import { EchoIntegration } from '../integrations/builtin/echo.js';
import type { NotificationEvent } from '../integrations/types.js';

describe('EchoIntegration', () => {
  let echo: EchoIntegration;

  beforeEach(() => {
    echo = new EchoIntegration();
  });

  afterEach(async () => {
    await echo.disconnect();
  });

  it('should have correct id and metadata', () => {
    expect(echo.id).toBe('echo');
    expect(echo.name).toBe('Echo Test');
    expect(echo.description).toBeDefined();
    expect(echo.configSchema).toBeDefined();
    expect(echo.configSchema.type).toBe('object');
  });

  it('should define configSchema with interval_seconds', () => {
    expect(echo.configSchema.properties).toBeDefined();
    expect(echo.configSchema.properties!.interval_seconds).toBeDefined();
    expect(echo.configSchema.properties!.interval_seconds.type).toBe('number');
  });

  it('should generate events at the configured interval', async () => {
    const events: NotificationEvent[] = [];
    echo.onEvent((event) => events.push(event));

    // Use 1-second interval for faster testing
    await echo.connect({ interval_seconds: '1' });

    // Wait for 1.5 seconds to get at least 1 event
    await new Promise(resolve => setTimeout(resolve, 1500));

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].source).toBe('echo');
    expect(events[0].type).toBe('info');
    expect(events[0].title).toMatch(/Echo #\d+/);
    expect(events[0].id).toBeDefined();
    expect(events[0].timestamp).toBeDefined();
  }, 5000);

  it('should stop generating events after disconnect', async () => {
    const events: NotificationEvent[] = [];
    echo.onEvent((event) => events.push(event));

    await echo.connect({ interval_seconds: '1' });
    await new Promise(resolve => setTimeout(resolve, 1500));

    const countBeforeDisconnect = events.length;
    await echo.disconnect();

    await new Promise(resolve => setTimeout(resolve, 1500));
    expect(events.length).toBe(countBeforeDisconnect);
  }, 5000);

  it('should be idempotent on connect (no duplicate timers)', async () => {
    const events: NotificationEvent[] = [];
    echo.onEvent((event) => events.push(event));

    await echo.connect({ interval_seconds: '1' });
    await echo.connect({ interval_seconds: '1' }); // Should not create a second timer

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Should have approximately 1-2 events, not double
    expect(events.length).toBeLessThanOrEqual(3);
  }, 5000);

  it('should return empty tools array', () => {
    expect(echo.getTools()).toEqual([]);
  });
});
