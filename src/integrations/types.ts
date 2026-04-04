
/**
 * JSON Schema Draft 7 type for integration config schemas.
 */
export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/** A single property in a JSON Schema */
export interface JSONSchemaProperty {
  type: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
}

/**
 * A notification event emitted by an integration.
 */
export interface NotificationEvent {
  /** Unique identifier for this notification */
  id: string;
  /** Source integration ID */
  source: string;
  /** Event type (e.g. 'info', 'warning', 'error', 'message') */
  type: string;
  /** Short title */
  title: string;
  /** Full body text */
  body: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Optional structured metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Stored notification row from SQLite.
 */
export interface StoredNotification {
  id: string;
  source: string;
  type: string;
  title: string;
  body: string;
  read: number;
  created_at: string;
  metadata: string | null;
}

/**
 * Configuration for an integration stored in the database.
 */
export interface IntegrationConfig {
  id: string;
  name: string;
  type: string;
  config: Record<string, string>;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  last_event_at: string | null;
}

/**
 * MCP tool definition exposed by an integration.
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * The plugin interface that every integration must implement.
 * Drives the CLI wizard via configSchema and exposes tools to agents.
 */
export interface IntegrationAdapter {
  /** Unique type identifier (e.g. 'echo', 'webhook', 'slack') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description of what this integration does */
  description: string;
  /** JSON Schema defining config fields needed by this integration */
  configSchema: JSONSchema;
  /** Connect / start the integration with the given config */
  connect(config: Record<string, string>): Promise<void>;
  /** Disconnect and clean up all resources (timers, connections) */
  disconnect(): Promise<void>;
  /** Register a handler for notification events */
  onEvent(handler: (event: NotificationEvent) => void): void;
  /** Get MCP tools this integration exposes to agents */
  getTools(): MCPTool[];
}
