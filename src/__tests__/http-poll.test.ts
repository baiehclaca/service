import { jest } from '@jest/globals';
import { HttpPollIntegration } from '../integrations/builtin/http-poll.js';
import type { NotificationEvent } from '../integrations/types.js';

// Mock global fetch
const originalFetch = globalThis.fetch;

describe('HttpPollIntegration', () => {
  let adapter: HttpPollIntegration;

  beforeEach(() => {
    adapter = new HttpPollIntegration();
  });

  afterEach(async () => {
    await adapter.disconnect();
    globalThis.fetch = originalFetch;
  });

  it('has correct id and metadata', () => {
    expect(adapter.id).toBe('http-poll');
    expect(adapter.name).toBe('HTTP Poll');
    expect(adapter.configSchema.type).toBe('object');
    expect(adapter.configSchema.required).toContain('url');
  });

  it('connect fails with missing url', async () => {
    await expect(adapter.connect({})).rejects.toThrow('Missing required config: url');
  });

  it('connect succeeds with url and mock fetch', async () => {
    globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('initial content'),
    } as Response);

    await adapter.connect({ url: 'http://example.com/test', interval_seconds: '9999' });
    expect(globalThis.fetch).toHaveBeenCalledWith('http://example.com/test', expect.any(Object));
  });

  it('detects content changes', async () => {
    let callCount = 0;
    globalThis.fetch = jest.fn<typeof fetch>().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(callCount === 1 ? 'content-v1' : 'content-v2'),
      } as Response);
    });

    const events: NotificationEvent[] = [];
    adapter.onEvent((event) => events.push(event));

    await adapter.connect({ url: 'http://example.com/test', interval_seconds: '9999' });
    expect(events.length).toBe(0); // Initial fetch — no change yet

    const result = await adapter.poll();
    expect(result.changed).toBe(true);
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe('change');
  });

  it('no change when content stays same', async () => {
    globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('same content'),
    } as Response);

    const events: NotificationEvent[] = [];
    adapter.onEvent((event) => events.push(event));

    await adapter.connect({ url: 'http://example.com/test', interval_seconds: '9999' });
    const result = await adapter.poll();
    expect(result.changed).toBe(false);
    expect(events.length).toBe(0);
  });

  it('emits error notification on fetch failure', async () => {
    globalThis.fetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('initial'),
      } as Response)
      .mockRejectedValueOnce(new Error('Network error'));

    const events: NotificationEvent[] = [];
    adapter.onEvent((event) => events.push(event));

    await adapter.connect({ url: 'http://example.com/test', interval_seconds: '9999' });
    await adapter.poll();
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe('error');
  });

  it('exposes fetch_now tool', () => {
    const tools = adapter.getTools();
    expect(tools.length).toBe(1);
    expect(tools[0]!.name).toBe('fetch_now');
  });

  it('fetch_now returns error when not connected', async () => {
    const tools = adapter.getTools();
    const result = await tools[0]!.handler({}) as { error: string };
    expect(result.error).toContain('not connected');
  });

  it('fetch_now works when connected', async () => {
    globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('content'),
    } as Response);

    await adapter.connect({ url: 'http://example.com/test', interval_seconds: '9999' });

    const tools = adapter.getTools();
    const result = await tools[0]!.handler({}) as { success: boolean; hash: string };
    expect(result.success).toBe(true);
    expect(result.hash).toBeTruthy();
  });

  it('disconnect clears timer and state', async () => {
    globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('content'),
    } as Response);

    await adapter.connect({ url: 'http://example.com/test', interval_seconds: '9999' });
    await adapter.disconnect();

    const tools = adapter.getTools();
    const result = await tools[0]!.handler({}) as { error: string };
    expect(result.error).toContain('not connected');
  });
});
