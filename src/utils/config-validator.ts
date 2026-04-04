// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — ajv CJS/ESM interop: at runtime `Ajv` is the constructor
import Ajv from 'ajv';
import type { JSONSchema } from '../integrations/types.js';

// At runtime, `Ajv` is the constructor function.
// TypeScript's type definitions for CJS interop may disagree, so we cast.
const ajv = new (Ajv as unknown as new (opts: Record<string, unknown>) => {
  compile: (schema: unknown) => {
    (data: unknown): boolean;
    errors?: Array<{ instancePath?: string; message?: string }> | null;
  };
})({ allErrors: true, strict: false, coerceTypes: true });

/**
 * Validate an integration config against its JSON Schema.
 * Returns { valid: true } or { valid: false, errors: [...] }.
 */
export function validateIntegrationConfig(
  config: Record<string, unknown>,
  schema: JSONSchema,
): { valid: boolean; errors: string[] } {
  const validate = ajv.compile(schema);
  const valid = validate(config);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors ?? []).map(
    (err) => `${err.instancePath || '.'} ${err.message ?? 'invalid'}`,
  );

  return { valid: false, errors };
}
