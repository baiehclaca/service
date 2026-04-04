import { useState, useEffect, useCallback } from 'react';

const BASE_URL = 'http://127.0.0.1:3334';
const TIMEOUT_MS = 5000;

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetch wrapper hook for the admin API.
 * Returns { data, loading, error, refetch }.
 * ECONNREFUSED → returns error (daemon offline).
 */
export function useApi<T>(path: string, intervalMs?: number): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const doFetch = async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const resp = await fetch(`${BASE_URL}${path}`, {
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
          const msg =
            err instanceof Error ? err.message : String(err);
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

    let interval: ReturnType<typeof setInterval> | undefined;
    if (intervalMs && intervalMs > 0) {
      interval = setInterval(doFetch, intervalMs);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [path, intervalMs, tick]);

  return { data, loading, error, refetch };
}
