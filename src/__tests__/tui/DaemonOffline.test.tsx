import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { DaemonOffline } from '../../cli/app/screens/DaemonOffline.js';

afterEach(() => {
  cleanup();
});

describe('DaemonOffline', () => {
  it('renders the offline message', () => {
    const { lastFrame } = render(React.createElement(DaemonOffline));
    const frame = lastFrame()!;
    expect(frame).toContain('SERVICE is not running');
  });

  it('shows the start command instruction', () => {
    const { lastFrame } = render(React.createElement(DaemonOffline));
    const frame = lastFrame()!;
    expect(frame).toContain('service start');
  });

  it('shows quit instruction', () => {
    const { lastFrame } = render(React.createElement(DaemonOffline));
    const frame = lastFrame()!;
    expect(frame).toContain('Press q to quit');
  });
});
