import { jest } from '@jest/globals';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { IntegrationList } from '../../cli/app/screens/IntegrationList.js';
import type { IntegrationItem } from '../../cli/app/screens/IntegrationList.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mockIntegrations: IntegrationItem[] = [
  {
    id: 'int-1',
    name: 'My Slack',
    type: 'slack',
    status: 'active',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    last_event_at: new Date(Date.now() - 120000).toISOString(),
  },
  {
    id: 'int-2',
    name: 'Twitter Feed',
    type: 'x-twitter',
    status: 'error',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    last_event_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'int-3',
    name: 'Disabled Webhook',
    type: 'webhook',
    status: 'inactive',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    last_event_at: null,
  },
];

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => mockIntegrations,
  });
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

describe('IntegrationList', () => {
  it('renders integration items after loading', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
    );

    // Initially shows loading
    expect(lastFrame()).toContain('Loading');

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('My Slack');
    expect(frame).toContain('Twitter Feed');
    expect(frame).toContain('Disabled Webhook');
  });

  it('shows count in header', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('Integrations (3)');
  });

  it('shows color-coded status badges', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('🟢');
    expect(frame).toContain('🔴');
    expect(frame).toContain('⏸');
  });

  it('shows relative time for last_event_at', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    const frame = lastFrame()!;
    // Should contain relative time like "2m ago" or "1h ago"
    expect(frame).toMatch(/\d+[mhd] ago/);
    // The third integration has null last_event_at, should show 'never'
    expect(frame).toContain('never');
  });

  it('navigates down with j key', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('j');
    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Twitter Feed');
  });

  it('navigates up with k key', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('j');
    await delay(50);
    stdin.write('k');
    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('My Slack');
  });

  it('calls onSelect when Enter is pressed', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { stdin } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('\r');
    await delay(50);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'int-1', name: 'My Slack' })
    );
  });

  it('calls onBack when Escape is pressed', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { stdin } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('\u001B');
    await delay(50);

    expect(onBack).toHaveBeenCalled();
  });

  it('calls enable API when e is pressed', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockIntegrations })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const { stdin } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
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
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockIntegrations })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const { stdin } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
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
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('x');
    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Remove integration');
    expect(frame).toContain('y');
    expect(frame).toContain('n');
  });

  it('removes integration when x then y is pressed', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockIntegrations })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const { stdin } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
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
  });

  it('cancels remove when x then n is pressed', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('x');
    await delay(50);
    stdin.write('n');
    await delay(50);

    const frame = lastFrame()!;
    // Should be back to the list, no confirmation dialog
    expect(frame).toContain('My Slack');
    expect(frame).not.toContain('Remove integration');
  });

  it('calls onAdd when a is pressed', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { stdin } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('a');
    await delay(50);

    expect(onAdd).toHaveBeenCalled();
  });

  it('shows keyboard hints in footer', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('j/k:nav');
    expect(frame).toContain('Enter:detail');
    expect(frame).toContain('e:enable');
    expect(frame).toContain('d:disable');
    expect(frame).toContain('x:remove');
    expect(frame).toContain('a:add');
    expect(frame).toContain('Esc:back');
  });

  it('shows empty message when no integrations exist', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const { lastFrame } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('No integrations configured');
  });

  it('shows integration type in list', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('(slack)');
    expect(frame).toContain('(x-twitter)');
    expect(frame).toContain('(webhook)');
  });
});
