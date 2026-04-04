import { WebhookIntegration } from '../integrations/builtin/webhook.js';
import type { NotificationEvent } from '../integrations/types.js';

describe('WebhookIntegration', () => {
  let webhook: WebhookIntegration;

  beforeEach(() => {
    webhook = new WebhookIntegration();
  });

  afterEach(async () => {
    await webhook.disconnect();
  });

  it('should have correct id and metadata', () => {
    expect(webhook.id).toBe('webhook');
    expect(webhook.name).toBe('Generic Webhook');
    expect(webhook.description).toBeDefined();
    expect(webhook.configSchema).toBeDefined();
    expect(webhook.configSchema.type).toBe('object');
  });

  it('should define configSchema with name property', () => {
    expect(webhook.configSchema.properties).toBeDefined();
    expect(webhook.configSchema.properties!.name).toBeDefined();
    expect(webhook.configSchema.properties!.name.type).toBe('string');
    expect(webhook.configSchema.required).toContain('name');
  });

  it('should connect without errors', async () => {
    await expect(webhook.connect({ name: 'test-hook' })).resolves.toBeUndefined();
  });

  it('should disconnect without errors', async () => {
    await webhook.connect({ name: 'test-hook' });
    await expect(webhook.disconnect()).resolves.toBeUndefined();
  });

  it('should create NotificationEvent from webhook POST body', () => {
    const events: NotificationEvent[] = [];
    webhook.onEvent((event) => events.push(event));

    const event = webhook.handleWebhookPost(
      { title: 'Deploy', body: 'Deployed v2.0', type: 'deploy' },
      'my-webhook'
    );

    expect(event.id).toBeDefined();
    expect(event.source).toBe('my-webhook');
    expect(event.type).toBe('deploy');
    expect(event.title).toBe('Deploy');
    expect(event.body).toBe('Deployed v2.0');
    expect(event.timestamp).toBeDefined();
  });

  it('should call event handler when webhook POST is received', () => {
    const events: NotificationEvent[] = [];
    webhook.onEvent((event) => events.push(event));

    webhook.handleWebhookPost(
      { title: 'Test', body: 'Hello' },
      'wh-1'
    );

    expect(events.length).toBe(1);
    expect(events[0].title).toBe('Test');
  });

  it('should handle missing title/body in webhook POST', () => {
    const event = webhook.handleWebhookPost(
      { custom_data: 'some_value' },
      'wh-2'
    );

    expect(event.title).toBe('Webhook Event');
    // Body should be JSON stringified fallback
    expect(event.body).toContain('custom_data');
  });

  it('should use message field as body fallback', () => {
    const event = webhook.handleWebhookPost(
      { message: 'Hello from external service' },
      'wh-3'
    );

    expect(event.body).toBe('Hello from external service');
  });

  it('should return empty tools array', () => {
    expect(webhook.getTools()).toEqual([]);
  });
});
