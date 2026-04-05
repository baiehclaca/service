import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { ConfirmDialog } from '../components/ConfirmDialog.js';

const BASE_URL = 'http://127.0.0.1:3334';
const RECONNECT_MIN_CONNECTING_MS = 400;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

interface McpTool {
  name: string;
  description: string;
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

/** Scrollable tool list component */
function ToolList({ tools, loading }: { tools: McpTool[]; loading: boolean }): React.ReactElement {
  const [scrollOffset, setScrollOffset] = useState(0);
  const VISIBLE_ROWS = 6;

  useInput((input) => {
    if (input === 'j') {
      setScrollOffset((prev) => Math.min(prev + 1, Math.max(0, tools.length - VISIBLE_ROWS)));
    }
    if (input === 'k') {
      setScrollOffset((prev) => Math.max(prev - 1, 0));
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor bold>Tools:</Text>
        <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
          <Text dimColor>Loading tools...</Text>
        </Box>
      </Box>
    );
  }

  const visibleTools = tools.slice(scrollOffset, scrollOffset + VISIBLE_ROWS);
  const canScrollDown = scrollOffset + VISIBLE_ROWS < tools.length;
  const canScrollUp = scrollOffset > 0;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor bold>Tools ({tools.length}):</Text>
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
        {tools.length === 0 ? (
          <Text dimColor>No tools available</Text>
        ) : (
          <>
            {canScrollUp && <Text dimColor>↑ scroll up (k)</Text>}
            {visibleTools.map((tool) => (
              <Box key={tool.name} flexDirection="column" marginBottom={0}>
                <Text bold>{tool.name}</Text>
                {tool.description ? (
                  <Text dimColor>  {tool.description}</Text>
                ) : null}
              </Box>
            ))}
            {canScrollDown && <Text dimColor>↓ scroll down (j)</Text>}
          </>
        )}
      </Box>
    </Box>
  );
}

/**
 * Detail view for a single MCP connection.
 * Shows: name, full command + args, status, connected_at, and tool list.
 * Keybindings: r=reconnect, x=remove, j/k=scroll tools, Escape=back.
 */
export function McpDetail({
  mcpId,
  mcpData,
  onBack,
}: McpDetailProps): React.ReactElement {
  const [data, setData] = useState<McpDetailData>(mcpData);
  // Track the current ID separately so it updates after a reconnect
  const [currentId, setCurrentId] = useState<string>(mcpId);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);

  // Clear action message after a short time
  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  // Fetch tools for the current MCP connection
  const fetchTools = useCallback(async (id: string) => {
    setToolsLoading(true);
    try {
      const resp = await fetch(`${BASE_URL}/api/mcp-connections/${id}/tools`);
      if (resp.ok) {
        const toolList = (await resp.json()) as McpTool[];
        setTools(toolList);
      } else {
        setTools([]);
      }
    } catch {
      setTools([]);
    } finally {
      setToolsLoading(false);
    }
  }, []);

  // Initial tools fetch
  useEffect(() => {
    fetchTools(currentId);
  }, [currentId, fetchTools]);

  // Reconnect: DELETE then POST with same config
  const reconnectMcp = useCallback(async () => {
    const reconnectStartedAt = Date.now();

    try {
      setData((prev) => ({ ...prev, status: 'connecting' }));
      setActionMessage('Reconnecting...');

      const delResp = await fetch(`${BASE_URL}/api/mcp-connections/${currentId}`, { method: 'DELETE' });
      if (!delResp.ok) {
        setData((prev) => ({ ...prev, status: 'error' }));
        setActionMessage('Failed to reconnect');
        return;
      }

      const postResp = await fetch(`${BASE_URL}/api/mcp-connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name, command: data.command, args: data.args }),
      });

      if (postResp.ok) {
        const result = (await postResp.json()) as { id: string; name: string; toolsAdded?: number };
        const elapsed = Date.now() - reconnectStartedAt;
        if (elapsed < RECONNECT_MIN_CONNECTING_MS) {
          await sleep(RECONNECT_MIN_CONNECTING_MS - elapsed);
        }

        setCurrentId(result.id);
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
  }, [currentId, data.name, data.command, data.args]);

  // Remove
  const removeMcp = useCallback(async () => {
    try {
      const resp = await fetch(`${BASE_URL}/api/mcp-connections/${currentId}`, { method: 'DELETE' });
      if (!resp.ok) {
        setActionMessage('Failed to remove');
        return;
      }
      onBack();
    } catch {
      setActionMessage('Failed to remove');
    }
  }, [currentId, onBack]);

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

      {/* Tool list */}
      <ToolList tools={tools} loading={toolsLoading} />

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          r:reconnect  x:remove  j/k:scroll  Esc:back
        </Text>
      </Box>
    </Box>
  );
}
