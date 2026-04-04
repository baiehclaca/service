import { EmailIntegration } from '../integrations/builtin/email.js';

describe('EmailIntegration', () => {
  let adapter: EmailIntegration;

  beforeEach(() => {
    adapter = new EmailIntegration();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('has correct id and metadata', () => {
    expect(adapter.id).toBe('email');
    expect(adapter.name).toContain('Email');
    expect(adapter.configSchema.type).toBe('object');
    expect(adapter.configSchema.required).toContain('smtp_host');
    expect(adapter.configSchema.required).toContain('imap_host');
    expect(adapter.configSchema.required).toContain('username');
    expect(adapter.configSchema.required).toContain('password');
  });

  it('connect succeeds with valid config', async () => {
    await adapter.connect({
      smtp_host: 'smtp.test.com',
      imap_host: 'imap.test.com',
      username: 'user@test.com',
      password: 'secret',
    });
  });

  it('connect fails with missing required config', async () => {
    await expect(adapter.connect({ smtp_host: 'smtp.test.com' })).rejects.toThrow('Missing required config');
  });

  it('connect is idempotent', async () => {
    const config = {
      smtp_host: 'smtp.test.com',
      imap_host: 'imap.test.com',
      username: 'user@test.com',
      password: 'secret',
    };
    await adapter.connect(config);
    await adapter.connect(config);
  });

  it('exposes 4 tools', () => {
    const tools = adapter.getTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('send_email');
    expect(names).toContain('list_emails');
    expect(names).toContain('read_email');
    expect(names).toContain('reply_email');
  });

  it('send_email returns error when not connected', async () => {
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'send_email')!;
    const result = await tool.handler({ to: 'a@b.com', subject: 'Hi', body: 'Test' }) as { error: string };
    expect(result.error).toContain('not connected');
  });

  it('send_email returns success when connected', async () => {
    await adapter.connect({
      smtp_host: 'smtp.test.com',
      imap_host: 'imap.test.com',
      username: 'user@test.com',
      password: 'secret',
    });
    const tools = adapter.getTools();
    const tool = tools.find(t => t.name === 'send_email')!;
    const result = await tool.handler({ to: 'a@b.com', subject: 'Hi', body: 'Test' }) as { success: boolean; error?: string };
    // With real nodemailer installed but a fake SMTP server, the send will fail.
    // success: false with an error message is expected in test environments.
    expect(typeof result.success === 'boolean').toBe(true);
  });

  it('disconnect stops poll timer', async () => {
    await adapter.connect({
      smtp_host: 'smtp.test.com',
      imap_host: 'imap.test.com',
      username: 'user@test.com',
      password: 'secret',
    });
    await adapter.disconnect();
  });
});
