# Changelog

All notable changes to SERVICE will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2025-04-03

### Added

- **MCP Hub**: Unified MCP server aggregating any number of downstream MCP servers via stdio proxy
- **Tool Namespacing**: Downstream tools exposed as `{mcpName}__toolName` — no collisions
- **Notification Gateway**: 24/7 event listener with SQLite persistence and SSE push to agents
- **Integration System**: Plugin architecture with 6 built-in adapters
  - Echo (test), Webhook, X/Twitter, Slack, Email (SMTP+IMAP), HTTP-poll
  - CLI wizard driven by JSON Schema config
  - Enable/disable without daemon restart
- **Agent Tools**: Full MCP tool suite (`service__get_notifications`, `service__save_note`, `service__connect_mcp`, `service__search_notifications`, `service__service_status`, `service__help`, and more)
- **Platform Tools**: Auto-generated MCP tools from active integrations (tweet, send_message, send_email, etc.)
- **TUI Dashboard**: 4-pane terminal dashboard (Live Feed, Integrations, MCPs, Agents)
- **Admin REST API**: Full CRUD on port 3334 for integrations, MCP connections, notifications
- **CLI**: Complete command set — `start`, `stop`, `status`, `integration *`, `mcp *`, `dashboard`, `completion`, `update`
- **Security**: AES-256-GCM encryption for stored credentials, no plaintext secrets
- **Resilience**: Downstream MCP crash recovery with exponential backoff, integration errors isolated
- **Shell Completion**: Bash, Zsh, and Fish completion scripts
- **npm Packaging**: Global install via `npm install -g service-mcp`

### Technical

- TypeScript strict mode, ESM modules
- SQLite with FTS5 full-text search for notifications
- Streamable HTTP transport for MCP connections
- 349+ unit and integration tests, ≥75% coverage
