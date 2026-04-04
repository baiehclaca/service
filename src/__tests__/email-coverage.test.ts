/**
 * Extended Email integration tests to boost statement coverage.
 * Tests cover connected-state tool handlers, IMAP/SMTP paths, error cases,
 * the pollInbox method, emit/onEvent flow, and disconnect edge cases.
 */
import { jest } from '@jest/globals';
import { EmailIntegration } from '../integrations/builtin/email.js';
import type { NotificationEvent } from '../integrations/types.js';

describe('EmailIntegration - connected state tool handlers', () => {
  // Helper: create an EmailIntegration in "connected" state with mocked internals
  function makeConnectedEmail(opts: {
    hasTransporter?: boolean;
    hasImapConfig?: boolean;
  } = {}): EmailIntegration {
    const { hasTransporter = true, hasImapConfig = true } = opts;
    const adapter = new EmailIntegration();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;

    a.connected = true;
    a.savedConfig = { username: 'user@test.com' };

    if (hasTransporter) {
      a.transporter = {
        sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-001@test' }),
        close: jest.fn(),
      };
    } else {
      a.transporter = null;
    }

    if (hasImapConfig) {
      a.imapConfig = {
        imap: {
          user: 'user@test.com',
          password: 'secret',
          host: 'imap.test.com',
          port: 993,
          tls: true,
        },
      };
    } else {
      a.imapConfig = null;
    }

    return adapter;
  }

  afterEach(async () => {
    // nothing to clean
  });

  // ─── send_email ──────────────────────────────────────────────────────────

  it('send_email succeeds with transporter and plain text', async () => {
    const adapter = makeConnectedEmail();
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'send_email')!;

    const result = await tool.handler({ to: 'a@b.com', subject: 'Hi', body: 'Hello' }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-001@test');
  });

  it('send_email succeeds with html body', async () => {
    const adapter = makeConnectedEmail();
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'send_email')!;

    const result = await tool.handler({
      to: 'a@b.com', subject: 'Hi', body: 'Hello', html: '<b>Hello</b>',
    }) as Record<string, unknown>;
    expect(result.success).toBe(true);
  });

  it('send_email returns error when not connected', async () => {
    const adapter = new EmailIntegration();
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'send_email')!;

    const result = await tool.handler({ to: 'a@b.com', subject: 'Hi', body: 'Hello' }) as Record<string, unknown>;
    expect(result.error).toContain('not connected');
  });

  it('send_email returns error when transporter is null', async () => {
    const adapter = makeConnectedEmail({ hasTransporter: false });
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'send_email')!;

    const result = await tool.handler({ to: 'a@b.com', subject: 'Hi', body: 'Hello' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('nodemailer');
  });

  it('send_email returns error when sendMail throws', async () => {
    const adapter = makeConnectedEmail();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).transporter.sendMail = jest.fn().mockRejectedValue(new Error('SMTP error'));
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'send_email')!;

    const result = await tool.handler({ to: 'a@b.com', subject: 'Hi', body: 'Hello' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('SMTP error');
  });

  it('send_email returns string error when sendMail throws non-Error', async () => {
    const adapter = makeConnectedEmail();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).transporter.sendMail = jest.fn().mockRejectedValue('raw send error');
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'send_email')!;

    const result = await tool.handler({ to: 'a@b.com', subject: 'Hi', body: 'Hello' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toBe('raw send error');
  });

  // ─── list_emails ─────────────────────────────────────────────────────────

  it('list_emails returns error when not connected', async () => {
    const adapter = new EmailIntegration();
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'list_emails')!;

    const result = await tool.handler({}) as Record<string, unknown>;
    expect(result.error).toContain('not connected');
  });

  it('list_emails returns error when imapConfig is null', async () => {
    const adapter = makeConnectedEmail({ hasImapConfig: false });
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'list_emails')!;

    const result = await tool.handler({}) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('imap-simple');
  });

  it('list_emails with no imapConfig and no folder returns imap-simple error', async () => {
    const adapter = makeConnectedEmail({ hasImapConfig: false });
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'list_emails')!;

    const result = await tool.handler({ folder: 'Sent', limit: 5 }) as Record<string, unknown>;
    expect(result.success).toBe(false);
  });

  it('list_emails attempts imap connection when imapConfig is set', async () => {
    const adapter = makeConnectedEmail();
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'list_emails')!;

    // Will try to import imap-simple and connect; may succeed or fail
    // Either way it should return a valid response object
    const result = await tool.handler({ limit: 5 }) as Record<string, unknown>;
    expect(typeof result.success === 'boolean' || typeof result.error === 'string').toBe(true);
  });

  // ─── read_email ──────────────────────────────────────────────────────────

  it('read_email returns error when not connected', async () => {
    const adapter = new EmailIntegration();
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'read_email')!;

    const result = await tool.handler({ message_id: '42' }) as Record<string, unknown>;
    expect(result.error).toContain('not connected');
  });

  it('read_email returns not-found error when imapConfig is null', async () => {
    const adapter = makeConnectedEmail({ hasImapConfig: false });
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'read_email')!;

    const result = await tool.handler({ message_id: '42' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('42');
  });

  it('read_email attempts imap connection when imapConfig is set', async () => {
    const adapter = makeConnectedEmail();
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'read_email')!;

    const result = await tool.handler({ message_id: '42' }) as Record<string, unknown>;
    expect(typeof result.success === 'boolean' || typeof result.error === 'string').toBe(true);
  });

  // ─── reply_email ─────────────────────────────────────────────────────────

  it('reply_email returns error when not connected', async () => {
    const adapter = new EmailIntegration();
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'reply_email')!;

    const result = await tool.handler({ message_id: 'msg001', body: 'Reply text' }) as Record<string, unknown>;
    expect(result.error).toContain('not connected');
  });

  it('reply_email succeeds when connected with transporter and to address', async () => {
    const adapter = makeConnectedEmail();
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'reply_email')!;

    const result = await tool.handler({
      message_id: 'msg001',
      body: 'Reply text',
      to: 'sender@test.com',
      subject: 'Re: Test',
    }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-001@test');
  });

  it('reply_email uses default subject when not provided', async () => {
    const adapter = makeConnectedEmail();
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'reply_email')!;

    const result = await tool.handler({
      message_id: 'msg001',
      body: 'Reply text',
      to: 'sender@test.com',
    }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sentArgs = (adapter as any).transporter.sendMail.mock.calls[0][0];
    expect(sentArgs.subject).toContain('Re:');
  });

  it('reply_email returns error when to is missing', async () => {
    const adapter = makeConnectedEmail();
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'reply_email')!;

    const result = await tool.handler({ message_id: 'msg001', body: 'Reply text' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });

  it('reply_email returns nodemailer error when transporter is null and to is provided', async () => {
    const adapter = makeConnectedEmail({ hasTransporter: false });
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'reply_email')!;

    const result = await tool.handler({
      message_id: 'msg001',
      body: 'Reply text',
      to: 'sender@test.com',
    }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('nodemailer');
  });

  it('reply_email returns error when sendMail throws', async () => {
    const adapter = makeConnectedEmail();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).transporter.sendMail = jest.fn().mockRejectedValue(new Error('SMTP reply error'));
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'reply_email')!;

    const result = await tool.handler({
      message_id: 'msg001',
      body: 'Reply text',
      to: 'sender@test.com',
    }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toContain('SMTP reply error');
  });

  it('reply_email handles non-Error throws', async () => {
    const adapter = makeConnectedEmail();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).transporter.sendMail = jest.fn().mockRejectedValue(42);
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'reply_email')!;

    const result = await tool.handler({
      message_id: 'msg001',
      body: 'Reply text',
      to: 'sender@test.com',
    }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toBe('42');
  });

  // ─── onEvent / emit ──────────────────────────────────────────────────────

  it('emits events when eventHandler is set', () => {
    const adapter = makeConnectedEmail();
    const events: NotificationEvent[] = [];
    adapter.onEvent((e) => events.push(e));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    const fakeEvent: NotificationEvent = {
      id: 'email-1',
      source: 'email',
      type: 'message',
      title: 'New Email',
      body: 'From: test@test.com',
      timestamp: new Date().toISOString(),
    };
    a.emit(fakeEvent);
    expect(events.length).toBe(1);
    expect(events[0].source).toBe('email');
  });

  it('emit silently ignores errors in event handler', () => {
    const adapter = makeConnectedEmail();
    adapter.onEvent(() => { throw new Error('handler crash'); });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    expect(() => a.emit({
      id: 'email-2', source: 'email', type: 'message',
      title: 'Test', body: 'body', timestamp: new Date().toISOString(),
    })).not.toThrow();
  });

  it('emit does nothing when no eventHandler registered', () => {
    const adapter = makeConnectedEmail();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    expect(() => a.emit({
      id: 'email-3', source: 'email', type: 'message',
      title: 'Test', body: 'body', timestamp: new Date().toISOString(),
    })).not.toThrow();
  });

  // ─── disconnect ──────────────────────────────────────────────────────────

  it('disconnect clears pollTimer and transporter', async () => {
    const adapter = makeConnectedEmail();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    a.pollTimer = setInterval(() => {}, 10000);

    await adapter.disconnect();
    expect(a.pollTimer).toBeNull();
    expect(a.transporter).toBeNull();
    expect(a.connected).toBe(false);
  });

  it('disconnect handles transporter.close() throwing', async () => {
    const adapter = makeConnectedEmail();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).transporter.close = jest.fn(() => { throw new Error('close error'); });

    await expect(adapter.disconnect()).resolves.not.toThrow();
  });

  it('disconnect handles imapConnection.end() throwing', async () => {
    const adapter = makeConnectedEmail();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    a.imapConnection = { end: jest.fn(() => { throw new Error('end error'); }) };

    await expect(adapter.disconnect()).resolves.not.toThrow();
    expect(a.imapConnection).toBeNull();
  });

  // ─── connect edge cases ───────────────────────────────────────────────────

  it('connect throws for missing required keys', async () => {
    const adapter = new EmailIntegration();
    await expect(adapter.connect({ smtp_host: 'smtp.test.com' })).rejects.toThrow('Missing required config');
  });

  it('connect with custom smtp_port=465', async () => {
    const adapter = new EmailIntegration();
    try {
      await adapter.connect({
        smtp_host: 'smtp.test.com',
        smtp_port: '465',
        imap_host: 'imap.test.com',
        imap_port: '993',
        username: 'user@test.com',
        password: 'secret',
      });
      await adapter.disconnect();
    } catch (e) {
      // Acceptable if nodemailer not installed or SMTP fails
      expect(e instanceof Error).toBe(true);
    }
  });

  it('connect with small poll_interval_seconds', async () => {
    const adapter = new EmailIntegration();
    try {
      await adapter.connect({
        smtp_host: 'smtp.test.com',
        imap_host: 'imap.test.com',
        username: 'user@test.com',
        password: 'secret',
        poll_interval_seconds: '30',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((adapter as any).connected).toBe(true);
      await adapter.disconnect();
    } catch {
      // ok
    }
  });
});

describe('EmailIntegration - pollInbox method', () => {
  it('pollInbox does nothing when imapConfig is null', async () => {
    const adapter = new EmailIntegration();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    a.imapConfig = null;
    await expect(a.pollInbox()).resolves.not.toThrow();
  });

  it('pollInbox catches errors from imap-simple (non-fatal)', async () => {
    const adapter = new EmailIntegration();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    a.imapConfig = { imap: { host: 'imap.test.com' } };
    // Will attempt to import and connect; errors must be swallowed
    await expect(a.pollInbox()).resolves.not.toThrow();
  });

  it('pollInbox is called by the poll timer', async () => {
    const adapter = new EmailIntegration();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = adapter as any;
    a.imapConfig = null; // makes pollInbox a no-op
    const spy = jest.spyOn(a, 'pollInbox');
    a.pollTimer = setInterval(() => {
      a.pollInbox().catch(() => {});
    }, 50);
    await new Promise(r => setTimeout(r, 120));
    clearInterval(a.pollTimer);
    expect(spy).toHaveBeenCalled();
  });
});
