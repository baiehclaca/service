import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { formatRelative } from '../../../utils/format-relative.js';

const BASE_URL = 'http://127.0.0.1:3334';

export interface NotificationDetailItem {
  id: string;
  source: string;
  type: string;
  title: string;
  body: string;
  read: number;
  created_at: string;
  metadata: string | null;
}

interface NotificationDetailProps {
  notification: NotificationDetailItem;
  onBack: (updated?: NotificationDetailItem) => void;
}

/**
 * Detail view for a single notification.
 * Shows full title, body, source, type, timestamp.
 * Space = mark as read, Escape = back.
 */
export function NotificationDetail({
  notification,
  onBack,
}: NotificationDetailProps): React.ReactElement {
  const [item, setItem] = useState<NotificationDetailItem>(notification);

  const markAsRead = useCallback(async () => {
    if (item.read) return;
    try {
      await fetch(`${BASE_URL}/api/notifications/${item.id}/read`, { method: 'PATCH' });
      const updated = { ...item, read: 1 };
      setItem(updated);
    } catch {
      // ignore
    }
  }, [item]);

  useInput((input, key) => {
    if (key.escape) {
      onBack(item);
      return;
    }
    if (input === ' ') {
      markAsRead();
      return;
    }
  });

  const readStatus = item.read ? 'Read' : 'Unread';
  const readColor = item.read ? 'gray' : 'cyan';
  const readMark = item.read ? '○' : '●';

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Notification Detail
        </Text>
      </Box>

      {/* Title */}
      <Box>
        <Text dimColor>Title: </Text>
        <Text bold>{item.title}</Text>
      </Box>

      {/* Source */}
      <Box>
        <Text dimColor>Source: </Text>
        <Text>{item.source}</Text>
      </Box>

      {/* Type */}
      <Box>
        <Text dimColor>Type: </Text>
        <Text>{item.type}</Text>
      </Box>

      {/* Timestamp */}
      <Box>
        <Text dimColor>Time: </Text>
        <Text>{item.created_at} ({formatRelative(item.created_at)})</Text>
      </Box>

      {/* Read status */}
      <Box>
        <Text dimColor>Status: </Text>
        <Text color={readColor}>
          {readMark} {readStatus}
        </Text>
      </Box>

      {/* Body */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Body:</Text>
        <Box
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          paddingY={0}
          flexDirection="column"
        >
          <Text wrap="wrap">{item.body}</Text>
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          Space:mark read  Esc:back
        </Text>
      </Box>
    </Box>
  );
}
