import * as p from '@clack/prompts';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DaemonManager } from '../daemon/manager.js';
import { selectIntegrationType, promptIntegrationName, runIntegrationWizard } from './wizard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_BASE = 'http://127.0.0.1:3334';
const FETCH_TIMEOUT = 5000;

/** Fetch with timeout (default 5s). */
async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Handle Ctrl+C from any @clack/prompts call. */
function handleCancel(value: unknown): asserts value is string {
  if (p.isCancel(value)) {
    p.cancel('Setup cancelled');
    process.exit(0);
  }
}

/** Check whether the daemon health endpoint responds. */
async function isDaemonHealthy(): Promise<boolean> {
  try {
    const resp = await fetchWithTimeout(`${API_BASE}/health`, undefined, 3000);
    return resp.ok;
  } catch {
    return false;
  }
}

/** Poll the health endpoint until it responds or timeout. */
async function pollHealth(timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isDaemonHealthy()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

// ─── Step 1: Daemon ─────────────────────────────────────

async function stepStartDaemon(): Promise<boolean> {
  const healthy = await isDaemonHealthy();
  if (healthy) {
    p.log.success('Daemon is already running.');
    return true;
  }

  const start = await p.confirm({ message: 'Start the SERVICE daemon?' });
  handleCancel(start);

  if (!start) {
    p.log.warn('Remaining steps require the daemon — they may fail.');
    return false;
  }

  const mainPath = join(__dirname, '..', 'main.js');
  const child = spawn('node', [mainPath], { detached: true, stdio: 'ignore' });
  child.unref();

  if (!child.pid) {
    p.log.error('Failed to spawn daemon process.');
    return false;
  }

  DaemonManager.writePid(child.pid);

  const s = p.spinner();
  s.start('Starting SERVICE daemon…');
  const ok = await pollHealth(10_000);

  if (ok) {
    s.stop('SERVICE started on ports 3333 / 3334');
    return true;
  }
  s.stop(`Daemon spawned (PID ${child.pid}) but health check not yet responding`);
  return false;
}

// ─── Step 2: MCP servers ────────────────────────────────

async function stepAddMcpServers(): Promise<string[]> {
  const names: string[] = [];

  let addMore = await p.confirm({ message: 'Connect an MCP server?' });
  handleCancel(addMore);

  while (addMore) {
    const name = await p.text({
      message: 'MCP server name:',
      placeholder: 'e.g. filesystem',
      validate: (v) => (!v?.trim() ? 'Name is required' : undefined),
    });
    handleCancel(name);

    const command = await p.text({
      message: 'Command to launch the MCP server:',
      placeholder: 'e.g. npx',
      validate: (v) => (!v?.trim() ? 'Command is required' : undefined),
    });
    handleCancel(command);

    const argsStr = await p.text({
      message: 'Arguments (space-separated, optional):',
      placeholder: 'e.g. -y @modelcontextprotocol/server-filesystem /tmp',
      defaultValue: '',
    });
    handleCancel(argsStr);

    const args = argsStr.trim() ? argsStr.trim().split(/\s+/) : [];

    const s = p.spinner();
    s.start(`Connecting to MCP server "${name}"…`);

    try {
      const resp = await fetchWithTimeout(`${API_BASE}/api/mcp-connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, command, args }),
      });

      if (!resp.ok) {
        const err = (await resp.json()) as { error: string };
        s.stop(`Failed: ${err.error}`);
      } else {
        const result = (await resp.json()) as { id: string; name: string; toolsAdded: number };
        s.stop(`MCP "${result.name}" connected — ${result.toolsAdded} tools available`);
        names.push(result.name);
      }
    } catch (err) {
      s.stop(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }

    const again = await p.confirm({ message: 'Add another MCP server?' });
    handleCancel(again);
    addMore = again;
  }

  return names;
}

// ─── Step 3: Integrations ───────────────────────────────

async function stepAddIntegrations(): Promise<string[]> {
  const names: string[] = [];

  let addMore = await p.confirm({ message: 'Set up a notification integration?' });
  handleCancel(addMore);

  while (addMore) {
    try {
      const typesResp = await fetchWithTimeout(`${API_BASE}/api/integrations/types`);
      if (!typesResp.ok) {
        p.log.error('Could not fetch integration types — is the daemon running?');
        break;
      }

      const types = (await typesResp.json()) as Array<{
        type: string;
        name: string;
        description: string;
        configSchema: Record<string, unknown>;
      }>;

      const typeInfoList = types.map((t) => ({
        type: t.type,
        name: t.name,
        description: t.description,
        configSchema: t.configSchema as unknown as import('../integrations/types.js').JSONSchema,
      }));

      const selected = await selectIntegrationType(typeInfoList);
      const integrationName = await promptIntegrationName(`My ${selected.name}`);
      const config = await runIntegrationWizard(
        typeInfoList.find((t) => t.type === selected.type)!,
        undefined,
        false,
      );

      const s = p.spinner();
      s.start(`Creating "${integrationName}" integration…`);

      const createResp = await fetchWithTimeout(`${API_BASE}/api/integrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: integrationName, type: selected.type, config }),
      });

      if (!createResp.ok) {
        const err = (await createResp.json()) as { error: string };
        s.stop(`Failed: ${err.error}`);
      } else {
        const result = (await createResp.json()) as { id: string; name: string; type: string };
        s.stop(`Integration "${result.name}" (${result.type}) added`);
        names.push(result.name);
      }
    } catch (err) {
      p.log.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }

    const again = await p.confirm({ message: 'Add another integration?' });
    handleCancel(again);
    addMore = again;
  }

  return names;
}

// ─── Orchestrator ───────────────────────────────────────

export async function runSetupWizard(): Promise<void> {
  p.intro('SERVICE — Setup Wizard');

  p.log.info(
    'SERVICE is an MCP Hub & Notification Center.\n' +
    'It aggregates downstream MCP servers and pushes real-time\n' +
    'notifications from platforms like Slack, Email, and X to your AI agents.',
  );

  // Step 1 — daemon
  const daemonRunning = await stepStartDaemon();

  // Step 2 — MCP servers
  const mcpNames = await stepAddMcpServers();

  // Step 3 — integrations
  const integrationNames = await stepAddIntegrations();

  // Step 4 — summary
  const lines: string[] = [];
  lines.push(`Daemon: ${daemonRunning ? 'running ✓' : 'not started'}`);

  if (mcpNames.length > 0) {
    lines.push(`MCP servers: ${mcpNames.join(', ')}`);
  } else {
    lines.push('MCP servers: none added');
  }

  if (integrationNames.length > 0) {
    lines.push(`Integrations: ${integrationNames.join(', ')}`);
  } else {
    lines.push('Integrations: none added');
  }

  lines.push('');
  lines.push('Next steps:');
  lines.push('  service dashboard          — open the TUI dashboard');
  lines.push('  service integration add    — add a notification integration');
  lines.push('  service mcp add            — connect another MCP server');
  lines.push('  service status             — check daemon status');

  p.note(lines.join('\n'), 'Setup Summary');

  p.outro('Setup complete! Run `service dashboard` to get started.');
}
