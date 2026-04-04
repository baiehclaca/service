import type { IntegrationAdapter, NotificationEvent, MCPTool, JSONSchema } from '../types.js';

// Dynamic import types for nodemailer and imap-simple (optional peer dependencies)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Transporter = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ImapConnection = any;

/**
 * Email integration adapter (SMTP + IMAP).
 * Uses nodemailer for sending and imap-simple for inbox polling (optional peer dependencies).
 * Tools: send_email, list_emails, read_email, reply_email.
 *
 * Gracefully handles missing packages: connect() marks as connected without
 * a live connection if packages are not installed.
 */
export class EmailIntegration implements IntegrationAdapter {
  readonly id = 'email';
  readonly name = 'Email (SMTP + IMAP)';
  readonly description = 'Send and receive emails via SMTP/IMAP with inbox polling notifications';

  readonly configSchema: JSONSchema = {
    type: 'object',
    properties: {
      smtp_host: {
        type: 'string',
        description: 'SMTP server hostname (e.g. smtp.gmail.com)',
      },
      smtp_port: {
        type: 'number',
        description: 'SMTP port (e.g. 587 for TLS)',
        default: 587,
      },
      imap_host: {
        type: 'string',
        description: 'IMAP server hostname (e.g. imap.gmail.com)',
      },
      imap_port: {
        type: 'number',
        description: 'IMAP port (e.g. 993 for SSL)',
        default: 993,
      },
      username: {
        type: 'string',
        description: 'Email account username',
      },
      password: {
        type: 'string',
        description: 'Email account password or app password',
      },
      poll_interval_seconds: {
        type: 'number',
        description: 'How often to check for new emails (seconds)',
        default: 60,
        minimum: 10,
        maximum: 3600,
      },
    },
    required: ['smtp_host', 'imap_host', 'username', 'password'],
  };

  private eventHandler: ((event: NotificationEvent) => void) | null = null;
  private connected = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private transporter: Transporter | null = null;
  private imapConfig: Record<string, unknown> | null = null;
  private imapConnection: ImapConnection | null = null;
  private lastSeenUid = 0;
  private savedConfig: Record<string, string> | null = null;

