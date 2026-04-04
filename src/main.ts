import express from 'express';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { McpHub } from './server/mcp-hub.js';
import { ServiceDatabase } from './db/database.js';
import { DaemonManager } from './daemon/manager.js';
import { NotificationStore } from './gateway/notification-store.js';
import { ServiceEventBus } from './gateway/event-bus.js';
import { PushManager } from './gateway/push-manager.js';
import { IntegrationRegistry } from './integrations/registry.js';
import { createAdminRouter } from './api/admin.js';
import { MemoryTools } from './tools/memory-tools.js';
import { McpManagementTools } from './tools/mcp-management-tools.js';
import { SearchTools } from './tools/search-tools.js';
import { StatusTools } from './tools/status-tools.js';
import { HelpTools } from './tools/help-tools.js';
import { PlatformToolsManager } from './tools/platform-tools.js';

const SERVICE_DIR = join(homedir(), '.service');
const STATE_FILE = join(SERVICE_DIR, 'state.json');

// Load version from package.json
const _require = createRequire(import.meta.url);
let _pkgVersion = '1.0.0';
try {
  const pkg = _require('../../package.json') as { version: string };
  _pkgVersion = pkg.version;
} catch { /* fallback to default */ }
const PKG_VERSION = _pkgVersion;

/** Print the SERVICE startup banner */
function printBanner(version: string): void {
  const banner = `
 ____  _____ ______     _____ ____ _____
/ ___|| ____|  _ \\ \\   / /_ _/ ___| ____|
\\___ \\|  _| | |_) \\ \\ / / | | |   |  _|
 ___) | |___|  _ < \\ V /  | | |___| |___
|____/|_____|_| \\_\\ \\_/  |___\\____|_____|

  MCP Hub & Notification Center v${version}
`;
  console.log(banner);
}

/**
 * SERVICE daemon entry point.
 * Initializes all components and starts both HTTP servers.
 */
