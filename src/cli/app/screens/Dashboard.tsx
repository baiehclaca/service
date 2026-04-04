import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useApi } from '../hooks/useApi.js';

const PANES = ['Live Feed', 'Integrations', 'MCPs', 'System'] as const;

const PANE_COLORS: Record<string, string> = {
  'Live Feed': 'cyan',
  'Integrations': 'green',
  'MCPs': 'yellow',
  'System': 'magenta',
};

interface DashboardProps {
  activePane: number;
  onNavigateToNotifications?: () => void;
}

interface Notification {
  source: string;
  title: string;
  created_at: string;
  read: number;
}

interface Integration {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface McpConnection {
  id: string;
  name: string;
  command: string;
  status: string;
}

interface StatusData {
  version: string;
  uptime: number;
  activeIntegrations: number;
  connectedMcps: number;
  activeSseConnections: number;
}

/**
 * 4-pane grid: Live Feed, Integrations, MCPs, System.
 * Tab cycles panes; active pane has highlighted border.
 * Each pane shows summary data from API.
 */
export function Dashboard({ activePane, onNavigateToNotifications }: DashboardProps): React.ReactElement {
  const { data: notifications } = useApi<Notification[]>('/api/notifications?limit=10', 5000);
  const { data: integrations } = useApi<Integration[]>('/api/integrations', 10000);
  const { data: mcps } = useApi<McpConnection[]>('/api/mcp-connections', 10000);
  const { data: status } = useApi<StatusData>('/api/status', 5000);

  // Handle Enter key to navigate into active pane
  useInput((_input, key) => {
    if (key.return) {
      const pane = PANES[activePane];
      if (pane === 'Live Feed' && onNavigateToNotifications) {
        onNavigateToNotifications();
      }
    }
  });

  const renderPane = (index: number): React.ReactElement => {
    const pane = PANES[index]!;
    const isActive = index === activePane;
    const color = PANE_COLORS[pane] ?? 'white';

    let content: React.ReactElement;

    switch (pane) {
      case 'Live Feed':
        content = renderNotifications(notifications);
        break;
      case 'Integrations':
        content = renderIntegrations(integrations);
        break;
      case 'MCPs':
        content = renderMcps(mcps);
        break;
      case 'System':
        content = renderSystem(status);
        break;
    }

    return (
      <Box
        key={pane}
        flexDirection="column"
        borderStyle={isActive ? 'bold' : 'single'}
        borderColor={isActive ? color : 'gray'}
        flexGrow={1}
        flexBasis="50%"
        paddingX={1}
      >
        <Box marginBottom={0}>
          <Text bold color={isActive ? color : 'gray'}>
            {pane}
            {isActive ? ' ◀' : ''}
          </Text>
        </Box>
        {content}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="row" flexGrow={1}>
        {renderPane(0)}
        {renderPane(1)}
      </Box>
      <Box flexDirection="row" flexGrow={1}>
        {renderPane(2)}
        {renderPane(3)}
      </Box>
      <Box paddingX={1}>
        <Text dimColor>j/k or arrow keys to navigate • Tab to cycle panes • Enter to select • ? for help</Text>
      </Box>
    </Box>
  );
}

function renderNotifications(notifications: Notification[] | null): React.ReactElement {
  if (!notifications) return <Text dimColor>Loading...</Text>;
  if (notifications.length === 0) return <Text dimColor>No notifications yet.</Text>;

  return (
    <Box flexDirection="column">
      {notifications.slice(0, 8).map((n, i) => {
        const readMark = n.read ? '○' : '●';
        const time = n.created_at?.split('T')[1]?.substring(0, 8) ?? '';
        return (
          <Text key={i}>
            <Text color={n.read ? 'gray' : 'cyan'}>{readMark}</Text>
            {' '}
            <Text dimColor>[{time}]</Text>
            {' '}
            <Text color="white">{n.source}:</Text>
            {' '}
            <Text>{n.title}</Text>
          </Text>
        );
      })}
    </Box>
  );
}

function renderIntegrations(integrations: Integration[] | null): React.ReactElement {
  if (!integrations) return <Text dimColor>Loading...</Text>;
  if (integrations.length === 0) return <Text dimColor>No integrations configured.</Text>;

  return (
    <Box flexDirection="column">
      {integrations.map((i) => {
        const badge = i.status === 'active' ? '🟢' : i.status === 'error' ? '🔴' : '⏸';
        return (
          <Text key={i.id}>
            {badge} <Text bold>{i.name}</Text> <Text dimColor>({i.type})</Text> — <Text>{i.status}</Text>
          </Text>
        );
      })}
    </Box>
  );
}

function renderMcps(mcps: McpConnection[] | null): React.ReactElement {
  if (!mcps) return <Text dimColor>Loading...</Text>;
  if (mcps.length === 0) return <Text dimColor>No MCPs connected.</Text>;

  return (
    <Box flexDirection="column">
      {mcps.map((m) => {
        const badge = m.status === 'active' ? '🟢' : m.status === 'error' ? '🔴' : '⏳';
        return (
          <Text key={m.id}>
            {badge} <Text bold>{m.name}</Text> <Text dimColor>({m.command})</Text>
          </Text>
        );
      })}
    </Box>
  );
}

function renderSystem(status: StatusData | null): React.ReactElement {
  if (!status) return <Text dimColor>Loading...</Text>;

  const uptimeMin = Math.floor(status.uptime / 60);
  const uptimeSec = status.uptime % 60;

  return (
    <Box flexDirection="column">
      <Text>
        <Text dimColor>Version:</Text> <Text>{status.version}</Text>
      </Text>
      <Text>
        <Text dimColor>Uptime:</Text> <Text>{uptimeMin}m {uptimeSec}s</Text>
      </Text>
      <Text>
        <Text dimColor>Integrations:</Text> <Text>{status.activeIntegrations}</Text>
      </Text>
      <Text>
        <Text dimColor>MCPs:</Text> <Text>{status.connectedMcps}</Text>
      </Text>
      <Text>
        <Text dimColor>SSE clients:</Text> <Text>{status.activeSseConnections}</Text>
      </Text>
    </Box>
  );
}
