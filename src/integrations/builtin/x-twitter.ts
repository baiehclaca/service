import type { IntegrationAdapter, NotificationEvent, MCPTool, JSONSchema } from '../types.js';

// Dynamic import type for twitter-api-v2 (optional peer dependency)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TwitterApiClient = any;

/**
 * X/Twitter integration adapter.
 * Uses twitter-api-v2 (optional peer dependency) for real API calls.
 * Config requires API keys; tools: tweet, reply, retweet, like, search_tweets.
 *
 * Gracefully handles missing twitter-api-v2 package: connect() will throw
 * a clear error if the package is not installed.
 */
export class XTwitterIntegration implements IntegrationAdapter {
  readonly id = 'x-twitter';
  readonly name = 'X / Twitter';
  readonly description = 'Connect to X (Twitter) for real-time tweet notifications and posting tools';

  readonly configSchema: JSONSchema = {
    type: 'object',
    properties: {
      api_key: {
        type: 'string',
        description: 'Twitter API Key (Consumer Key)',
      },
      api_secret: {
        type: 'string',
        description: 'Twitter API Secret (Consumer Secret)',
      },
      access_token: {
        type: 'string',
        description: 'Twitter Access Token',
      },
      access_token_secret: {
        type: 'string',
        description: 'Twitter Access Token Secret',
      },
      bearer_token: {
        type: 'string',
        description: 'Twitter Bearer Token (for read-only search)',
      },
      track_keywords: {
        type: 'string',
        description: 'Comma-separated keywords to track (e.g. "ai,mcp,agents")',
      },
    },
    required: ['api_key', 'api_secret', 'access_token', 'access_token_secret'],
  };

  private eventHandler: ((event: NotificationEvent) => void) | null = null;
  private connected = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private client: TwitterApiClient | null = null;

  async connect(config: Record<string, string>): Promise<void> {
    // Idempotent: disconnect first if already connected
    if (this.connected) {
      await this.disconnect();
    }

    // Validate required credentials are present
    const required = ['api_key', 'api_secret', 'access_token', 'access_token_secret'];
    for (const key of required) {
      if (!config[key]) {
        throw new Error(`Missing required config: ${key}`);
      }
    }

    // Try to load twitter-api-v2; throw a clear error if not installed
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — optional peer dependency may not be installed
      const { TwitterApi } = await import('twitter-api-v2');
      this.client = new TwitterApi({
        appKey: config.api_key,
        appSecret: config.api_secret,
        accessToken: config.access_token,
        accessSecret: config.access_token_secret,
      });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND' ||
          (err instanceof Error && err.message.includes('Cannot find'))) {
        throw new Error("Package 'twitter-api-v2' is not installed. Run: npm install twitter-api-v2");
      }
      // Re-throw other errors (e.g. bad credentials format)
      throw err;
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.client = null;
    this.connected = false;
  }

  onEvent(handler: (event: NotificationEvent) => void): void {
    this.eventHandler = handler;
  }

  /** Emit a notification event safely */
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
        name: 'tweet',
        description: 'Post a new tweet',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Tweet text (max 280 chars)' },
          },
          required: ['text'],
        },
        handler: async (args: Record<string, unknown>) => {
          const text = args.text as string;
          if (!this.connected) {
            return { success: false, error: 'X/Twitter integration not connected' };
          }
          try {
            if (this.client) {
              const result = await this.client.v2.tweet(text);
              return { success: true, id: result.data.id, text: result.data.text };
            }
            return { success: false, error: "Package 'twitter-api-v2' is not available. Run: npm install twitter-api-v2" };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        name: 'reply',
        description: 'Reply to a tweet',
        inputSchema: {
          type: 'object',
          properties: {
            tweet_id: { type: 'string', description: 'ID of the tweet to reply to' },
            text: { type: 'string', description: 'Reply text' },
          },
          required: ['tweet_id', 'text'],
        },
        handler: async (args: Record<string, unknown>) => {
          if (!this.connected) {
            return { success: false, error: 'X/Twitter integration not connected' };
          }
          try {
            const tweet_id = args.tweet_id as string;
            const text = args.text as string;
            if (this.client) {
              const result = await this.client.v2.tweet(text, { reply: { in_reply_to_tweet_id: tweet_id } });
              return { success: true, id: result.data.id, text: result.data.text };
            }
            return { success: false, error: "Package 'twitter-api-v2' is not available. Run: npm install twitter-api-v2" };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        name: 'retweet',
        description: 'Retweet a tweet',
        inputSchema: {
          type: 'object',
          properties: {
            tweet_id: { type: 'string', description: 'ID of the tweet to retweet' },
          },
          required: ['tweet_id'],
        },
        handler: async (args: Record<string, unknown>) => {
          if (!this.connected) {
            return { success: false, error: 'X/Twitter integration not connected' };
          }
          try {
            const tweetId = args.tweet_id as string;
            if (this.client) {
              const me = await this.client.v2.me();
              const userId = me.data.id;
              const result = await this.client.v2.retweet(userId, tweetId);
              return { success: true, retweeted: result.data.retweeted };
            }
            return { success: false, error: "Package 'twitter-api-v2' is not available. Run: npm install twitter-api-v2" };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        name: 'like',
        description: 'Like a tweet',
        inputSchema: {
          type: 'object',
          properties: {
            tweet_id: { type: 'string', description: 'ID of the tweet to like' },
          },
          required: ['tweet_id'],
        },
        handler: async (args: Record<string, unknown>) => {
          if (!this.connected) {
            return { success: false, error: 'X/Twitter integration not connected' };
          }
          try {
            const tweetId = args.tweet_id as string;
            if (this.client) {
              const me = await this.client.v2.me();
              const userId = me.data.id;
              const result = await this.client.v2.like(userId, tweetId);
              return { success: true, liked: result.data.liked };
            }
            return { success: false, error: "Package 'twitter-api-v2' is not available. Run: npm install twitter-api-v2" };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        name: 'search_tweets',
        description: 'Search recent tweets by query',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            max_results: { type: 'number', description: 'Max results (10-100)', default: 10 },
          },
          required: ['query'],
        },
        handler: async (args: Record<string, unknown>) => {
          if (!this.connected) {
            return { success: false, error: 'X/Twitter integration not connected' };
          }
          try {
            const query = args.query as string;
            const limit = (args.max_results as number) || 10;
            if (this.client) {
              const results = await this.client.v2.search(query, { max_results: limit });
              const tweets = results.data?.data ?? [];
              return { success: true, count: tweets.length, results: tweets };
            }
            return { success: false, error: "Package 'twitter-api-v2' is not available. Run: npm install twitter-api-v2" };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
    ];
  }
}
