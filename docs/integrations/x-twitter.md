# X / Twitter Integration

Connect SERVICE to X (Twitter) to receive real-time notifications for mentions, DMs, and keyword alerts.

## Prerequisites

- An X Developer account: https://developer.twitter.com
- A project and app created in the Developer Portal
- **OAuth 2.0** credentials (Client ID + Client Secret) **or** legacy API keys (API Key, API Secret, Access Token, Access Token Secret)
- Your app must have **Read** permissions at minimum; **Read + Write** if you want to post replies via tools

## Config Fields

| Field | Required | Description |
|-------|----------|-------------|
| `api_key` | Required | X API Key (Consumer Key) from Developer Portal |
| `api_secret` | Required | X API Secret (Consumer Secret) |
| `access_token` | Required | OAuth access token for your account |
| `access_token_secret` | Required | OAuth access token secret |
| `keywords` | Optional | Comma-separated keywords to track (e.g. `"AI,MCP,claude"`) |
| `mention_notifications` | Optional | `"true"` to receive mention alerts (default: `true`) |
| `dm_notifications` | Optional | `"true"` to receive DM alerts (default: `false`) |

## Setup Wizard

```bash
# Interactive mode
service integration add x-twitter

# Non-interactive mode
service integration add x-twitter \
  --name "My X Account" \
  --config '{"api_key":"YOUR_KEY","api_secret":"YOUR_SECRET","access_token":"TOKEN","access_token_secret":"TOKEN_SECRET","keywords":"AI,MCP"}'
```

Example wizard session:
```
? Integration name: My X Account
? API Key: xxxxxxxxxxxxxxxxxxxxxxxx
? API Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
? Access Token: 123456789-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
? Access Token Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
? Keywords to track (comma-separated, optional): AI,MCP,claude
? Enable mention notifications? Yes
? Enable DM notifications? No

✓ Integration created: My X Account (x-twitter)
  ID: a1b2c3d4-...
```

## Example MCP Tool Calls

**List recent notifications from X:**
```json
{
  "tool": "service_list_notifications",
  "arguments": {
    "source": "x-twitter",
    "limit": 10
  }
}
```

**Check unread mentions:**
```json
{
  "tool": "service_list_notifications",
  "arguments": {
    "source": "x-twitter",
    "unread": true
  }
}
```

**Mark a notification as read:**
```json
{
  "tool": "service_mark_read",
  "arguments": {
    "id": "notif_abc123"
  }
}
```

## Troubleshooting

**`401 Unauthorized` on connect**
- Double-check that your API Key, Secret, Access Token, and Access Token Secret are correct and not expired.
- Regenerate tokens in the Developer Portal if needed.

**No mention notifications arriving**
- Verify your X app has **Read** permissions enabled in the Developer Portal under "App Settings > User authentication settings".
- Ensure the `mention_notifications` config field is set to `"true"`.

**Keywords not triggering notifications**
- X Filtered Stream requires Elevated access or higher. Check your developer access tier at https://developer.twitter.com/en/portal/products.
- Confirm the integration status is `active` with `service integration list`.
