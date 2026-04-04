import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { TitleBar } from '../../cli/app/components/TitleBar.js';

afterEach(() => {
  cleanup();
});

describe('TitleBar', () => {
  it('renders SERVICE name', () => {
    const { lastFrame } = render(
      React.createElement(TitleBar, { version: '1.0.1', daemonOnline: true })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('SERVICE');
  });

  it('renders version', () => {
    const { lastFrame } = render(
      React.createElement(TitleBar, { version: '1.0.1', daemonOnline: true })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('1.0.1');
  });

  it('shows online status when daemon is online', () => {
    const { lastFrame } = render(
      React.createElement(TitleBar, { version: '1.0.1', daemonOnline: true })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('online');
  });

  it('shows offline status when daemon is offline', () => {
    const { lastFrame } = render(
      React.createElement(TitleBar, { version: '1.0.1', daemonOnline: false })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('offline');
  });
});
