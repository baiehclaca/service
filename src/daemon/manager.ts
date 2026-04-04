import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { ServiceError } from '../utils/errors.js';

const SERVICE_DIR = join(homedir(), '.service');
const PID_FILE = join(SERVICE_DIR, 'service.pid');
const STATE_FILE = join(SERVICE_DIR, 'state.json');

/** Live status data returned by the admin API */
export interface LiveStatus {
  running: boolean;
  pid: number | null;
  uptime?: string;
  startedAt?: string;
  version?: string;
  activeIntegrations?: number;
  connectedMcps?: number;
  activeSseConnections?: number;
  mcpPort?: number;
  adminPort?: number;
  message: string;
}

/**
 * Daemon lifecycle management.
 * Handles start/stop/status with PID file tracking.
 */
export class DaemonManager {
  /** Get the PID file path */
  static get pidFile(): string {
    return PID_FILE;
  }

  /** Get the service directory */
  static get serviceDir(): string {
    return SERVICE_DIR;
  }

  /** Ensure the ~/.service directory exists */
  static ensureServiceDir(): void {
    mkdirSync(SERVICE_DIR, { recursive: true });
    mkdirSync(join(SERVICE_DIR, 'logs'), { recursive: true });
  }

  /** Write the current process PID */
  static writePid(pid?: number): void {
    DaemonManager.ensureServiceDir();
    writeFileSync(PID_FILE, String(pid ?? process.pid), 'utf-8');
  }

  /** Read the stored PID, or null if not running */
  static readPid(): number | null {
    try {
      if (!existsSync(PID_FILE)) return null;
      const content = readFileSync(PID_FILE, 'utf-8').trim();
      const pid = parseInt(content, 10);
      if (isNaN(pid)) return null;
      return pid;
    } catch {
      return null;
    }
  }

  /** Check if a process with given PID is running */
  static isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /** Check if the daemon is currently running */
  static isRunning(): { running: boolean; pid: number | null } {
    const pid = DaemonManager.readPid();
    if (pid === null) return { running: false, pid: null };
    const running = DaemonManager.isProcessRunning(pid);
    if (!running) {
      // Stale PID file — clean up
      DaemonManager.removePid();
      return { running: false, pid: null };
    }
    return { running: true, pid };
  }

  /** Remove the PID file */
  static removePid(): void {
    try {
      if (existsSync(PID_FILE)) {
        unlinkSync(PID_FILE);
      }
    } catch {
      // Ignore removal errors
    }
  }

  /** Stop the daemon by sending SIGTERM to the stored PID */
  static stop(): { stopped: boolean; message: string } {
    const { running, pid } = DaemonManager.isRunning();
    if (!running || pid === null) {
      return { stopped: false, message: 'SERVICE daemon is not running.' };
    }

    try {
      process.kill(pid, 'SIGTERM');
      DaemonManager.removePid();
      return { stopped: true, message: `SERVICE daemon (PID ${pid}) stopped.` };
    } catch (error) {
      return {
        stopped: false,
        message: `Failed to stop daemon: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /** Format milliseconds into human-readable uptime string */
  static formatUptime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  /** Get daemon status information */
  static status(): LiveStatus {
    const { running, pid } = DaemonManager.isRunning();
    if (!running) {
      return { running: false, pid: null, message: 'SERVICE daemon is not running.' };
    }

    // Read state file for startedAt
    let startedAt: string | undefined;
    let version: string | undefined;
    let mcpPort: number | undefined;
    let adminPort: number | undefined;
    try {
      const stateRaw = readFileSync(STATE_FILE, 'utf-8');
      const state = JSON.parse(stateRaw) as {
        startedAt?: string;
        version?: string;
        mcpPort?: number;
        adminPort?: number;
      };
      startedAt = state.startedAt;
      version = state.version;
      mcpPort = state.mcpPort;
      adminPort = state.adminPort;
    } catch { /* state file may not exist yet */ }

    let uptime: string | undefined;
    if (startedAt) {
      const ms = Date.now() - new Date(startedAt).getTime();
      uptime = DaemonManager.formatUptime(ms);
    }

    // Try to fetch live counts from admin API
    let activeIntegrations: number | undefined;
    let connectedMcps: number | undefined;
    let activeSseConnections: number | undefined;
    try {
      const port = adminPort ?? 3334;
      const response = execSync(`curl -s --max-time 2 http://localhost:${port}/api/status`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const data = JSON.parse(response) as {
        activeIntegrations?: number;
        connectedMcps?: number;
        activeSseConnections?: number;
      };
      activeIntegrations = data.activeIntegrations;
      connectedMcps = data.connectedMcps;
      activeSseConnections = data.activeSseConnections;
    } catch { /* admin API might not be available */ }

    return {
      running: true,
      pid,
      uptime,
      startedAt,
      version,
      activeIntegrations,
      connectedMcps,
      activeSseConnections,
      mcpPort: mcpPort ?? 3333,
      adminPort: adminPort ?? 3334,
      message: `SERVICE daemon is running (PID ${pid}).`,
    };
  }
}
