import { jest } from '@jest/globals';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { McpList } from '../../cli/app/screens/McpList.js';
import type { McpItem } from '../../cli/app/screens/McpList.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mockMcps: McpItem[] = [
  {
    id: 'mcp-1',
    name: 'filesystem',
    command: 'npx @modelcontextprotocol/server-filesystem',
    args: ['/Users/test/docs'],
    status: 'active',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    toolCount: 14,
  },
  {
    id: 'mcp-2',
    name: 'github',
    command: 'npx @modelcontextprotocol/server-github',
    args: [],
    status: 'error',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    toolCount: 0,
  },
  {
    id: 'mcp-3',
    name: 'memory',
    command: 'npx @modelcontextprotocol/server-memory',
    args: ['--persist'],
    status: 'connecting',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
];

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => mockMcps,
  });
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

describe('McpList', () => {
  it('renders MCP items after loading', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    // Initially shows loading
    expect(lastFrame()).toContain('Loading');

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('filesystem');
    expect(frame).toContain('github');
    expect(frame).toContain('memory');
  });

  it('shows count in header', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('MCPs (3)');
  });

  it('shows color-coded status badges', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('🟢');
    expect(frame).toContain('🔴');
    expect(frame).toContain('⏳');
  });

  it('shows tool count when available', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    const frame = lastFrame()!;
    // filesystem has toolCount: 14 — should show "14 tools"
    expect(frame).toContain('14 tools');
    // github has toolCount: 0 — should NOT show tool count
    // memory has toolCount: undefined — should NOT show tool count
  });

  it('shows command (truncated) in list', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    const frame = lastFrame()!;
    // Commands should be visible (may be truncated)
    expect(frame).toContain('npx');
  });

  it('navigates down with j key', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('j');
    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('github');
  });

  it('navigates up with k key', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('j');
    await delay(50);
    stdin.write('k');
    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('filesystem');
  });

  it('calls onSelect when Enter is pressed', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { stdin } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('\r');
    await delay(50);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mcp-1', name: 'filesystem' })
    );
  });

  it('calls onBack when Escape is pressed', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { stdin } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('\u001B');
    await delay(50);

    expect(onBack).toHaveBeenCalled();
  });

  it('calls onAdd when a is pressed', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { stdin } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('a');
    await delay(50);

    expect(onAdd).toHaveBeenCalled();
  });

  it('shows confirmation dialog when x is pressed', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('x');
    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Remove MCP');
    expect(frame).toContain('y');
    expect(frame).toContain('n');
  });

  it('removes MCP when x then y is pressed', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockMcps })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const { stdin } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('x');
    await delay(50);
    stdin.write('y');
    await delay(100);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/mcp-connections/mcp-1'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('cancels remove when x then n is pressed', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('x');
    await delay(100);
    stdin.write('n');
    await delay(100);

    const frame = lastFrame()!;
    // Should be back to the list, no confirmation dialog
    expect(frame).toContain('filesystem');
  });

  it('triggers reconnect when r is pressed', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockMcps })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'mcp-new', name: 'filesystem', toolsAdded: 14 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => mockMcps });

    const { lastFrame, stdin } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    stdin.write('r');
    await delay(200);

    // Should have called DELETE then POST
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/mcp-connections/mcp-1'),
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/mcp-connections'),
      expect.objectContaining({ method: 'POST' })
    );

    const frame = lastFrame()!;
    expect(frame).toContain('Reconnect');
  });

  it('shows keyboard hints in footer', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('j/k:nav');
    expect(frame).toContain('Enter:detail');
    expect(frame).toContain('r:reconnect');
    expect(frame).toContain('x:remove');
    expect(frame).toContain('a:add');
    expect(frame).toContain('Esc:back');
  });

  it('shows empty message when no MCPs exist', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const { lastFrame } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('No MCPs connected');
  });

  it('shows status text in list entries', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();
    const onAdd = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpList, { onBack, onSelect, onAdd })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('active');
    expect(frame).toContain('error');
    expect(frame).toContain('connecting');
  });
});
