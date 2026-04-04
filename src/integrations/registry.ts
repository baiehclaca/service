import { EventEmitter } from 'node:events';
import type { IntegrationAdapter, NotificationEvent, JSONSchema } from './types.js';
import { NotificationStore } from '../gateway/notification-store.js';
import { ServiceEventBus } from '../gateway/event-bus.js';
import { EchoIntegration } from './builtin/echo.js';
import { WebhookIntegration } from './builtin/webhook.js';
import { XTwitterIntegration } from './builtin/x-twitter.js';
import { SlackIntegration } from './builtin/slack.js';
import { EmailIntegration } from './builtin/email.js';
import { HttpPollIntegration } from './builtin/http-poll.js';

/** Runtime state for a loaded integration */
interface LoadedIntegration {
  id: string;
  adapter: IntegrationAdapter;
  instanceId: string;
  config: Record<string, string>;
}

/** Metadata about an available integration type */
export interface IntegrationTypeInfo {
  type: string;
  name: string;
  description: string;
  configSchema: JSONSchema;
}

/**
 * Registry for managing integration adapters.
 * Loads/unloads adapters, stores configs in DB, and routes events.
 *
 * Emits:
 *   'integration:loaded'   (instanceId: string, adapter: IntegrationAdapter)
 *   'integration:unloaded' (instanceId: string)
 */
export class IntegrationRegistry extends EventEmitter {
  private adapters: Map<string, LoadedIntegration> = new Map();
  private adapterFactories: Map<string, () => IntegrationAdapter> = new Map();
  private store: NotificationStore;
  private eventBus: ServiceEventBus;

  constructor(store: NotificationStore, eventBus: ServiceEventBus) {
    super();
    this.store = store;
    this.eventBus = eventBus;

    // Register built-in adapter factories
    this.adapterFactories.set('echo', () => new EchoIntegration());
    this.adapterFactories.set('webhook', () => new WebhookIntegration());
    this.adapterFactories.set('x-twitter', () => new XTwitterIntegration());
    this.adapterFactories.set('slack', () => new SlackIntegration());
    this.adapterFactories.set('email', () => new EmailIntegration());
    this.adapterFactories.set('http-poll', () => new HttpPollIntegration());
  }

  /** Get a factory for creating adapters of a given type */
  getAdapterFactory(type: string): (() => IntegrationAdapter) | undefined {
    return this.adapterFactories.get(type);
  }

  /** Get all registered adapter type names */
  getAvailableTypes(): string[] {
    return Array.from(this.adapterFactories.keys());
  }

  /** Get detailed info about all available integration types */
  getAvailableTypesInfo(): IntegrationTypeInfo[] {
    const types: IntegrationTypeInfo[] = [];
    for (const [type, factory] of this.adapterFactories) {
      const adapter = factory();
      types.push({
        type,
        name: adapter.name,
        description: adapter.description,
        configSchema: adapter.configSchema,
      });
    }
    return types;
  }

  /** Load and connect an integration */
  async loadIntegration(
    instanceId: string,
    type: string,
    config: Record<string, string>,
    name?: string
  ): Promise<void> {
    const factory = this.adapterFactories.get(type);
    if (!factory) {
      throw new Error(`Unknown integration type: ${type}`);
    }

    // If already loaded, disconnect first
    if (this.adapters.has(instanceId)) {
      await this.unloadIntegration(instanceId);
    }

    const adapter = factory();

    // Set up event handler
    adapter.onEvent((event: NotificationEvent) => {
      // Store notification in DB
      this.store.insert(event);
      // Update last_event_at
      this.store.updateLastEventAt(instanceId);
      // Emit on event bus for SSE push
      this.eventBus.emitNotification(event);
    });

    // Store config with status='connecting' first (A-INT-03)
    this.store.storeIntegrationConfig(
      instanceId,
      name || adapter.name,
      type,
      config,
      'connecting'
    );

    try {
      // Connect the adapter
      await adapter.connect(config);
    } catch (error) {
      // Connection failed — mark as error
      this.store.updateIntegrationStatus(
        instanceId,
        'error',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }

    // Only mark active after successful connect
    this.store.updateIntegrationStatus(instanceId, 'active');

    this.adapters.set(instanceId, {
      id: type,
      adapter,
      instanceId,
      config,
    });

    // Notify listeners that an integration has been loaded
    this.emit('integration:loaded', instanceId, adapter);
  }

  /** Unload and disconnect an integration */
  async unloadIntegration(instanceId: string): Promise<void> {
    const loaded = this.adapters.get(instanceId);
    if (loaded) {
      try {
        await loaded.adapter.disconnect();
      } catch {
        // Errors during disconnect should not propagate
      }
      this.adapters.delete(instanceId);
      // Notify listeners that an integration has been unloaded
      this.emit('integration:unloaded', instanceId);
    }
  }

  /** Get a loaded adapter by instance ID */
  getAdapter(instanceId: string): IntegrationAdapter | undefined {
    return this.adapters.get(instanceId)?.adapter;
  }

  /** Get all loaded integrations */
  getLoadedIntegrations(): Map<string, LoadedIntegration> {
    return this.adapters;
  }

  /**
   * Disable an integration: disconnects its adapter and marks it inactive in DB.
   * Does NOT remove it — can be re-enabled. A-INT-06
   */
  async disableIntegration(instanceId: string): Promise<boolean> {
    const loaded = this.adapters.get(instanceId);
    if (loaded) {
      try {
        await loaded.adapter.disconnect();
      } catch {
        // Errors during disconnect should not propagate
      }
      this.adapters.delete(instanceId);
    }
    this.store.updateIntegrationStatus(instanceId, 'inactive');
    return true;
  }

  /**
   * Enable an integration: loads config from DB and reconnects.
   * A-INT-06
   */
  async enableIntegration(instanceId: string): Promise<void> {
    // Load stored config
    const config = this.store.loadIntegrationConfig(instanceId);
    if (!config) {
      throw new Error(`No config found for integration ${instanceId}`);
    }

    // Determine type from DB
    const allIntegrations = this.store.getAllIntegrations();
    const integrationRow = allIntegrations.find(i => i.id === instanceId);
    if (!integrationRow) {
      throw new Error(`Integration ${instanceId} not found in database`);
    }

    await this.loadIntegration(instanceId, integrationRow.type, config, integrationRow.name);
  }

  /**
   * Remove an integration completely: disconnect + remove from DB.
   * A-CLI-08
   */
  async deleteIntegration(instanceId: string): Promise<boolean> {
    await this.unloadIntegration(instanceId);
    this.store.deleteIntegration(instanceId);
    return true;
  }

  /** Get the notification store reference (for external use) */
  getStore(): NotificationStore {
    return this.store;
  }

  /** Shutdown all integrations */
  async shutdown(): Promise<void> {
    for (const [id] of this.adapters) {
      await this.unloadIntegration(id);
    }
  }
}
