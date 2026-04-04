<div align="center">

```
 ____  _____ ______     _____ ____ _____
/ ___|| ____|  _ \ \   / /_ _/ ___| ____|
\___ \|  _| | |_) \ \ / / | | |   |  _|
 ___) | |___|  _ < \ V /  | | |___| |___
|____/|_____|_| \_\ \_/  |___\____|_____|

  MCP Hub & Notification Center
```

[![npm version](https://img.shields.io/npm/v/service-mcp?style=flat-square&color=CB3837&logo=npm)](https://www.npmjs.com/package/service-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)
[![GitHub CI](https://img.shields.io/github/actions/workflow/status/baiehclaca/service-mcp/ci.yml?style=flat-square&logo=github)](https://github.com/baiehclaca/service-mcp/actions)

**The only MCP server your AI agent needs.**

</div>

---

AI agents today juggle a dozen MCP servers: one for GitHub, one for the filesystem, one for search, one for Slack. Every restart, every new project, every new agent has to re-configure all of them. **SERVICE solves this.** It's a persistent 24/7 background daemon that aggregates all your downstream MCP servers into one unified connection — and layers on a real-time notification gateway so your agents can receive events from X/Twitter, Slack, Email, and webhooks the moment they happen.

**One connection. All your tools. Always on.**

---

## Why SERVICE?

- 🔌 **Single MCP endpoint for everything** — Claude Desktop, Cursor, Copilot, and any MCP client connect to one URL (`http://localhost:3333/mcp`) and instantly get all tools from all your downstream servers, namespaced cleanly (`github__create_issue`, `filesystem__read_file`, etc.)
- ⚡ **Real-time push, not polling** — integrations like Slack, Email, X/Twitter, and webhooks stream events to your agents the moment they arrive via SSE, so agents can react in real-time without burning tokens on polling loops
- 🔒 **Local-first and private** — all data lives in `~/.service/service.db` (SQLite), credentials are AES-256-GCM encrypted, nothing leaves your machine unless you configure it to
- 🧩 **Plugin-style integrations** — add new integrations via a CLI wizard or the REST API; no rebuild required

---

## Architecture

```
AI Agent (Claude Desktop / Cursor / Copilot / any MCP client)
              │
              │  Single MCP connection (Streamable HTTP)
              ▼
┌─────────────────────────────────────────────────────────────┐
│                      SERVICE DAEMON                         │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            MCP Hub  ·  port 3333                      │  │
│  │  Aggregates & proxies tools from all downstream MCPs  │  │
│  │  Namespaced tools: github__create_issue, etc.         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │      Notification Gateway  ·  port 3334               │  │
│  │  24/7 listener for all integrations                   │  │
│  │  SQLite persistence + SSE push to agents              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │      Integration System  (plugin-based)               │  │
│  │  X/Twitter · Slack · Email · Webhooks · HTTP-poll     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │      CLI Dashboard  (TUI)                             │  │
│  │  Live Feed · Integrations · MCPs · Agents             │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                              │
    ┌────┘                              └──────────────────┐
    ▼                                                      ▼
Downstream MCPs (stdio)                      External Platforms
github, filesystem, memory,          X/Twitter, Slack, Email,
brave-search, any MCP server         Webhook, HTTP-poll, custom
```

---

## Quickstart

```bash
# 1. Install globally
npm install -g service-mcp

# 2. Start the daemon
service start

# 3. Add your AI client config (see below)

# 4. Add integrations interactively
service integration add

# 5. Watch it live
service dashboard
```

> **Ports:** `3333` — MCP Hub (agents connect here) · `3334` — Admin API + SSE stream

---

## Connect Your AI Client

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "service": {
      "url": "http://localhost:3333/mcp"
    }
  }
}
```

### Cursor

Edit your Cursor MCP settings (`~/.cursor/mcp.json` or via Settings → MCP):

```json
{
  "mcpServers": {
    "service": {
      "url": "http://localhost:3333/mcp"
    }
  }
}
```

### Any stdio-compatible client

```json
{
  "mcpServers": {
    "service": {
      "command": "npx",
      "args": ["service-mcp", "mcp-server"]
    }
  }
}
```

---

## CLI Reference

### Daemon Lifecycle

| Command | Description |
|---|---|
| `service start` | Start the SERVICE daemon in the background |
| `service stop` | Gracefully stop the daemon |
| `service status` | Show daemon status (uptime, ports, integrations, MCPs) |

### Integration Management

| Command | Description |
|---|---|
| `service integration list` | List all configured integrations and their status |
| `service integration add [type]` | Add a new integration via interactive wizard |
| `service integration remove <id>` | Permanently remove an integration |
| `service integration enable <id>` | Re-enable a disabled integration |
| `service integration disable <id>` | Disable without removing |

### MCP Connection Management

| Command | Description |
|---|---|
| `service mcp list` | List all downstream MCP connections |
| `service mcp add <name> <command> [args...]` | Add a downstream MCP server |
| `service mcp remove <id>` | Disconnect and remove a downstream MCP |

### Utilities

| Command | Description |
|---|---|
| `service dashboard` | Open the live TUI dashboard |
| `service completion <shell>` | Generate shell completion script (bash/zsh/fish) |
| `service update` | Check for and install newer versions from npm |
| `service --help` | Show help for all commands |
| `service --version` | Show installed version |

---

## MCP Tool Reference

All built-in SERVICE tools are prefixed with `service__`. Downstream MCP tools are namespaced as `{mcpName}__toolName` (e.g. `github__create_issue`).

### Notifications

| Tool | Parameters | Description |
|---|---|---|
| `service__get_notifications` | `limit?`, `source?` | Get recent notifications with optional filters |
| `service__get_unread_count` | — | Count of unread notifications |
| `service__mark_notification_read` | `id` | Mark a specific notification as read |
| `service__search_notifications` | `query` | Full-text search across notification history |

### Agent Memory

| Tool | Parameters | Description |
|---|---|---|
| `service__save_note` | `key`, `value` | Save a persistent key-value note |
| `service__get_note` | `key` | Retrieve a note by key |
| `service__list_notes` | — | List all saved note keys |
| `service__delete_note` | `key` | Delete a note by key |

### MCP Management

| Tool | Parameters | Description |
|---|---|---|
| `service__connect_mcp` | `name`, `command`, `args?` | Add a downstream MCP at runtime |
| `service__disconnect_mcp` | `id` | Remove a downstream MCP connection |
| `service__list_connected_mcps` | — | List all active downstream MCP connections |

### System

| Tool | Parameters | Description |
|---|---|---|
| `service__service_status` | — | Daemon health: uptime, version, integration count |
| `service__help` | — | Formatted guide of all available tools |

### Platform Tools (Auto-registered from Integrations)

When integrations are active, their tools are automatically registered and available to your agents:

| Integration | Tools |
|---|---|
| **X / Twitter** | `x__tweet`, `x__reply`, `x__retweet`, `x__like`, `x__search_tweets` |
| **Slack** | `slack__send_message`, `slack__list_channels`, `slack__get_thread`, `slack__react` |
| **Email** | `email__send_email`, `email__list_emails`, `email__read_email`, `email__reply_email` |
| **HTTP-poll** | `httpPoll__fetch_now` |

---

## Integration Setup

### Webhook

The simplest integration — receives HTTP POST requests and converts them to notifications.

```bash
service integration add webhook --name my-webhook
# Returns webhook URL: http://localhost:3334/webhooks/<integration-id>
```

Send events from any external system:

```bash
curl -X POST http://localhost:3334/webhooks/<id> \
  -H "Content-Type: application/json" \
  -d '{"title": "Deploy Complete", "body": "v2.1.0 deployed to production"}'
```

---

### X / Twitter

Requires a Twitter API v2 bearer token. Optional: keyword tracking.

```bash
service integration add x
# Wizard prompts for:
#   bearer_token     — Twitter API v2 bearer token
#   track_keywords   — (optional) comma-separated keywords to monitor
```

---

### Slack

Requires a Slack Bot Token with Socket Mode enabled.

```bash
service integration add slack
# Wizard prompts for:
#   bot_token   — xoxb-... (Bot User OAuth Token)
#   app_token   — xapp-... (App-Level Token for Socket Mode)
```

**Scopes required:** `channels:read`, `chat:write`, `reactions:write`, `channels:history`

---

### Email (SMTP + IMAP)

Monitors your inbox via IMAP and sends email via SMTP. Works with Gmail, Outlook, Fastmail, and any standard mail server.

```bash
service integration add email
# Wizard prompts for:
#   imap_host, imap_port   — e.g. imap.gmail.com:993
#   smtp_host, smtp_port   — e.g. smtp.gmail.com:587
#   user, password         — your email credentials (stored encrypted)
```

> **Tip for Gmail:** Enable "App Passwords" in your Google Account security settings.

---

### HTTP Poll

Polls a URL on a schedule and creates a notification whenever the content changes.

```bash
service integration add http-poll
# Wizard prompts for:
#   url               — endpoint to poll
#   interval_seconds  — polling interval (e.g. 60)
#   method            — GET or POST
```

---

## Admin REST API

SERVICE exposes a full REST API on port `3334` for programmatic management and automation:

| Endpoint | Method | Description |
|---|---|---|
| `/health` | `GET` | Health check — returns `{"status":"ok"}` |
| `/api/status` | `GET` | Full daemon status (uptime, version, counts) |
| `/api/notifications` | `GET` | List notifications (`?unread`, `?source`, `?limit`) |
| `/api/notifications/:id/read` | `PATCH` | Mark a notification as read |
| `/api/integrations` | `GET` | List all configured integrations |
| `/api/integrations` | `POST` | Create a new integration |
| `/api/integrations/:id` | `DELETE` | Remove an integration |
| `/api/integrations/types` | `GET` | List all available integration types |
| `/api/mcp-connections` | `GET` | List downstream MCP connections |
| `/api/mcp-connections` | `POST` | Add a downstream MCP server |
| `/api/mcp-connections/:id` | `DELETE` | Remove a downstream MCP |
| `/events` | `GET` | SSE stream — real-time notification events |
| `/webhooks/:id` | `POST` | Inbound webhook receiver |

### SSE Event Stream

Subscribe to real-time events:

```bash
curl -N http://localhost:3334/events
```

Events are JSON-encoded `NotificationEvent` objects pushed as they arrive.

---

## Data Storage

All data is stored locally on your machine. Nothing is sent to external servers unless you configure an integration.

| Path | Purpose |
|---|---|
| `~/.service/service.db` | SQLite database — notifications, integrations, notes |
| `~/.service/config.json` | Daemon configuration |
| `~/.service/service.pid` | Daemon PID file |
| `~/.service/state.json` | Runtime state (connected agents, uptime) |
| `~/.service/logs/` | Rotating log files |
| `~/.service/.encryption_key` | Auto-generated AES-256-GCM encryption key for credentials |

> Credentials stored in integrations are encrypted at rest using AES-256-GCM. The encryption key is generated once on first run and stored at `~/.service/.encryption_key`.

---

## Examples

See the [`examples/`](examples/) directory for ready-to-use configs:

| File | Description |
|---|---|
| [`claude-desktop-config.json`](examples/claude-desktop-config.json) | Full Claude Desktop configuration |
| [`cursor-mcp-config.json`](examples/cursor-mcp-config.json) | Cursor editor MCP config |
| [`mcp-connections.json`](examples/mcp-connections.json) | Sample downstream MCP connections (github, filesystem, brave) |
| [`webhook-integration.sh`](examples/webhook-integration.sh) | Shell script for sending webhook events |

---

## Requirements

| Requirement | Version |
|---|---|
| Node.js | ≥ 20.0.0 |
| npm | ≥ 9.0.0 |
| OS | macOS, Linux, Windows (WSL2) |

---

## Development

```bash
# Clone and install
git clone https://github.com/baiehclaca/service-mcp.git
cd service-mcp
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Development mode (watch + auto-reload)
npm run dev

# Lint
npm run lint
```

### Adding a Custom Integration

Every integration implements the `IntegrationAdapter` interface:

```typescript
interface IntegrationAdapter {
  id: string
  name: string
  description: string
  configSchema: JSONSchema          // Fields the wizard will prompt for
  connect(config: Record<string, string>): Promise<void>
  disconnect(): Promise<void>
  onEvent(handler: (event: NotificationEvent) => void): void
  getTools(): MCPTool[]             // Tools exposed to agents
}
```

Register your adapter in `src/integrations/index.ts` — no rebuild of the core daemon is needed.

---

## License

[MIT](LICENSE) — © 2024 service-mcp contributors
