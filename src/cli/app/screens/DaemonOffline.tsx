import React from 'react';
import { Box, Text } from 'ink';

/**
 * Shown when daemon unreachable.
 * Displays 'SERVICE is not running — run `service start`'.
 */
export function DaemonOffline(): React.ReactElement {
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="red"
        paddingX={4}
        paddingY={2}
        alignItems="center"
      >
        <Text bold color="red">
          SERVICE is not running
        </Text>
        <Box marginTop={1}>
          <Text>
            Run <Text bold color="cyan">service start</Text> to start the daemon
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press q to quit</Text>
        </Box>
      </Box>
    </Box>
  );
}
