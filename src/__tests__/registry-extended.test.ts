import { IntegrationRegistry } from '../integrations/registry.js';
import { NotificationStore } from '../gateway/notification-store.js';
import { ServiceEventBus } from '../gateway/event-bus.js';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../db/schema.js';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

describe('IntegrationRegistry (extended)', () => {
  let db: Database.Database;
  let store: NotificationStore;
  let eventBus: ServiceEventBus;
  let registry: IntegrationRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA_SQL);

    // Ensure encryption key exists
    const serviceDir = join(homedir(), '.service');
    mkdirSync(serviceDir, { recursive: true });
    const keyPath = join(serviceDir, '.encryption_key');
    if (!existsSync(keyPath)) {
      writeFileSync(keyPath, randomBytes(32).toString('hex'), { mode: 0o600 });
    }

    store = new NotificationStore(db);
    eventBus = ServiceEventBus.getInstance();
    registry = new IntegrationRegistry(store, eventBus);
  });

  afterEach(async () => {
    await registry.shutdown();
    db.close();
    ServiceEventBus.resetInstance();
  });

  it('registers all 6 adapter types', () => {
    const types = registry.getAvailableTypes();
    expect(types).toContain('echo');
    expect(types).toContain('webhook');
    expect(types).toContain('x-twitter');
    expect(types).toContain('slack');
    expect(types).toContain('email');
    expect(types).toContain('http-poll');
    expect(types.length).toBe(6);
  });

  it('getAvailableTypesInfo returns detailed info with configSchema', () => {
    const typesInfo = registry.getAvailableTypesInfo();
    expect(typesInfo.length).toBe(6);

    const webhook = typesInfo.find(t => t.type === 'webhook');
    expect(webhook).toBeDefined();
    expect(webhook!.name).toBe('Generic Webhook');
    expect(webhook!.configSchema.type).toBe('object');

    const xtwitter = typesInfo.find(t => t.type === 'x-twitter');
    expect(xtwitter).toBeDefined();
    expect(xtwitter!.name).toBe('X / Twitter');
  });

  it('loadIntegration with webhook type works', async () => {
    await registry.loadIntegration('test-webhook-1', 'webhook', { name: 'Test Webhook' }, 'Test Webhook');
    expect(registry.getLoadedIntegrations().size).toBe(1);
    expect(registry.getAdapter('test-webhook-1')).toBeDefined();
  });

  it('disableIntegration disconnects adapter and marks inactive', async () => {
    await registry.loadIntegration('test-echo-1', 'echo', { interval_seconds: '9999' }, 'Test Echo');
    expect(registry.getLoadedIntegrations().size).toBe(1);

    await registry.disableIntegration('test-echo-1');
    expect(registry.getLoadedIntegrations().size).toBe(0);

    // Check DB status
    const allIntegrations = store.getAllIntegrations();
    const echo = allIntegrations.find(i => i.id === 'test-echo-1');
    expect(echo).toBeDefined();
    expect(echo!.status).toBe('inactive');
  });

  it('enableIntegration reconnects a disabled integration', async () => {
    await registry.loadIntegration('test-echo-2', 'echo', { interval_seconds: '9999' }, 'Test Echo 2');
    await registry.disableIntegration('test-echo-2');
    expect(registry.getLoadedIntegrations().size).toBe(0);

    await registry.enableIntegration('test-echo-2');
    expect(registry.getLoadedIntegrations().size).toBe(1);
    expect(registry.getAdapter('test-echo-2')).toBeDefined();
  });

  it('deleteIntegration removes from DB and adapter map', async () => {
    await registry.loadIntegration('test-webhook-del', 'webhook', { name: 'To Delete' }, 'To Delete');
    expect(registry.getLoadedIntegrations().size).toBe(1);

    await registry.deleteIntegration('test-webhook-del');
    expect(registry.getLoadedIntegrations().size).toBe(0);

    // Check it's gone from DB
    const allIntegrations = store.getAllIntegrations();
    const found = allIntegrations.find(i => i.id === 'test-webhook-del');
    expect(found).toBeUndefined();
  });

  it('enableIntegration throws for non-existent integration', async () => {
    await expect(registry.enableIntegration('non-existent')).rejects.toThrow();
  });

  it('loadIntegration throws for unknown type', async () => {
    await expect(
      registry.loadIntegration('test-unknown', 'non-existent-type', {}, 'Test'),
    ).rejects.toThrow('Unknown integration type');
  });
});