async function main(): Promise<void> {
  const startTime = new Date();

  // Ensure service directory exists
  DaemonManager.ensureServiceDir();

  // Write PID file
  DaemonManager.writePid();

  // Write initial state file
  const writeStateFile = (extra?: { activeIntegrations?: number; connectedMcps?: number; activeSseConnections?: number }) => {
    try {
      writeFileSync(STATE_FILE, JSON.stringify({
        pid: process.pid,
        startedAt: startTime.toISOString(),
        version: PKG_VERSION,
        mcpPort: 3333,
        adminPort: 3334,
        activeIntegrations: extra?.activeIntegrations ?? 0,
        connectedMcps: extra?.connectedMcps ?? 0,
        activeSseConnections: extra?.activeSseConnections ?? 0,
      }), 'utf-8');
    } catch { /* ignore write errors */ }
  };
  writeStateFile();

  // Print startup banner
  printBanner(PKG_VERSION);

  // Initialize database
  const db = ServiceDatabase.getInstance();
  console.log('[SERVICE] Database initialized');

  // Initialize gateway components
  const eventBus = ServiceEventBus.getInstance();
  const notificationStore = new NotificationStore(db.db);
  const pushManager = new PushManager(eventBus);
  console.log('[SERVICE] Notification gateway initialized');

  // Initialize integration registry
  const registry = new IntegrationRegistry(notificationStore, eventBus);
  console.log('[SERVICE] Integration registry initialized');

  // Create MCP Hub and set notification store
  const hub = new McpHub();
  hub.setNotificationStore(notificationStore);

  // Initialize tool modules
  const memoryTools = new MemoryTools(db.db);
  const mcpManagementTools = new McpManagementTools(hub, notificationStore);
  const searchTools = new SearchTools(notificationStore);
  const statusTools = new StatusTools({
    hub,
    registry,
    pushManager,
    startTime,
    version: PKG_VERSION,
  });
  const helpTools = new HelpTools(hub, registry);
  const platformToolsManager = new PlatformToolsManager(registry);

  // Wire PlatformToolsManager to integration lifecycle events
  registry.on('integration:loaded', (instanceId: string) => {
    platformToolsManager.registerIntegrationTools(instanceId);
  });
  registry.on('integration:unloaded', (instanceId: string) => {
    platformToolsManager.deregisterIntegrationTools(instanceId);
  });

  // Wire tools into the hub
  hub.setMemoryTools(memoryTools);
  hub.setMcpManagementTools(mcpManagementTools);
  hub.setSearchTools(searchTools);
  hub.setStatusTools(statusTools);
  hub.setHelpTools(helpTools);
  hub.setPlatformToolsManager(platformToolsManager);

  const mcpApp = hub.createApp();

  // Start MCP Hub HTTP server on port 3333
  const mcpServer = mcpApp.listen(3333, () => {
    console.log('[SERVICE] MCP Hub listening on http://localhost:3333/mcp');
  });

  // Create Admin API on port 3334
  const adminApp = express();
  adminApp.use(express.json());

  // Mount admin router
  const adminRouter = createAdminRouter({
    store: notificationStore,
    pushManager,
    registry,
    eventBus,
    hub,
    startTime,
  });
  adminApp.use(adminRouter);

  const adminServer = adminApp.listen(3334, () => {
    console.log('[SERVICE] Admin API listening on http://localhost:3334');
  });

  // Start built-in echo integration (inactive by default, but registered)
  try {
    await registry.loadIntegration('echo-default', 'echo', { interval_seconds: '30' }, 'Default Echo');
    console.log('[SERVICE] Echo integration started');
  } catch (error) {
    console.warn('[SERVICE] Failed to start echo integration:', error);
  }

  // Auto-connect MCP connections that were persisted with status='active'
  const savedMcpConnections = notificationStore.getMcpConnections();
  for (const conn of savedMcpConnections) {
    if (conn.status === 'active') {
      try {
        await hub.addProxyById(conn.id, conn.name, conn.command, conn.args);
        console.log(`[SERVICE] Reconnected MCP '${conn.name}'`);
      } catch (error) {
        console.warn(`[SERVICE] Failed to reconnect MCP '${conn.name}':`, error);
        notificationStore.saveMcpConnection(conn.id, conn.name, conn.command, conn.args, 'error');
      }
    }
  }

  // Periodically update the state file with live counts
  const stateInterval = setInterval(() => {
    writeStateFile({
      activeIntegrations: registry.getLoadedIntegrations().size,
      connectedMcps: hub.getProxies().size,
      activeSseConnections: pushManager.getConnectionCount(),
    });
  }, 30_000);

  // Graceful shutdown handler
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[SERVICE] Received ${signal}, shutting down...`);

    clearInterval(stateInterval);

    // Shutdown integrations
    await registry.shutdown();

    // Shutdown push manager
    pushManager.shutdown();

    // Close servers first (stop accepting new connections)
    await new Promise<void>((resolve) => {
      mcpServer.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      adminServer.close(() => resolve());
    });

    // Shutdown hub (closes transports + proxies)
    await hub.shutdown();

    // Close database
    db.close();
    ServiceDatabase.resetInstance();

    // Clean up singletons
    ServiceEventBus.resetInstance();

    // Remove PID file
    DaemonManager.removePid();

    console.log('[SERVICE] Shutdown complete.');
    process.exit(0);
  };

  process.on('SIGTERM', () => { shutdown('SIGTERM'); });
  process.on('SIGINT', () => { shutdown('SIGINT'); });

  // Print startup summary
  const integrationCount = registry.getLoadedIntegrations().size;
  const mcpCount = hub.getProxies().size;
  console.log('[SERVICE] ─────────────────────────────────');
  console.log(`[SERVICE]   Ports:        MCP ${3333} · Admin ${3334}`);
  console.log(`[SERVICE]   Integrations: ${integrationCount} active`);
  console.log(`[SERVICE]   MCPs:         ${mcpCount} connected`);
  console.log('[SERVICE] ─────────────────────────────────');
  console.log('[SERVICE] Daemon started successfully.');
}

main().catch((error) => {
  console.error('[SERVICE] Fatal error:', error);
  DaemonManager.removePid();
  process.exit(1);
});
