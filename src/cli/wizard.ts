import * as p from '@clack/prompts';
import type { IntegrationTypeInfo } from '../integrations/registry.js';
import type { JSONSchemaProperty } from '../integrations/types.js';

/** Secret field names — any field containing these strings uses password input */
const SECRET_KEYWORDS = ['key', 'secret', 'token', 'password'];

/**
 * Check if a field name should be treated as a secret.
 */
export function isSecretField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return SECRET_KEYWORDS.some((s) => lower.includes(s));
}

/**
 * Redact a value if it belongs to a secret field.
 */
function redactValue(fieldName: string, value: string): string {
  return isSecretField(fieldName) ? '••••••' : value;
}

/**
 * Handle cancel from any @clack/prompts call.
 */
function handleCancel(value: unknown): asserts value is string {
  if (p.isCancel(value)) {
    p.cancel('Cancelled');
    process.exit(0);
  }
}

/**
 * Validate that a URL-like string is well-formed.
 */
function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run the integration setup wizard using @clack/prompts.
 * Generates prompts from the adapter's configSchema and returns the config.
 * @param showIntro - whether to show the intro banner (false if already shown by selectIntegrationType)
 */
export async function runIntegrationWizard(
  typeInfo: IntegrationTypeInfo,
  overrides?: Record<string, string>,
  showIntro = true,
): Promise<Record<string, string>> {
  const schema = typeInfo.configSchema;

  if (showIntro) {
    p.intro('SERVICE — Integration Setup');
  }

  p.log.info(`Setting up ${typeInfo.name} integration\n${typeInfo.description}`);

  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    p.log.info('No configuration needed.');
    p.outro('Integration added successfully!');
    return {};
  }

  // If overrides are provided (non-interactive mode), return them directly
  if (overrides && Object.keys(overrides).length > 0) {
    return overrides;
  }

  const config: Record<string, string> = {};
  const requiredFields = new Set(schema.required ?? []);

  for (const [key, prop] of Object.entries(schema.properties)) {
    const isRequired = requiredFields.has(key);
    const description = prop.description ?? `Enter ${key}`;
    const label = isRequired ? `${description} (required)` : description;

    if (prop.enum && prop.enum.length > 0) {
      // Enum field — use select()
      const value = await p.select({
        message: label,
        options: (prop.enum as string[]).map((v) => ({
          value: String(v),
          label: String(v),
        })),
        initialValue: prop.default !== undefined ? String(prop.default) : undefined,
      });
      handleCancel(value);
      config[key] = value;
    } else if (isSecretField(key)) {
      // Secret field — use password()
      const value = await p.password({
        message: label,
        validate: (val) => {
          if (isRequired && (!val || !val.trim())) return `${key} is required`;
          return undefined;
        },
      });
      handleCancel(value);
      if (value !== '') {
        config[key] = value;
      }
    } else {
      // Plain text field — use text()
      const value = await p.text({
        message: label,
        defaultValue: prop.default !== undefined ? String(prop.default) : undefined,
        placeholder: prop.default !== undefined ? String(prop.default) : undefined,
        validate: (val) => {
          if (isRequired && (!val || !val.trim())) return `${key} is required`;
          if (val && val.trim()) {
            // Numeric validation
            if (prop.type === 'number') {
              const num = Number(val);
              if (isNaN(num)) return 'Please enter a valid number';
              if (prop.minimum !== undefined && num < prop.minimum) {
                return `Minimum value is ${prop.minimum}`;
              }
              if (prop.maximum !== undefined && num > prop.maximum) {
                return `Maximum value is ${prop.maximum}`;
              }
            }
            // URL validation for fields with 'url' in the name or description
            if (isUrlField(key, prop) && !isValidUrl(val)) {
              return 'Please enter a valid URL';
            }
          }
          return undefined;
        },
      });
      handleCancel(value);
      if (value !== '' && value !== undefined) {
        config[key] = value;
      }
    }
  }

  // Review step — show summary with secrets redacted
  const reviewLines = Object.entries(config)
    .map(([k, v]) => `  ${k}: ${redactValue(k, v)}`)
    .join('\n');

  p.note(reviewLines, 'Review your configuration');

  return config;
}

