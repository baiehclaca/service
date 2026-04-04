import { jest } from '@jest/globals';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { NotificationDetail } from '../../cli/app/screens/NotificationDetail.js';
import type { NotificationDetailItem } from '../../cli/app/screens/NotificationDetail.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mockNotification: NotificationDetailItem = {
  id: 'n1',
  source: 'slack',
  type: 'message',
  title: 'New message in #general',
  body: 'Hello world from Slack! This is the full body text of the notification with all details.',
  read: 0,
  created_at: new Date(Date.now() - 120000).toISOString(),
  metadata: null,
};

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
  });
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

describe('NotificationDetail', () => {
  it('renders full notification details', () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(NotificationDetail, {
        notification: mockNotification,
        onBack,
      })
    );

    const frame = lastFrame()!;
    expect(frame).toContain('Notification Detail');
    expect(frame).toContain('New message in #general');
    expect(frame).toContain('slack');
    expect(frame).toContain('message');
    expect(frame).toContain('Hello world from Slack!');
  });

  it('shows unread status indicator', () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(NotificationDetail, {
        notification: mockNotification,
        onBack,
      })
    );

    const frame = lastFrame()!;
    expect(frame).toContain('●');
    expect(frame).toContain('Unread');
  });

  it('shows read status indicator for read notification', () => {
    const onBack = jest.fn();
    const readNotification = { ...mockNotification, read: 1 };

    const { lastFrame } = render(
      React.createElement(NotificationDetail, {
        notification: readNotification,
        onBack,
      })
    );

    const frame = lastFrame()!;
    expect(frame).toContain('○');
    expect(frame).toContain('Read');
  });

  it('shows timestamp with relative time', () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(NotificationDetail, {
        notification: mockNotification,
        onBack,
      })
    );

    const frame = lastFrame()!;
    // Should contain the actual timestamp and relative time
    expect(frame).toContain('Time:');
    expect(frame).toMatch(/\d+[mhd] ago/);
  });

  it('calls onBack when Escape is pressed', async () => {
    const onBack = jest.fn();

    const { stdin } = render(
      React.createElement(NotificationDetail, {
        notification: mockNotification,
        onBack,
      })
    );

    await delay(50);
    stdin.write('\u001B');
    await delay(50);

    expect(onBack).toHaveBeenCalled();
  });

  it('marks notification as read with Space', async () => {
    const onBack = jest.fn();

    const { lastFrame, stdin } = render(
      React.createElement(NotificationDetail, {
        notification: mockNotification,
        onBack,
      })
    );

    await delay(50);
    stdin.write(' ');
    await delay(100);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/notifications/n1/read'),
      expect.objectContaining({ method: 'PATCH' })
    );

    // Status should now show as Read
    const frame = lastFrame()!;
    expect(frame).toContain('Read');
  });

  it('does not call mark-read API for already-read notification', async () => {
    const onBack = jest.fn();
    const readNotification = { ...mockNotification, read: 1 };

    const { stdin } = render(
      React.createElement(NotificationDetail, {
        notification: readNotification,
        onBack,
      })
    );

    await delay(50);
    stdin.write(' ');
    await delay(100);

    // fetch should NOT have been called (beyond any initial calls)
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/notifications/n1/read'),
      expect.anything()
    );
  });

  it('shows body text', () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(NotificationDetail, {
        notification: mockNotification,
        onBack,
      })
    );

    const frame = lastFrame()!;
    expect(frame).toContain('Body:');
    expect(frame).toContain('Hello world from Slack!');
    expect(frame).toContain('full body text');
  });

  it('shows source field', () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(NotificationDetail, {
        notification: mockNotification,
        onBack,
      })
    );

    const frame = lastFrame()!;
    expect(frame).toContain('Source:');
    expect(frame).toContain('slack');
  });

  it('shows type field', () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(NotificationDetail, {
        notification: mockNotification,
        onBack,
      })
    );

    const frame = lastFrame()!;
    expect(frame).toContain('Type:');
    expect(frame).toContain('message');
  });

  it('shows keyboard hints in footer', () => {
    const onBack = jest.fn();

    const { lastFrame } = render(
      React.createElement(NotificationDetail, {
        notification: mockNotification,
        onBack,
      })
    );

    const frame = lastFrame()!;
    expect(frame).toContain('Space:mark read');
    expect(frame).toContain('Esc:back');
  });

  it('passes updated item back on back navigation after marking read', async () => {
    const onBack = jest.fn();

    const { stdin } = render(
      React.createElement(NotificationDetail, {
        notification: mockNotification,
        onBack,
      })
    );

    // Mark as read
    await delay(50);
    stdin.write(' ');
    await delay(100);

    // Navigate back
    stdin.write('\u001B');
    await delay(50);

    expect(onBack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1', read: 1 })
    );
  });
});
