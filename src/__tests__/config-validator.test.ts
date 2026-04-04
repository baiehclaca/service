import { validateIntegrationConfig } from '../utils/config-validator.js';
import type { JSONSchema } from '../integrations/types.js';

describe('validateIntegrationConfig', () => {
  const webhookSchema: JSONSchema = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name',
      },
    },
    required: ['name'],
  };

  const httpPollSchema: JSONSchema = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to poll',
      },
      interval_seconds: {
        type: 'number',
        description: 'Polling interval',
        minimum: 10,
        maximum: 86400,
      },
    },
    required: ['url'],
  };

  it('validates a valid config', () => {
    const result = validateIntegrationConfig({ name: 'test' }, webhookSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects config with missing required field', () => {
    const result = validateIntegrationConfig({}, webhookSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validates config with optional fields', () => {
    const result = validateIntegrationConfig(
      { url: 'http://example.com' },
      httpPollSchema,
    );
    expect(result.valid).toBe(true);
  });

  it('rejects config with wrong type', () => {
    const result = validateIntegrationConfig(
      { url: 'http://example.com', interval_seconds: 'not-a-number' },
      httpPollSchema,
    );
    expect(result.valid).toBe(false);
  });

  it('validates empty config against schema with no required fields', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        foo: { type: 'string', description: 'Optional' },
      },
    };
    const result = validateIntegrationConfig({}, schema);
    expect(result.valid).toBe(true);
  });
});
