import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { StatusBar } from '../../cli/app/components/StatusBar.js';

afterEach(() => {
  cleanup();
});

describe('StatusBar', () => {
  it('renders unread count', () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        unreadCount: 5,
        uptime: '2m 30s',
        mcpPort: 3333,
        adminPort: 3334,
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('5');
    expect(frame).toContain('unread');
  });

  it('renders port numbers', () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        unreadCount: 0,
        uptime: '1m 0s',
        mcpPort: 3333,
        adminPort: 3334,
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('3333');
    expect(frame).toContain('3334');
  });

  it('renders uptime', () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        unreadCount: 0,
        uptime: '5m 10s',
        mcpPort: 3333,
        adminPort: 3334,
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('5m 10s');
  });

  it('renders keyboard hints', () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        unreadCount: 0,
        uptime: '0s',
        mcpPort: 3333,
        adminPort: 3334,
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('q:quit');
    expect(frame).toContain('?:help');
    expect(frame).toContain('Tab:pane');
  });

  it('renders zero unread count', () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        unreadCount: 0,
        uptime: '0s',
        mcpPort: 3333,
        adminPort: 3334,
      })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('0');
    expect(frame).toContain('unread');
  });
});