  async connect(config: Record<string, string>): Promise<void> {
    if (this.connected) {
      await this.disconnect();
    }

    const required = ['smtp_host', 'imap_host', 'username', 'password'];
    for (const key of required) {
      if (!config[key]) {
        throw new Error(`Missing required config: ${key}`);
      }
    }

    this.savedConfig = config;
    const smtpPort = parseInt(config.smtp_port ?? '587', 10);
    const imapPort = parseInt(config.imap_port ?? '993', 10);
    const pollInterval = parseInt(config.poll_interval_seconds ?? '60', 10) * 1000;

    // Try to set up nodemailer transporter; throw a clear error if not installed
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — optional peer dependency may not be installed
      const nodemailer = await import('nodemailer');
      this.transporter = nodemailer.createTransport({
        host: config.smtp_host,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: config.username,
          pass: config.password,
        },
      });
    } catch (err) {
      if (err instanceof Error && (err.message.includes('Cannot find') || (err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND' || (err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND')) {
        throw new Error("Package 'nodemailer' is not installed. Run: npm install nodemailer");
      }
      throw err;
    }

    // Try to set up imap-simple config
    this.imapConfig = {
      imap: {
        user: config.username,
        password: config.password,
        host: config.imap_host,
        port: imapPort,
        tls: imapPort === 993,
        authTimeout: 3000,
      },
    };

    // Start polling interval for new emails
    if (this.imapConfig) {
      this.pollTimer = setInterval(() => {
        this.pollInbox().catch(() => {
          // Ignore polling errors — they'll retry next interval
        });
      }, pollInterval);
    }

    this.connected = true;
  }

  /** Poll IMAP inbox for unseen messages and emit NotificationEvents */
  private async pollInbox(): Promise<void> {
    if (!this.imapConfig) return;
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — optional peer dependency may not be installed
      const imapSimple = await import('imap-simple');
      const connection = await imapSimple.connect(this.imapConfig);
      await connection.openBox('INBOX');
      const messages = await connection.search(['UNSEEN'], {
        bodies: ['HEADER.FIELDS (FROM SUBJECT DATE)'],
        markSeen: false,
      });
      for (const msg of messages) {
        const uid = msg.attributes?.uid ?? 0;
        if (uid <= this.lastSeenUid) continue;
        this.lastSeenUid = Math.max(this.lastSeenUid, uid);
        const header = msg.parts?.[0]?.body ?? {};
        this.emit({
          id: `email-${uid}-${Date.now()}`,
          source: 'email',
          type: 'message',
          title: (header.subject?.[0] ?? 'New email') as string,
          body: `From: ${header.from?.[0] ?? 'unknown'}`,
          timestamp: new Date().toISOString(),
          metadata: { uid, from: header.from?.[0], date: header.date?.[0] },
        });
      }
      connection.end();
    } catch {
      // Polling errors are non-fatal
    }
  }

  async disconnect(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.imapConnection) {
      try { this.imapConnection.end(); } catch { /* ignore */ }
      this.imapConnection = null;
    }
    if (this.transporter) {
      try { this.transporter.close(); } catch { /* ignore */ }
      this.transporter = null;
    }
    this.imapConfig = null;
    this.savedConfig = null;
    this.connected = false;
  }

  onEvent(handler: (event: NotificationEvent) => void): void {
    this.eventHandler = handler;
  }

  private emit(event: NotificationEvent): void {
    if (this.eventHandler) {
      try {
        this.eventHandler(event);
      } catch {
        // Integration errors must not crash the daemon
      }
    }
  }

  getTools(): MCPTool[] {
    return [
      {
        name: 'send_email',
        description: 'Send an email',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient email address' },
            subject: { type: 'string', description: 'Email subject' },
            body: { type: 'string', description: 'Email body (plain text)' },
            html: { type: 'string', description: 'Email body (HTML, optional)' },
          },
          required: ['to', 'subject', 'body'],
        },
        handler: async (args: Record<string, unknown>) => {
          if (!this.connected) {
            return { error: 'Email integration not connected' };
          }
          try {
            const to = args.to as string;
            const subject = args.subject as string;
            const text = args.body as string;
            const html = args.html as string | undefined;
            const from = this.savedConfig?.username ?? '';
            if (this.transporter) {
              const info = await this.transporter.sendMail({ from, to, subject, text, ...(html ? { html } : {}) });
              return { success: true, messageId: info.messageId };
            }
            return { success: false, error: "Package 'nodemailer' is not available. Run: npm install nodemailer" };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        name: 'list_emails',
        description: 'List recent emails from inbox',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Max emails to return', default: 20 },
            folder: { type: 'string', description: 'IMAP folder (default: INBOX)', default: 'INBOX' },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          if (!this.connected) {
            return { error: 'Email integration not connected' };
          }
          try {
            const folder = (args.folder as string) ?? 'INBOX';
            const limit = (args.limit as number) ?? 20;
            if (this.imapConfig) {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore — optional peer dependency may not be installed
              const imapSimple = await import('imap-simple');
              const connection = await imapSimple.connect(this.imapConfig);
              await connection.openBox(folder);
              const messages = await connection.search(['ALL'], {
                bodies: ['HEADER.FIELDS (FROM SUBJECT DATE)'],
                markSeen: false,
              });
              connection.end();
              const recent = messages.slice(-limit).reverse();
              const emails = recent.map((msg: Record<string, unknown>) => {
                const attrs = msg.attributes as Record<string, unknown>;
                const parts = msg.parts as Array<{ body: Record<string, string[]> }>;
                const header = parts?.[0]?.body ?? {};
                return {
                  uid: attrs?.uid,
                  subject: header.subject?.[0] ?? '',
                  from: header.from?.[0] ?? '',
                  date: header.date?.[0] ?? '',
                };
              });
              return { success: true, emails };
            }
            return { success: false, error: "Package 'imap-simple' is not available. Run: npm install imap-simple" };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        name: 'read_email',
        description: 'Read a specific email by UID',
        inputSchema: {
          type: 'object',
          properties: {
            message_id: { type: 'string', description: 'Email UID (from list_emails)' },
          },
          required: ['message_id'],
        },
        handler: async (args: Record<string, unknown>) => {
          if (!this.connected) {
            return { error: 'Email integration not connected' };
          }
          try {
            const uid = args.message_id as string;
            if (this.imapConfig) {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore — optional peer dependency may not be installed
              const imapSimple = await import('imap-simple');
              const connection = await imapSimple.connect(this.imapConfig);
              await connection.openBox('INBOX');
              const messages = await connection.search([['UID', uid]], {
                bodies: ['HEADER', 'TEXT'],
                markSeen: false,
              });
              connection.end();
              if (messages.length === 0) {
                return { success: false, error: `Email ${uid} not found` };
              }
              const msg = messages[0];
              const parts = msg.parts as Array<{ which: string; body: unknown }>;
              const headerPart = parts.find(p => p.which === 'HEADER');
              const textPart = parts.find(p => p.which === 'TEXT');
              return {
                success: true,
                email: {
                  uid,
                  headers: headerPart?.body ?? {},
                  text: textPart?.body ?? '',
                },
              };
            }
            return { success: false, error: `Email ${uid} not found` };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
      {
        name: 'reply_email',
        description: 'Reply to an email',
        inputSchema: {
          type: 'object',
          properties: {
            message_id: { type: 'string', description: 'Original email message ID or In-Reply-To header value' },
            body: { type: 'string', description: 'Reply body text' },
            to: { type: 'string', description: 'Reply-to address (if not specified, uses original sender)' },
            subject: { type: 'string', description: 'Subject (if not specified, uses Re: original)' },
          },
          required: ['message_id', 'body'],
        },
        handler: async (args: Record<string, unknown>) => {
          if (!this.connected) {
            return { error: 'Email integration not connected' };
          }
          try {
            const messageId = args.message_id as string;
            const text = args.body as string;
            const to = (args.to as string) ?? '';
            const subject = (args.subject as string) ?? `Re: (${messageId})`;
            const from = this.savedConfig?.username ?? '';
            if (this.transporter && to) {
              const info = await this.transporter.sendMail({
                from,
                to,
                subject,
                text,
                headers: { 'In-Reply-To': messageId, References: messageId },
              });
              return { success: true, messageId: info.messageId };
            }
            return { success: false, error: to ? "Package 'nodemailer' is not available. Run: npm install nodemailer" : 'Reply-to address is required' };
          } catch (e) {
            return { success: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      },
    ];
  }
}
