import { jest } from '@jest/globals';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { IntegrationDetail } from '../../cli/app/screens/IntegrationDetail.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mockDetailResponse = {
  id: 'int-1',
  name: 'My Slack',
  type: 'slack',
  status: 'active',
  created_at: '2025-01-15T10:30:00Z',
  updated_at: '2025-01-15T12:00:00Z',
  last_event_at: new Date(Date.now() - 120000).toISOString(),
  config: {
    bot_token: 'xoxb-real-token-here',
    app_token: 'xapp-another-token-here',
    channel: 'general',
    api_key: 'sk-12345',
  },
};

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => mockDetailResponse,
  });
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

describe('IntegrationDetail', () => {
  it('renders integration details after loading', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationDetail, { integrationId: 'int-1', onBack })
    );

    // Initially shows loading
    expect(lastFrame()).toContain('Loading');

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('int-1');
    expect(frame).toContain('My Slack');
    expect(frame).toContain('slack');
    expect(frame).toContain('active');
  });

  it('shows all detail fields', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationDetail, { integrationId: 'int-1', onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('ID:');
    expect(frame).toContain('Name:');
    expect(frame).toContain('Type:');
    expect(frame).toContain('Status:');
    expect(frame).toContain('Created:');
    expect(frame).toContain('Last Event:');
  });

  it('shows status badge with icon', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationDetail, { integrationId: 'int-1', onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('🟢');
  });

  it('redacts secret config fields', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationDetail, { integrationId: 'int-1', onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    // Secret fields should be redacted
    expect(frame).toContain('bot_token');
    expect(frame).toContain('••••••');
    expect(frame).not.toContain('xoxb-real-token-here');
    expect(frame).not.toContain('xapp-another-token-here');
    expect(frame).not.toContain('sk-12345');
  });

  it('shows non-secret config fields in plain text', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationDetail, { integrationId: 'int-1', onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    // Non-secret field should be shown
    expect(frame).toContain('channel');
    expect(frame).toContain('general');
  });

  it('shows Configuration section header', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationDetail, { integrationId: 'int-1', onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('Configuration');
  });

  it('shows last_event_at with relative time', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationDetail, { integrationId: 'int-1', onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toMatch(/\d+[mhd] ago/);
  });

  it('calls onBack when Escape is pressed', async () => {
    const onBack = jest.fn();

    const { stdin } = render(
      React.createElement(IntegrationDetail, { integrationId: 'int-1', onBack })
    );

    await delay(100);

    stdin.write('\u001B');
    await delay(50);

    expect(onBack).toHaveBeenCalled();
  });

  it('calls enable API when e is pressed', async () => {
    const onBack = jest.fn();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockDetailResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const { stdin } = render(
      React.createElement(IntegrationDetail, { integrationId: 'int-1', onBack })
    );

    await delay(100);

    stdin.write('e');
    await delay(100);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/integrations/int-1/enable'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('calls disable API when d is pressed', async () => {
    const onBack = jest.fn();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockDetailResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const { stdin } = render(
      React.createElement(IntegrationDetail, { integrationId: 'int-1', onBack })
    );

    await delay(100);

    stdin.write('d');
    await delay(100);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/integrations/int-1/disable'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('shows confirmation dialog when x is pressed', async () => {
    const onBack = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(IntegrationDetail, { integrationId: 'int-1', onBack })
    );

    await delay(100);

    stdin.write('x');
    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Remove integration');
    expect(frame).toContain('y');
    expect(frame).toContain('n');
  });

  it('removes integration when x then y is pressed and calls onBack', async () => {
    const onBack = jest.fn();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockDetailResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const { stdin } = render(
      React.createElement(IntegrationDetail, { integrationId: 'int-1', onBack })
    );

    await delay(100);

    stdin.write('x');
    await delay(50);
    stdin.write('y');
    await delay(100);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/integrations/int-1'),
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(onBack).toHaveBeenCalled();
  });

  it('cancels remove when x then n is pressed', async () => {
    const onBack = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(IntegrationDetail, { integrationId: 'int-1', onBack })
    );

    await delay(100);

    stdin.write('x');
    await delay(50);
    stdin.write('n');
    await delay(50);

    const frame = lastFrame()!;
    // Should be back to detail, not showing confirm dialog
    expect(frame).toContain('My Slack');
    expect(frame).not.toContain('Remove integration');
  });

  it('shows keyboard hints in footer', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationDetail, { integrationId: 'int-1', onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('e:enable');
    expect(frame).toContain('d:disable');
    expect(frame).toContain('x:remove');
    expect(frame).toContain('Esc:back');
  });

  it('handles 404 error gracefully', async () => {
    const onBack = jest.fn();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    });

    const { lastFrame } = render(
      React.createElement(IntegrationDetail, { integrationId: 'nonexistent', onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('HTTP 404');
  });

  it('shows "never" when last_event_at is null', async () => {
    const onBack = jest.fn();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        ...mockDetailResponse,
        last_event_at: null,
      }),
    });

    const { lastFrame } = render(
      React.createElement(IntegrationDetail, { integrationId: 'int-1', onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('never');
  });
});
