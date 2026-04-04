# SERVICE — MCP Hub & Notification Center

## Mission Overview

SERVICE is a 24/7 CLI daemon and MCP server hub. It is the **only MCP server an AI agent needs to connect to**. It:
1. Aggregates any number of downstream MCP servers (proxying all their tools under one roof)
2. Acts as a real-time notification gateway — pushing platform events (X, email, Slack, WhatsApp, phone, custom) to connected AI agents
3. Exposes a CLI for human operators to configure integrations, view the live notification feed, and manage connected agents
4. Allows any new integration to be registered via a config/UI without rebuilding

## Tech Stack

- **Runtime**: Node.js v25.8.2, TypeScript, Bun for scripts
- **MCP SDK**: `@modelcontextprotocol/sdk` (Streamable HTTP + stdio transports)
- **Database**: SQLite (better-sqlite3) for persistence — integrations, notifications, agent sessions
- **CLI**: ink (React for CLI) or commander + ora for interactive terminal UI
- **Process management**: Self-daemonizing with PID file, auto-restart
- **Notifications**: SSE to connected agents, WebSocket fallback

## Architecture

```
AI Agent (Claude/Cursor/etc.)
    │  stdio or HTTP MCP connection
    ▼
┌─────────────────────────────────┐
│         SERVICE daemon          │
│  ┌──────────────────────────┐  │
│  │   MCP Hub (aggregator)   │  │  ← Proxies tools from all connected MCPs
│  │   Tool Router            │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │   Notification Gateway   │  │  ← 24/7 event listener, pushes to agents
│  │   Integration Manager    │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │   CLI Dashboard          │  │  ← Human operator interface
│  └──────────────────────────┘  │
└─────────────────────────────────┘
         │              │
    ┌────┘              └────────────┐
    ▼                               ▼
Downstream MCPs              External Platforms
(filesystem, github,     (X/Twitter, Email, Slack,
 memory, brave, etc.)     WhatsApp, Phone, custom)
```

## Key Design Decisions

- **Streamable HTTP transport** for agent connections (supports push/SSE from server→agent)
- **stdio proxy** for downstream MCPs (spawn as child processes)
- **SQLite** for durability — notifications survive restarts
- **Plugin-style integrations** — each integration is a module implementing a common interface
- **No hardcoded integrations** — integrations are defined by config and can be added dynamically

## Ports

- `3333` — SERVICE MCP HTTP server (agents connect here)
- `3334` — SERVICE CLI/Admin HTTP API (internal, dashboard)
- `3335` — WebSocket notification bus (internal)

**Off-limits** (already in use):
- `3000` — WhatsApp bridge (Hermes)
- `5000`, `7000` — ControlCenter
- `8082`, `8644` — Existing Python processes
- `8317`, `8318` — CLIProxy

## Baseline Test Command

```bash
cd /Users/teodorwaltervido/Desktop/service && npm test
```

## Build Command

```bash
cd /Users/teodorwaltervido/Desktop/service && npm run build
```

## Start Command

```bash
cd /Users/teodorwaltervido/Desktop/service && npm run service start
```

## Worker Guidelines

- Always run `npm run build` before testing
- Use `npm test` for unit/integration tests
- The MCP server must be reachable at `http://localhost:3333/mcp`
- Every new integration must implement the `IntegrationAdapter` interface
- Notifications must be stored in SQLite before being pushed to agents
- Never hardcode credentials — use `.env` and the integration config system
- Follow TypeScript strict mode
- Keep each file under 300 lines — extract helpers liberally

## Integration System

Each integration (X, Email, Slack, WhatsApp, custom) implements:
```typescript
interface IntegrationAdapter {
  id: string
  name: string
  description: string
  configSchema: JSONSchema  // Defines what config fields are needed
  connect(config: Record<string, string>): Promise<void>
  disconnect(): Promise<void>
  onEvent(handler: (event: NotificationEvent) => void): void
  getTools(): MCPTool[]  // Tools this integration exposes to agents
}
```

## Validation

Run the test suite: `npm test`
Check the MCP server: `curl http://localhost:3333/mcp`
Check health: `curl http://localhost:3334/health`
