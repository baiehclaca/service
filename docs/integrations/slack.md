# Slack Integration

Connect SERVICE to Slack to receive notifications for messages, mentions, and channel activity.

## Prerequisites

- A Slack workspace where you have permission to install apps
- A **Slack App** created at https://api.slack.com/apps
- Bot Token Scopes required:
  - `channels:history` — read messages from public channels
  - `groups:history` — read messages from private channels
  - `im:history` — read direct messages
  - `mpim:history` — read group DMs
  - `channels:read` — list channels
  - `users:read` — resolve user names
- Install the app to your workspace and copy the **Bot User OAuth Token** (`xoxb-...`)
- Optionally, configure **Event Subscriptions** to push events via webhooks (see Troubleshooting)

## Config Fields

| Field | Required | Description |
|-------|----------|-------------|
| `bot_token` | Required | Slack Bot User OAuth Token (`xoxb-...`) |
| `signing_secret` | Optional | Slack App Signing Secret (for webhook verification) |
| `channels` | Optional | Comma-separated channel names or IDs to monitor (e.g. `"general,C0123ABCD"`) |
| `mention_only` | Optional | `"true"` to only notify on direct mentions of the bot (default: `false`) |
| `poll_interval_seconds` | Optional | How often to poll for new messages, in seconds (default: `"30"`) |

## Setup Wizard

```bash
# Interactive mode
service integration add slack

# Non-interactive mode
service integration add slack \
  --name "Work Slack" \
  --config '{"bot_token":"xoxb-your-token","channels":"general,alerts","mention_only":"false","poll_interval_seconds":"60"}'
```

Example wizard session:
```
? Integration name: Work Slack
? Bot User OAuth Token (xoxb-...): xoxb-123456789012-...
? Signing Secret (optional, for webhook verification): abc123...
? Channels to monitor (comma-separated, leave blank for all): general,alerts
? Only notify on mentions? No
? Poll interval in seconds: 30

✓ Integration created: Work Slack (slack)
  ID: b2c3d4e5-...
```

## Example MCP Tool Calls

**List recent Slack notifications:**
```json
{
  "tool": "service_list_notifications",
  "arguments": {
    "source": "slack",
    "limit": 20
  }
}
```

**Get unread Slack messages:**
```json
{
  "tool": "service_list_notifications",
  "arguments": {
    "source": "slack",
    "unread": true,
    "limit": 5
  }
}
```

**Mark a Slack notification as read:**
```json
{
  "tool": "service_mark_read",
  "arguments": {
    "id": "notif_xyz789"
  }
}
```

## Troubleshooting

**`missing_scope` error on startup**
- Go to your Slack App settings → "OAuth & Permissions" → "Bot Token Scopes" and add the required scopes listed in Prerequisites above, then reinstall the app.

**Messages from some channels not appearing**
- Ensure the bot is **invited** to private channels: `/invite @YourBotName` in the Slack channel.
- Double-check that the channel ID or name is included in the `channels` config field.

**High latency on notifications**
- SERVICE polls Slack's API by default. Reduce `poll_interval_seconds` (minimum recommended: `10`) or configure Slack Event Subscriptions pointing to `http://your-host:3334/webhooks/<integration-id>` for real-time push notifications.
