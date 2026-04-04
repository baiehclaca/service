import { jest } from '@jest/globals';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { McpAdd } from '../../cli/app/screens/McpAdd.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'new-mcp', name: 'test-mcp', toolsAdded: 5 }),
  });
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

describe('McpAdd', () => {
  it('renders Step 1: Name initially', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpAdd, { onBack })
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Step 1');
    expect(frame).toContain('Name');
  });

  it('shows "Add MCP" header', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpAdd, { onBack })
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Add MCP');
  });

  it('calls onBack when Escape is pressed', async () => {
    const onBack = jest.fn();

    const { stdin } = render(
      React.createElement(McpAdd, { onBack })
    );

    await delay(50);

    stdin.write('\u001B');
    await delay(50);

    expect(onBack).toHaveBeenCalled();
  });

  it('shows navigation hints', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpAdd, { onBack })
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Esc:cancel');
  });

  it('shows name prompt text', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpAdd, { onBack })
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Enter a name');
  });

  it('shows Step 1 label for name step', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpAdd, { onBack })
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Step 1');
    expect(frame).toContain('Name');
  });

  it('shows hint for enter and escape', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(McpAdd, { onBack })
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Enter:next');
    expect(frame).toContain('Esc:cancel');
  });
});
