import React from 'react';
import { Box, Text } from 'ink';

interface TitleBarProps {
  version: string;
  daemonOnline: boolean;
}

/**
 * Top bar: 'SERVICE' name, version, daemon status dot.
 */
export function TitleBar({ version, daemonOnline }: TitleBarProps): React.ReactElement {
  const statusDot = daemonOnline ? '🟢' : '🔴';
  const statusText = daemonOnline ? 'online' : 'offline';

  return (
    <Box width="100%" justifyContent="space-between" paddingX={1}>
      <Text bold color="blue">
        SERVICE
      </Text>
      <Text>
        <Text dimColor>v{version}</Text>
        {'  '}
        {statusDot}
        {'  '}
        <Text color={daemonOnline ? 'green' : 'red'}>{statusText}</Text>
      </Text>
    </Box>
  );
}
