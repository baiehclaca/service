import { SlackIntegration } from '../integrations/builtin/slack.js';
import type { NotificationEvent } from '../integrations/types.js';

describe('SlackIntegration', () => {
  let adapter: SlackIntegration;

  beforeEach(() => {
    adapter = new SlackIntegration();
  });

  afterEach(async () => {
    // Ensure adapter is disconnected after each test
    await adapter.disconnect();
  });

  it('has correct id and metadata', () => {
    expect(adapter.id).toBe('slack');
    expect(adapter.name).toBe('Slack');
    expect(adapter.configSchema.type).toBe('object');
    expect(adapter.configSchema.required).toContain('bot_token');
    expect(adapter.configSchema.required).toContain('app_token');
  });

  it('connect fails with missing required config', async () => {
    await expect(adapter.connect({ bot_token: '' })).rejects.toThrow('Missing required Slack tokens');
  });

  it('exposes 4 tools', () => {
    const tools = adapter.getTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('send_message');
    expect(names).toContain('list_channels');
    expect(names).toContain('get_thread');
    expect(names).toContain('react');
  });

  it('send_message returns error when not connected', async () => {
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'send_message')!;
    const result = await tool.handler({ channel: '#test', text: 'hello' }) as { error: string };
    expect(result.error).toContain('not connected');
  });

  it('list_channels returns error when not connected', async () => {
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'list_channels')!;
    const result = await tool.handler({}) as { error: string };
    expect(result.error).toContain('not connected');
  });

  it('get_thread returns error when not connected', async () => {
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'get_thread')!;
    const result = await tool.handler({ channel: 'C123', thread_ts: '12345.67890' }) as { error: string };
    expect(result.error).toContain('not connected');
  });

  it('react returns error when not connected', async () => {
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'react')!;
    const result = await tool.handler({ channel: 'C123', timestamp: '12345.67890', emoji: 'thumbsup' }) as { error: string };
    expect(result.error).toContain('not connected');
  });

  it('onEvent registers handler', () => {
    const events: NotificationEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    expect(events.length).toBe(0);
  });

  it('@slack/bolt package is installed and importable', async () => {
    // Verify the package is available (required since we removed mock-success fallbacks)
    const bolt = await import('@slack/bolt');
    expect(bolt.App).toBeDefined();
  });
});
