import type { Request, Response, NextFunction } from 'express';

/**
 * Interface the MCP hub (3333) and admin API (3334) bind to.
 * Defaults to loopback. Set SERVICE_HOST explicitly to expose them; there is no auth.
 */
export const BIND_HOST = process.env.SERVICE_HOST ?? '127.0.0.1';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostnameOf(value: string): string | null {
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True when the Host header names a loopback host (blocks DNS rebinding). */
export function isLocalHostHeader(host: string | undefined): boolean {
  if (!host) return false;
  const name = hostnameOf(host);
  return name !== null && LOCAL_HOSTNAMES.has(name);
}

/** True when there is no Origin (non-browser client) or the Origin is loopback (blocks CSRF). */
export function isLocalOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  if (origin === 'null') return false;
  const name = hostnameOf(origin);
  return name !== null && LOCAL_HOSTNAMES.has(name);
}

/**
 * Express middleware: reject requests whose Host or Origin is not loopback.
 * The daemon has no authentication and can spawn processes, so it must only
 * answer local, same-machine, non-browser-forged requests.
 */
export function localOnly(req: Request, res: Response, next: NextFunction): void {
  if (!isLocalHostHeader(req.headers.host) || !isLocalOrigin(req.headers.origin)) {
    res.status(403).json({ error: 'Forbidden: SERVICE only accepts local requests' });
    return;
  }
  next();
}

const SECRET_FIELD = /(key|secret|token|password|pass|credential)/i;

/** Mask secret-looking config values before they leave the process. */
export function redactConfig(config: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    out[k] = SECRET_FIELD.test(k) && v ? '********' : v;
  }
  return out;
}
