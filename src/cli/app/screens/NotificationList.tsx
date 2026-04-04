import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { formatRelative } from '../../../utils/format-relative.js';

const BASE_URL = 'http://127.0.0.1:3334';

export interface NotificationItem {
  id: string;
  source: string;
  type: string;
  title: string;
  body: string;
  read: number;
  created_at: string;
  metadata: string | null;
}

interface NotificationListProps {
  onBack: () => void;
  onSelect: (notification: NotificationItem) => void;
  sseNotifications?: NotificationItem[];
}

/**
 * Full notification list with keyboard navigation, filtering, search.
 * Keybindings: up/down or j/k = move, Enter = detail, Space = mark read,
 * A = mark all read, u = toggle unread filter, / = search, Escape = back.
 */
export function NotificationList({
  onBack,
  onSelect,
  sseNotifications,
}: NotificationListProps): React.ReactElement {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const rows = process.stdout.rows ?? 24;
  const visibleCount = Math.max(rows - 8, 5);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      let url: string;
      if (searchQuery) {
        url = `${BASE_URL}/api/notifications?search=${encodeURIComponent(searchQuery)}&limit=50`;
      } else if (unreadOnly) {
        url = `${BASE_URL}/api/notifications?limit=50&unread=true`;
      } else {
        url = `${BASE_URL}/api/notifications?limit=50`;
      }
      const resp = await fetch(url);
      if (resp.ok) {
        const data = (await resp.json()) as NotificationItem[];
        // Merge with any SSE items that aren't in the fetched data
        setNotifications((prev) => {
          const fetchedIds = new Set(data.map((n) => n.id));
          const sseOnly = prev.filter((n) => !fetchedIds.has(n.id));
          return [...sseOnly, ...data];
        });
      }
    } catch {
      // Silently fail — daemon might be offline
    } finally {
      setLoading(false);
    }
  }, [unreadOnly, searchQuery]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Merge SSE notifications into list (prepend new ones)
  useEffect(() => {
    if (sseNotifications && sseNotifications.length > 0) {
      setNotifications((prev) => {
        const existingIds = new Set(prev.map((n) => n.id));
        const newItems = sseNotifications.filter((n) => !existingIds.has(n.id));
        if (newItems.length === 0) return prev;
        return [...newItems, ...prev];
      });
    }
  }, [sseNotifications]);

  // Mark a single notification as read
  const markAsRead = useCallback(
    async (id: string) => {
      try {
        await fetch(`${BASE_URL}/api/notifications/${id}/read`, { method: 'PATCH' });
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: 1 } : n))
        );
      } catch {
        // ignore
      }
    },
    []
  );

  // Mark all as read
  const markAllRead = useCallback(async () => {
    try {
      await fetch(`${BASE_URL}/api/notifications/mark-all-read`, { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
    } catch {
      // ignore
    }
  }, []);

  // Keep selection in bounds
  useEffect(() => {
    if (selectedIndex >= notifications.length && notifications.length > 0) {
      setSelectedIndex(notifications.length - 1);
    }
  }, [notifications, selectedIndex]);

  // Adjust scroll offset to keep selection visible
  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + visibleCount) {
      setScrollOffset(selectedIndex - visibleCount + 1);
    }
  }, [selectedIndex, scrollOffset, visibleCount]);

  useInput((input, key) => {
    // Search mode: handle text input
    if (searchMode) {
      if (key.escape) {
        setSearchMode(false);
        setSearchInput('');
        setSearchQuery('');
        return;
      }
      if (key.return) {
        setSearchQuery(searchInput);
        setSearchMode(false);
        setSelectedIndex(0);
        setScrollOffset(0);
        return;
      }
      if (key.backspace || key.delete) {
        setSearchInput((prev) => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setSearchInput((prev) => prev + input);
        return;
      }
      return;
    }

    // Normal mode keybindings
    if (key.escape) {
      if (searchQuery) {
        setSearchQuery('');
        setSelectedIndex(0);
        setScrollOffset(0);
      } else {
        onBack();
      }
      return;
    }

    // Navigate up
    if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    // Navigate down
    if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => Math.min(notifications.length - 1, i + 1));
      return;
    }

    // Enter = open detail
    if (key.return) {
      const selected = notifications[selectedIndex];
      if (selected) {
        onSelect(selected);
      }
      return;
    }

    // Space = mark selected as read
    if (input === ' ') {
      const selected = notifications[selectedIndex];
      if (selected && !selected.read) {
        markAsRead(selected.id);
      }
      return;
    }

    // A = mark all as read
    if (input === 'A') {
      markAllRead();
      return;
    }

    // u = toggle unread filter
    if (input === 'u') {
      setUnreadOnly((v) => !v);
      setSelectedIndex(0);
      setScrollOffset(0);
      setLoading(true);
      return;
    }

    // / = search
    if (input === '/') {
      setSearchMode(true);
      setSearchInput('');
      return;
    }
  });

  const unreadCount = notifications.filter((n) => !n.read).length;
  const visibleNotifications = notifications.slice(scrollOffset, scrollOffset + visibleCount);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">
          Notifications ({unreadCount} unread)
        </Text>
        <Box>
          {unreadOnly && (
            <Text color="yellow"> [unread only]</Text>
          )}
          {searchQuery && (
            <Text color="yellow"> [search: {searchQuery}]</Text>
          )}
        </Box>
      </Box>

      {/* Search bar */}
      {searchMode && (
        <Box paddingX={1}>
          <Text color="yellow">Search: </Text>
          <Text>{searchInput}</Text>
          <Text dimColor>█</Text>
        </Box>
      )}

      {/* Notification list */}
      <Box flexDirection="column" flexGrow={1} overflowY="hidden" paddingX={1}>
        {loading ? (
          <Text dimColor>Loading notifications...</Text>
        ) : notifications.length === 0 ? (
          <Text dimColor>No notifications.</Text>
        ) : (
          visibleNotifications.map((n, i) => {
            const actualIndex = scrollOffset + i;
            const isSelected = actualIndex === selectedIndex;
            const readMark = n.read ? '○' : '●';
            const time = formatRelative(n.created_at);

            return (
              <Box key={n.id}>
                <Text
                  inverse={isSelected}
                  bold={!n.read}
                  color={n.read ? 'gray' : 'cyan'}
                >
                  {readMark} [{n.source}] {n.title}
                </Text>
                <Text dimColor> {time}</Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* Footer */}
      <Box paddingX={1}>
        <Text dimColor>
          j/k:nav  Enter:detail  Space:read  A:all-read  u:filter  /:search  Esc:back
        </Text>
      </Box>
    </Box>
  );
}
