import { randomUUID, createHash } from 'node:crypto';
import type { IntegrationAdapter, NotificationEvent, MCPTool, JSONSchema } from '../types.js';

/**
 * HTTP-poll integration adapter.
 * Polls a configured URL on a schedule, detects changes via SHA-256 hash,
 * and emits notifications when content changes.
 */
export class HttpPollIntegration implements IntegrationAdapter {
  readonly id = 'http-poll';
  readonly name = 'HTTP Poll';
  readonly description = 'Poll a URL on a schedule and notify when content changes (SHA-256 hash detection)';

  readonly configSchema: JSONSchema = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to poll for changes',
      },
      interval_seconds: {
        type: 'number',
        description: 'Polling interval in seconds',
        default: 300,
        minimum: 10,
        maximum: 86400,
      },
      headers: {
        type: 'string',
        description: 'Custom headers as JSON string (e.g. {"Authorization":"Bearer ..."})',
      },
      method: {
        type: 'string',
        description: 'HTTP method (GET or HEAD)',
        default: 'GET',
        enum: ['GET', 'HEAD'],
      },
    },
    required: ['url'],
  };

  private eventHandler: ((event: NotificationEvent) => void) | null = null;
  private connected = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastHash: string | null = null;
  private config: Record<string, string> = {};

  async connect(config: Record<string, string>): Promise<void> {
    if (this.connected) {
      await this.disconnect();
    }

    if (!config.url) {
      throw new Error('Missing required config: url');
    }

    this.config = config;
    this.connected = true;

    const intervalSeconds = parseInt(config.interval_seconds || '300', 10);
    const intervalMs = intervalSeconds * 1000;

    // Do an initial fetch to establish the baseline hash
    await this.poll();

    // Start polling
    this.pollTimer = setInterval(() => {
      this.poll().catch(() => {
        // Polling errors should not crash the daemon
      });
    }, intervalMs);
  }

  async disconnect(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.connected = false;
    this.lastHash = null;
    this.config = {};
  }

  onEvent(handler: (event: NotificationEvent) => void): void {
    this.eventHandler = handler;
  }

  private emit(event: NotificationEvent): void {
    if (this.eventHandler) {
      try {
        this.eventHandler(event);
      } catch {
        // Integration errors must not crash the daemon
      }
    }
  }

  /** Fetch the URL and check for content changes */
  async poll(): Promise<{ changed: boolean; hash: string; content?: string }> {
    const url = this.config.url;
    if (!url) {
      return { changed: false, hash: '' };
    }

    let headers: Record<string, string> = {};
    if (this.config.headers) {
      try {
        headers = JSON.parse(this.config.headers) as Record<string, string>;
      } catch {
        // Invalid headers JSON, ignore
      }
    }

    const method = this.config.method || 'GET';

    try {
      const response = await fetch(url, { method, headers });
      const content = await response.text();
      const hash = createHash('sha256').update(content).digest('hex');

      const changed = this.lastHash !== null && this.lastHash !== hash;

      if (changed) {
        this.emit({
          id: randomUUID(),
          source: 'http-poll',
          type: 'change',
          title: `Content changed: ${url}`,
          body: `The content at ${url} has changed. Previous hash: ${this.lastHash}, new hash: ${hash}`,
          timestamp: new Date().toISOString(),
          metadata: {
            url,
            previousHash: this.lastHash,
            newHash: hash,
            statusCode: response.status,
          },
        });
      }

      this.lastHash = hash;
      return { changed, hash, content };
    } catch (error) {
      this.emit({
        id: randomUUID(),
        source: 'http-poll',
        type: 'error',
        title: `Poll error: ${url}`,
        body: `Failed to poll ${url}: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
        metadata: { url, error: error instanceof Error ? error.message : String(error) },
      });
      return { changed: false, hash: '' };
    }
  }

  getTools(): MCPTool[] {
    return [
      {
        name: 'fetch_now',
        description: 'Immediately fetch the configured URL and check for changes',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        handler: async () => {
          if (!this.connected) {
            return { error: 'HTTP-poll integration not connected' };
          }
          const result = await this.poll();
          return {
            success: true,
            changed: result.changed,
            hash: result.hash,
            url: this.config.url,
          };
        },
      },
    ];
  }
}
