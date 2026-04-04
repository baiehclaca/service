import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { Select, TextInput, PasswordInput } from '@inkjs/ui';
import type { JSONSchema, JSONSchemaProperty } from '../../../integrations/types.js';

const BASE_URL = 'http://127.0.0.1:3334';

/** Secret field detection: field name contains any of these substrings */
const SECRET_KEYWORDS = ['key', 'secret', 'token', 'password'];

function isSecretField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return SECRET_KEYWORDS.some((s) => lower.includes(s));
}

/** Redact a value for display */
function redactValue(fieldName: string, value: string): string {
  return isSecretField(fieldName) ? '••••••' : value;
}

interface IntegrationTypeInfo {
  type: string;
  name: string;
  description: string;
  configSchema: JSONSchema;
}

type Step = 'select-type' | 'fill-fields' | 'enter-name' | 'review' | 'submitting' | 'success' | 'error';

interface IntegrationAddProps {
  onBack: () => void;
}

/**
 * Multi-step in-TUI form for adding a new integration.
 * Step 1: Select integration type (Select from @inkjs/ui)
 * Step 2: Enter integration name
 * Step 3: Schema-driven field prompts (TextInput/PasswordInput/Select)
 * Step 4: Review screen (secrets redacted)
 * Step 5: Submit via POST /api/integrations
 * Cancel: Escape at any step → back to list
 */
