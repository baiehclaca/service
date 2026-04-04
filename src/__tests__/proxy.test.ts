import { StdioMcpProxy } from '../server/proxy.js';

describe('StdioMcpProxy', () => {
  it('should create a proxy with name and command', () => {
    const proxy = new StdioMcpProxy('test-mcp', 'node', ['server.js']);
    expect(proxy.id).toBe('test-mcp');
    expect(proxy.name).toBe('test-mcp');
    expect(proxy.available).toBe(false);
  });

  it('should start unavailable', () => {
    const proxy = new StdioMcpProxy('mcp2', '/usr/bin/node', ['foo.js']);
    expect(proxy.available).toBe(false);
  });

  it('should return empty tools when not connected', async () => {
    const proxy = new StdioMcpProxy('mcp3', 'node', ['bar.js']);
    const tools = await proxy.listTools();
    expect(tools).toEqual([]);
  });

  it('should handle disconnect when never connected', async () => {
    const proxy = new StdioMcpProxy('mcp4', 'node', ['baz.js']);
    // Should not throw
    await proxy.disconnect();
    expect(proxy.available).toBe(false);
  });

  it('should be an EventEmitter', () => {
    const proxy = new StdioMcpProxy('mcp5', 'node', ['x.js']);
    expect(typeof proxy.on).toBe('function');
    expect(typeof proxy.emit).toBe('function');
    expect(typeof proxy.removeListener).toBe('function');
  });

  it('should expose id and name properties', () => {
    const proxy = new StdioMcpProxy('my-mcp', 'npx', ['-y', 'server']);
    expect(proxy.id).toBe('my-mcp');
    expect(proxy.name).toBe('my-mcp');
  });

  it('should emit error when connecting to non-existent command', async () => {
    const proxy = new StdioMcpProxy(
      'bad-mcp',
      '/nonexistent/path/to/binary-123456',
      [],
    );

    const errorPromise = new Promise<Error>((resolve) => {
      proxy.on('error', (err) => {
        resolve(err as Error);
      });
    });

    // connect() catches errors internally; it won't reject
    proxy.connect();

    const error = await errorPromise;
    expect(error).toBeTruthy();
    expect(typeof (error as Error).message).toBe('string');
    expect(proxy.available).toBe(false);

    // Clean up to prevent retry loop
    await proxy.disconnect();
  }, 10000);
});
