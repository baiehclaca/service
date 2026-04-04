import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { formatRelative } from '../../../utils/format-relative.js';

const BASE_URL = 'http://127.0.0.1:3334';

/** Secret field detection: field name contains any of these substrings */
const SECRET_KEYWORDS = ['key', 'secret', 'token', 'password'];

function isSecretField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return SECRET_KEYWORDS.some((s) => lower.includes(s));
}

/** Mask a value for display */
function redactValue(fieldName: string, value: string): string {
  return isSecretField(fieldName) ? '••••••' : value;
}

export interface IntegrationDetailData {
  id: string;
  name: string;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_event_at: string | null;
  config?: Record<string, string>;
}

interface IntegrationDetailProps {
  integrationId: string;
  onBack: () => void;
}

/** Returns a color-coded status badge */
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
 * Detail view for a single integration.
 * Shows: id, name, type, status, created_at, last_event_at, config (secrets redacted).
 * Keybindings: e=enable, d=disable, x=remove, Escape=back.
 */
export function IntegrationDetail({
  integrationId,
  onBack,
}: IntegrationDetailProps): React.ReactElement {
  const [data, setData] = useState<IntegrationDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Fetch integration detail with config
  const fetchDetail = useCallback(async () => {
    try {
      const resp = await fetch(`${BASE_URL}/api/integrations/${integrationId}`);
      if (resp.ok) {
        const json = (await resp.json()) as IntegrationDetailData;
        setData(json);
        setError(null);
      } else {
        setError(`HTTP ${resp.status}`);
      }
    } catch {
      setError('Failed to fetch integration details');
    } finally {
      setLoading(false);
    }
  }, [integrationId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Clear action message
  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  // Enable
  const enableIntegration = useCallback(async () => {
    try {
      await fetch(`${BASE_URL}/api/integrations/${integrationId}/enable`, { method: 'POST' });
      setData((prev) => prev ? { ...prev, status: 'active' } : prev);
      setActionMessage('Integration enabled');
    } catch {
      setActionMessage('Failed to enable');
    }
  }, [integrationId]);

  // Disable
  const disableIntegration = useCallback(async () => {
    try {
      await fetch(`${BASE_URL}/api/integrations/${integrationId}/disable`, { method: 'POST' });
      setData((prev) => prev ? { ...prev, status: 'inactive' } : prev);
      setActionMessage('Integration disabled');
    } catch {
      setActionMessage('Failed to disable');
    }
  }, [integrationId]);

  // Remove
  const removeIntegration = useCallback(async () => {
    try {
      await fetch(`${BASE_URL}/api/integrations/${integrationId}`, { method: 'DELETE' });
      onBack();
    } catch {
      setActionMessage('Failed to remove');
    }
  }, [integrationId, onBack]);

  const handleConfirmRemove = useCallback(() => {
    removeIntegration();
    setConfirmRemove(false);
  }, [removeIntegration]);

  const handleCancelRemove = useCallback(() => {
    setConfirmRemove(false);
  }, []);

  useInput((input, key) => {
    if (confirmRemove) return;

    if (key.escape) {
      onBack();
      return;
    }

    if (input === 'e') {
      enableIntegration();
      return;
    }

    if (input === 'd') {
      disableIntegration();
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
          <Text bold color="green">Integration Detail</Text>
        </Box>
        <ConfirmDialog
          message={`Remove integration "${data?.name ?? ''}"? (y/n)`}
          onConfirm={handleConfirmRemove}
          onCancel={handleCancelRemove}
        />
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        <Text dimColor>Loading integration details...</Text>
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        <Text color="red">{error ?? 'Integration not found'}</Text>
        <Box marginTop={1}>
          <Text dimColor>Esc:back</Text>
        </Box>
      </Box>
    );
  }

  const badge = statusBadge(data.status);
  const configEntries = data.config ? Object.entries(data.config) : [];

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {/* Header */}
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="green">Integration Detail</Text>
        {actionMessage && <Text color="yellow">{actionMessage}</Text>}
      </Box>

      {/* Fields */}
      <Box>
        <Text dimColor>ID: </Text>
        <Text>{data.id}</Text>
      </Box>
      <Box>
        <Text dimColor>Name: </Text>
        <Text bold>{data.name}</Text>
      </Box>
      <Box>
        <Text dimColor>Type: </Text>
        <Text>{data.type}</Text>
      </Box>
      <Box>
        <Text dimColor>Status: </Text>
        <Text color={badge.color}>{badge.icon} {data.status}</Text>
      </Box>
      <Box>
        <Text dimColor>Created: </Text>
        <Text>{data.created_at}</Text>
      </Box>
      <Box>
        <Text dimColor>Last Event: </Text>
        <Text>
          {data.last_event_at
            ? `${data.last_event_at} (${formatRelative(data.last_event_at)})`
            : 'never'}
        </Text>
      </Box>

      {/* Config */}
      {configEntries.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor bold>Configuration:</Text>
          <Box
            borderStyle="single"
            borderColor="gray"
            flexDirection="column"
            paddingX={1}
          >
            {configEntries.map(([key, value]) => (
              <Box key={key}>
                <Text dimColor>{key}: </Text>
                <Text>{redactValue(key, String(value))}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          e:enable  d:disable  x:remove  Esc:back
        </Text>
      </Box>
    </Box>
  );
}
