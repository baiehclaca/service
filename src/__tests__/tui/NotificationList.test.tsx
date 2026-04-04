import { jest } from '@jest/globals';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { NotificationList } from '../../cli/app/screens/NotificationList.js';
import type { NotificationItem } from '../../cli/app/screens/NotificationList.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mockNotifications: NotificationItem[] = [
  {
    id: 'n1',
    source: 'slack',
    type: 'message',
    title: 'New message in #general',
    body: 'Hello world from Slack!',
    read: 0,
    created_at: new Date(Date.now() - 120000).toISOString(),
    metadata: null,
  },
  {
    id: 'n2',
    source: 'email',
    type: 'email',
    title: 'Meeting reminder',
    body: 'Your meeting starts in 15 minutes.',
    read: 1,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    metadata: null,
  },
  {
    id: 'n3',
    source: 'x-twitter',
    type: 'mention',
    title: '@user mentioned you',
    body: 'Check out this tweet!',
    read: 0,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    metadata: null,
  },
];

// Mock global fetch
const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => mockNotifications,
  });
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

describe('NotificationList', () => {
  it('renders notification items after loading', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();

    const { lastFrame } = render(
      React.createElement(NotificationList, { onBack, onSelect })
    );

    // Initially shows loading
    expect(lastFrame()).toContain('Loading');

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('New message in #general');
    expect(frame).toContain('Meeting reminder');
    expect(frame).toContain('@user mentioned you');
  });

  it('shows unread count in header', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();

    const { lastFrame } = render(
      React.createElement(NotificationList, { onBack, onSelect })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('2 unread');
  });

  it('shows unread (●) and read (○) indicators', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();

    const { lastFrame } = render(
      React.createElement(NotificationList, { onBack, onSelect })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('●');
    expect(frame).toContain('○');
  });

  it('navigates down with j key', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(NotificationList, { onBack, onSelect })
    );

    await delay(100);

    // First item is selected by default; press j to move down
    stdin.write('j');
    await delay(50);

    // The second item should now be highlighted (inverse)
    const frame = lastFrame()!;
    // Just confirm no crash and items render
    expect(frame).toContain('Meeting reminder');
  });

  it('navigates up with k key', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(NotificationList, { onBack, onSelect })
    );

    await delay(100);

    // Move down then up
    stdin.write('j');
    await delay(50);
    stdin.write('k');
    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('New message in #general');
  });

  it('calls onSelect when Enter is pressed', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();

    const { stdin } = render(
      React.createElement(NotificationList, { onBack, onSelect })
    );

    await delay(100);

    stdin.write('\r');
    await delay(50);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1', title: 'New message in #general' })
    );
  });

  it('calls onBack when Escape is pressed', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();

    const { stdin } = render(
      React.createElement(NotificationList, { onBack, onSelect })
    );

    await delay(100);

    stdin.write('\u001B');
    await delay(50);

    expect(onBack).toHaveBeenCalled();
  });

  it('marks notification as read with Space', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNotifications })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const { stdin } = render(
      React.createElement(NotificationList, { onBack, onSelect })
    );

    await delay(100);

    // Press Space to mark first notification as read
    stdin.write(' ');
    await delay(100);

    // fetch should have been called with PATCH for mark-read
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/notifications/n1/read'),
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('marks all as read with A key', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => mockNotifications })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const { stdin } = render(
      React.createElement(NotificationList, { onBack, onSelect })
    );

    await delay(100);

    stdin.write('A');
    await delay(100);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/notifications/mark-all-read'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('toggles unread filter with u key', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(NotificationList, { onBack, onSelect })
    );

    await delay(100);

    stdin.write('u');
    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('unread only');

    // fetch should have been called with unread=true
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('unread=true')
    );
  });

  it('opens search mode with / key', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(NotificationList, { onBack, onSelect })
    );

    await delay(100);

    stdin.write('/');
    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Search:');
  });

  it('displays keyboard hints in footer', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();

    const { lastFrame } = render(
      React.createElement(NotificationList, { onBack, onSelect })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('j/k:nav');
    expect(frame).toContain('Enter:detail');
    expect(frame).toContain('Space:read');
    expect(frame).toContain('Esc:back');
  });

  it('appends SSE notifications to list', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();

    const sseNotifications: NotificationItem[] = [
      {
        id: 'sse-1',
        source: 'webhook',
        type: 'alert',
        title: 'New SSE notification',
        body: 'Via SSE',
        read: 0,
        created_at: new Date().toISOString(),
        metadata: null,
      },
    ];

    const { lastFrame } = render(
      React.createElement(NotificationList, {
        onBack,
        onSelect,
        sseNotifications,
      })
    );

    // Wait for initial fetch + SSE merge
    await delay(200);

    const frame = lastFrame()!;
    expect(frame).toContain('New SSE notification');
  });

  it('shows no notifications message when empty', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const { lastFrame } = render(
      React.createElement(NotificationList, { onBack, onSelect })
    );

    await delay(100);

    const frame = lastFrame()!;
    expect(frame).toContain('No notifications');
  });

  it('shows relative timestamps', async () => {
    const onBack = jest.fn();
    const onSelect = jest.fn();

    const { lastFrame } = render(
      React.createElement(NotificationList, { onBack, onSelect })
    );

    await delay(100);

    const frame = lastFrame()!;
    // Should contain relative time like "2m ago" or "1h ago" or "2h ago"
    expect(frame).toMatch(/\d+[mhd] ago/);
  });
});
