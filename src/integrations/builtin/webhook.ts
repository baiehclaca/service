import { randomUUID } from 'node:crypto';
import type { IntegrationAdapter, NotificationEvent, MCPTool, JSONSchema } from '../types.js';

/**
 * Webhook integration: receives external events via HTTP POST
 * to /webhooks/:integrationId on the admin API.
 * Any JSON body is accepted and converted to a NotificationEvent.
 */
export class WebhookIntegration implements IntegrationAdapter {
  readonly id = 'webhook';
  readonly name = 'Generic Webhook';
  readonly description = 'Receives notifications via HTTP POST to a unique webhook URL';

  readonly configSchema: JSONSchema = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Human-readable name for this webhook',
      },
    },
    required: ['name'],
  };

  private eventHandler: ((event: NotificationEvent) => void) | null = null;
  private instanceId: string = '';

  async connect(config: Record<string, string>): Promise<void> {
    // Store instance ID for tracking
    this.instanceId = config.name || 'webhook';
  }

  async disconnect(): Promise<void> {
    // No persistent connections to clean up
  }

  onEvent(handler: (event: NotificationEvent) => void): void {
    this.eventHandler = handler;
  }

  /**
   * Called by the admin API when a webhook POST is received.
   * Converts the raw body into a NotificationEvent.
   */
  handleWebhookPost(body: Record<string, unknown>, integrationId: string): NotificationEvent {
    const event: NotificationEvent = {
      id: randomUUID(),
      source: integrationId,
      type: (body.type as string) || 'webhook',
      title: (body.title as string) || 'Webhook Event',
      body: (body.body as string) || (body.message as string) || JSON.stringify(body),
      timestamp: new Date().toISOString(),
      metadata: body.metadata as Record<string, unknown> | undefined,
    };

    if (this.eventHandler) {
      try {
        this.eventHandler(event);
      } catch {
        // Integration errors must not crash the daemon
      }
    }

    return event;
  }

  /**
   * Alias for handleWebhookPost — called by admin API router when routing
   * through registered adapters (A-API-14).
   */
  receiveWebhook(body: Record<string, unknown>, integrationId?: string): NotificationEvent {
    return this.handleWebhookPost(body, integrationId ?? this.instanceId);
  }

  getTools(): MCPTool[] {
    return [];
  }
}
