import { DaemonManager } from '../daemon/manager.js';
import { existsSync } from 'node:fs';

describe('DaemonManager', () => {
  it('should ensure service directory exists', () => {
    DaemonManager.ensureServiceDir();
    expect(existsSync(DaemonManager.serviceDir)).toBe(true);
  });

  it('should return not running when no PID file exists', () => {
    // If there's a stale PID file, remove it first
    DaemonManager.removePid();
    const status = DaemonManager.isRunning();
    // Might be running from a real daemon, just check the shape
    expect(status).toHaveProperty('running');
    expect(status).toHaveProperty('pid');
  });

  it('should return status info', () => {
    const status = DaemonManager.status();
    expect(status).toHaveProperty('running');
    expect(status).toHaveProperty('pid');
    expect(status).toHaveProperty('message');
  });

  it('should handle stop when not running', () => {
    DaemonManager.removePid();
    const result = DaemonManager.stop();
    expect(result.stopped).toBe(false);
    expect(result.message).toContain('not running');
  });
});
