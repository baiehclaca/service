import blessed from 'blessed';

/** Options for creating the dashboard */
export interface DashboardOptions {
  adminUrl?: string;
}

/**
 * TUI Dashboard with 4 panes: Live Feed, Integrations, MCPs, Agents.
 * Refreshes from admin API every 2 seconds.
 * A-CLI-12, A-CLI-13, A-CLI-14, A-CLI-15
 */
export function createDashboard(options?: DashboardOptions): blessed.Widgets.Screen {
  const adminUrl = options?.adminUrl ?? 'http://localhost:3334';

  const screen = blessed.screen({
    smartCSR: true,
    title: 'SERVICE — Dashboard',
    fullUnicode: true,
  });

  // Title bar
  blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' SERVICE — MCP Hub & Notification Center Dashboard',
    style: {
      fg: 'white',
      bg: 'blue',
      bold: true,
    },
  });

  // Live Feed pane (top-left) — A-CLI-13
  const feedBox = blessed.box({
    parent: screen,
    label: ' Live Feed ',
    top: 1,
    left: 0,
    width: '50%',
    height: '50%-1',
    border: { type: 'line' },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '│' },
    style: {
      border: { fg: 'cyan' },
      label: { fg: 'cyan', bold: true },
    },
    content: 'Loading notifications...',
  });

  // Integrations pane (top-right) — A-CLI-14
  const integrationsBox = blessed.box({
    parent: screen,
    label: ' Integrations ',
    top: 1,
    left: '50%',
    width: '50%',
    height: '50%-1',
    border: { type: 'line' },
    scrollable: true,
    style: {
      border: { fg: 'green' },
      label: { fg: 'green', bold: true },
    },
    content: 'Loading integrations...',
  });

  // MCPs pane (bottom-left) — A-CLI-15
  const mcpsBox = blessed.box({
    parent: screen,
    label: ' Connected MCPs ',
    top: '50%',
    left: 0,
    width: '50%',
    height: '50%',
    border: { type: 'line' },
    scrollable: true,
    style: {
      border: { fg: 'yellow' },
      label: { fg: 'yellow', bold: true },
    },
    content: 'Loading MCPs...',
  });

  // Agents pane (bottom-right)
  const agentsBox = blessed.box({
    parent: screen,
    label: ' Agents ',
    top: '50%',
    left: '50%',
    width: '50%',
    height: '50%',
    border: { type: 'line' },
    scrollable: true,
    style: {
      border: { fg: 'magenta' },
      label: { fg: 'magenta', bold: true },
    },
    content: 'Loading agents...',
  });

  // Refresh data from admin API
  async function refreshData(): Promise<void> {
    try {
      // Fetch notifications
      const notifResp = await fetch(`${adminUrl}/api/notifications?limit=20`);
      if (notifResp.ok) {
        const notifications = (await notifResp.json()) as Array<{
          source: string;
          title: string;
          created_at: string;
          read: number;
        }>;
        if (notifications.length === 0) {
          feedBox.setContent('No notifications yet.');
        } else {
          const lines = notifications.map((n) => {
            const readMark = n.read ? '  ' : '● ';
            const time = n.created_at.split('T')[1]?.substring(0, 8) ?? '';
            return `${readMark}[${time}] ${n.source}: ${n.title}`;
          });
          feedBox.setContent(lines.join('\n'));
        }
      } else {
        feedBox.setContent('Failed to fetch notifications');
      }
    } catch {
      feedBox.setContent('Cannot connect to admin API');
    }

    try {
      // Fetch integrations
      const intResp = await fetch(`${adminUrl}/api/integrations`);
      if (intResp.ok) {
        const integrations = (await intResp.json()) as Array<{
          id: string;
          name: string;
          type: string;
          status: string;
        }>;
        if (integrations.length === 0) {
          integrationsBox.setContent('No integrations configured.');
        } else {
          const lines = integrations.map((i) => {
            const statusMark = i.status === 'active' ? '●' : '○';
            return `${statusMark} ${i.name} (${i.type}) — ${i.status}`;
          });
          integrationsBox.setContent(lines.join('\n'));
        }
      } else {
        integrationsBox.setContent('Failed to fetch integrations');
      }
    } catch {
      integrationsBox.setContent('Cannot connect to admin API');
    }

    try {
      // Fetch MCP connections
      const mcpResp = await fetch(`${adminUrl}/api/mcp-connections`);
      if (mcpResp.ok) {
        const mcps = (await mcpResp.json()) as Array<{
          id: string;
          name: string;
          command: string;
          status: string;
        }>;
        if (mcps.length === 0) {
          mcpsBox.setContent('No downstream MCPs connected.');
        } else {
          const lines = mcps.map((m) => {
            const statusMark = m.status === 'active' ? '●' : '○';
            return `${statusMark} ${m.name} (${m.command}) — ${m.status}`;
          });
          mcpsBox.setContent(lines.join('\n'));
        }
      } else {
        mcpsBox.setContent('Failed to fetch MCPs');
      }
    } catch {
      mcpsBox.setContent('Cannot connect to admin API');
    }

    try {
      // Fetch agent sessions (falls back to /api/status if /api/agent-sessions is unavailable)
      let agentContent: string;
      try {
        const agentResp = await fetch(`${adminUrl}/api/agent-sessions`);
        if (agentResp.ok) {
          const sessions = (await agentResp.json()) as Array<{
            id: string;
            connected_at: string;
            last_seen: string;
          }>;
          if (sessions.length === 0) {
            agentContent = 'No active agent sessions.\n\nPress q to quit, Tab to cycle panes';
          } else {
            const lines = sessions.map((s) => {
              const connectedAt = s.connected_at.split('T')[1]?.substring(0, 8) ?? '';
              return `● Session ${s.id.substring(0, 8)} (connected ${connectedAt})`;
            });
            agentContent = `Active sessions: ${sessions.length}\n\n${lines.join('\n')}\n\nPress q to quit`;
          }
        } else {
          throw new Error('agent-sessions not available');
        }
      } catch {
        // Fallback to /api/status
        const statusResp = await fetch(`${adminUrl}/api/status`);
        if (statusResp.ok) {
          const status = (await statusResp.json()) as {
            version: string;
            uptime: number;
            activeIntegrations: number;
            connectedMcps: number;
            activeSseConnections: number;
          };
          const uptimeMin = Math.floor(status.uptime / 60);
          const uptimeSec = status.uptime % 60;
          agentContent = [
            `Version:             ${status.version}`,
            `Uptime:              ${uptimeMin}m ${uptimeSec}s`,
            `Active integrations: ${status.activeIntegrations}`,
            `Connected MCPs:      ${status.connectedMcps}`,
            `SSE connections:     ${status.activeSseConnections}`,
            '',
            'Press q to quit, Tab to cycle panes',
          ].join('\n');
        } else {
          agentContent = 'Failed to fetch agent status';
        }
      }
      agentsBox.setContent(agentContent);
    } catch {
      agentsBox.setContent('Cannot connect to admin API');
    }

    screen.render();
  }

  // Keyboard handling
  screen.key(['q', 'C-c'], () => {
    clearInterval(refreshTimer);
    screen.destroy();
    process.exit(0);
  });

  screen.key(['escape'], () => {
    clearInterval(refreshTimer);
    screen.destroy();
    process.exit(0);
  });

  // Initial render + refresh timer
  screen.render();
  refreshData();
  const refreshTimer = setInterval(refreshData, 2000);

  return screen;
}