/**
 * Start a connection test spinner. Returns the spinner so the caller
 * can stop it after the API call completes.
 */
export function startConnectionSpinner(): { stop: (msg?: string) => void; error: (msg?: string) => void } {
  const s = p.spinner();
  s.start('Testing connection...');
  return { stop: (msg?: string) => s.stop(msg), error: (msg?: string) => s.error(msg) };
}

/**
 * Complete the wizard after the API call succeeds.
 * Called from the CLI action handler after POST /api/integrations.
 */
export function wizardConnectionSuccess(): void {
  p.outro('Integration added successfully!');
}

/**
 * Show connection failure message.
 */
export function wizardConnectionFailure(error: string): void {
  p.log.error(`Connection failed: ${error}`);
}

/**
 * Prompt for integration type selection.
 */
export async function selectIntegrationType(
  availableTypes: IntegrationTypeInfo[],
): Promise<IntegrationTypeInfo> {
  p.intro('SERVICE — Integration Setup');

  const type = await p.select({
    message: 'Select integration type:',
    options: availableTypes.map((t) => ({
      value: t.type,
      label: `${t.name} — ${t.description}`,
    })),
  });

  handleCancel(type);

  return availableTypes.find((t) => t.type === type)!;
}

/**
 * Prompt for a name for the new integration.
 */
export async function promptIntegrationName(
  defaultName?: string,
): Promise<string> {
  const name = await p.text({
    message: 'Enter a name for this integration:',
    defaultValue: defaultName,
    placeholder: defaultName,
    validate: (val) => {
      if (!val || !val.trim()) return 'Name is required';
      return undefined;
    },
  });
  handleCancel(name);
  return name;
}

/**
 * Interactive wizard for `mcp add` when no arguments are given.
 */
export async function runMcpAddWizard(): Promise<{
  name: string;
  command: string;
  args: string[];
}> {
  p.intro('SERVICE — Add MCP Connection');

  const name = await p.text({
    message: 'MCP server name:',
    placeholder: 'e.g. filesystem',
    validate: (val) => {
      if (!val || !val.trim()) return 'Name is required';
      return undefined;
    },
  });
  handleCancel(name);

  const command = await p.text({
    message: 'Command to launch the MCP server:',
    placeholder: 'e.g. npx',
    validate: (val) => {
      if (!val || !val.trim()) return 'Command is required';
      return undefined;
    },
  });
  handleCancel(command);

  const argsInput = await p.text({
    message: 'Arguments (space-separated, optional):',
    placeholder: 'e.g. -y @modelcontextprotocol/server-filesystem /tmp',
    defaultValue: '',
  });
  handleCancel(argsInput);

  const args = argsInput.trim() ? argsInput.trim().split(/\s+/) : [];

  // Review step
  const reviewLines = [
    `  Name:    ${name}`,
    `  Command: ${command}`,
    `  Args:    ${args.length > 0 ? args.join(' ') : '(none)'}`,
  ].join('\n');

  p.note(reviewLines, 'Review MCP connection');

  const confirmed = await p.confirm({
    message: 'Add this MCP connection?',
  });
  handleCancel(confirmed);

  if (!confirmed) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  return { name, command, args };
}

/**
 * Check if a field is a URL field based on name or description.
 */
function isUrlField(key: string, prop: JSONSchemaProperty): boolean {
  const lower = key.toLowerCase();
  if (lower.includes('url') || lower.includes('endpoint') || lower.includes('webhook')) {
    return true;
  }
  const desc = (prop.description ?? '').toLowerCase();
  return desc.includes('url') || desc.includes('endpoint');
}
