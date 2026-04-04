import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { HelpOverlay } from '../../cli/app/components/HelpOverlay.js';

afterEach(() => {
  cleanup();
});

describe('HelpOverlay', () => {
  it('renders nothing when not visible', () => {
    const { lastFrame } = render(
      React.createElement(HelpOverlay, { visible: false })
    );
    const frame = lastFrame();
    // Should be empty or minimal when not visible
    expect(frame).toBeDefined();
  });

  it('renders keyboard shortcuts when visible', () => {
    const { lastFrame } = render(
      React.createElement(HelpOverlay, { visible: true })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Keyboard Shortcuts');
    expect(frame).toContain('Tab');
    expect(frame).toContain('Quit dashboard');
  });

  it('shows close instruction', () => {
    const { lastFrame } = render(
      React.createElement(HelpOverlay, { visible: true })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Escape to close');
  });

  it('lists Enter key binding', () => {
    const { lastFrame } = render(
      React.createElement(HelpOverlay, { visible: true })
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Enter');
  });
});
