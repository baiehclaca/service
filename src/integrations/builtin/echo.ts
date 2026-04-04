import { randomUUID } from 'node:crypto';
import type { IntegrationAdapter, NotificationEvent, MCPTool, JSONSchema } from '../types.js';

/**
 * Echo integration: generates synthetic notification events
 * at a configurable interval (default 30 seconds).
 * Used for testing and verifying the notification pipeline.
 */
export class EchoIntegration implements IntegrationAdapter {
  readonly id = 'echo';
  readonly name = 'Echo Test';
  readonly description = 'Generates synthetic notification events at a configurable interval for testing';

  readonly configSchema: JSONSchema = {
    type: 'object',
    properties: {
      interval_seconds: {
        type: 'number',
        description: 'Interval between synthetic events in seconds',
        default: 30,
        minimum: 1,
        maximum: 3600,
      },
    },
    required: [],
  };

  private timer: ReturnType<typeof setInterval> | null = null;
  private eventHandler: ((event: NotificationEvent) => void) | null = null;
  private counter = 0;

  async connect(config: Record<string, string>): Promise<void> {
    // Idempotent: stop existing timer first
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const intervalSeconds = parseInt(config.interval_seconds || '30', 10);
    const intervalMs = intervalSeconds * 1000;

    this.timer = setInterval(() => {
      this.counter++;
      const event: NotificationEvent = {
        id: randomUUID(),
        source: 'echo',
        type: 'info',
        title: `Echo #${this.counter}`,
        body: `Synthetic echo event #${this.counter} at ${new Date().toISOString()}`,
        timestamp: new Date().toISOString(),
        metadata: { counter: this.counter },
      };

      if (this.eventHandler) {
        try {
          this.eventHandler(event);
        } catch {
          // Integration errors must not crash the daemon
        }
      }
    }, intervalMs);
  }

  async disconnect(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.counter = 0;
  }

  onEvent(handler: (event: NotificationEvent) => void): void {
    this.eventHandler = handler;
  }

  getTools(): MCPTool[] {
    return [];
  }
}