export function IntegrationAdd({ onBack }: IntegrationAddProps): React.ReactElement {
  const [step, setStep] = useState<Step>('select-type');
  const [types, setTypes] = useState<IntegrationTypeInfo[]>([]);
  const [selectedType, setSelectedType] = useState<IntegrationTypeInfo | null>(null);
  const [integrationName, setIntegrationName] = useState('');
  const [fields, setFields] = useState<Array<{ name: string; prop: JSONSchemaProperty; required: boolean }>>([]);
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch available types
  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const resp = await fetch(`${BASE_URL}/api/integrations/types`);
        if (resp.ok) {
          const data = (await resp.json()) as IntegrationTypeInfo[];
          setTypes(data);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchTypes();
  }, []);

  // Handle Escape for cancellation
  useInput((_input, key) => {
    if (key.escape) {
      onBack();
    }
  });

  // Handle type selection
  const handleTypeSelect = useCallback((value: string) => {
    const typeInfo = types.find((t) => t.type === value);
    if (typeInfo) {
      setSelectedType(typeInfo);

      // Extract fields from config schema
      const schemaFields: Array<{ name: string; prop: JSONSchemaProperty; required: boolean }> = [];
      if (typeInfo.configSchema.properties) {
        const required = typeInfo.configSchema.required ?? [];
        for (const [name, prop] of Object.entries(typeInfo.configSchema.properties)) {
          schemaFields.push({ name, prop, required: required.includes(name) });
        }
      }
      setFields(schemaFields);
      setCurrentFieldIndex(0);
      setFieldValues({});
      setIntegrationName(`My ${typeInfo.name}`);
      setStep('enter-name');
    }
  }, [types]);

  // Handle name submission
  const handleNameSubmit = useCallback((value: string) => {
    setIntegrationName(value);
    if (fields.length > 0) {
      setStep('fill-fields');
    } else {
      setStep('review');
    }
  }, [fields.length]);

  // Handle field value submission
  const handleFieldSubmit = useCallback((value: string) => {
    const field = fields[currentFieldIndex];
    if (!field) return;

    setFieldValues((prev) => ({ ...prev, [field.name]: value }));

    if (currentFieldIndex < fields.length - 1) {
      setCurrentFieldIndex((i) => i + 1);
    } else {
      setStep('review');
    }
  }, [currentFieldIndex, fields]);

  // Handle enum field selection
  const handleEnumSelect = useCallback((value: string) => {
    const field = fields[currentFieldIndex];
    if (!field) return;

    setFieldValues((prev) => ({ ...prev, [field.name]: value }));

    if (currentFieldIndex < fields.length - 1) {
      setCurrentFieldIndex((i) => i + 1);
    } else {
      setStep('review');
    }
  }, [currentFieldIndex, fields]);

  // Submit the form
  const handleSubmit = useCallback(async () => {
    if (!selectedType) return;
    setStep('submitting');

    try {
      const resp = await fetch(`${BASE_URL}/api/integrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedType.type,
          name: integrationName,
          config: fieldValues,
        }),
      });

      if (resp.ok) {
        setStep('success');
        // Auto-return to list after 2s
        setTimeout(() => onBack(), 2000);
      } else {
        const result = (await resp.json()) as { error?: string };
        setErrorMessage(result.error ?? `HTTP ${resp.status}`);
        setStep('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      setStep('error');
    }
  }, [selectedType, integrationName, fieldValues, onBack]);

  // Render based on step
  switch (step) {
    case 'select-type':
      return renderSelectType(types, loading, handleTypeSelect);

    case 'enter-name':
      return renderNameInput(integrationName, handleNameSubmit);

    case 'fill-fields':
      return renderFieldInput(
        fields,
        currentFieldIndex,
        fieldValues,
        handleFieldSubmit,
        handleEnumSelect,
        selectedType
      );

    case 'review':
      return renderReview(
        selectedType,
        integrationName,
        fieldValues,
        fields,
        handleSubmit,
        onBack
      );

    case 'submitting':
      return (
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <Text bold color="green">Add Integration</Text>
          <Box marginTop={1}>
            <Text color="yellow">Creating integration...</Text>
          </Box>
        </Box>
      );

    case 'success':
      return (
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <Text bold color="green">Add Integration</Text>
          <Box marginTop={1}>
            <Text color="green">✓ Integration created successfully!</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Returning to list...</Text>
          </Box>
        </Box>
      );

    case 'error':
      return (
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <Text bold color="green">Add Integration</Text>
          <Box marginTop={1}>
            <Text color="red">✗ Failed to create integration: {errorMessage}</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Esc:back</Text>
          </Box>
        </Box>
      );
  }
}

function renderSelectType(
  types: IntegrationTypeInfo[],
  loading: boolean,
  onSelect: (value: string) => void
): React.ReactElement {
  if (loading) {
    return (
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        <Text bold color="green">Add Integration</Text>
        <Text dimColor>Loading integration types...</Text>
      </Box>
    );
  }

  const options = types.map((t) => ({
    label: `${t.name} — ${t.description}`,
    value: t.type,
  }));

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold color="green">Add Integration — Step 1: Select Type</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Select an integration type:</Text>
        <Box marginTop={1}>
          <Select options={options} onChange={onSelect} />
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑/↓:navigate  Enter:select  Esc:cancel</Text>
      </Box>
    </Box>
  );
}

function renderNameInput(
  defaultName: string,
  onSubmit: (value: string) => void
): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold color="green">Add Integration — Step 2: Name</Text>
      <Box marginTop={1}>
        <Text>Enter a name for this integration:</Text>
      </Box>
      <Box marginTop={1}>
        <TextInput defaultValue={defaultName} onSubmit={onSubmit} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Enter:submit  Esc:cancel</Text>
      </Box>
    </Box>
  );
}

function renderFieldInput(
  fields: Array<{ name: string; prop: JSONSchemaProperty; required: boolean }>,
  currentIndex: number,
  _fieldValues: Record<string, string>,
  onSubmit: (value: string) => void,
  onEnumSelect: (value: string) => void,
  selectedType: IntegrationTypeInfo | null
): React.ReactElement {
  const field = fields[currentIndex];
  if (!field) return <Text>No fields</Text>;

  const fieldDescription = field.prop.description || field.name;
  const isSecret = isSecretField(field.name);
  const hasEnum = field.prop.enum && field.prop.enum.length > 0;
  const defaultVal = field.prop.default !== undefined ? String(field.prop.default) : '';

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold color="green">
        Add Integration — {selectedType?.name ?? 'Config'} ({currentIndex + 1}/{fields.length})
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text bold>{field.name}</Text>
          {field.required && <Text color="red">*</Text>}
          {': '}
          <Text dimColor>{fieldDescription}</Text>
        </Text>
        {field.prop.minimum !== undefined && (
          <Text dimColor>  (min: {field.prop.minimum})</Text>
        )}
        {field.prop.maximum !== undefined && (
          <Text dimColor>  (max: {field.prop.maximum})</Text>
        )}
      </Box>
      <Box marginTop={1}>
        {hasEnum ? (
          <Select
            options={field.prop.enum!.map((v) => ({
              label: String(v),
              value: String(v),
            }))}
            onChange={onEnumSelect}
          />
        ) : isSecret ? (
          <PasswordInput
            placeholder={`Enter ${field.name}...`}
            onSubmit={onSubmit}
          />
        ) : (
          <TextInput
            defaultValue={defaultVal}
            placeholder={`Enter ${field.name}...`}
            onSubmit={onSubmit}
          />
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Enter:submit  Esc:cancel</Text>
      </Box>
    </Box>
  );
}

function renderReview(
  selectedType: IntegrationTypeInfo | null,
  name: string,
  fieldValues: Record<string, string>,
  fields: Array<{ name: string; prop: JSONSchemaProperty; required: boolean }>,
  onSubmit: () => void,
  _onBack: () => void
): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold color="green">Add Integration — Review</Text>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text dimColor>Type: </Text>
          <Text>{selectedType?.name ?? 'Unknown'} ({selectedType?.type})</Text>
        </Box>
        <Box>
          <Text dimColor>Name: </Text>
          <Text bold>{name}</Text>
        </Box>
      </Box>
      {fields.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor bold>Configuration:</Text>
          <Box
            borderStyle="single"
            borderColor="gray"
            flexDirection="column"
            paddingX={1}
          >
            {fields.map(({ name: fieldName }) => (
              <Box key={fieldName}>
                <Text dimColor>{fieldName}: </Text>
                <Text>{redactValue(fieldName, fieldValues[fieldName] ?? '')}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}
      <Box marginTop={1}>
        <ReviewActions onSubmit={onSubmit} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Enter:create  Esc:cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * Small helper component to handle the review step's Enter key.
 * Separated so useInput can be called at the component level.
 */
function ReviewActions({ onSubmit }: { onSubmit: () => void }): React.ReactElement {
  useInput((_input, key) => {
    if (key.return) {
      onSubmit();
    }
  });

  return <Text color="cyan">Press Enter to create integration, Esc to cancel</Text>;
}
