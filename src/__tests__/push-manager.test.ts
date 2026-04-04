import { ServiceEventBus } from '../gateway/event-bus.js';
import { PushManager } from '../gateway/push-manager.js';
import type { NotificationEvent } from '../integrations/types.js';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

/** Minimal mock of an Express Response for SSE testing */
class MockResponse extends EventEmitter {
  public written: string[] = [];
  public statusCode: number = 200;
  public headers: Record<string, string> = {};
  public ended = false;

  writeHead(status: number, headers: Record<string, string>): void {
    this.statusCode = status;
    this.headers = { ...this.headers, ...headers };
  }

  write(data: string): boolean {
    this.written.push(data);
    return true;
  }

  end(): void {
    this.ended = true;
  }
}

describe('PushManager', () => {
  let eventBus: ServiceEventBus;
  let pushManager: PushManager;

  beforeEach(() => {
    ServiceEventBus.resetInstance();
    eventBus = ServiceEventBus.getInstance();
    pushManager = new PushManager(eventBus);
  });

  afterEach(() => {
    pushManager.shutdown();
    ServiceEventBus.resetInstance();
  });

  function makeEvent(overrides?: Partial<NotificationEvent>): NotificationEvent {
    return {
      id: randomUUID(),
      source: 'test',
      type: 'info',
      title: 'Test',
      body: 'Test body',
      timestamp: new Date().toISOString(),
      ...overrides,
    };
  }

  it('should add SSE connection and set headers', () => {
    const res = new MockResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = pushManager.addConnection(res as any);

    expect(id).toBeDefined();
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/event-stream');
    expect(res.headers['Cache-Control']).toBe('no-cache');
    expect(res.headers['Connection']).toBe('keep-alive');
  });

  it('should send initial connection comment', () => {
    const res = new MockResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pushManager.addConnection(res as any);

    expect(res.written[0]).toBe(': connected\n\n');
  });

  it('should track connection count', () => {
    expect(pushManager.getConnectionCount()).toBe(0);

    const res1 = new MockResponse();
    const res2 = new MockResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pushManager.addConnection(res1 as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pushManager.addConnection(res2 as any);

    expect(pushManager.getConnectionCount()).toBe(2);
  });

  it('should broadcast notifications to all connections', () => {
    const res1 = new MockResponse();
    const res2 = new MockResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pushManager.addConnection(res1 as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pushManager.addConnection(res2 as any);

    const event = makeEvent({ id: 'test-event-123', title: 'Broadcast Test' });
    pushManager.broadcast(event);

    // Both should receive the SSE-formatted event
    const sseData1 = res1.written.find(d => d.includes('event: notification'));
    const sseData2 = res2.written.find(d => d.includes('event: notification'));
    expect(sseData1).toBeDefined();
    expect(sseData2).toBeDefined();
    expect(sseData1).toContain('id: test-event-123');
    expect(sseData1).toContain('Broadcast Test');
  });

  it('should broadcast via event bus when notification is emitted', () => {
    const res = new MockResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pushManager.addConnection(res as any);

    const event = makeEvent({ title: 'EventBus Test' });
    eventBus.emitNotification(event);

    const sseData = res.written.find(d => d.includes('EventBus Test'));
    expect(sseData).toBeDefined();
  });

  it('should use correct SSE format: id, event, data', () => {
    const res = new MockResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pushManager.addConnection(res as any);

    const event = makeEvent({ id: 'evt-abc' });
    pushManager.broadcast(event);

    const sseMessage = res.written.find(d => d.includes('event: notification'));
    expect(sseMessage).toBeDefined();
    // Check format: id: {uuid}\nevent: notification\ndata: {JSON}\n\n
    expect(sseMessage).toMatch(/^id: evt-abc\nevent: notification\ndata: \{.+\}\n\n$/s);
  });

  it('should remove connection on close event', () => {
    const res = new MockResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pushManager.addConnection(res as any);

    expect(pushManager.getConnectionCount()).toBe(1);
    res.emit('close');
    expect(pushManager.getConnectionCount()).toBe(0);
  });

  it('should clean up all connections on shutdown', () => {
    const res1 = new MockResponse();
    const res2 = new MockResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pushManager.addConnection(res1 as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pushManager.addConnection(res2 as any);

    pushManager.shutdown();

    expect(pushManager.getConnectionCount()).toBe(0);
    expect(res1.ended).toBe(true);
    expect(res2.ended).toBe(true);
  });
});
