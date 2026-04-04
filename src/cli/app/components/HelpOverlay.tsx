import React from 'react';
import { Box, Text } from 'ink';

interface HelpOverlayProps {
  visible: boolean;
}

/**
 * ? key shows keybinding reference overlay.
 */
export function HelpOverlay({ visible }: HelpOverlayProps): React.ReactElement | null {
  if (!visible) return null;

  const bindings = [
    ['Tab', 'Cycle between panes'],
    ['j / ↓', 'Move down in list'],
    ['k / ↑', 'Move up in list'],
    ['Enter', 'Open detail / select'],
    ['Escape', 'Go back'],
    ['r', 'Refresh data'],
    ['?', 'Toggle this help overlay'],
    ['q', 'Quit dashboard'],
  ];

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      alignSelf="center"
    >
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="yellow">
          Keyboard Shortcuts
        </Text>
      </Box>
      {bindings.map(([key, desc]) => (
        <Box key={key} gap={2}>
          <Box width={14}>
            <Text bold color="cyan">
              {key}
            </Text>
          </Box>
          <Text>{desc}</Text>
        </Box>
      ))}
      <Box justifyContent="center" marginTop={1}>
        <Text dimColor>Press ? or Escape to close</Text>
      </Box>
    </Box>
  );
}
