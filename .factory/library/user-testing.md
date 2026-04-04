## Validation Surface

### Primary Surface: CLI
The SERVICE daemon is controlled via CLI (`node dist/cli/index.js`). Validators use shell commands (`Execute` tool) to:
- Start/stop the daemon
- Run CLI commands and assert output
- Call `curl` to hit the MCP and Admin API endpoints

### Secondary Surface: MCP API (HTTP)
MCP endpoint at `http://localhost:3333/mcp`. Validators send raw JSON-RPC requests via `curl` and assert responses.

### Tertiary Surface: Admin REST API (HTTP)
Admin endpoint at `http://localhost:3334`. Validators hit `/health`, `/api/notifications`, `/api/integrations`, `/webhooks/:id` via `curl`.

### Test Suite
`npm test` is the primary automated validation. Validators run it and assert exit code 0.

---

## Validation Concurrency

**Machine:** Apple Silicon, 16 GB RAM, 8 CPU cores
**Baseline usage:** ~4 GB (macOS + Hermes + Chrome + droids)
**Available headroom:** ~12 GB × 70% = **~8.4 GB usable**

### Per-surface cost:
- NODE daemon process: ~150 MB
- Jest test suite: ~200 MB
- curl/shell commands: negligible

### Max concurrent validators: **3**

Each validator needs: ~350 MB (daemon + test runner). 3 validators = ~1.05 GB, well within budget.

**Note:** The daemon uses SQLite with a single file — concurrent validators MUST use different `SERVICE_DATA_DIR` env vars (e.g., `/tmp/service-test-1`, `/tmp/service-test-2`) to avoid DB conflicts.

---

## Daemon Setup for Validators

Start daemon for validation:
```bash
export SERVICE_MCP_PORT=3333
export SERVICE_ADMIN_PORT=3334
export SERVICE_DATA_DIR=/tmp/service-validate
cd /Users/teodorwaltervido/Desktop/service
npm run build
node dist/main.js &
sleep 2  # wait for startup
```

Teardown:
```bash
node dist/cli/index.js stop || kill $(cat /tmp/service-validate/service.pid) 2>/dev/null
```

## Flow Validator Guidance: cli-http
- Use a single validator process for m1 assertions because CLI, MCP, Admin API, and SQLite state share one daemon process and one persistent data directory by default.
- Do not run concurrent mutating flows against the same daemon instance.
- Keep all commands scoped to `/Users/teodorwaltervido/Desktop/service`.
- Preferred validation tools: `Execute` with `node dist/cli/index.js` and `curl`.
- Evidence files should be written under mission evidence path assigned by parent validator.

## Isolation Notes
- Current runtime behavior (as observed in m2 user-testing): `node dist/main.js` binds to default ports `3333/3334` and uses HOME-based `~/.service` paths; environment variables like `SERVICE_MCP_PORT`, `SERVICE_ADMIN_PORT`, and `SERVICE_DATA_DIR` were not honored during validation attempts.
- Until fixed, validators should avoid assuming parallel isolated daemon instances via env-only overrides on this project.
