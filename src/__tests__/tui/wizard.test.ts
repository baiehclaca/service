import { isSecretField } from '../../cli/wizard.js';
import type { IntegrationTypeInfo } from '../../integrations/registry.js';

// ─── Secret field detection ────────────────────────────────

describe('isSecretField', () => {
  it('detects api_key as secret', () => {
    expect(isSecretField('api_key')).toBe(true);
  });

  it('detects api_secret as secret', () => {
    expect(isSecretField('api_secret')).toBe(true);
  });

  it('detects access_token as secret', () => {
    expect(isSecretField('access_token')).toBe(true);
  });

  it('detects password as secret', () => {
    expect(isSecretField('password')).toBe(true);
  });

  it('detects bot_token as secret', () => {
    expect(isSecretField('bot_token')).toBe(true);
  });

  it('detects app_token as secret', () => {
    expect(isSecretField('app_token')).toBe(true);
  });

  it('does not flag host as secret', () => {
    expect(isSecretField('host')).toBe(false);
  });

  it('does not flag port as secret', () => {
    expect(isSecretField('port')).toBe(false);
  });

  it('does not flag name as secret', () => {
    expect(isSecretField('name')).toBe(false);
  });

  it('does not flag username as secret', () => {
    expect(isSecretField('username')).toBe(false);
  });

  it('case insensitive detection for API_KEY', () => {
    expect(isSecretField('API_KEY')).toBe(true);
  });

  it('detects access_token_secret', () => {
    expect(isSecretField('access_token_secret')).toBe(true);
  });

  it('does not flag url as secret', () => {
    expect(isSecretField('url')).toBe(false);
  });

  it('does not flag webhook_url as secret', () => {
    expect(isSecretField('webhook_url')).toBe(false);
  });
});

// ─── X/Twitter secret field classification ─────────────────

describe('X/Twitter secret field classification', () => {
  const xTwitterFields = ['api_key', 'api_secret', 'access_token', 'access_token_secret'];

  it('all X/Twitter config fields are detected as secrets', () => {
    for (const field of xTwitterFields) {
      expect(isSecretField(field)).toBe(true);
    }
  });
});

// ─── Slack secret field classification ─────────────────────

describe('Slack secret field classification', () => {
  it('bot_token is detected as secret', () => {
    expect(isSecretField('bot_token')).toBe(true);
  });

  it('app_token is detected as secret', () => {
    expect(isSecretField('app_token')).toBe(true);
  });

  it('channel is NOT detected as secret', () => {
    expect(isSecretField('channel')).toBe(false);
  });
});

// ─── Email secret field classification ─────────────────────

describe('Email secret field classification', () => {
  it('password is detected as secret', () => {
    expect(isSecretField('password')).toBe(true);
  });

  it('host is NOT detected as secret', () => {
    expect(isSecretField('host')).toBe(false);
  });

  it('port is NOT detected as secret', () => {
    expect(isSecretField('port')).toBe(false);
  });

  it('username is NOT detected as secret', () => {
    expect(isSecretField('username')).toBe(false);
  });
});

// ─── Wizard function exports ───────────────────────────────

describe('wizard module exports', () => {
  it('exports runIntegrationWizard function', async () => {
    const wizard = await import('../../cli/wizard.js');
    expect(typeof wizard.runIntegrationWizard).toBe('function');
  });

  it('exports selectIntegrationType function', async () => {
    const wizard = await import('../../cli/wizard.js');
    expect(typeof wizard.selectIntegrationType).toBe('function');
  });

  it('exports promptIntegrationName function', async () => {
    const wizard = await import('../../cli/wizard.js');
    expect(typeof wizard.promptIntegrationName).toBe('function');
  });

  it('exports runMcpAddWizard function', async () => {
    const wizard = await import('../../cli/wizard.js');
    expect(typeof wizard.runMcpAddWizard).toBe('function');
  });

  it('exports startConnectionSpinner function', async () => {
    const wizard = await import('../../cli/wizard.js');
    expect(typeof wizard.startConnectionSpinner).toBe('function');
  });

  it('exports wizardConnectionSuccess function', async () => {
    const wizard = await import('../../cli/wizard.js');
    expect(typeof wizard.wizardConnectionSuccess).toBe('function');
  });

  it('exports wizardConnectionFailure function', async () => {
    const wizard = await import('../../cli/wizard.js');
    expect(typeof wizard.wizardConnectionFailure).toBe('function');
  });

  it('exports isSecretField function', async () => {
    const wizard = await import('../../cli/wizard.js');
    expect(typeof wizard.isSecretField).toBe('function');
  });
});

// ─── Non-interactive overrides path ────────────────────────

describe('runIntegrationWizard — overrides bypass prompts', () => {
  it('returns overrides directly without entering interactive prompts', async () => {
    const wizard = await import('../../cli/wizard.js');

    const typeInfo: IntegrationTypeInfo = {
      type: 'echo',
      name: 'Echo',
      description: 'Echo test',
      configSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message' },
        },
      },
    };

    const overrides = { message: 'hello' };
    const result = await wizard.runIntegrationWizard(typeInfo, overrides);
    expect(result).toEqual(overrides);
  });
});

// ─── Empty schema returns empty config ─────────────────────

describe('runIntegrationWizard — empty schema', () => {
  it('returns empty config immediately for schema with no properties', async () => {
    const wizard = await import('../../cli/wizard.js');

    const typeInfo: IntegrationTypeInfo = {
      type: 'webhook',
      name: 'Webhook',
      description: 'Receive webhooks',
      configSchema: { type: 'object' },
    };

    const result = await wizard.runIntegrationWizard(typeInfo);
    expect(result).toEqual({});
  });
});

// ─── Integration type schema classification ────────────────

describe('integration type secret fields classification', () => {
  // These represent the actual schemas used in the system
  const schemaTests = [
    {
      name: 'X/Twitter',
      fields: {
        api_key: true,
        api_secret: true,
        access_token: true,
        access_token_secret: true,
      },
    },
    {
      name: 'Slack',
      fields: {
        bot_token: true,
        app_token: true,
        channel: false,
      },
    },
    {
      name: 'Email',
      fields: {
        host: false,
        port: false,
        username: false,
        password: true,
      },
    },
    {
      name: 'HTTP Poll',
      fields: {
        url: false,
        interval_seconds: false,
        headers: false,
      },
    },
  ];

  for (const { name, fields } of schemaTests) {
    describe(name, () => {
      for (const [field, expected] of Object.entries(fields)) {
        it(`${field} → ${expected ? 'secret (password)' : 'text'}`, () => {
          expect(isSecretField(field)).toBe(expected);
        });
      }
    });
  }
});
