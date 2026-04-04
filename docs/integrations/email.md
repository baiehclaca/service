# Email Integration

Connect SERVICE to an email account (Gmail, Outlook, or any IMAP server) to receive notifications for new emails, filtered by sender, subject, or label.

## Prerequisites

- An email account with IMAP access enabled
- **For Gmail**: Enable IMAP in Gmail Settings → See All Settings → Forwarding and POP/IMAP. Also generate an **App Password** at https://myaccount.google.com/apppasswords (requires 2FA enabled) — do NOT use your main Google password.
- **For Outlook/Microsoft 365**: Enable IMAP access via https://outlook.live.com/mail/options/mail/accounts
- **For other providers**: IMAP server hostname, port (usually `993` for SSL), and credentials

## Config Fields

| Field | Required | Description |
|-------|----------|-------------|
| `imap_host` | Required | IMAP server hostname (e.g. `imap.gmail.com`, `outlook.office365.com`) |
| `imap_port` | Optional | IMAP port (default: `"993"`) |
| `username` | Required | Email address or login username |
| `password` | Required | Email password or App Password |
| `mailbox` | Optional | Mailbox/folder to monitor (default: `"INBOX"`) |
| `filter_from` | Optional | Only notify for emails from this sender (e.g. `"boss@company.com"`) |
| `filter_subject` | Optional | Only notify for emails matching this subject keyword |
| `poll_interval_seconds` | Optional | How often to check for new mail (default: `"60"`) |
| `mark_seen` | Optional | `"true"` to mark emails as read after fetching (default: `"false"`) |

## Setup Wizard

```bash
# Interactive mode
service integration add email

# Non-interactive mode (Gmail example)
service integration add email \
  --name "Gmail Inbox" \
  --config '{"imap_host":"imap.gmail.com","username":"you@gmail.com","password":"your-app-password","mailbox":"INBOX","poll_interval_seconds":"120"}'
```

Example wizard session:
```
? Integration name: Gmail Inbox
? IMAP host: imap.gmail.com
? IMAP port (default 993): 993
? Username (email address): you@gmail.com
? Password (use App Password for Gmail): xxxx xxxx xxxx xxxx
? Mailbox to monitor (default: INBOX): INBOX
? Filter by sender (optional): 
? Filter by subject keyword (optional): 
? Poll interval in seconds (default 60): 120
? Mark emails as read after fetching? No

✓ Integration created: Gmail Inbox (email)
  ID: c3d4e5f6-...
```

## Example MCP Tool Calls

**List recent email notifications:**
```json
{
  "tool": "service_list_notifications",
  "arguments": {
    "source": "email",
    "limit": 10
  }
}
```

**Get unread emails only:**
```json
{
  "tool": "service_list_notifications",
  "arguments": {
    "source": "email",
    "unread": true
  }
}
```

**Mark an email notification as read:**
```json
{
  "tool": "service_mark_read",
  "arguments": {
    "id": "notif_email001"
  }
}
```

## Troubleshooting

**`Authentication failed` error**
- For Gmail, you **must** use an App Password, not your regular Google password. Regular passwords are rejected when IMAP is accessed by third-party apps.
- Ensure "Less secure app access" is not the chosen method — use App Passwords instead.

**`Connection refused` or timeout**
- Verify IMAP is enabled in your email provider's settings.
- Confirm the `imap_host` and `imap_port` are correct. Most providers use port `993` (SSL/TLS). Try `"993"` explicitly.
- Check if a firewall is blocking outbound port 993.

**Emails arrive late or not at all**
- Reduce `poll_interval_seconds` (e.g. `"30"`) for more frequent checks.
- For Gmail, check that the `mailbox` field matches the exact label name (e.g. `"[Gmail]/All Mail"` for All Mail).
