import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import type { IntegrationTypeInfo } from '../integrations/registry.js';

/**
 * Interactive CLI wizard that generates config prompts from a JSON Schema.
 * Drives config collection for any integration type (A-INT-05).
 */

/**
 * Run the integration setup wizard.
 * Generates prompts from the adapter's configSchema and returns the config.
 */
export async function runIntegrationWizard(
  typeInfo: IntegrationTypeInfo,
  overrides?: Record<string, string>,
): Promise<Record<string, string>> {
  const schema = typeInfo.configSchema;

  console.log(chalk.blue(`\n  Setting up ${typeInfo.name} integration`));
  console.log(chalk.gray(`  ${typeInfo.description}\n`));

  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    console.log(chalk.gray('  No configuration needed.'));
    return {};
  }

  // If overrides are provided (non-interactive mode), use them directly
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
      const value = await select({
        message: label,
        choices: (prop.enum as string[]).map((v) => ({ value: String(v), name: String(v) })),
        default: prop.default !== undefined ? String(prop.default) : undefined,
      });
      config[key] = value;
    } else {
      const value = await input({
        message: label,
        default: prop.default !== undefined ? String(prop.default) : undefined,
        validate: (val: string) => {
          if (isRequired && !val) return `${key} is required`;
          if (prop.type === 'number' && val !== '') {
            const num = Number(val);
            if (isNaN(num)) return 'Please enter a valid number';
            if (prop.minimum !== undefined && num < prop.minimum) {
              return `Minimum value is ${prop.minimum}`;
            }
            if (prop.maximum !== undefined && num > prop.maximum) {
              return `Maximum value is ${prop.maximum}`;
            }
          }
          return true;
        },
      });

      if (value !== '' && value !== undefined) {
        config[key] = value;
      }
    }
  }

  return config;
}

/**
 * Prompt for integration type selection.
 */
export async function selectIntegrationType(
  availableTypes: IntegrationTypeInfo[],
): Promise<IntegrationTypeInfo> {
  const type = await select({
    message: 'Select integration type:',
    choices: availableTypes.map((t) => ({
      value: t.type,
      name: `${t.name} — ${t.description}`,
    })),
  });

  return availableTypes.find((t) => t.type === type)!;
}

/**
 * Prompt for a name for the new integration.
 */
export async function promptIntegrationName(
  defaultName?: string,
): Promise<string> {
  const name = await input({
    message: 'Enter a name for this integration:',
    default: defaultName,
    validate: (val: string) => {
      if (!val.trim()) return 'Name is required';
      return true;
    },
  });
  return name;
}
