import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { Text, useApp, useInput } from 'ink';
import { DaemonOffline } from '../../cli/app/screens/DaemonOffline.js';
import { TitleBar } from '../../cli/app/components/TitleBar.js';
import { StatusBar } from '../../cli/app/components/StatusBar.js';
import { HelpOverlay } from '../../cli/app/components/HelpOverlay.js';

afterEach(() => {
  cleanup();
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('App', () => {
  describe('screen routing', () => {
    it('renders DaemonOffline screen component', () => {
      const { lastFrame } = render(React.createElement(DaemonOffline));
      expect(lastFrame()).toContain('SERVICE is not running');
      expect(lastFrame()).toContain('service start');
    });

    it('renders TitleBar with online status', () => {
      const { lastFrame } = render(
        React.createElement(TitleBar, { version: '1.0.1', daemonOnline: true })
      );
      expect(lastFrame()).toContain('SERVICE');
      expect(lastFrame()).toContain('online');
    });

    it('renders TitleBar with offline status', () => {
      const { lastFrame } = render(
        React.createElement(TitleBar, { version: '1.0.1', daemonOnline: false })
      );
      expect(lastFrame()).toContain('SERVICE');
      expect(lastFrame()).toContain('offline');
    });
  });

  describe('keyboard handling', () => {
    it('responds to keyboard input via useInput', async () => {
      let receivedInput = '';

      function TestKeyboard() {
        useInput((input) => {
          receivedInput = input;
        });
        return React.createElement(Text, null, 'waiting');
      }

      const { stdin } = render(React.createElement(TestKeyboard));
      await delay(50);
      stdin.write('q');
      await delay(50);
      expect(receivedInput).toBe('q');
    });

    it('useApp().exit() works for quitting', async () => {
      let exited = false;

      function TestQuit() {
        const { exit } = useApp();
        useInput((input) => {
          if (input === 'q') {
            exited = true;
            exit();
          }
        });
        return React.createElement(Text, null, 'test');
      }

      const { stdin } = render(React.createElement(TestQuit));
      await delay(50);
      stdin.write('q');
      await delay(50);
      expect(exited).toBe(true);
    });

    it('help overlay can be toggled', () => {
      // Visible
      const visible = render(React.createElement(HelpOverlay, { visible: true }));
      expect(visible.lastFrame()).toContain('Keyboard Shortcuts');
      visible.cleanup();

      // Not visible
      const hidden = render(React.createElement(HelpOverlay, { visible: false }));
      const frame = hidden.lastFrame() ?? '';
      expect(frame).not.toContain('Keyboard Shortcuts');
      hidden.cleanup();
    });

    it('? key toggles help state', async () => {
      function TestHelp() {
        const [helpVisible, setHelpVisible] = React.useState(false);

        useInput((input) => {
          if (input === '?') {
            setHelpVisible((v) => !v);
          }
        });

        return React.createElement(Text, null, `help:${helpVisible}`);
      }

      const { stdin, lastFrame } = render(React.createElement(TestHelp));
      expect(lastFrame()).toContain('help:false');

      await delay(50);
      stdin.write('?');
      await delay(50);
      expect(lastFrame()).toContain('help:true');

      stdin.write('?');
      await delay(50);
      expect(lastFrame()).toContain('help:false');
    });

    it('pane cycling works with state', async () => {
      const PANE_COUNT = 4;

      function TestPaneCycle() {
        const [pane, setPane] = React.useState(0);

        useInput((input) => {
          if (input === 'n') {
            setPane((p) => (p + 1) % PANE_COUNT);
          }
        });

        return React.createElement(Text, null, `pane:${pane}`);
      }

      const { stdin, lastFrame } = render(React.createElement(TestPaneCycle));
      expect(lastFrame()).toContain('pane:0');

      await delay(50);
      stdin.write('n');
      await delay(50);
      expect(lastFrame()).toContain('pane:1');

      stdin.write('n');
      await delay(50);
      expect(lastFrame()).toContain('pane:2');

      stdin.write('n');
      await delay(50);
      expect(lastFrame()).toContain('pane:3');

      stdin.write('n');
      await delay(50);
      expect(lastFrame()).toContain('pane:0');
    });
  });

  describe('status bar integration', () => {
    it('StatusBar renders with correct data', () => {
      const { lastFrame } = render(
        React.createElement(StatusBar, {
          unreadCount: 3,
          uptime: '5m 20s',
          mcpPort: 3333,
          adminPort: 3334,
        })
      );
      const frame = lastFrame()!;
      expect(frame).toContain('3');
      expect(frame).toContain('unread');
      expect(frame).toContain('5m 20s');
      expect(frame).toContain('3333');
      expect(frame).toContain('3334');
    });
  });
});
