import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { ConfirmDialog } from '../components/ConfirmDialog.js';

const BASE_URL = 'http://127.0.0.1:3334';
const RECONNECT_MIN_CONNECTING_MS = 400;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface McpItem {
  id: string;
  name: string;
  command: string;
  args: string[];
  status: string;
  created_at: string;
  updated_at: string;
  toolCount?: number;
}

interface McpListProps {
  onBack: () => void;
  onSelect: (mcp: McpItem) => void;
  onAdd: () => void;
}

/** Returns a color-coded status badge for an MCP connection */
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

/** Truncate a string to the given max length */
function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/**
 * Full navigable MCP connection list with status badges and keybindings.
 * Enter=detail, x=remove (confirm), a=add, r=reconnect, Escape=dashboard.
 * Auto-refreshes every 10s via GET /api/mcp-connections.
 */
export function McpList({
  onBack,
  onSelect,
  onAdd,
}: McpListProps): React.ReactElement {
  const [mcps, setMcps] = useState<McpItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const rows = process.stdout.rows ?? 24;
  const visibleCount = Math.max(rows - 8, 5);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Fetch MCP connections
  const fetchMcps = useCallback(async () => {
    try {
      const resp = await fetch(`${BASE_URL}/api/mcp-connections`);
      if (resp.ok) {
        const data = (await resp.json()) as McpItem[];
        setMcps(data);
      }
    } catch {
      // silently ignore — daemon may be offline
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + auto-refresh every 10s
  useEffect(() => {
    fetchMcps();
    const interval = setInterval(fetchMcps, 10000);
    return () => clearInterval(interval);
  }, [fetchMcps]);

  // Keep selection in bounds
  useEffect(() => {
    if (selectedIndex >= mcps.length && mcps.length > 0) {
      setSelectedIndex(mcps.length - 1);
    }
  }, [mcps.length, selectedIndex]);

  // Adjust scroll offset to keep selection visible
  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + visibleCount) {
      setScrollOffset(selectedIndex - visibleCount + 1);
    }
  }, [selectedIndex, scrollOffset, visibleCount]);

  // Clear action message after a short time
  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  // Reconnect an MCP (DELETE then POST with same config)
  const reconnectMcp = useCallback(async (mcp: McpItem) => {
    const reconnectStartedAt = Date.now();

    try {
      setMcps((prev) =>
        prev.map((m) => (m.id === mcp.id ? { ...m, status: 'connecting' } : m))
      );
      setActionMessage('Reconnecting...');

      // Delete existing connection
      const delResp = await fetch(`${BASE_URL}/api/mcp-connections/${mcp.id}`, { method: 'DELETE' });
      if (!delResp.ok) {
        setActionMessage('Failed to reconnect');
        return;
      }

      // Re-create with same config
      const postResp = await fetch(`${BASE_URL}/api/mcp-connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: mcp.name, command: mcp.command, args: mcp.args }),
      });

      if (postResp.ok) {
        setActionMessage('Reconnected successfully');
      } else {
        setActionMessage('Failed to reconnect');
      }
    } catch {
      setActionMessage('Failed to reconnect');
    } finally {
      const elapsed = Date.now() - reconnectStartedAt;
      if (elapsed < RECONNECT_MIN_CONNECTING_MS) {
        await sleep(RECONNECT_MIN_CONNECTING_MS - elapsed);
      }
      fetchMcps();
    }
  }, [fetchMcps]);

  // Remove an MCP connection
  const removeMcp = useCallback(async (id: string) => {
    try {
      const resp = await fetch(`${BASE_URL}/api/mcp-connections/${id}`, { method: 'DELETE' });
      if (!resp.ok) {
        setActionMessage('Failed to remove MCP');
        return;
      }
      setMcps((prev) => prev.filter((m) => m.id !== id));
      setActionMessage('MCP removed');
    } catch {
      setActionMessage('Failed to remove MCP');
    }
  }, []);

  // Handle confirm dialog callbacks
  const handleConfirmRemove = useCallback(() => {
    const selected = mcps[selectedIndex];
    if (selected) {
      removeMcp(selected.id);
    }
    setConfirmRemove(false);
  }, [mcps, selectedIndex, removeMcp]);

  const handleCancelRemove = useCallback(() => {
    setConfirmRemove(false);
  }, []);

  // Keyboard handling
  useInput((input, key) => {
    // Don't process keys while confirm dialog is showing
    if (confirmRemove) return;

    if (key.escape) {
      onBack();
      return;
    }

    // Navigate up
    if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    // Navigate down
    if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => Math.min(mcps.length - 1, i + 1));
      return;
    }

    // Enter = open detail
    if (key.return) {
      const selected = mcps[selectedIndex];
      if (selected) {
        onSelect(selected);
      }
      return;
    }

    // r = reconnect
    if (input === 'r') {
      const selected = mcps[selectedIndex];
      if (selected) {
        reconnectMcp(selected);
      }
      return;
    }

    // x = remove (with confirmation)
    if (input === 'x') {
      const selected = mcps[selectedIndex];
      if (selected) {
        setConfirmRemove(true);
      }
      return;
    }

    // a = add new
    if (input === 'a') {
      onAdd();
      return;
    }
  });

  const visibleMcps = mcps.slice(scrollOffset, scrollOffset + visibleCount);

  if (confirmRemove) {
    const selected = mcps[selectedIndex];
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box paddingX={1} marginBottom={1}>
          <Text bold color="yellow">MCPs</Text>
        </Box>
        <ConfirmDialog
          message={`Remove MCP "${selected?.name ?? ''}"? (y/n)`}
          onConfirm={handleConfirmRemove}
          onCancel={handleCancelRemove}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color="yellow">
          MCPs ({mcps.length})
        </Text>
        {actionMessage && (
          <Text color="yellow">{actionMessage}</Text>
        )}
      </Box>

      {/* MCP list */}
      <Box flexDirection="column" flexGrow={1} overflowY="hidden" paddingX={1}>
        {loading ? (
          <Text dimColor>Loading MCPs...</Text>
        ) : mcps.length === 0 ? (
          <Text dimColor>No MCPs connected. Press &apos;a&apos; to add one.</Text>
        ) : (
          visibleMcps.map((mcp, i) => {
            const actualIndex = scrollOffset + i;
            const isSelected = actualIndex === selectedIndex;
            const badge = statusBadge(mcp.status);

            return (
              <Box key={mcp.id}>
                <Text inverse={isSelected}>
                  {badge.icon}{' '}
                  <Text bold>{mcp.name}</Text>
                  {' '}
                  <Text dimColor>({truncate(mcp.command, 30)})</Text>
                  {' — '}
                  <Text color={badge.color}>{mcp.status}</Text>
                  {mcp.toolCount != null && mcp.toolCount > 0 ? (
                    <Text dimColor>{' • '}{mcp.toolCount} tools</Text>
                  ) : null}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* Footer */}
      <Box paddingX={1}>
        <Text dimColor>
          j/k:nav  Enter:detail  r:reconnect  x:remove  a:add  Esc:back
        </Text>
      </Box>
    </Box>
  );
}
