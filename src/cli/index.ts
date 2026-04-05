#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { DaemonManager } from '../daemon/manager.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Poll a URL until it returns ok or timeout (ms) is exceeded */
async function pollHealth(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return true;
    } catch {
      // ignore — daemon not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

const program = new Command();

program
  .name('service')
  .description('SERVICE — MCP Hub & Notification Center')
  .version('1.0.0');

// ─── Daemon lifecycle ────────────────────────────────────

program
  .command('start')
  .description('Start the SERVICE daemon')
  .action(async () => {
    const { running, pid } = DaemonManager.isRunning();
    if (running) {
      console.log(chalk.yellow(`SERVICE daemon is already running (PID ${pid}).`));
      return;
    }

    const spinner = ora('Starting SERVICE daemon...').start();

    const mainPath = join(__dirname, '..', 'main.js');

    const child = spawn('node', [mainPath], {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    if (child.pid) {
      DaemonManager.writePid(child.pid);

      // Poll health endpoint until ready (up to 10s)
      const healthy = await pollHealth('http://127.0.0.1:3334/health', 10000);

      if (healthy) {
        spinner.succeed('SERVICE started on ports 3333/3334');
      } else {
        spinner.warn(`SERVICE daemon started (PID ${child.pid}) but health check not yet responding`);
      }
      console.log(chalk.gray(`  MCP Hub: http://localhost:3333/mcp`));
      console.log(chalk.gray(`  Admin:   http://localhost:3334`));
    } else {
      spinner.fail('Failed to start SERVICE daemon.');
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop the SERVICE daemon')
  .action(() => {
    const spinner = ora('Stopping...').start();
    const result = DaemonManager.stop();
    if (result.stopped) {
      spinner.succeed('Stopped');
    } else {
      spinner.info(result.message);
    }
  });

program
  .command('status')
  .description('Show the SERVICE daemon status')
  .action(() => {
    const spinner = ora('Checking status...').start();
    const result = DaemonManager.status();
    spinner.stop();

    if (result.running) {
      console.log(chalk.green(`● SERVICE daemon is running`));
      console.log(chalk.gray(`  Status:              Running (PID: ${result.pid})`));
      if (result.uptime) {
        console.log(chalk.gray(`  Uptime:              ${result.uptime}`));
      }
      if (result.version) {
        console.log(chalk.gray(`  Version:             ${result.version}`));
      }
      if (result.activeIntegrations !== undefined) {
        console.log(chalk.gray(`  Active integrations: ${result.activeIntegrations}`));
      }
      if (result.connectedMcps !== undefined) {
        console.log(chalk.gray(`  Connected MCPs:      ${result.connectedMcps}`));
      }
      if (result.activeSseConnections !== undefined) {
        console.log(chalk.gray(`  SSE connections:     ${result.activeSseConnections}`));
      }
      console.log(chalk.gray(`  MCP port:            ${result.mcpPort ?? 3333}`));
      console.log(chalk.gray(`  Admin port:          ${result.adminPort ?? 3334}`));
    } else {
      console.log(chalk.red(`○ SERVICE daemon is not running`));
    }
  });

// ─── Integration management ─────────────────────────────

const integration = program
  .command('integration')
  .description('Manage integrations');

integration
  .command('list')
  .description('List all configured integrations')
  .action(async () => {
    try {
      const resp = await fetch('http://127.0.0.1:3334/api/integrations');
      if (!resp.ok) {
        console.error(chalk.red('Failed to fetch integrations. Is the daemon running?'));
        process.exit(1);
      }
      const integrations = (await resp.json()) as Array<{
        id: string;
        name: string;
        type: string;
        status: string;
        created_at: string;
        last_event_at: string | null;
      }>;

      if (integrations.length === 0) {
        console.log(chalk.gray('No integrations configured.'));
        return;
      }

      // Print table header
      console.log('');
      console.log(
        chalk.bold(
          padRight('ID', 24) +
          padRight('Name', 20) +
          padRight('Type', 14) +
          padRight('Status', 12) +
          padRight('Last Event', 22),
        ),
      );
      console.log(chalk.gray('─'.repeat(92)));

      for (const i of integrations) {
        const statusColor = i.status === 'active' ? chalk.green : i.status === 'error' ? chalk.red : chalk.yellow;
        console.log(
          padRight(i.id, 24) +
          padRight(i.name, 20) +
          padRight(i.type, 14) +
          statusColor(padRight(i.status, 12)) +
          padRight(i.last_event_at ?? '—', 22),
        );
      }
      console.log('');
    } catch {
      console.error(chalk.red('Cannot connect to admin API. Is the daemon running?'));
      process.exit(1);
    }
  });

integration
  .command('add [type]')
  .description('Add a new integration (interactive wizard or with --name flag)')
  .option('--name <name>', 'Integration name (non-interactive mode)')
  .option('--config <json>', 'Config as JSON string (non-interactive mode)')
  .action(async (type: string | undefined, opts: { name?: string; config?: string }) => {
    try {
      // Get available types
      const typesResp = await fetch('http://127.0.0.1:3334/api/integrations/types');
      if (!typesResp.ok) {
        console.error(chalk.red('Failed to fetch integration types. Is the daemon running?'));
        process.exit(1);
      }
      const types = (await typesResp.json()) as Array<{
        type: string;
        name: string;
        description: string;
        configSchema: Record<string, unknown>;
      }>;

      // Determine the type
      let selectedType: typeof types[0] | undefined;
      let introShown = false;
      if (type) {
        selectedType = types.find((t) => t.type === type);
        if (!selectedType) {
          console.error(chalk.red(`Unknown integration type: ${type}`));
          console.log(chalk.gray(`Available types: ${types.map((t) => t.type).join(', ')}`));
          process.exit(1);
        }
      } else {
        // Import wizard dynamically for interactive type selection
        const { selectIntegrationType } = await import('./wizard.js');
        const typeInfoList = types.map(t => ({
          type: t.type,
          name: t.name,
          description: t.description,
          configSchema: t.configSchema as unknown as import('../integrations/types.js').JSONSchema,
        }));
        const selected = await selectIntegrationType(typeInfoList);
        selectedType = types.find((t) => t.type === selected.type);
        introShown = true;
      }

      if (!selectedType) {
        console.error(chalk.red('No type selected.'));
        process.exit(1);
      }

      // Determine config
      let config: Record<string, string> = {};
      let name = opts.name;

      if (opts.config) {
        // Non-interactive: parse config from JSON
        try {
          config = JSON.parse(opts.config) as Record<string, string>;
        } catch {
          console.error(chalk.red('Invalid --config JSON'));
          process.exit(1);
        }
      } else if (opts.name) {
        // Non-interactive with just a name (for simple types like webhook)
        config = { name: opts.name };
      } else {
        // Interactive wizard
        const { runIntegrationWizard, promptIntegrationName, startConnectionSpinner, wizardConnectionSuccess, wizardConnectionFailure } = await import('./wizard.js');
        const wizardTypeInfo = {
          type: selectedType.type,
          name: selectedType.name,
          description: selectedType.description,
          configSchema: selectedType.configSchema as unknown as import('../integrations/types.js').JSONSchema,
        };
        name = await promptIntegrationName(`My ${selectedType.name}`);
        config = await runIntegrationWizard(wizardTypeInfo, undefined, !introShown);

        // Connection test with spinner
        const connSpinner = startConnectionSpinner();
        const integrationName = name || config.name || `${selectedType.type}-${Date.now()}`;
        const createResp = await fetch('http://127.0.0.1:3334/api/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: selectedType.type,
            name: integrationName,
            config,
          }),
        });

        if (!createResp.ok) {
          const err = (await createResp.json()) as { error: string };
          connSpinner.error('Connection failed');
          wizardConnectionFailure(err.error);
          process.exit(1);
        }

        const result = (await createResp.json()) as { id: string; name: string; type: string };
        connSpinner.stop('Connection successful');
        wizardConnectionSuccess();
        console.log(chalk.gray(`  ID: ${result.id}`));
        if (selectedType.type === 'webhook') {
          console.log(chalk.gray(`  Webhook URL: http://localhost:3334/webhooks/${result.id}`));
        }
        return;
      }

      if (!name) {
        name = config.name || `${selectedType.type}-${Date.now()}`;
      }

      // Create via API (non-interactive path)
      const createResp = await fetch('http://127.0.0.1:3334/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedType.type,
          name,
          config,
        }),
      });

      if (!createResp.ok) {
        const err = (await createResp.json()) as { error: string };
        console.error(chalk.red(`Failed to create integration: ${err.error}`));
        process.exit(1);
      }

      const result = (await createResp.json()) as { id: string; name: string; type: string };
      console.log(chalk.green(`\n✓ Integration created: ${result.name} (${result.type})`));
      console.log(chalk.gray(`  ID: ${result.id}`));
      if (selectedType.type === 'webhook') {
        console.log(chalk.gray(`  Webhook URL: http://localhost:3334/webhooks/${result.id}`));
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

integration
  .command('remove <id>')
  .description('Remove an integration by ID')
  .action(async (id: string) => {
    try {
      const resp = await fetch(`http://127.0.0.1:3334/api/integrations/${id}`, {
        method: 'DELETE',
      });

      if (!resp.ok) {
        const err = (await resp.json()) as { error: string };
        console.error(chalk.red(`Failed to remove integration: ${err.error}`));
        process.exit(1);
      }

      console.log(chalk.green(`✓ Integration ${id} removed.`));
    } catch {
      console.error(chalk.red('Cannot connect to admin API. Is the daemon running?'));
      process.exit(1);
    }
  });

integration
  .command('enable <id>')
  .description('Enable a disabled integration')
  .action(async (id: string) => {
    try {
      const resp = await fetch(`http://127.0.0.1:3334/api/integrations/${id}/enable`, {
        method: 'POST',
      });

      if (!resp.ok) {
        const err = (await resp.json()) as { error: string };
        console.error(chalk.red(`Failed to enable integration: ${err.error}`));
        process.exit(1);
      }

      console.log(chalk.green(`✓ Integration ${id} enabled.`));
    } catch {
      console.error(chalk.red('Cannot connect to admin API. Is the daemon running?'));
      process.exit(1);
    }
  });

integration
  .command('disable <id>')
  .description('Disable an integration without removing it')
  .action(async (id: string) => {
    try {
      const resp = await fetch(`http://127.0.0.1:3334/api/integrations/${id}/disable`, {
        method: 'POST',
      });

      if (!resp.ok) {
        const err = (await resp.json()) as { error: string };
        console.error(chalk.red(`Failed to disable integration: ${err.error}`));
        process.exit(1);
      }

      console.log(chalk.green(`✓ Integration ${id} disabled.`));
    } catch {
      console.error(chalk.red('Cannot connect to admin API. Is the daemon running?'));
      process.exit(1);
    }
  });

// ─── MCP connection management ──────────────────────────

const mcp = program
  .command('mcp')
  .description('Manage downstream MCP connections');

mcp
  .command('list')
  .description('List all connected downstream MCP servers')
  .action(async () => {
    try {
      const resp = await fetch('http://127.0.0.1:3334/api/mcp-connections');
      if (!resp.ok) {
        console.error(chalk.red('Failed to fetch MCP connections. Is the daemon running?'));
        process.exit(1);
      }
      const connections = (await resp.json()) as Array<{
        id: string;
        name: string;
        command: string;
        args: string[];
        status: string;
      }>;

      if (connections.length === 0) {
        console.log(chalk.gray('No downstream MCPs connected.'));
        return;
      }

      console.log('');
      console.log(
        chalk.bold(
          padRight('ID', 40) +
          padRight('Name', 20) +
          padRight('Command', 30) +
          padRight('Status', 12),
        ),
      );
      console.log(chalk.gray('─'.repeat(102)));

      for (const c of connections) {
        const statusColor = c.status === 'active' ? chalk.green : chalk.yellow;
        const cmdStr = `${c.command} ${c.args.join(' ')}`.trim();
        console.log(
          padRight(c.id, 40) +
          padRight(c.name, 20) +
          padRight(cmdStr.substring(0, 28), 30) +
          statusColor(padRight(c.status, 12)),
        );
      }
      console.log('');
    } catch {
      console.error(chalk.red('Cannot connect to admin API. Is the daemon running?'));
      process.exit(1);
    }
  });

mcp
  .command('add [name] [command] [args...]')
  .description('Register a new downstream MCP stdio server (interactive wizard if no args)')
  .action(async (name?: string, command?: string, args?: string[]) => {
    try {
      let mcpName: string;
      let mcpCommand: string;
      let mcpArgs: string[];

      if (!name || !command) {
        // Interactive wizard — no positional args provided
        const { runMcpAddWizard } = await import('./wizard.js');
        const result = await runMcpAddWizard();
        mcpName = result.name;
        mcpCommand = result.command;
        mcpArgs = result.args;
      } else {
        // Positional form: mcp add <name> <command> [args...]
        mcpName = name;
        mcpCommand = command;
        mcpArgs = args ?? [];
      }

      const spinner = ora('Connecting to MCP server...').start();

      const resp = await fetch('http://127.0.0.1:3334/api/mcp-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: mcpName, command: mcpCommand, args: mcpArgs }),
      });

      if (!resp.ok) {
        const err = (await resp.json()) as { error: string };
        spinner.fail(`Failed to add MCP: ${err.error}`);
        process.exit(1);
      }

      const result = (await resp.json()) as { id: string; name: string; toolsAdded: number };
      spinner.succeed(`MCP '${result.name}' connected (${result.toolsAdded} tools available)`);
      console.log(chalk.gray(`  ID: ${result.id}`));
    } catch {
      console.error(chalk.red('Cannot connect to admin API. Is the daemon running?'));
      process.exit(1);
    }
  });

mcp
  .command('remove <id>')
  .description('Disconnect and remove a downstream MCP')
  .action(async (id: string) => {
    try {
      const resp = await fetch(`http://127.0.0.1:3334/api/mcp-connections/${id}`, {
        method: 'DELETE',
      });

      if (!resp.ok) {
        const err = (await resp.json()) as { error: string };
        console.error(chalk.red(`Failed to remove MCP: ${err.error}`));
        process.exit(1);
      }

      console.log(chalk.green(`✓ MCP ${id} disconnected and removed.`));
    } catch {
      console.error(chalk.red('Cannot connect to admin API. Is the daemon running?'));
      process.exit(1);
    }
  });

// ─── Dashboard ──────────────────────────────────────────

program
  .command('dashboard')
  .description('Open the TUI dashboard')
  .action(async () => {
    const { createDashboard } = await import('./dashboard.js') as { createDashboard: () => void };
    createDashboard();
  });

// ─── Shell completion ───────────────────────────────────

program
  .command('completion <shell>')
  .description('Generate shell completion script (bash, zsh, fish)')
  .action((shell: string) => {
    const commands = [
      'start', 'stop', 'status', 'dashboard',
      'integration', 'mcp', 'completion', 'update',
    ];
    const subcommands: Record<string, string[]> = {
      integration: ['list', 'add', 'remove', 'enable', 'disable'],
      mcp: ['list', 'add', 'remove'],
    };

    switch (shell) {
      case 'bash': {
        const script = `# SERVICE bash completion
# Add to ~/.bashrc: eval "$(service completion bash)"
_service_completions() {
  local cur prev commands
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="${commands.join(' ')}"

  case "\${prev}" in
    service)
      COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
      return 0
      ;;
    integration)
      COMPREPLY=( $(compgen -W "${subcommands.integration.join(' ')}" -- "\${cur}") )
      return 0
      ;;
    mcp)
      COMPREPLY=( $(compgen -W "${subcommands.mcp.join(' ')}" -- "\${cur}") )
      return 0
      ;;
    completion)
      COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
      return 0
      ;;
  esac
}
complete -F _service_completions service`;
        console.log(script);
        break;
      }
      case 'zsh': {
        const script = `# SERVICE zsh completion
# Add to ~/.zshrc: eval "$(service completion zsh)"
_service() {
  local -a commands integration_cmds mcp_cmds shells
  commands=(
    'start:Start the SERVICE daemon'
    'stop:Stop the SERVICE daemon'
    'status:Show daemon status'
    'dashboard:Open the TUI dashboard'
    'integration:Manage integrations'
    'mcp:Manage downstream MCP connections'
    'completion:Generate shell completion script'
    'update:Check for updates'
  )
  integration_cmds=(
    'list:List all integrations'
    'add:Add a new integration'
    'remove:Remove an integration'
    'enable:Enable an integration'
    'disable:Disable an integration'
  )
  mcp_cmds=(
    'list:List connected MCPs'
    'add:Add a downstream MCP'
    'remove:Remove a downstream MCP'
  )
  shells=('bash' 'zsh' 'fish')

  _arguments -C \\
    '1:command:->command' \\
    '*::arg:->args'

  case $state in
    command)
      _describe 'command' commands
      ;;
    args)
      case \${words[1]} in
        integration) _describe 'subcommand' integration_cmds ;;
        mcp) _describe 'subcommand' mcp_cmds ;;
        completion) _describe 'shell' shells ;;
      esac
      ;;
  esac
}
compdef _service service`;
        console.log(script);
        break;
      }
      case 'fish': {
        const script = `# SERVICE fish completion
# Add to ~/.config/fish/completions/service.fish
complete -c service -n '__fish_use_subcommand' -a start -d 'Start the SERVICE daemon'
complete -c service -n '__fish_use_subcommand' -a stop -d 'Stop the SERVICE daemon'
complete -c service -n '__fish_use_subcommand' -a status -d 'Show daemon status'
complete -c service -n '__fish_use_subcommand' -a dashboard -d 'Open the TUI dashboard'
complete -c service -n '__fish_use_subcommand' -a integration -d 'Manage integrations'
complete -c service -n '__fish_use_subcommand' -a mcp -d 'Manage downstream MCP connections'
complete -c service -n '__fish_use_subcommand' -a completion -d 'Generate shell completion script'
complete -c service -n '__fish_use_subcommand' -a update -d 'Check for updates'

complete -c service -n '__fish_seen_subcommand_from integration' -a list -d 'List all integrations'
complete -c service -n '__fish_seen_subcommand_from integration' -a add -d 'Add a new integration'
complete -c service -n '__fish_seen_subcommand_from integration' -a remove -d 'Remove an integration'
complete -c service -n '__fish_seen_subcommand_from integration' -a enable -d 'Enable an integration'
complete -c service -n '__fish_seen_subcommand_from integration' -a disable -d 'Disable an integration'

complete -c service -n '__fish_seen_subcommand_from mcp' -a list -d 'List connected MCPs'
complete -c service -n '__fish_seen_subcommand_from mcp' -a add -d 'Add a downstream MCP'
complete -c service -n '__fish_seen_subcommand_from mcp' -a remove -d 'Remove a downstream MCP'

complete -c service -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish' -d 'Shell type'`;
        console.log(script);
        break;
      }
      default:
        console.error(chalk.red(`Unsupported shell: ${shell}. Use bash, zsh, or fish.`));
        process.exit(1);
    }
  });

// ─── Update check ───────────────────────────────────────

program
  .command('update')
  .description('Check for newer versions of service-mcp on npm')
  .action(async () => {
    const currentVersion = program.version() ?? '1.0.0';
    console.log(chalk.gray(`Current version: ${currentVersion}`));
    console.log(chalk.gray('Checking npm registry...'));

    try {
      const resp = await fetch('https://registry.npmjs.org/service-mcp/latest');
      if (!resp.ok) {
        if (resp.status === 404) {
          console.log(chalk.yellow('Package not yet published to npm.'));
          return;
        }
        console.error(chalk.red(`Failed to check npm registry (HTTP ${resp.status})`));
        return;
      }
      const data = (await resp.json()) as { version: string };
      const latestVersion = data.version;

      if (latestVersion === currentVersion) {
        console.log(chalk.green(`✓ You are on the latest version (${currentVersion}).`));
      } else {
        console.log(chalk.yellow(`A newer version is available: ${latestVersion} (current: ${currentVersion})`));
        console.log(chalk.gray(`  Update with: npm install -g service-mcp@${latestVersion}`));
      }
    } catch (error) {
      console.error(chalk.red(`Cannot reach npm registry: ${error instanceof Error ? error.message : String(error)}`));
    }
  });

// ─── Helpers ────────────────────────────────────────────

function padRight(str: string, len: number): string {
  if (str.length >= len) return str.substring(0, len - 1) + ' ';
  return str + ' '.repeat(len - str.length);
}

program.parse(process.argv);
