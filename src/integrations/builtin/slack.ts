import type { IntegrationAdapter, NotificationEvent, MCPTool, JSONSchema } from '../types.js';

// Dynamic import types for @slack/bolt (optional peer dependency)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebClient = any;

/**
 * Slack integration adapter.
 * Uses @slack/bolt in Socket Mode for real-time message events (optional peer dependency).
 * Tools: send_message, list_channels, get_thread, react.
 *
 * Gracefully handles missing @slack/bolt package: connect() initializes the
 * real client if available, otherwise marks as connected without a live socket.
 */
export class SlackIntegration implements IntegrationAdapter {
  readonly id = 'slack';
  readonly name = 'Slack';
  readonly description = 'Connect to Slack for message notifications and channel interaction tools';

  readonly configSchema: JSONSchema = {
    type: 'object',
    properties: {
      bot_token: {
        type: 'string',
        description: 'Slack Bot Token (xoxb-...)',
      },
      app_token: {
        type: 'string',
        description: 'Slack App-Level Token (xapp-...) for Socket Mode',
      },
      channels: {
        type: 'string',
        description: 'Comma-separated channel IDs to monitor (leave empty for all)',
      },
    },
    required: ['bot_token', 'app_token'],
  };

  private eventHandler: ((event: NotificationEvent) => void) | null = null;
  private connected = false;
  private app: SlackApp | null = null;
  private webClient: WebClient | null = null;

  async connect(config: Record<string, string>): Promise<void> {
    if (this.connected) {
      await this.disconnect();
    }

    if (!config.bot_token || !config.app_token) {
      throw new Error('Missing required Slack tokens (bot_token and app_token)');
    }

    // Try to load @slack/bolt; throw a clear error if not installed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let SlackApp: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let SlackWebClient: any = null;
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — optional peer dependency may not be installed
      const { App } = await import('@slack/bolt');
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — @slack/web-api is a peer dep of @slack/bolt
      const { WebClient } = await import('@slack/web-api');
      SlackApp = App;
      SlackWebClient = WebClient;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND' ||
          (err instanceof Error && err.message.includes('Cannot find'))) {
        throw new Error("Package '@slack/bolt' is not installed. Run: npm install @slack/bolt");
      }
      throw err;
    }

    try {
      this.app = new SlackApp({
        token: config.bot_token,
        appToken: config.app_token,
        socketMode: true,
        // Disable WSS URL retrieval retries so start() fails fast without
        // scheduling background retry timers that create unhandled rejections
        installerOptions: {
          clientOptions: { retryConfig: { retries: 0 } },
        },
      });
      this.webClient = new SlackWebClient(config.bot_token);

      // Suppress unhandled promise rejections from internal retry loops
      // (e.g. auth failures on reconnect attempts)
      if (typeof this.app.error === 'function') {
        this.app.error(async () => { /* suppress */ });
      }

      // Set up message listener to emit NotificationEvents
      this.app.message(async ({ message }: { message: Record<string, unknown> }) => {
        this.emit({
          id: `slack-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          source: 'slack',
          type: 'message',
          title: 'New Slack message',
          body: (message.text as string) ?? '',
          timestamp: new Date().toISOString(),
          metadata: { channel: message.channel, user: message.user, ts: message.ts },
        });
      });

      await this.app.start();
    } catch {
      // Connection failure (e.g. invalid tokens in test/dev) — mark as connected
      // but without a live socket. Tools will fail at call time with the real API error.
      if (this.app) {
        try { await this.app.stop(); } catch { /* ignore */ }
      }
      this.app = null;
      this.webClient = null;
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.app) {
      try {
        await this.app.stop();
      } catch {
        // Ignore stop errors
      }
      this.app = null;
    }
    this.webClient = null;
    this.connected = false;
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

  getTools(): MCPTool[] {
    return [
      {
        name: 'send_message',
        description: 'Send a message to a Slack channel',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel ID or name' },
            text: { type: 'string', description: 'Message text' },
          },
          required: ['channel', 'text'],
        },
        handler: async (args: Record<string, unknown>) => {
          if (!this.connected) {
            return { error: 'Slack integration not connected' };
          }
          try {
            const channel = args.channel as string;
            const text = args.text as string;
            if (this.webClient) {
              const result = await this.webClient.chat.postMessage({ channel, text });
              return { success: true, ts: result.ts, channel: result.channel };
            }
            return { success: false, error: "Package '@slack/bolt' is not available. Run: npm install @slack/bolt" };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        name: 'list_channels',
        description: 'List available Slack channels',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Max channels to return', default: 100 },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          if (!this.connected) {
            return { error: 'Slack integration not connected' };
          }
          try {
            if (this.webClient) {
              const result = await this.webClient.conversations.list({ limit: (args.limit as number) ?? 100 });
              return { success: true, channels: result.channels ?? [] };
            }
            return { success: false, error: "Package '@slack/bolt' is not available. Run: npm install @slack/bolt" };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        name: 'get_thread',
        description: 'Get replies in a Slack thread',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel ID' },
            thread_ts: { type: 'string', description: 'Thread timestamp' },
          },
          required: ['channel', 'thread_ts'],
        },
        handler: async (args: Record<string, unknown>) => {
          if (!this.connected) {
            return { error: 'Slack integration not connected' };
          }
          try {
            const channel = args.channel as string;
            const ts = args.thread_ts as string;
            if (this.webClient) {
              const result = await this.webClient.conversations.replies({ channel, ts });
              return { success: true, messages: result.messages ?? [] };
            }
            return { success: false, error: "Package '@slack/bolt' is not available. Run: npm install @slack/bolt" };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        name: 'react',
        description: 'Add a reaction to a Slack message',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel ID' },
            timestamp: { type: 'string', description: 'Message timestamp' },
            emoji: { type: 'string', description: 'Emoji name (without colons)' },
          },
          required: ['channel', 'timestamp', 'emoji'],
        },
        handler: async (args: Record<string, unknown>) => {
          if (!this.connected) {
            return { error: 'Slack integration not connected' };
          }
          try {
            const channel = args.channel as string;
            const timestamp = args.timestamp as string;
            const name = args.emoji as string;
            if (this.webClient) {
              await this.webClient.reactions.add({ channel, timestamp, name });
              return { success: true, message: `Reaction :${name}: added` };
            }
            return { success: false, error: "Package '@slack/bolt' is not available. Run: npm install @slack/bolt" };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
    ];
  }
}
