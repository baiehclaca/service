# Custom Integration

SERVICE supports custom integrations by implementing the `IntegrationAdapter` interface. This lets you connect any platform or data source without modifying the SERVICE core.

## When to Use a Custom Integration

- You need to monitor a platform not built into SERVICE (e.g. Discord, Telegram, PagerDuty, custom internal systems)
- You want to expose custom MCP tools to connected AI agents
- You have specialized event processing logic (filtering, transformation, deduplication)

## The `IntegrationAdapter` Interface

Every custom integration must implement this TypeScript interface:

```typescript
import type { IntegrationAdapter, NotificationEvent, MCPTool, JSONSchema } from '@service/types';

export class MyCustomIntegration implements IntegrationAdapter {
  // Unique identifier (use a short slug: "my-platform")
  id = 'my-platform';

  // Human-readable name shown in the UI and CLI
  name = 'My Platform';

  // Shown in 'service integration add' list
  description = 'Connects SERVICE to My Platform for real-time notifications.';

  // JSON Schema defining the config fields shown in the setup wizard
  configSchema: JSONSchema = {
    type: 'object',
    required: ['api_key'],
    properties: {
      api_key: {
        type: 'string',
        description: 'API key for My Platform'
      },
      webhook_secret: {
        type: 'string',
        description: 'Optional webhook signing secret'
      }
    }
  };

  private eventHandler?: (event: NotificationEvent) => void;

  // Called when the integration is activated with its config
  async connect(config: Record<string, string>): Promise<void> {
    const apiKey = config.api_key;
    // Initialize your SDK / polling loop / WebSocket here
    // Call this.emitEvent(...) when a new event arrives
  }

  // Called when the integration is deactivated or removed
  async disconnect(): Promise<void> {
    // Stop polling, close WebSocket connections, cleanup timers
  }

  // Register the handler that SERVICE calls to store+push notifications
  onEvent(handler: (event: NotificationEvent) => void): void {
    this.eventHandler = handler;
  }

  // Return MCP tools this integration exposes to connected AI agents
  getTools(): MCPTool[] {
    return [
      {
        name: 'my_platform_send_message',
        description: 'Send a message via My Platform',
        inputSchema: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', description: 'Message to send' }
          }
        },
        handler: async (args: { message: string }) => {
          // Implement tool logic here
          return { success: true };
        }
      }
    ];
  }

  // Helper to emit events from inside connect()
  private emitEvent(event: Omit<NotificationEvent, 'id' | 'timestamp'>): void {
    if (this.eventHandler) {
      this.eventHandler({
        ...event,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      });
    }
  }
}
```

## Registering Your Custom Integration

### Step 1: Create your integration file

Place it in `src/integrations/custom/my-platform.ts` (or any path you prefer).

### Step 2: Register with the IntegrationRegistry

In `src/integrations/registry.ts`, import and register your adapter:

```typescript
import { MyCustomIntegration } from './custom/my-platform.js';

// Inside the registry constructor or init method:
this.register(new MyCustomIntegration());
```

### Step 3: Build and restart

```bash
npm run build
service stop
service start
```

### Step 4: Verify registration

```bash
service integration add
# Your integration should appear in the type selection list
```

### Step 5: Add an instance

```bash
service integration add my-platform \
  --name "My Platform Instance" \
  --config '{"api_key":"your-key-here"}'
```

## Config Schema Reference

The `configSchema` determines what fields the setup wizard prompts for:

| JSON Schema keyword | Effect |
|--------------------|--------|
| `required: ["field"]` | Field is mandatory; wizard will not proceed without it |
| `properties.X.description` | Shown as the prompt label in the wizard |
| `properties.X.type: "string"` | Standard text input |
| `properties.X.enum: ["a","b"]` | Wizard shows a selection menu |
| `properties.X.default: "val"` | Pre-filled default value in the wizard |

## Example: Minimal Polling Integration

```typescript
export class ExamplePollingIntegration implements IntegrationAdapter {
  id = 'example-poll';
  name = 'Example Poll';
  description = 'Polls an API every N seconds.';
  configSchema: JSONSchema = {
    type: 'object',
    required: ['url'],
    properties: {
      url: { type: 'string', description: 'URL to poll' },
      interval: { type: 'string', description: 'Poll interval in seconds', default: '60' }
    }
  };

  private timer?: NodeJS.Timeout;
  private eventHandler?: (e: NotificationEvent) => void;
  private lastValue?: string;

  async connect(config: Record<string, string>): Promise<void> {
    const interval = parseInt(config.interval ?? '60', 10) * 1000;
    const poll = async () => {
      const res = await fetch(config.url);
      const body = await res.text();
      if (body !== this.lastValue) {
        this.lastValue = body;
        this.emitEvent({ source: this.id, type: 'change', title: 'Content Changed', body });
      }
    };
    await poll();
    this.timer = setInterval(poll, interval);
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
  }

  onEvent(handler: (e: NotificationEvent) => void): void {
    this.eventHandler = handler;
  }

  getTools(): MCPTool[] { return []; }

  private emitEvent(event: Omit<NotificationEvent, 'id' | 'timestamp'>): void {
    this.eventHandler?.({ ...event, id: crypto.randomUUID(), timestamp: new Date().toISOString() });
  }
}
```

## Troubleshooting

**Integration type not showing in `service integration add`**
- Ensure you called `this.register(new MyCustomIntegration())` in the registry init, and ran `npm run build` + restarted the daemon.

**`connect()` called but no events arriving in SERVICE**
- Confirm you are calling `this.emitEvent(...)` (or your equivalent) when new data arrives, and that `onEvent()` was called before `connect()` (the registry handles this ordering).

**Custom MCP tools not visible to AI agents**
- Check that `getTools()` returns correctly structured `MCPTool` objects with valid `name`, `description`, `inputSchema`, and `handler`.
- Restart the MCP Hub after registering the integration so agents re-discover the updated tool list.
