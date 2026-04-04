import { StdioMcpProxy } from '../server/proxy.js';
import { spawn } from 'node:child_process';

describe('StdioMcpProxy extended coverage', () => {
  it('should mark as not available after disconnect', async () => {
    const proxy = new StdioMcpProxy('test', 'node', []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = proxy as any;
    p._available = true;
    await proxy.disconnect();
    expect(proxy.available).toBe(false);
  });

  it('should not connect when destroyed', async () => {
    const proxy = new StdioMcpProxy('test', 'echo', ['hello']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = proxy as any;
    p._destroyed = true;
    await proxy.connect();
    expect(proxy.available).toBe(false);
  });

  it('should clear retry timer on disconnect', async () => {
    const proxy = new StdioMcpProxy('test', 'echo', ['hello']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = proxy as any;
    p.retryTimer = setTimeout(() => {}, 100000);
    await proxy.disconnect();
    expect(p.retryTimer).toBeNull();
  });

  it('should handle callTool failure when not connected', async () => {
    const proxy = new StdioMcpProxy('test', 'echo', ['hello']);
    await expect(proxy.callTool('test', {})).rejects.toThrow();
    await proxy.disconnect();
  });

  it('should have correct name/id', () => {
    const proxy = new StdioMcpProxy('myname', 'mycommand', ['arg1', 'arg2']);
    expect(proxy.id).toBe('myname');
    expect(proxy.name).toBe('myname');
    expect(proxy.available).toBe(false);
  });

  it('should emit exit event on child process exit', async () => {
    const proxy = new StdioMcpProxy('exit-test', 'echo', ['hello']);
    const exitPromise = new Promise<void>((resolve) => {
      proxy.on('exit', () => resolve());
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = proxy as any;
    p._destroyed = false;
    proxy.connect().catch(() => {}); // connect will fail but trigger process

    // Wait a bit for the process to exit or error
    await Promise.race([exitPromise, new Promise<void>(r => setTimeout(r, 2000))]);
    await proxy.disconnect();
  }, 5000);

  it('should reject pending requests on disconnect', async () => {
    const proxy = new StdioMcpProxy('test', 'echo', []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = proxy as any;

    // Simulate a pending request
    const pendingPromise = new Promise<void>((resolve, reject) => {
      p.pendingRequests.set(1, {
        resolve: () => resolve(),
        reject: (err: Error) => reject(err),
        timer: setTimeout(() => {}, 30000),
      });
    });

    await proxy.disconnect();

    // Pending request should be rejected
    await expect(pendingPromise).rejects.toThrow('Proxy disconnected');
  });
});
