import React, { useState, useCallback, useEffect } from 'react';
import { Box, useApp, useInput } from 'ink';
import { TitleBar } from './components/TitleBar.js';
import { StatusBar } from './components/StatusBar.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { DaemonOffline } from './screens/DaemonOffline.js';
import { Dashboard } from './screens/Dashboard.js';
import { useApi } from './hooks/useApi.js';

type Screen = 'dashboard' | 'offline';

interface StatusData {
  version: string;
  uptime: number;
  activeSseConnections: number;
}

interface NotificationItem {
  read: number;
}

const PANE_COUNT = 4;

/**
 * Root component.
 * Screen state machine: renders TitleBar + current screen + StatusBar.
 * Keyboard: q=quit, ?=help, Tab=cycle pane.
 */
export function App(): React.ReactElement {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [activePane, setActivePane] = useState(0);
  const [helpVisible, setHelpVisible] = useState(false);

  // Check daemon health
  const { data: statusData, error: statusError } = useApi<StatusData>('/api/status', 5000);

  // Get unread count from notifications
  const { data: notifData } = useApi<NotificationItem[]>('/api/notifications?limit=100', 5000);

  // Detect daemon online/offline
  useEffect(() => {
    if (statusError === 'ECONNREFUSED') {
      setScreen('offline');
    } else if (statusData) {
      setScreen('dashboard');
    }
  }, [statusData, statusError]);

  // Format uptime
  const formatUptime = useCallback((): string => {
    if (!statusData?.uptime) return '—';
    const total = statusData.uptime;
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  }, [statusData]);

  // Keyboard handling
  useInput((input, key) => {
    // Help overlay toggle
    if (input === '?') {
      setHelpVisible((v) => !v);
      return;
    }

    // Close help with Escape
    if (key.escape && helpVisible) {
      setHelpVisible(false);
      return;
    }

    // Don't process other keys when help is showing
    if (helpVisible) return;

    // Quit
    if (input === 'q') {
      exit();
      return;
    }

    // Tab to cycle panes
    if (key.tab) {
      setActivePane((p) => (p + 1) % PANE_COUNT);
      return;
    }
  });

  // Fallback raw stdin listener for PTY/non-interactive contexts where
  // Ink's useInput may not fire reliably (e.g. tuistory, piped terminals).
  useEffect(() => {
    const handleStdin = (data: Buffer) => {
      const key = data.toString();
      // q, Q, ctrl+c, ctrl+q all quit
      if (key === 'q' || key === 'Q' || key === '\u0003' || key === '\u0011') {
        exit();
      }
    };

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on('data', handleStdin);

    return () => {
      process.stdin.off('data', handleStdin);
      process.stdin.pause();
    };
  }, [exit]);

  // SIGINT handler for clean exit in all contexts
  useEffect(() => {
    const handleSigint = () => process.exit(0);
    process.on('SIGINT', handleSigint);
    return () => {
      process.off('SIGINT', handleSigint);
    };
  }, []);

  const version = statusData?.version ?? '1.0.1';
  const daemonOnline = screen === 'dashboard' && !statusError;
  const unreadCount = notifData ? notifData.filter((n) => !n.read).length : 0;

  const rows = process.stdout.rows ?? 24;

  return (
    <Box flexDirection="column" height={rows}>
      <TitleBar version={version} daemonOnline={daemonOnline} />
      <Box flexGrow={1} flexDirection="column">
        {helpVisible ? (
          <HelpOverlay visible={true} />
        ) : screen === 'offline' ? (
          <DaemonOffline />
        ) : (
          <Dashboard activePane={activePane} />
        )}
      </Box>
      <StatusBar
        unreadCount={unreadCount}
        uptime={formatUptime()}
        mcpPort={3333}
        adminPort={3334}
      />
    </Box>
  );
}
