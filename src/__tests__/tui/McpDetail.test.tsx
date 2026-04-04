import { jest } from '@jest/globals';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { McpDetail } from '../../cli/app/screens/McpDetail.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mockMcpData = {
  id: 'mcp-1',
  name: 'filesystem',
  command: 'npx',
  args: ['@modelcontextprotocol/server-filesystem', '/Users/test/docs'],
  status: 'active',
  created_at: '2025-01-15T10:30:00Z',
  updated_at: '2025-01-15T12:00:00Z',
  toolsAdded: 14,
};

const mockTools = [
  { name: 'read_file', description: 'Read the contents of a file' },
  { name: 'write_file', description: 'Write content to a file' },
];

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn().mockImplementation((url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes('/tools')) {
      return Promise.resolve({
        ok: true,
        json: async () => [],
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ success: true }),
    });
  });
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

describe('McpDetail', () => {
  it('renders MCP detail fields', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: mockMcpData, onBack })
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('filesystem');
    expect(frame).toContain('npx');
    expect(frame).toContain('active');
    expect(frame).toContain('2025-01-15T10:30:00Z');
  });

  it('shows full command and args', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: mockMcpData, onBack })
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Command:');
    expect(frame).toContain('npx');
    expect(frame).toContain('Args:');
    expect(frame).toContain('@modelcontextprotocol/server-filesystem');
    expect(frame).toContain('/Users/test/docs');
  });

  it('shows all detail field labels', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: mockMcpData, onBack })
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Name:');
    expect(frame).toContain('Command:');
    expect(frame).toContain('Args:');
    expect(frame).toContain('Status:');
    expect(frame).toContain('Connected At:');
  });

  it('shows status badge with icon', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: mockMcpData, onBack })
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('🟢');
  });

  it('shows "No tools available" when tools list is empty', async () => {
    const onBack = jest.fn();

    (global.fetch as jest.Mock).mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/tools')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    });

    const { lastFrame } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: mockMcpData, onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('Tools (0):');
    expect(frame).toContain('No tools available');
  });

  it('shows tool list with descriptions', async () => {
    const onBack = jest.fn();

    (global.fetch as jest.Mock).mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/tools')) {
        return Promise.resolve({ ok: true, json: async () => mockTools });
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    });

    const { lastFrame } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: mockMcpData, onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('Tools (2):');
    expect(frame).toContain('read_file');
    expect(frame).toContain('Read the contents of a file');
    expect(frame).toContain('write_file');
    expect(frame).toContain('Write content to a file');
  });

  it('shows (none) when args are empty', async () => {
    const onBack = jest.fn();
    const noArgsMcp = { ...mockMcpData, args: [] };

    const { lastFrame } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: noArgsMcp, onBack })
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('(none)');
  });

  it('calls onBack when Escape is pressed', async () => {
    const onBack = jest.fn();

    const { stdin } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: mockMcpData, onBack })
    );

    await delay(50);

    stdin.write('\u001B');
    await delay(50);

    expect(onBack).toHaveBeenCalled();
  });

  it('triggers reconnect when r is pressed', async () => {
    const onBack = jest.fn();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // initial tools fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }) // DELETE
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'mcp-new', name: 'filesystem', toolsAdded: 14 }) }) // POST
      .mockResolvedValueOnce({ ok: true, json: async () => [] }); // tools fetch after reconnect

    const { lastFrame, stdin } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: mockMcpData, onBack })
    );

    await delay(50);

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
    expect(frame).toContain('Reconnected');
  });

  it('shows confirmation dialog when x is pressed', async () => {
    const onBack = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: mockMcpData, onBack })
    );

    await delay(50);

    stdin.write('x');
    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Remove MCP');
    expect(frame).toContain('y');
    expect(frame).toContain('n');
  });

  it('removes MCP when x then y is pressed and calls onBack', async () => {
    const onBack = jest.fn();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // tools fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }); // DELETE

    const { stdin } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: mockMcpData, onBack })
    );

    await delay(50);

    stdin.write('x');
    await delay(50);
    stdin.write('y');
    await delay(100);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/mcp-connections/mcp-1'),
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(onBack).toHaveBeenCalled();
  });

  it('cancels remove when x then n is pressed', async () => {
    const onBack = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: mockMcpData, onBack })
    );

    await delay(50);

    stdin.write('x');
    await delay(100);
    stdin.write('n');
    await delay(100);

    const frame = lastFrame()!;
    // Should be back to detail, not showing confirm dialog
    expect(frame).toContain('filesystem');
  });

  it('shows keyboard hints in footer', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: mockMcpData, onBack })
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('r:reconnect');
    expect(frame).toContain('x:remove');
    expect(frame).toContain('Esc:back');
  });

  it('shows MCP Detail header', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: mockMcpData, onBack })
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('MCP Detail');
  });

  it('shows error status badge for errored MCP', async () => {
    const onBack = jest.fn();
    const errorMcp = { ...mockMcpData, status: 'error' };

    const { lastFrame } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: errorMcp, onBack })
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('🔴');
    expect(frame).toContain('error');
  });

  it('shows connecting status during reconnect', async () => {
    const onBack = jest.fn();

    // Delay the DELETE response so we can see the 'connecting' state
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // tools fetch
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({
          ok: true,
          json: async () => ({ success: true }),
        }), 500))
      );

    const { lastFrame, stdin } = render(
      React.createElement(McpDetail, { mcpId: 'mcp-1', mcpData: mockMcpData, onBack })
    );

    await delay(50);

    stdin.write('r');
    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('connecting');
  });
});
