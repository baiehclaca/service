import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { localOnly, isLocalHostHeader, isLocalOrigin, redactConfig, BIND_HOST } from '../server/local-guard.js';

function request(port: number, path: string, headers: Record<string, string>, method = 'GET'): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('local-guard', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    const app = express();
    app.use(localOnly);
    app.all('/api/mcp-connections', (_req, res) => { res.status(201).json({ ok: true }); });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.once('listening', () => r()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('binds to loopback by default', () => {
    if (process.env.SERVICE_HOST === undefined) expect(BIND_HOST).toBe('127.0.0.1');
  });

  it('allows loopback Host with no Origin', async () => {
    expect(await request(port, '/api/mcp-connections', { Host: `127.0.0.1:${port}` }, 'POST')).toBe(201);
    expect(await request(port, '/api/mcp-connections', { Host: `localhost:${port}` }, 'POST')).toBe(201);
  });

  it('rejects DNS-rebinding Host headers', async () => {
    expect(await request(port, '/api/mcp-connections', { Host: `attacker.example:${port}` }, 'POST')).toBe(403);
    expect(await request(port, '/api/mcp-connections', { Host: `127.0.0.1.attacker.example` }, 'POST')).toBe(403);
  });

  it('rejects cross-origin browser requests', async () => {
    expect(await request(port, '/api/mcp-connections', { Host: `127.0.0.1:${port}`, Origin: 'https://evil.example' }, 'POST')).toBe(403);
    expect(await request(port, '/api/mcp-connections', { Host: `127.0.0.1:${port}`, Origin: 'null' }, 'POST')).toBe(403);
    expect(await request(port, '/api/mcp-connections', { Host: `127.0.0.1:${port}`, Origin: `http://localhost:${port}` }, 'POST')).toBe(201);
  });

  it('classifies hosts and origins', () => {
    expect(isLocalHostHeader('[::1]:3334')).toBe(true);
    expect(isLocalHostHeader(undefined)).toBe(false);
    expect(isLocalOrigin(undefined)).toBe(true);
    expect(isLocalOrigin('http://localhost.evil.example')).toBe(false);
  });

  it('redacts secret config fields', () => {
    expect(redactConfig({ bot_token: 'xoxb-1', smtp_host: 'smtp.example', password: 'p', api_secret: '' }))
      .toEqual({ bot_token: '********', smtp_host: 'smtp.example', password: '********', api_secret: '' });
  });
});
