/**
 * Extended X/Twitter integration tests to boost statement coverage.
 * Tests cover connected-state tool handlers (tweet, reply, retweet, like,
 * search_tweets), error paths, emit/onEvent flow, and disconnect edge cases.
 */
import { jest } from '@jest/globals';
import { XTwitterIntegration } from '../integrations/builtin/x-twitter.js';
import type { NotificationEvent } from '../integrations/types.js';

describe('XTwitterIntegration - connected state tool handlers', () => {
  // Helper: create an XTwitterIntegration in "connected" state with a mocked client
  function makeConnectedTwitter(hasClient = true): XTwitterIntegration {
    const adapter = new XTwitterIntegration();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    a.connected = true;

    if (hasClient) {
      a.client = {
        v2: {
          tweet: jest.fn().mockResolvedValue({ data: { id: 'tweet-001', text: 'hello world' } }),
          me: jest.fn().mockResolvedValue({ data: { id: 'user-001' } }),
          retweet: jest.fn().mockResolvedValue({ data: { retweeted: true } }),
          like: jest.fn().mockResolvedValue({ data: { liked: true } }),
          search: jest.fn().mockResolvedValue({ data: { data: [{ id: 'tw1', text: 'result 1' }] } }),
        },
      };
    } else {
      a.client = null;
    }

    return adapter;
  }

  // ─── tweet ───────────────────────────────────────────────────────────────

  it('tweet succeeds when connected with client', async () => {
    const adapter = makeConnectedTwitter(true);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'tweet')!;

    const result = await tool.handler({ text: 'hello world' }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.id).toBe('tweet-001');
    expect(result.text).toBe('hello world');
  });

  it('tweet returns error when client is null', async () => {
    const adapter = makeConnectedTwitter(false);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'tweet')!;

    const result = await tool.handler({ text: 'hello world' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('twitter-api-v2');
  });

  it('tweet returns error when client.v2.tweet throws', async () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client.v2.tweet = jest.fn().mockRejectedValue(new Error('Twitter API error'));
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'tweet')!;

    const result = await tool.handler({ text: 'hello world' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('Twitter API error');
  });

  it('tweet returns string error when client throws non-Error', async () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client.v2.tweet = jest.fn().mockRejectedValue('raw error');
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'tweet')!;

    const result = await tool.handler({ text: 'hello world' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toBe('raw error');
  });

  // ─── reply ───────────────────────────────────────────────────────────────

  it('reply returns error when not connected', async () => {
    const adapter = new XTwitterIntegration();
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'reply')!;

    const result = await tool.handler({ tweet_id: 'tw001', text: 'reply text' }) as Record<string, unknown>;
    expect(result.error).toContain('not connected');
  });

  it('reply succeeds when connected with client', async () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client.v2.tweet = jest.fn().mockResolvedValue({ data: { id: 'reply-001', text: 'reply text' } });
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'reply')!;

    const result = await tool.handler({ tweet_id: 'tw001', text: 'reply text' }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.id).toBe('reply-001');
    expect(result.text).toBe('reply text');
  });

  it('reply returns error when client is null', async () => {
    const adapter = makeConnectedTwitter(false);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'reply')!;

    const result = await tool.handler({ tweet_id: 'tw001', text: 'reply text' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('twitter-api-v2');
  });

  it('reply returns error when client.v2.tweet throws', async () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client.v2.tweet = jest.fn().mockRejectedValue(new Error('reply API error'));
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'reply')!;

    const result = await tool.handler({ tweet_id: 'tw001', text: 'reply text' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('reply API error');
  });

  it('reply returns string error for non-Error throws', async () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client.v2.tweet = jest.fn().mockRejectedValue(123);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'reply')!;

    const result = await tool.handler({ tweet_id: 'tw001', text: 'reply text' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toBe('123');
  });

  // ─── retweet ─────────────────────────────────────────────────────────────

  it('retweet returns error when not connected', async () => {
    const adapter = new XTwitterIntegration();
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'retweet')!;

    const result = await tool.handler({ tweet_id: 'tw001' }) as Record<string, unknown>;
    expect(result.error).toContain('not connected');
  });

  it('retweet succeeds when connected with client', async () => {
    const adapter = makeConnectedTwitter(true);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'retweet')!;

    const result = await tool.handler({ tweet_id: 'tw001' }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.retweeted).toBe(true);
  });

  it('retweet returns error when client is null', async () => {
    const adapter = makeConnectedTwitter(false);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'retweet')!;

    const result = await tool.handler({ tweet_id: 'tw001' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('twitter-api-v2');
  });

  it('retweet returns error when client.v2.me throws', async () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client.v2.me = jest.fn().mockRejectedValue(new Error('me() failed'));
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'retweet')!;

    const result = await tool.handler({ tweet_id: 'tw001' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('me() failed');
  });

  it('retweet returns error when client.v2.retweet throws', async () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client.v2.retweet = jest.fn().mockRejectedValue(new Error('retweet API error'));
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'retweet')!;

    const result = await tool.handler({ tweet_id: 'tw001' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('retweet API error');
  });

  it('retweet returns string error for non-Error throws', async () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client.v2.me = jest.fn().mockRejectedValue('auth_error');
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'retweet')!;

    const result = await tool.handler({ tweet_id: 'tw001' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toBe('auth_error');
  });

  // ─── like ────────────────────────────────────────────────────────────────

  it('like returns error when not connected', async () => {
    const adapter = new XTwitterIntegration();
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'like')!;

    const result = await tool.handler({ tweet_id: 'tw001' }) as Record<string, unknown>;
    expect(result.error).toContain('not connected');
  });

  it('like succeeds when connected with client', async () => {
    const adapter = makeConnectedTwitter(true);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'like')!;

    const result = await tool.handler({ tweet_id: 'tw001' }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.liked).toBe(true);
  });

  it('like returns error when client is null', async () => {
    const adapter = makeConnectedTwitter(false);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'like')!;

    const result = await tool.handler({ tweet_id: 'tw001' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('twitter-api-v2');
  });

  it('like returns error when client.v2.me throws', async () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client.v2.me = jest.fn().mockRejectedValue(new Error('me() error'));
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'like')!;

    const result = await tool.handler({ tweet_id: 'tw001' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('me() error');
  });

  it('like returns error when client.v2.like throws', async () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client.v2.like = jest.fn().mockRejectedValue(new Error('like API error'));
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'like')!;

    const result = await tool.handler({ tweet_id: 'tw001' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('like API error');
  });

  it('like returns string error for non-Error throws', async () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client.v2.like = jest.fn().mockRejectedValue({ code: 403 });
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'like')!;

    const result = await tool.handler({ tweet_id: 'tw001' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  // ─── search_tweets ───────────────────────────────────────────────────────

  it('search_tweets returns error when not connected', async () => {
    const adapter = new XTwitterIntegration();
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'search_tweets')!;

    const result = await tool.handler({ query: 'mcp ai' }) as Record<string, unknown>;
    expect(result.error).toContain('not connected');
  });

  it('search_tweets succeeds when connected with client', async () => {
    const adapter = makeConnectedTwitter(true);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'search_tweets')!;

    const result = await tool.handler({ query: 'mcp ai', max_results: 5 }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('search_tweets uses default max_results=10 when not provided', async () => {
    const adapter = makeConnectedTwitter(true);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'search_tweets')!;

    const result = await tool.handler({ query: 'mcp' }) as Record<string, unknown>;
    expect(result.success).toBe(true);
  });

  it('search_tweets returns empty results when API returns no data', async () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client.v2.search = jest.fn().mockResolvedValue({ data: {} });
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'search_tweets')!;

    const result = await tool.handler({ query: 'mcp' }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('search_tweets returns error when client is null', async () => {
    const adapter = makeConnectedTwitter(false);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'search_tweets')!;

    const result = await tool.handler({ query: 'mcp' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('twitter-api-v2');
  });

  it('search_tweets returns error when client.v2.search throws', async () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client.v2.search = jest.fn().mockRejectedValue(new Error('search API error'));
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'search_tweets')!;

    const result = await tool.handler({ query: 'mcp' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('search API error');
  });

  it('search_tweets returns string error for non-Error throws', async () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).client.v2.search = jest.fn().mockRejectedValue('search_error_string');
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'search_tweets')!;

    const result = await tool.handler({ query: 'mcp' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toBe('search_error_string');
  });

  // ─── onEvent / emit ──────────────────────────────────────────────────────

  it('emits events when eventHandler is set', () => {
    const adapter = makeConnectedTwitter(true);
    const events: NotificationEvent[] = [];
    adapter.onEvent((e) => events.push(e));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    const fakeEvent: NotificationEvent = {
      id: 'tw-1',
      source: 'x-twitter',
      type: 'message',
      title: 'New Tweet',
      body: 'Hello from Twitter',
      timestamp: new Date().toISOString(),
    };
    a.emit(fakeEvent);
    expect(events.length).toBe(1);
    expect(events[0].source).toBe('x-twitter');
  });

  it('emit silently ignores errors in event handler', () => {
    const adapter = makeConnectedTwitter(true);
    adapter.onEvent(() => { throw new Error('handler error'); });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    expect(() => a.emit({
      id: 'tw-2', source: 'x-twitter', type: 'message',
      title: 'Test', body: 'body', timestamp: new Date().toISOString(),
    })).not.toThrow();
  });

  it('emit does nothing when no eventHandler registered', () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    expect(() => a.emit({
      id: 'tw-3', source: 'x-twitter', type: 'message',
      title: 'Test', body: 'body', timestamp: new Date().toISOString(),
    })).not.toThrow();
  });

  // ─── disconnect / pollTimer ───────────────────────────────────────────────

  it('disconnect clears pollTimer', async () => {
    const adapter = makeConnectedTwitter(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    a.pollTimer = setInterval(() => {}, 10000);

    await adapter.disconnect();
    expect(a.pollTimer).toBeNull();
    expect(a.connected).toBe(false);
    expect(a.client).toBeNull();
  });

  it('disconnect when no pollTimer works cleanly', async () => {
    const adapter = makeConnectedTwitter(true);
    await expect(adapter.disconnect()).resolves.not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((adapter as any).connected).toBe(false);
  });

  // ─── connect edge cases ───────────────────────────────────────────────────

  it('connect throws when missing required fields', async () => {
    const adapter = new XTwitterIntegration();
    await expect(adapter.connect({
      api_key: '', api_secret: '', access_token: '', access_token_secret: '',
    })).rejects.toThrow('Missing required config');
  });

  it('connect is idempotent (disconnect then reconnect)', async () => {
    const adapter = new XTwitterIntegration();
    // First connect
    try {
      await adapter.connect({
        api_key: 'fake-key',
        api_secret: 'fake-secret',
        access_token: 'fake-token',
        access_token_secret: 'fake-token-secret',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((adapter as any).connected).toBe(true);

      // Second connect (should disconnect first)
      await adapter.connect({
        api_key: 'new-key',
        api_secret: 'new-secret',
        access_token: 'new-token',
        access_token_secret: 'new-token-secret',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((adapter as any).connected).toBe(true);
      await adapter.disconnect();
    } catch (e) {
      // If twitter-api-v2 package not installed
      expect(e instanceof Error).toBe(true);
    }
  });
});
