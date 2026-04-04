import { jest } from '@jest/globals';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { IntegrationAdd } from '../../cli/app/screens/IntegrationAdd.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mockTypesResponse = [
  {
    type: 'echo',
    name: 'Echo (Test)',
    description: 'Sends periodic test notifications',
    configSchema: {
      type: 'object',
      properties: {
        interval_seconds: {
          type: 'number',
          description: 'Interval between echo notifications in seconds',
          default: 60,
          minimum: 1,
        },
      },
      required: [],
    },
  },
  {
    type: 'webhook',
    name: 'Generic Webhook',
    description: 'Receives webhook POST notifications',
    configSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Webhook identifier name',
        },
      },
      required: ['name'],
    },
  },
  {
    type: 'slack',
    name: 'Slack',
    description: 'Slack integration',
    configSchema: {
      type: 'object',
      properties: {
        bot_token: {
          type: 'string',
          description: 'Slack bot token',
        },
        app_token: {
          type: 'string',
          description: 'Slack app-level token',
        },
        channel: {
          type: 'string',
          description: 'Default channel',
        },
      },
      required: ['bot_token', 'app_token'],
    },
  },
];

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => mockTypesResponse,
  });
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

describe('IntegrationAdd', () => {
  it('renders type selection step initially', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationAdd, { onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('Select Type');
    expect(frame).toContain('Echo (Test)');
  });

  it('shows loading while fetching types', async () => {
    const onBack = jest.fn();

    // Delay the fetch response
    (global.fetch as jest.Mock).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({
        ok: true,
        json: async () => mockTypesResponse,
      }), 500))
    );

    const { lastFrame } = render(
      React.createElement(IntegrationAdd, { onBack })
    );

    const frame = lastFrame()!;
    expect(frame).toContain('Loading');
  });

  it('calls onBack when Escape is pressed', async () => {
    const onBack = jest.fn();

    const { stdin } = render(
      React.createElement(IntegrationAdd, { onBack })
    );

    await delay(100);

    stdin.write('\u001B');
    await delay(50);

    expect(onBack).toHaveBeenCalled();
  });

  it('shows all integration types in select', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationAdd, { onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('Echo (Test)');
    expect(frame).toContain('Generic Webhook');
    expect(frame).toContain('Slack');
  });

  it('shows navigation hints at the bottom', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationAdd, { onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('Esc:cancel');
  });

  it('fetches types from the API on mount', async () => {
    const onBack = jest.fn();

    render(React.createElement(IntegrationAdd, { onBack }));

    await delay(100);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/integrations/types')
    );
  });

  it('shows "Add Integration" header', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationAdd, { onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('Add Integration');
  });

  it('renders step 1 label', async () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(IntegrationAdd, { onBack })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('Step 1');
  });
});
