import { isSecretField } from '../../cli/wizard.js';

// ─── Setup module exports ──────────────────────────────────

describe('setup module exports', () => {
  it('exports runSetupWizard function', async () => {
    const setup = await import('../../cli/setup.js');
    expect(typeof setup.runSetupWizard).toBe('function');
  });
});

// ─── Re-verify isSecretField is available for setup usage ──

describe('isSecretField — setup context', () => {
  it('detects api_key as secret', () => {
    expect(isSecretField('api_key')).toBe(true);
  });

  it('does not flag name as secret', () => {
    expect(isSecretField('name')).toBe(false);
  });

  it('does not flag command as secret', () => {
    expect(isSecretField('command')).toBe(false);
  });

  it('detects bot_token as secret', () => {
    expect(isSecretField('bot_token')).toBe(true);
  });
});
