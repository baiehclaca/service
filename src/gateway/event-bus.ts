import { EventEmitter } from 'node:events';
import type { NotificationEvent } from '../integrations/types.js';

/**
 * Global event bus for SERVICE notifications.
 * Singleton EventEmitter — integrations emit events, gateway/push-manager listens.
 *
 * Events:
 *   'notification' — a new NotificationEvent was created
 *   'error'        — a non-fatal error in an integration
 */
class ServiceEventBus extends EventEmitter {
  private static instance: ServiceEventBus | null = null;

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  /** Get the singleton event bus */
  static getInstance(): ServiceEventBus {
    if (!ServiceEventBus.instance) {
      ServiceEventBus.instance = new ServiceEventBus();
    }
    return ServiceEventBus.instance;
  }

  /** Reset singleton (for testing) */
  static resetInstance(): void {
    if (ServiceEventBus.instance) {
      ServiceEventBus.instance.removeAllListeners();
      ServiceEventBus.instance = null;
    }
  }

  /** Emit a notification event */
  emitNotification(event: NotificationEvent): void {
    this.emit('notification', event);
  }
}

export { ServiceEventBus };
