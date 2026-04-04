import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  unreadCount: number;
  uptime: string;
  mcpPort: number;
  adminPort: number;
}

/**
 * Bottom bar: unread count, uptime, ports (3333/3334).
 * Refreshes every 5s via parent providing updated props.
 */
export function StatusBar({ unreadCount, uptime, mcpPort, adminPort }: StatusBarProps): React.ReactElement {
  return (
    <Box width="100%" justifyContent="space-between" paddingX={1}>
      <Text>
        <Text color="cyan" bold>
          {unreadCount}
        </Text>
        <Text dimColor> unread</Text>
      </Text>
      <Text dimColor>
        uptime: {uptime}
      </Text>
      <Text dimColor>
        ports: {mcpPort}/{adminPort}
      </Text>
      <Text dimColor>
        q:quit  ?:help  Tab:pane
      </Text>
    </Box>
  );
}
