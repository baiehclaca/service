import React from 'react';
import { render } from 'ink';
import { App } from './app/App.js';

/**
 * Thin wrapper that launches the Ink TUI dashboard.
 * Replaces the old blessed-based dashboard.
 */
export function createDashboard(): void {
  render(React.createElement(App));
}
