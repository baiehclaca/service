import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { ConfirmDialog } from '../components/ConfirmDialog.js';

const BASE_URL = 'http://127.0.0.1:3334';

export interface McpDetailData {
  id: string;
  name: string;
  command: string;
  args: string[];
  status: string;
  created_at: string;
  updated_at: string;
  toolsAdded?: number;
}

interface McpDetailProps {
  mcpId: string;
  mcpData: McpDetailData;
  onBack: () => void;
}

/** Returns a color-coded status badge */
function statusBadge(status: string): { icon: string; color: string } {
  switch (status) {
    case 'active':
    case 'connected':
      return { icon: '🟢', color: 'green' };
    case 'error':
      return { icon: '🔴', color: 'red' };
    case 'connecting':
      return { icon: '⏳', color: 'yellow' };
    default:
      return { icon: '○', color: 'gray' };
  }
}

/**
 * Detail view for a single MCP connection.
 * Shows: name, full command + args, status, connected_at.
 * Scrollable tool list (if tools API is available) or placeholder.
 * Keybindings: r=reconnect, x=remove, Escape=back.
 */
export function McpDetail({
  mcpId,
  mcpData,
  onBack,
}: McpDetailProps): React.ReactElement {
  const [data, setData] = useState<McpDetailData>(mcpData);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Clear action message after a short time
  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  // Reconnect: DELETE then POST with same config
  const reconnectMcp = useCallback(async () => {
    try {
      setData((prev) => ({ ...prev, status: 'connecting' }));
      setActionMessage('Reconnecting...');

      const delResp = await fetch(`${BASE_URL}/api/mcp-connections/${mcpId}`, { method: 'DELETE' });
      if (!delResp.ok) {
        setActionMessage('Failed to reconnect');
        return;
      }

      const postResp = await fetch(`${BASE_URL}/api/mcp-connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name, command: data.command, args: data.args }),
      });

      if (postResp.ok) {
        const result = (await postResp.json()) as { id: string; name: string; toolsAdded: number };
        setData((prev) => ({ ...prev, id: result.id, status: 'active', toolsAdded: result.toolsAdded }));
        setActionMessage('Reconnected successfully');
      } else {
        setData((prev) => ({ ...prev, status: 'error' }));
        setActionMessage('Failed to reconnect');
      }
    } catch {
      setData((prev) => ({ ...prev, status: 'error' }));
      setActionMessage('Failed to reconnect');
    }
  }, [mcpId, data.name, data.command, data.args]);

  // Remove
  const removeMcp = useCallback(async () => {
    try {
      const resp = await fetch(`${BASE_URL}/api/mcp-connections/${mcpId}`, { method: 'DELETE' });
      if (!resp.ok) {
        setActionMessage('Failed to remove');
        return;
      }
      onBack();
    } catch {
      setActionMessage('Failed to remove');
    }
  }, [mcpId, onBack]);

  const handleConfirmRemove = useCallback(() => {
    removeMcp();
    setConfirmRemove(false);
  }, [removeMcp]);

  const handleCancelRemove = useCallback(() => {
    setConfirmRemove(false);
  }, []);

  useInput((input, key) => {
    if (confirmRemove) return;

    if (key.escape) {
      onBack();
      return;
    }

    if (input === 'r') {
      reconnectMcp();
      return;
    }

    if (input === 'x') {
      setConfirmRemove(true);
      return;
    }
  });

  if (confirmRemove) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box paddingX={1} marginBottom={1}>
          <Text bold color="yellow">MCP Detail</Text>
        </Box>
        <ConfirmDialog
          message={`Remove MCP "${data.name}"? (y/n)`}
          onConfirm={handleConfirmRemove}
          onCancel={handleCancelRemove}
        />
      </Box>
    );
  }

  const badge = statusBadge(data.status);
  const argsStr = data.args.length > 0 ? data.args.join(' ') : '(none)';

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {/* Header */}
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="yellow">MCP Detail</Text>
        {actionMessage && <Text color="yellow">{actionMessage}</Text>}
      </Box>

      {/* Fields */}
      <Box>
        <Text dimColor>Name: </Text>
        <Text bold>{data.name}</Text>
      </Box>
      <Box>
        <Text dimColor>Command: </Text>
        <Text>{data.command}</Text>
      </Box>
      <Box>
        <Text dimColor>Args: </Text>
        <Text>{argsStr}</Text>
      </Box>
      <Box>
        <Text dimColor>Status: </Text>
        <Text color={badge.color}>{badge.icon} {data.status}</Text>
      </Box>
      <Box>
        <Text dimColor>Connected At: </Text>
        <Text>{data.created_at}</Text>
      </Box>

      {/* Tool list — no API exists to fetch tools, show placeholder */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor bold>Tools:</Text>
        <Box
          borderStyle="single"
          borderColor="gray"
          flexDirection="column"
          paddingX={1}
        >
          <Text dimColor>Connect to MCP to see tools</Text>
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          r:reconnect  x:remove  Esc:back
        </Text>
      </Box>
    </Box>
  );
}
