# Changelog

All notable changes to SERVICE will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-04-05

### Added
- Interactive setup/onboarding wizard (`service setup` / `service init`)
  - Step-by-step first-run configuration with @clack/prompts
  - Auto-starts daemon with health polling
  - Connect MCP servers interactively with tool count feedback
  - Add notification integrations with schema-driven prompts
  - Summary screen with next-steps guidance

## [1.1.0] — 2026-04-05

### Added

- **Ink v6 TUI Dashboard**: Replaced the legacy `blessed` dashboard with a fully interactive, keyboard-driven terminal UI built on Ink v6 (React for CLI) — the same framework powering Claude Code and Gemini CLI
- **Full keyboard navigation**: Tab cycles panes, arrow keys / j/k navigate lists, Enter opens detail views, Escape goes back, `q` quits, `?` shows help overlay
- **Notification Center**: Full notification management screen with:
  - Navigable notification list with visual unread indicators (● unread / ○ read)
  - Detail view showing full body, source, type, and timestamp
  - Mark-as-read (Space) and mark-all-read (A)
  - Filter unread only (`u` toggle)
  - Inline full-text search (`/`) via FTS5
  - Real-time SSE push — new notifications appear instantly without refresh
- **Integration Manager**: Full integration management screen with:
  - Color-coded status badges (🟢 active / 🔴 error / ⏸ disabled)
  - Detail view with config fields (secrets redacted as ••••••)
  - Enable/disable integrations (`e`/`d` keys)
  - Remove with confirmation dialog (`x` key)
  - In-TUI add form with type selection, schema-driven fields, and password masking for secret fields
- **MCP Connection Manager**: Full MCP management screen with:
  - Status badges (🟢 connected / 🔴 error / ⏳ connecting) and tool count display
  - Detail view with full command, args, status, and scrollable tool list
  - Add form for new MCP connections
  - Remove with confirmation (`x` key)
  - Reconnect disconnected MCPs (`r` key)
- **@clack/prompts Wizards**: Rebuilt all standalone CLI wizards with @clack/prompts:
  - Styled intro/outro banners
  - Password masking for secret fields (api_key, api_secret, token, password, etc.)
  - Review screen before submit (secrets redacted)
  - Cancel handling (Ctrl+C exits cleanly with "Cancelled" message)
  - Interactive `service mcp add` wizard (when run without arguments)
- **Ora spinners**: Loading spinners on `service start`, `service stop`, and `service status` commands
- **SSE real-time connection**: Dashboard subscribes to SSE event stream for live push updates instead of polling
- **Help overlay**: `?` key shows full keyboard shortcut reference
- **Status bar**: Bottom bar showing unread count, daemon uptime, and port numbers
- **Daemon offline screen**: Clear "SERVICE is not running" screen when daemon is unreachable

### Removed

- **blessed**: Removed `blessed` and `@types/blessed` — fully replaced by Ink v6
- **inquirer**: Removed `inquirer` — fully replaced by @clack/prompts

### Changed

- TUI dashboard now uses React/Ink component architecture with hooks (`useApi`, `useSse`, `useInput`)
- All integration and MCP management can now be done entirely within the TUI dashboard
- Wizard flows now use @clack/prompts' native password masking instead of plaintext input

## [1.0.1] — 2026-04-04

### Fixed

- **bin/service.js**: Fixed wrong relative import path (`./dist` → `../dist`) that caused global installs to fail with "module not found" error
- **bin/service.js**: Added Node.js version guard — exits with clear error message if Node < 20 is detected
- **bin/service.js**: Added `.catch()` handler so startup errors are surfaced to users instead of silently failing
- **package.json**: Added `prepublishOnly` script (`npm run build && npm test`) to ensure dist is always built before publish
- **package.json**: Added `overrides.semver ^7.6.0` to patch ReDoS vulnerability in `imap-simple` → `semver` dependency chain
- **package.json**: Added `exports` field for proper ESM/CJS resolution (`.` → `dist/main.js`, `./cli` → `dist/cli/index.js`)
- **package.json**: Fixed repository URL (`service-mcp/service-mcp` → `baiehclaca/service`)
- **Lint**: Cleaned up 19 warnings — removed unused imports/variables across source files and test files
- **CHANGELOG.md**: Fixed wrong release year (2025 → 2026)
- **README.md**: Fixed GitHub Actions CI badge URL (`baiehclaca/service-mcp` → `baiehclaca/service`)
- **.npmignore**: Added `.npmignore` to exclude `src/`, `coverage/`, config files, and dev-only files from the published tarball

## [1.0.0] — 2026-04-04

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
