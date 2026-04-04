import { DaemonManager } from '../daemon/manager.js';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

describe('DaemonManager extended', () => {
  const SERVICE_DIR = join(homedir(), '.service');
  const PID_FILE = join(SERVICE_DIR, 'service.pid');
  const STATE_FILE = join(SERVICE_DIR, 'state.json');

  // Save and restore PID file to avoid interfering with a running daemon
  let savedPid: string | null = null;
  let savedState: string | null = null;

  beforeEach(() => {
    try {
      savedPid = readFileSync(PID_FILE, 'utf-8');
    } catch { savedPid = null; }
    try {
      savedState = readFileSync(STATE_FILE, 'utf-8');
    } catch { savedState = null; }
  });

  afterEach(() => {
    if (savedPid !== null) {
      writeFileSync(PID_FILE, savedPid, 'utf-8');
    } else {
      try { unlinkSync(PID_FILE); } catch { /* ignore */ }
    }
    if (savedState !== null) {
      writeFileSync(STATE_FILE, savedState, 'utf-8');
    }
  });

  it('should return correct pidFile path', () => {
    expect(DaemonManager.pidFile).toContain('.service/service.pid');
  });

  it('should return correct serviceDir path', () => {
    expect(DaemonManager.serviceDir).toContain('.service');
  });

  it('should ensure service directory exists', () => {
    DaemonManager.ensureServiceDir();
    expect(existsSync(SERVICE_DIR)).toBe(true);
    expect(existsSync(join(SERVICE_DIR, 'logs'))).toBe(true);
  });

  it('should write and read PID', () => {
    DaemonManager.writePid(12345);
    const pid = DaemonManager.readPid();
    expect(pid).toBe(12345);
  });

  it('should return null for missing PID file', () => {
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
    expect(DaemonManager.readPid()).toBeNull();
  });

  it('should detect current process as running', () => {
    const running = DaemonManager.isProcessRunning(process.pid);
    expect(running).toBe(true);
  });

  it('should detect nonexistent process as not running', () => {
    // PID 99999 is very unlikely to be running
    const running = DaemonManager.isProcessRunning(99999);
    expect(running).toBe(false);
  });

  it('should format uptime correctly', () => {
    expect(DaemonManager.formatUptime(5000)).toBe('5s');
    expect(DaemonManager.formatUptime(65000)).toBe('1m 5s');
    expect(DaemonManager.formatUptime(3661000)).toBe('1h 1m');
    expect(DaemonManager.formatUptime(90061000)).toBe('1d 1h 1m');
  });

  it('should report not running when PID file is missing', () => {
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
    const result = DaemonManager.isRunning();
    expect(result.running).toBe(false);
    expect(result.pid).toBeNull();
  });

  it('should clean up stale PID file', () => {
    writeFileSync(PID_FILE, '99999', 'utf-8');
    const result = DaemonManager.isRunning();
    expect(result.running).toBe(false);
    // Should have removed the stale PID file
  });

  it('should report daemon is running when current PID is written', () => {
    DaemonManager.writePid(process.pid);
    const result = DaemonManager.isRunning();
    expect(result.running).toBe(true);
    expect(result.pid).toBe(process.pid);
  });

  it('should stop returning not running when daemon is not running', () => {
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
    const result = DaemonManager.stop();
    expect(result.stopped).toBe(false);
    expect(result.message).toContain('not running');
  });

  it('should report status when not running', () => {
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
    const status = DaemonManager.status();
    expect(status.running).toBe(false);
    expect(status.message).toContain('not running');
  });

  it('should report status with state file', () => {
    DaemonManager.writePid(process.pid);
    writeFileSync(STATE_FILE, JSON.stringify({
      startedAt: new Date().toISOString(),
      version: '1.0.0',
      mcpPort: 3333,
      adminPort: 3334,
    }), 'utf-8');

    const status = DaemonManager.status();
    expect(status.running).toBe(true);
    expect(status.pid).toBe(process.pid);
    expect(status.version).toBe('1.0.0');
    expect(status.uptime).toBeDefined();
  });

  it('should remove PID file on removePid', () => {
    writeFileSync(PID_FILE, '12345', 'utf-8');
    DaemonManager.removePid();
    expect(existsSync(PID_FILE)).toBe(false);
  });

  it('should not throw when removing nonexistent PID file', () => {
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
    expect(() => DaemonManager.removePid()).not.toThrow();
  });
});
