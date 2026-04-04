# HTTP Poll Integration

The HTTP Poll integration periodically fetches a URL and generates a SERVICE notification whenever the response changes or matches a condition. This is useful for monitoring REST APIs, RSS/Atom feeds, status pages, or any HTTP endpoint that doesn't support webhooks.

## Prerequisites

- A publicly accessible HTTP or HTTPS URL to monitor
- (Optional) An API key or Bearer token if the endpoint requires authentication
- The SERVICE daemon running with outbound internet access

## Config Fields

| Field | Required | Description |
|-------|----------|-------------|
| `url` | Required | The HTTP/HTTPS URL to poll |
| `method` | Optional | HTTP method (default: `"GET"`) |
| `headers` | Optional | JSON object of request headers (e.g. `{"Authorization":"Bearer TOKEN"}`) |
| `interval_seconds` | Optional | How often to poll, in seconds (default: `"60"`, minimum: `"10"`) |
| `change_detection` | Optional | What triggers a notification: `"any"` (any response change), `"status"` (HTTP status changes), `"content"` (body changes), or `"jq"` (use a jq expression). Default: `"any"` |
| `jq_filter` | Optional | jq expression to extract a value for comparison (e.g. `.status`, `.data[0].id`). Required when `change_detection` is `"jq"`. |
| `notify_on` | Optional | `"change"` (notify when value changes) or `"always"` (notify on every poll). Default: `"change"` |
| `expected_status` | Optional | Expected HTTP status code; notify if it differs (e.g. `"200"`) |

## Setup Wizard

```bash
# Interactive mode
service integration add http-poll

# Non-interactive mode (monitor a status page)
service integration add http-poll \
  --name "GitHub Status" \
  --config '{"url":"https://www.githubstatus.com/api/v2/status.json","interval_seconds":"120","change_detection":"jq","jq_filter":".status.description"}'
```

Example wizard session:
```
? Integration name: GitHub Status Monitor
? URL to poll: https://www.githubstatus.com/api/v2/status.json
? HTTP method (default GET): GET
? Custom headers JSON (optional): 
? Poll interval in seconds (default 60): 120
? Change detection mode (any/status/content/jq): jq
? jq filter expression: .status.description
? Notify on change or always? change
? Expected HTTP status code (optional): 200

✓ Integration created: GitHub Status Monitor (http-poll)
  ID: e5f6a7b8-...
```

## Example MCP Tool Calls

**List recent HTTP poll notifications:**
```json
{
  "tool": "service_list_notifications",
  "arguments": {
    "source": "http-poll",
    "limit": 10
  }
}
```

**Get unread status change alerts:**
```json
{
  "tool": "service_list_notifications",
  "arguments": {
    "source": "e5f6a7b8-...",
    "unread": true
  }
}
```

**Check current poll status via admin API:**
```bash
curl http://localhost:3334/api/integrations
```

## Example Use Cases

- **Monitor a REST API** for new records: poll `/api/items/latest` every 30s, use jq filter `.id` to detect new item IDs.
- **Website uptime monitoring**: poll your production URL every 60s, set `expected_status: "200"` to alert on downtime.
- **RSS feed notifications**: poll an RSS/Atom feed URL, detect content changes with `change_detection: "content"`.

## Troubleshooting

**Integration created but no notifications arriving**
- Confirm the URL is reachable from the machine running SERVICE: `curl <url>`
- Check the integration status: `service integration list`. Status `error` means the last poll failed — check SERVICE logs.

**Too many notifications (spamming)**
- Set `change_detection: "jq"` with a specific filter to track only the relevant field, rather than detecting any body change.
- Increase `interval_seconds` to reduce polling frequency.

**`jq_filter` not working as expected**
- Test your jq expression independently: `curl <url> | jq '<expression>'`
- Ensure `jq` is installed on your system if SERVICE uses it as a subprocess, or verify the integration uses a built-in jq library.
