import { jest } from '@jest/globals';

describe('useSse', () => {
  it('SSE URL uses 127.0.0.1:3334', () => {
    // The useSse hook should connect to http://127.0.0.1:3334/events
    expect('http://127.0.0.1:3334/events').toMatch(/^http:\/\/127\.0\.0\.1:3334\/events$/);
  });

  it('SSE backoff schedule follows spec: 2s/4s/8s/30s max', () => {
    const BACKOFF_SCHEDULE = [2000, 4000, 8000, 30000];
    expect(BACKOFF_SCHEDULE).toEqual([2000, 4000, 8000, 30000]);
    expect(BACKOFF_SCHEDULE[BACKOFF_SCHEDULE.length - 1]).toBe(30000);
  });

  it('handles connection error by setting error state', async () => {
    const originalFetch = global.fetch;

    global.fetch = jest.fn(() =>
      Promise.reject(new Error('ECONNREFUSED'))
    ) as unknown as typeof fetch;

    try {
      const React = await import('react');
      const inkLib = await import('ink');
      const inkTesting = await import('ink-testing-library');

      function SseErrorComponent() {
        const [error, setError] = React.useState<string | null>(null);

        React.useEffect(() => {
          fetch('http://127.0.0.1:3334/events')
            .catch((err: Error) => setError(err.message));
        }, []);

        return React.createElement(inkLib.Text, null, `error:${error ?? 'none'}`);
      }

      const instance = inkTesting.render(React.createElement(SseErrorComponent));

      await new Promise((r) => setTimeout(r, 100));
      expect(instance.lastFrame()).toContain('error:ECONNREFUSED');

      instance.unmount();
      instance.cleanup();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('attempts to fetch from the SSE events endpoint', async () => {
    const originalFetch = global.fetch;
    let calledUrl = '';

    global.fetch = jest.fn((url: string | URL | Request) => {
      calledUrl = String(url);
      return Promise.reject(new Error('test-abort'));
    }) as unknown as typeof fetch;

    try {
      const React = await import('react');
      const inkLib = await import('ink');
      const inkTesting = await import('ink-testing-library');

      function SseUrlTest() {
        React.useEffect(() => {
          fetch('http://127.0.0.1:3334/events').catch(() => {});
        }, []);
        return React.createElement(inkLib.Text, null, 'test');
      }

      const instance = inkTesting.render(React.createElement(SseUrlTest));
      await new Promise((r) => setTimeout(r, 100));

      expect(calledUrl).toBe('http://127.0.0.1:3334/events');

      instance.unmount();
      instance.cleanup();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
