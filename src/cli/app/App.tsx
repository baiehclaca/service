import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Box, useApp, useInput } from 'ink';
import { TitleBar } from './components/TitleBar.js';
import { StatusBar } from './components/StatusBar.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { DaemonOffline } from './screens/DaemonOffline.js';
import { Dashboard } from './screens/Dashboard.js';
import { NotificationList } from './screens/NotificationList.js';
import { NotificationDetail } from './screens/NotificationDetail.js';
import { useApi } from './hooks/useApi.js';
import { useSse } from './hooks/useSse.js';
import type { NotificationItem } from './screens/NotificationList.js';
import type { NotificationDetailItem } from './screens/NotificationDetail.js';

type Screen = 'dashboard' | 'offline' | 'notifications' | 'notification-detail';

interface StatusData {
  version: string;
  uptime: number;
  activeSseConnections: number;
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
  const [selectedNotification, setSelectedNotification] = useState<NotificationDetailItem | null>(null);

  // Check daemon health
  const { data: statusData, error: statusError } = useApi<StatusData>('/api/status', 5000);

  // Get unread count from notifications
  const { data: notifData } = useApi<NotificationItem[]>('/api/notifications?limit=100', 5000);

  // SSE connection for real-time updates
  const { events: sseEvents } = useSse();

  // Extract notification items from SSE events
  const sseNotifications = useMemo<NotificationItem[]>(() => {
    return sseEvents
      .filter((e) => e.type === 'notification' && e.data && typeof e.data.id === 'string')
      .map((e) => ({
        id: e.data.id as string,
        source: (e.data.source as string) || 'unknown',
        type: (e.data.type as string) || 'notification',
        title: (e.data.title as string) || 'Untitled',
        body: (e.data.body as string) || '',
        read: (e.data.read as number) ?? 0,
        created_at: (e.data.created_at as string) || new Date().toISOString(),
        metadata: (e.data.metadata as string) ?? null,
      }));
  }, [sseEvents]);

  // Compute unread count using a deduplicated Set of unread IDs.
  // API data is the source of truth; SSE items only contribute if their ID
  // is not already present in the API list, preventing double-counting after
  // mark-all-read and when SSE echoes notifications already fetched.
  const unreadCount = useMemo(() => {
    const unreadIds = new Set<string>();
    if (notifData) {
      for (const n of notifData) {
        if (!n.read) unreadIds.add(n.id);
      }
    }
    const apiIds = new Set(notifData ? notifData.map((n) => n.id) : []);
    for (const n of sseNotifications) {
      if (!n.read && !apiIds.has(n.id)) {
        unreadIds.add(n.id);
      }
    }
    return unreadIds.size;
  }, [notifData, sseNotifications]);

  // Detect daemon online/offline
  useEffect(() => {
    if (statusError === 'ECONNREFUSED') {
      setScreen('offline');
    } else if (statusData && screen === 'offline') {
      setScreen('dashboard');
    }
  }, [statusData, statusError, screen]);

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

  // Navigate to notification list from dashboard
  const handleNavigateToNotifications = useCallback(() => {
    setScreen('notifications');
  }, []);

  // Navigate to notification detail
  const handleSelectNotification = useCallback((notification: NotificationItem) => {
    setSelectedNotification(notification);
    setScreen('notification-detail');
  }, []);

  // Back from notification detail to list
  const handleBackFromDetail = useCallback((updated?: NotificationDetailItem) => {
    if (updated) {
      setSelectedNotification(updated);
    }
    setScreen('notifications');
  }, []);

  // Back from notification list to dashboard
  const handleBackFromList = useCallback(() => {
    setScreen('dashboard');
  }, []);

  // Keyboard handling — only active on dashboard / help screens
  useInput((input, key) => {
    // Help overlay toggle (works from any screen)
    if (input === '?' && screen === 'dashboard') {
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

    // Don't handle q / Tab when in sub-screens (they have their own input)
    if (screen !== 'dashboard' && screen !== 'offline') return;

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
  const daemonOnline = !statusError && statusData !== null;

  const rows = process.stdout.rows ?? 24;

  const renderScreen = (): React.ReactElement => {
    if (helpVisible) {
      return <HelpOverlay visible={true} />;
    }
    switch (screen) {
      case 'offline':
        return <DaemonOffline />;
      case 'notifications':
        return (
          <NotificationList
            onBack={handleBackFromList}
            onSelect={handleSelectNotification}
            sseNotifications={sseNotifications}
          />
        );
      case 'notification-detail':
        return selectedNotification ? (
          <NotificationDetail
            notification={selectedNotification}
            onBack={handleBackFromDetail}
          />
        ) : (
          <DaemonOffline />
        );
      case 'dashboard':
      default:
        return (
          <Dashboard
            activePane={activePane}
            onNavigateToNotifications={handleNavigateToNotifications}
          />
        );
    }
  };

  return (
    <Box flexDirection="column" height={rows}>
      <TitleBar version={version} daemonOnline={daemonOnline} />
      <Box flexGrow={1} flexDirection="column">
        {renderScreen()}
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
