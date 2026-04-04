# Webhook Integration

The Webhook integration allows external services to push events into SERVICE via HTTP POST requests. Any system that can send an HTTP request (GitHub, Stripe, PagerDuty, Zapier, custom apps, etc.) can deliver notifications to SERVICE in real-time.

## Prerequisites

- The SERVICE daemon must be running and accessible on port `3334`
- The external service must be able to reach `http://your-host:3334/webhooks/<integration-id>`
- If running locally, use a tunneling tool like **ngrok** (`ngrok http 3334`) to expose the endpoint

## Config Fields

| Field | Required | Description |
|-------|----------|-------------|
| `secret` | Optional | Shared secret for webhook signature verification (HMAC-SHA256). If set, incoming requests must include a `X-Hub-Signature-256` header. |
| `event_type_field` | Optional | JSON field path in the webhook body to use as the notification type (default: `"type"`) |
| `title_field` | Optional | JSON field path to use as the notification title (default: `"title"`) |
| `body_field` | Optional | JSON field path to use as the notification body/message (default: `"body"`) |

## Setup Wizard

```bash
# Interactive mode
service integration add webhook

# Non-interactive mode
service integration add webhook \
  --name "GitHub Events" \
  --config '{"secret":"my-webhook-secret","event_type_field":"action","title_field":"repository.full_name"}'
```

Example wizard session:
```
? Integration name: GitHub Events
? Shared secret (optional, for signature verification): mysecretvalue
? Event type field path (default: type): action
? Title field path (default: title): repository.full_name
? Body field path (default: body): head_commit.message

✓ Integration created: GitHub Events (webhook)
  ID: d4e5f6a7-...
  Webhook URL: http://localhost:3334/webhooks/d4e5f6a7-...
```

Configure the Webhook URL in your external service (e.g. GitHub repo → Settings → Webhooks → Add webhook).

## Example MCP Tool Calls

**List webhook notifications:**
```json
{
  "tool": "service_list_notifications",
  "arguments": {
    "source": "d4e5f6a7-...",
    "limit": 20
  }
}
```

**Get unread webhook events:**
```json
{
  "tool": "service_list_notifications",
  "arguments": {
    "source": "webhook",
    "unread": true
  }
}
```

**Manually trigger a test webhook (for development):**
```bash
curl -X POST http://localhost:3334/webhooks/<integration-id> \
  -H "Content-Type: application/json" \
  -d '{"type":"test","title":"Test Event","body":"Hello from webhook!"}'
```

## Payload Format

SERVICE accepts any JSON body. The default mapping:

```json
{
  "type": "push",
  "title": "New Push to main",
  "body": "3 commits pushed by alice",
  "metadata": { "repo": "my-org/my-repo", "branch": "main" }
}
```

Fields not matching the configured paths are stored in `metadata`.

## Troubleshooting

**Webhook not receiving events**
- Run `service status` to confirm the daemon is running.
- Test locally: `curl -X POST http://localhost:3334/webhooks/<id> -H "Content-Type: application/json" -d '{"title":"test"}'`
- If behind a NAT/firewall, set up ngrok: `ngrok http 3334` and use the ngrok HTTPS URL in your external service.

**`404 Not Found` on the webhook URL**
- The integration ID in the URL must exactly match the ID shown by `service integration list`. Copy-paste to avoid typos.

**Signature verification failing**
- Ensure the `secret` in the SERVICE config matches the secret configured in the external service.
- SERVICE expects the `X-Hub-Signature-256: sha256=<hmac>` header format (GitHub/standard format).
