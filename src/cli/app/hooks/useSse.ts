import { useState, useEffect, useRef, useCallback } from 'react';

const SSE_URL = 'http://127.0.0.1:3334/events';

const BACKOFF_SCHEDULE = [2000, 4000, 8000, 30000]; // ms

export interface SseEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface UseSseResult {
  events: SseEvent[];
  connected: boolean;
  error: string | null;
}

/**
 * SSE client hook using fetch + ReadableStream.
 * Reconnects with exponential backoff (2s/4s/8s/30s max).
 * Cleans up on unmount.
 */
export function useSse(): UseSseResult {
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const controller = new AbortController();
    abortRef.current = controller;

    fetch(SSE_URL, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          throw new Error(`SSE HTTP ${response.status}`);
        }

        if (mountedRef.current) {
          setConnected(true);
          setError(null);
          retryRef.current = 0;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (mountedRef.current) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let eventType = 'message';
          let eventData = '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              eventData = line.slice(5).trim();
            } else if (line === '' && eventData) {
              try {
                const parsed = JSON.parse(eventData) as Record<string, unknown>;
                if (mountedRef.current) {
                  setEvents((prev) => [{ type: eventType, data: parsed }, ...prev].slice(0, 200));
                }
              } catch {
                // Non-JSON SSE data — store as raw
                if (mountedRef.current) {
                  setEvents((prev) => [{ type: eventType, data: { raw: eventData } }, ...prev].slice(0, 200));
                }
              }
              eventType = 'message';
              eventData = '';
            }
          }
        }

        // Stream ended cleanly — reconnect
        if (mountedRef.current) {
          setConnected(false);
          scheduleReconnect();
        }
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        if (controller.signal.aborted) return;

        const msg = err instanceof Error ? err.message : String(err);
        setConnected(false);
        setError(msg);
        scheduleReconnect();
      });
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const idx = Math.min(retryRef.current, BACKOFF_SCHEDULE.length - 1);
    const delay = BACKOFF_SCHEDULE[idx]!;
    retryRef.current++;
    setTimeout(() => {
      if (mountedRef.current) connect();
    }, delay);
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [connect]);

  return { events, connected, error };
}
