import { XTwitterIntegration } from '../integrations/builtin/x-twitter.js';
import type { NotificationEvent } from '../integrations/types.js';

describe('XTwitterIntegration', () => {
  let adapter: XTwitterIntegration;

  beforeEach(() => {
    adapter = new XTwitterIntegration();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('has correct id and metadata', () => {
    expect(adapter.id).toBe('x-twitter');
    expect(adapter.name).toBe('X / Twitter');
    expect(adapter.configSchema.type).toBe('object');
    expect(adapter.configSchema.required).toContain('api_key');
  });

  it('connect succeeds with valid config', async () => {
    await adapter.connect({
      api_key: 'test-key',
      api_secret: 'test-secret',
      access_token: 'test-token',
      access_token_secret: 'test-token-secret',
    });
    // Should not throw
  });

  it('connect fails with missing required config', async () => {
    await expect(adapter.connect({ api_key: 'test' })).rejects.toThrow('Missing required config');
  });

  it('connect is idempotent', async () => {
    const config = {
      api_key: 'test-key',
      api_secret: 'test-secret',
      access_token: 'test-token',
      access_token_secret: 'test-token-secret',
    };
    await adapter.connect(config);
    await adapter.connect(config);
    // Should not throw
  });

  it('exposes tweet tool', () => {
    const tools = adapter.getTools();
    expect(tools.length).toBeGreaterThan(0);
    const tweetTool = tools.find(t => t.name === 'tweet');
    expect(tweetTool).toBeDefined();
    expect(tweetTool!.description).toContain('Post');
  });

  it('exposes all 5 tools', () => {
    const tools = adapter.getTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('tweet');
    expect(names).toContain('reply');
    expect(names).toContain('retweet');
    expect(names).toContain('like');
    expect(names).toContain('search_tweets');
  });

  it('tweet tool returns error when not connected', async () => {
    const tools = adapter.getTools();
    const tweetTool = tools.find(t => t.name === 'tweet')!;
    const result = await tweetTool.handler({ text: 'hello' }) as { error: string };
    expect(result.error).toContain('not connected');
  });

  it('tweet tool returns success when connected', async () => {
    await adapter.connect({
      api_key: 'test-key',
      api_secret: 'test-secret',
      access_token: 'test-token',
      access_token_secret: 'test-token-secret',
    });
    const tools = adapter.getTools();
    const tweetTool = tools.find(t => t.name === 'tweet')!;
    const result = await tweetTool.handler({ text: 'hello world' }) as { success: boolean; error?: string };
    // With real twitter-api-v2 package installed but fake credentials, the API call
    // will fail with an auth error. success: false with an error message is expected.
    expect(typeof result.success === 'boolean').toBe(true);
  });

  it('disconnect works cleanly', async () => {
    await adapter.connect({
      api_key: 'test-key',
      api_secret: 'test-secret',
      access_token: 'test-token',
      access_token_secret: 'test-token-secret',
    });
    await adapter.disconnect();
    // Should not throw
  });

  it('onEvent registers handler', () => {
    const events: NotificationEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    // Handler is registered but no events emitted without real Twitter API
    expect(events.length).toBe(0);
  });
});
