import React from 'react';
import { Box, Text, useInput } from 'ink';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Reusable y/n confirmation dialog.
 */
export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps): React.ReactElement {
  useInput((input) => {
    if (input === 'y' || input === 'Y') {
      onConfirm();
    } else if (input === 'n' || input === 'N') {
      onCancel();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      alignSelf="center"
    >
      <Text>{message}</Text>
      <Box marginTop={1}>
        <Text dimColor>Press </Text>
        <Text bold color="green">y</Text>
        <Text dimColor> to confirm, </Text>
        <Text bold color="red">n</Text>
        <Text dimColor> to cancel</Text>
      </Box>
    </Box>
  );
}
