import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';

const BASE_URL = 'http://127.0.0.1:3334';

type Step = 'name' | 'command' | 'args' | 'review' | 'submitting' | 'success' | 'error';

interface McpAddProps {
  onBack: () => void;
}

/**
 * In-TUI form for adding a new MCP connection.
 * Fields: name (text), command (text), args (text, space-separated, split on submit).
 * Submit → POST /api/mcp-connections → success → back to list.
 * Escape=cancel.
 */
export function McpAdd({ onBack }: McpAddProps): React.ReactElement {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [argsStr, setArgsStr] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle Escape for cancellation
  useInput((_input, key) => {
    if (key.escape) {
      onBack();
    }
  });

  // Handle name submission
  const handleNameSubmit = useCallback((value: string) => {
    setName(value);
    setStep('command');
  }, []);

  // Handle command submission
  const handleCommandSubmit = useCallback((value: string) => {
    setCommand(value);
    setStep('args');
  }, []);

  // Handle args submission
  const handleArgsSubmit = useCallback((value: string) => {
    setArgsStr(value);
    setStep('review');
  }, []);

  // Submit the form
  const handleSubmit = useCallback(async () => {
    setStep('submitting');

    const args = argsStr.trim() ? argsStr.trim().split(/\s+/) : [];

    try {
      const resp = await fetch(`${BASE_URL}/api/mcp-connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, command, args }),
      });

      if (resp.ok) {
        setStep('success');
        // Auto-return to list after 2s
        setTimeout(() => onBack(), 2000);
      } else {
        const result = (await resp.json()) as { error?: string };
        setErrorMessage(result.error ?? `HTTP ${resp.status}`);
        setStep('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      setStep('error');
    }
  }, [name, command, argsStr, onBack]);

  // Render based on step
  switch (step) {
    case 'name':
      return (
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <Text bold color="yellow">Add MCP — Step 1: Name</Text>
          <Box marginTop={1}>
            <Text>Enter a name for this MCP connection:</Text>
          </Box>
          <Box marginTop={1}>
            <TextInput placeholder="e.g. filesystem" onSubmit={handleNameSubmit} />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Enter:next  Esc:cancel</Text>
          </Box>
        </Box>
      );

    case 'command':
      return (
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <Text bold color="yellow">Add MCP — Step 2: Command</Text>
          <Box marginTop={1}>
            <Text>Enter the command to start this MCP server:</Text>
          </Box>
          <Box marginTop={1}>
            <TextInput placeholder="e.g. npx @modelcontextprotocol/server-filesystem" onSubmit={handleCommandSubmit} />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Enter:next  Esc:cancel</Text>
          </Box>
        </Box>
      );

    case 'args':
      return (
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <Text bold color="yellow">Add MCP — Step 3: Args</Text>
          <Box marginTop={1}>
            <Text>Enter command arguments (space-separated, or leave empty):</Text>
          </Box>
          <Box marginTop={1}>
            <TextInput placeholder="e.g. /path/to/dir --verbose" onSubmit={handleArgsSubmit} />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Enter:next  Esc:cancel</Text>
          </Box>
        </Box>
      );

    case 'review':
      return (
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <Text bold color="yellow">Add MCP — Review</Text>
          <Box marginTop={1} flexDirection="column">
            <Box>
              <Text dimColor>Name: </Text>
              <Text bold>{name}</Text>
            </Box>
            <Box>
              <Text dimColor>Command: </Text>
              <Text>{command}</Text>
            </Box>
            <Box>
              <Text dimColor>Args: </Text>
              <Text>{argsStr.trim() || '(none)'}</Text>
            </Box>
          </Box>
          <Box marginTop={1}>
            <ReviewActions onSubmit={handleSubmit} />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Enter:create  Esc:cancel</Text>
          </Box>
        </Box>
      );

    case 'submitting':
      return (
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <Text bold color="yellow">Add MCP</Text>
          <Box marginTop={1}>
            <Text color="yellow">Creating MCP connection...</Text>
          </Box>
        </Box>
      );

    case 'success':
      return (
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <Text bold color="yellow">Add MCP</Text>
          <Box marginTop={1}>
            <Text color="green">✓ MCP connection created successfully!</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Returning to list...</Text>
          </Box>
        </Box>
      );

    case 'error':
      return (
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <Text bold color="yellow">Add MCP</Text>
          <Box marginTop={1}>
            <Text color="red">✗ Failed to create MCP connection: {errorMessage}</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Esc:back</Text>
          </Box>
        </Box>
      );
  }
}

/**
 * Small helper component to handle the review step's Enter key.
 * Separated so useInput can be called at the component level.
 */
function ReviewActions({ onSubmit }: { onSubmit: () => void }): React.ReactElement {
  useInput((_input, key) => {
    if (key.return) {
      onSubmit();
    }
  });

  return <Text color="cyan">Press Enter to create MCP connection, Esc to cancel</Text>;
}
