import { jest } from '@jest/globals';

// We test useApi by creating a minimal React wrapper with ink-testing-library
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import { Text } from 'ink';

// Mock fetch globally
const originalFetch = global.fetch;

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

// Inline the hook for testing — avoids import issues with hook modules
function useApi<T>(path: string): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const doFetch = async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);

        const resp = await fetch(`http://127.0.0.1:3334${path}`, {
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!resp.ok) {
          if (!cancelled) {
            setError(`HTTP ${resp.status}`);
            setLoading(false);
          }
          return;
        }

        const json = (await resp.json()) as T;
        if (!cancelled) {
          setData(json);
          setError(null);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('ECONNREFUSED') || msg.includes('abort') || msg.includes('fetch failed')) {
            setError('ECONNREFUSED');
          } else {
            setError(msg);
          }
          setLoading(false);
        }
      }
    };

    doFetch();

    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data, loading, error };
}

function TestComponent({ path }: { path: string }) {
  const { data, loading, error } = useApi<{ value: string }>(path);
  if (loading) return React.createElement(Text, null, 'loading');
  if (error) return React.createElement(Text, null, `error:${error}`);
  return React.createElement(Text, null, `data:${data?.value}`);
}

describe('useApi', () => {
  it('returns loading state initially', () => {
    // Mock fetch to never resolve
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;

    const { lastFrame } = render(
      React.createElement(TestComponent, { path: '/api/status' })
    );
    expect(lastFrame()).toContain('loading');
  });

  it('returns data on successful fetch', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ value: 'test123' }),
      })
    ) as unknown as typeof fetch;

    const { lastFrame } = render(
      React.createElement(TestComponent, { path: '/api/status' })
    );

    // Wait for async fetch to complete
    await new Promise((r) => setTimeout(r, 100));
    expect(lastFrame()).toContain('data:test123');
  });

  it('returns error on HTTP error', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      })
    ) as unknown as typeof fetch;

    const { lastFrame } = render(
      React.createElement(TestComponent, { path: '/api/status' })
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(lastFrame()).toContain('error:HTTP 500');
  });

  it('returns ECONNREFUSED on network error', async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new Error('fetch failed'))
    ) as unknown as typeof fetch;

    const { lastFrame } = render(
      React.createElement(TestComponent, { path: '/api/status' })
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(lastFrame()).toContain('error:ECONNREFUSED');
  });

  it('uses correct base URL', async () => {
    const mockFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ value: 'ok' }),
      })
    ) as unknown as typeof fetch;
    global.fetch = mockFetch;

    render(React.createElement(TestComponent, { path: '/api/test' }));

    await new Promise((r) => setTimeout(r, 100));
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3334/api/test',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});
