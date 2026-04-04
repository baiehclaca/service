import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { formatRelative } from '../../../utils/format-relative.js';

const BASE_URL = 'http://127.0.0.1:3334';

export interface IntegrationItem {
  id: string;
  name: string;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_event_at: string | null;
}

interface IntegrationListProps {
  onBack: () => void;
  onSelect: (integration: IntegrationItem) => void;
  onAdd: () => void;
}

/** Returns a color-coded status badge for an integration */
function statusBadge(status: string): { icon: string; color: string } {
  switch (status) {
    case 'active':
      return { icon: '🟢', color: 'green' };
    case 'error':
      return { icon: '🔴', color: 'red' };
    case 'disabled':
    case 'inactive':
      return { icon: '⏸', color: 'gray' };
    default:
      return { icon: '○', color: 'gray' };
  }
}

/**
 * Full navigable integration list with status badges and keybindings.
 * Enter=detail, e=enable, d=disable, x=remove (confirm), a=add, Escape=dashboard.
 * Auto-refreshes every 10s via GET /api/integrations.
 */
export function IntegrationList({
  onBack,
  onSelect,
  onAdd,
}: IntegrationListProps): React.ReactElement {
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const rows = process.stdout.rows ?? 24;
  const visibleCount = Math.max(rows - 8, 5);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Fetch integrations
  const fetchIntegrations = useCallback(async () => {
    try {
      const resp = await fetch(`${BASE_URL}/api/integrations`);
      if (resp.ok) {
        const data = (await resp.json()) as IntegrationItem[];
        setIntegrations(data);
      }
    } catch {
      // silently ignore — daemon may be offline
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + auto-refresh every 10s
  useEffect(() => {
    fetchIntegrations();
    const interval = setInterval(fetchIntegrations, 10000);
    return () => clearInterval(interval);
  }, [fetchIntegrations]);

  // Keep selection in bounds
  useEffect(() => {
    if (selectedIndex >= integrations.length && integrations.length > 0) {
      setSelectedIndex(integrations.length - 1);
    }
  }, [integrations.length, selectedIndex]);

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

  // Enable an integration
  const enableIntegration = useCallback(async (id: string) => {
    try {
      const resp = await fetch(`${BASE_URL}/api/integrations/${id}/enable`, { method: 'POST' });
      if (!resp.ok) {
        setActionMessage('Failed to enable integration');
        return;
      }
      setIntegrations((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: 'active' } : i))
      );
      setActionMessage('Integration enabled');
    } catch {
      setActionMessage('Failed to enable integration');
    }
  }, []);

  // Disable an integration
  const disableIntegration = useCallback(async (id: string) => {
    try {
      const resp = await fetch(`${BASE_URL}/api/integrations/${id}/disable`, { method: 'POST' });
      if (!resp.ok) {
        setActionMessage('Failed to disable integration');
        return;
      }
      setIntegrations((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: 'inactive' } : i))
      );
      setActionMessage('Integration disabled');
    } catch {
      setActionMessage('Failed to disable integration');
    }
  }, []);

  // Remove an integration
  const removeIntegration = useCallback(async (id: string) => {
    try {
      const resp = await fetch(`${BASE_URL}/api/integrations/${id}`, { method: 'DELETE' });
      if (!resp.ok) {
        setActionMessage('Failed to remove integration');
        return;
      }
      setIntegrations((prev) => prev.filter((i) => i.id !== id));
      setActionMessage('Integration removed');
    } catch {
      setActionMessage('Failed to remove integration');
    }
  }, []);

  // Handle confirm dialog callbacks
  const handleConfirmRemove = useCallback(() => {
    const selected = integrations[selectedIndex];
    if (selected) {
      removeIntegration(selected.id);
    }
    setConfirmRemove(false);
  }, [integrations, selectedIndex, removeIntegration]);

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
      setSelectedIndex((i) => Math.min(integrations.length - 1, i + 1));
      return;
    }

    // Enter = open detail
    if (key.return) {
      const selected = integrations[selectedIndex];
      if (selected) {
        onSelect(selected);
      }
      return;
    }

    // e = enable
    if (input === 'e') {
      const selected = integrations[selectedIndex];
      if (selected) {
        enableIntegration(selected.id);
      }
      return;
    }

    // d = disable
    if (input === 'd') {
      const selected = integrations[selectedIndex];
      if (selected) {
        disableIntegration(selected.id);
      }
      return;
    }

    // x = remove (with confirmation)
    if (input === 'x') {
      const selected = integrations[selectedIndex];
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

  const visibleIntegrations = integrations.slice(scrollOffset, scrollOffset + visibleCount);

  if (confirmRemove) {
    const selected = integrations[selectedIndex];
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box paddingX={1} marginBottom={1}>
          <Text bold color="green">Integrations</Text>
        </Box>
        <ConfirmDialog
          message={`Remove integration "${selected?.name ?? ''}"? (y/n)`}
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
        <Text bold color="green">
          Integrations ({integrations.length})
        </Text>
        {actionMessage && (
          <Text color="yellow">{actionMessage}</Text>
        )}
      </Box>

      {/* Integration list */}
      <Box flexDirection="column" flexGrow={1} overflowY="hidden" paddingX={1}>
        {loading ? (
          <Text dimColor>Loading integrations...</Text>
        ) : integrations.length === 0 ? (
          <Text dimColor>No integrations configured. Press &apos;a&apos; to add one.</Text>
        ) : (
          visibleIntegrations.map((integration, i) => {
            const actualIndex = scrollOffset + i;
            const isSelected = actualIndex === selectedIndex;
            const badge = statusBadge(integration.status);
            const lastEvent = integration.last_event_at
              ? formatRelative(integration.last_event_at)
              : 'never';

            return (
              <Box key={integration.id}>
                <Text inverse={isSelected}>
                  {badge.icon}{' '}
                  <Text bold>{integration.name}</Text>
                  {' '}
                  <Text dimColor>({integration.type})</Text>
                  {' — '}
                  <Text color={badge.color}>{integration.status}</Text>
                  {' • last event: '}
                  <Text dimColor>{lastEvent}</Text>
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* Footer */}
      <Box paddingX={1}>
        <Text dimColor>
          j/k:nav  Enter:detail  e:enable  d:disable  x:remove  a:add  Esc:back
        </Text>
      </Box>
    </Box>
  );
}
