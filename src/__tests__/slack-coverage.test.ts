/**
 * Extended Slack integration tests to boost statement coverage.
 * Tests cover connected-state tool handlers, webClient paths, error paths,
 * the emit/onEvent flow, and disconnect edge cases.
 */
import { jest } from '@jest/globals';
import { SlackIntegration } from '../integrations/builtin/slack.js';
import type { NotificationEvent } from '../integrations/types.js';

describe('SlackIntegration - connected state tool handlers', () => {
  // Helper: create a SlackIntegration with a fake connected state
  function makeConnectedSlack(hasWebClient = true): SlackIntegration {
    const adapter = new SlackIntegration();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    a.connected = true;
    if (hasWebClient) {
      a.webClient = {
        chat: {
          postMessage: jest.fn().mockResolvedValue({ ts: '12345.67890', channel: 'C123' }),
        },
        conversations: {
          list: jest.fn().mockResolvedValue({ channels: [{ id: 'C123', name: 'general' }] }),
          replies: jest.fn().mockResolvedValue({ messages: [{ text: 'reply 1' }] }),
        },
        reactions: {
          add: jest.fn().mockResolvedValue({}),
        },
      };
    } else {
      a.webClient = null;
    }
    return adapter;
  }

  // ─── send_message ────────────────────────────────────────────────────────

  it('send_message succeeds when connected with webClient', async () => {
    const adapter = makeConnectedSlack(true);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'send_message')!;

    const result = await tool.handler({ channel: 'C123', text: 'hello' }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.ts).toBe('12345.67890');
    expect(result.channel).toBe('C123');
  });

  it('send_message returns error when webClient is null (no @slack/bolt)', async () => {
    const adapter = makeConnectedSlack(false);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'send_message')!;

    const result = await tool.handler({ channel: 'C123', text: 'hello' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('@slack/bolt');
  });

  it('send_message returns error when webClient.chat.postMessage throws', async () => {
    const adapter = makeConnectedSlack(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).webClient.chat.postMessage = jest.fn().mockRejectedValue(new Error('Slack API error'));
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'send_message')!;

    const result = await tool.handler({ channel: 'C123', text: 'hello' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('Slack API error');
  });

  it('send_message returns error when webClient throws non-Error', async () => {
    const adapter = makeConnectedSlack(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).webClient.chat.postMessage = jest.fn().mockRejectedValue('string error');
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'send_message')!;

    const result = await tool.handler({ channel: 'C123', text: 'hello' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toBe('string error');
  });

  // ─── list_channels ───────────────────────────────────────────────────────

  it('list_channels succeeds when connected with webClient', async () => {
    const adapter = makeConnectedSlack(true);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'list_channels')!;

    const result = await tool.handler({ limit: 10 }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(Array.isArray(result.channels)).toBe(true);
  });

  it('list_channels succeeds with default limit', async () => {
    const adapter = makeConnectedSlack(true);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'list_channels')!;

    const result = await tool.handler({}) as Record<string, unknown>;
    expect(result.success).toBe(true);
  });

  it('list_channels returns channels as empty array when API returns undefined', async () => {
    const adapter = makeConnectedSlack(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).webClient.conversations.list = jest.fn().mockResolvedValue({ channels: undefined });
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'list_channels')!;

    const result = await tool.handler({}) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.channels).toEqual([]);
  });

  it('list_channels returns error when webClient is null', async () => {
    const adapter = makeConnectedSlack(false);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'list_channels')!;

    const result = await tool.handler({}) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('@slack/bolt');
  });

  it('list_channels returns error when API throws', async () => {
    const adapter = makeConnectedSlack(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).webClient.conversations.list = jest.fn().mockRejectedValue(new Error('channels error'));
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'list_channels')!;

    const result = await tool.handler({}) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('channels error');
  });

  // ─── get_thread ──────────────────────────────────────────────────────────

  it('get_thread succeeds when connected with webClient', async () => {
    const adapter = makeConnectedSlack(true);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'get_thread')!;

    const result = await tool.handler({ channel: 'C123', thread_ts: '12345.67890' }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it('get_thread returns messages as empty array when API returns undefined', async () => {
    const adapter = makeConnectedSlack(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).webClient.conversations.replies = jest.fn().mockResolvedValue({ messages: undefined });
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'get_thread')!;

    const result = await tool.handler({ channel: 'C123', thread_ts: '12345.67890' }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.messages).toEqual([]);
  });

  it('get_thread returns error when webClient is null', async () => {
    const adapter = makeConnectedSlack(false);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'get_thread')!;

    const result = await tool.handler({ channel: 'C123', thread_ts: '12345.67890' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('@slack/bolt');
  });

  it('get_thread returns error when API throws', async () => {
    const adapter = makeConnectedSlack(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).webClient.conversations.replies = jest.fn().mockRejectedValue(new Error('thread error'));
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'get_thread')!;

    const result = await tool.handler({ channel: 'C123', thread_ts: '12345.67890' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('thread error');
  });

  // ─── react ───────────────────────────────────────────────────────────────

  it('react succeeds when connected with webClient', async () => {
    const adapter = makeConnectedSlack(true);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'react')!;

    const result = await tool.handler({ channel: 'C123', timestamp: '12345.67890', emoji: 'thumbsup' }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.message).toContain('thumbsup');
  });

  it('react returns error when webClient is null', async () => {
    const adapter = makeConnectedSlack(false);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'react')!;

    const result = await tool.handler({ channel: 'C123', timestamp: '12345.67890', emoji: 'thumbsup' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('@slack/bolt');
  });

  it('react returns error when API throws', async () => {
    const adapter = makeConnectedSlack(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).webClient.reactions.add = jest.fn().mockRejectedValue(new Error('reaction error'));
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'react')!;

    const result = await tool.handler({ channel: 'C123', timestamp: '12345.67890', emoji: 'thumbsup' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('reaction error');
  });

  it('react returns error when API throws non-Error', async () => {
    const adapter = makeConnectedSlack(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).webClient.reactions.add = jest.fn().mockRejectedValue('raw string error');
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'react')!;

    const result = await tool.handler({ channel: 'C123', timestamp: '12345.67890', emoji: 'thumbsup' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toBe('raw string error');
  });

  // ─── onEvent / emit ──────────────────────────────────────────────────────

  it('emits events when eventHandler is set', () => {
    const adapter = makeConnectedSlack(true);
    const events: NotificationEvent[] = [];
    adapter.onEvent((e) => events.push(e));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    const fakeEvent: NotificationEvent = {
      id: 'test-1',
      source: 'slack',
      type: 'message',
      title: 'New Slack message',
      body: 'Hello from Slack',
      timestamp: new Date().toISOString(),
    };
    a.emit(fakeEvent);
    expect(events.length).toBe(1);
    expect(events[0].source).toBe('slack');
  });

  it('emit silently ignores errors in event handler', () => {
    const adapter = makeConnectedSlack(true);
    adapter.onEvent(() => { throw new Error('handler error'); });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    expect(() => a.emit({
      id: 'test-2',
      source: 'slack',
      type: 'message',
      title: 'Test',
      body: 'body',
      timestamp: new Date().toISOString(),
    })).not.toThrow();
  });

  it('emit does nothing when no eventHandler registered', () => {
    const adapter = makeConnectedSlack(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    expect(() => a.emit({
      id: 'test-3',
      source: 'slack',
      type: 'message',
      title: 'Test',
      body: 'body',
      timestamp: new Date().toISOString(),
    })).not.toThrow();
  });

  // ─── disconnect ──────────────────────────────────────────────────────────

  it('disconnect calls app.stop() and sets connected=false', async () => {
    const adapter = makeConnectedSlack(true);
    const stopMock = jest.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).app = { stop: stopMock };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).connected = true;

    await adapter.disconnect();
    expect(stopMock).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((adapter as any).connected).toBe(false);
  });

  it('disconnect handles stop() throwing', async () => {
    const adapter = makeConnectedSlack(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).app = { stop: jest.fn().mockRejectedValue(new Error('stop error')) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).connected = true;

    await expect(adapter.disconnect()).resolves.not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((adapter as any).connected).toBe(false);
  });

  it('connect throws when missing required tokens', async () => {
    const adapter = new SlackIntegration();
    await expect(adapter.connect({})).rejects.toThrow('Missing required Slack tokens');
  });

  it('new SlackIntegration starts disconnected', () => {
    const adapter = new SlackIntegration();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((adapter as any).connected).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((adapter as any).webClient).toBeNull();
  });
});
