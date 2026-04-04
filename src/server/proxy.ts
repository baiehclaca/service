import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

/** JSON-RPC 2.0 message types */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Proxies an MCP server running as a stdio child process.
 * Handles JSON-RPC 2.0 communication, tool listing, and crash recovery.
 */
export class StdioMcpProxy extends EventEmitter {
  public readonly id: string;
  public readonly name: string;
  private command: string;
  private args: string[];
  private process: ChildProcess | null = null;
  private buffer: string = '';
  private pendingRequests: Map<string | number, {
    resolve: (value: JsonRpcResponse) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();
  private nextId: number = 1;
  private tools: McpToolDefinition[] = [];
  private _available: boolean = false;
  private retryCount: number = 0;
  private maxRetryDelay: number = 60000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _destroyed: boolean = false;

  constructor(name: string, command: string, args: string[] = []) {
    super();
    this.id = name;
    this.name = name;
    this.command = command;
    this.args = args;
  }

  /** Whether this proxy is connected and available */
  get available(): boolean {
    return this._available;
  }

  /** Start the child process and initialize the MCP connection */
  async connect(): Promise<void> {
    if (this._destroyed) return;

    try {
      this.process = spawn(this.command, this.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (chunk: Buffer) => {
        this.handleStdoutData(chunk);
      });

      this.process.stderr?.on('data', (chunk: Buffer) => {
        this.emit('stderr', chunk.toString());
      });

      this.process.on('exit', (code, signal) => {
        this._available = false;
        this.rejectAllPending(new Error(`Process exited: code=${code} signal=${signal}`));
        this.emit('exit', code, signal);
        if (!this._destroyed) {
          this.scheduleRetry();
        }
      });

      this.process.on('error', (err: Error) => {
        this._available = false;
        this.rejectAllPending(err);
        this.emit('error', err);
        if (!this._destroyed) {
          this.scheduleRetry();
        }
      });

      // Initialize the MCP connection
      const initResult = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'service-hub', version: '1.0.0' },
      });

      if (initResult.error) {
        throw new Error(`Initialize failed: ${initResult.error.message}`);
      }

      // Send initialized notification
      this.sendNotification('notifications/initialized', {});

      // Get tool list
      await this.refreshTools();

      this._available = true;
      this.retryCount = 0;
      this.emit('connected', this.tools);
    } catch (error) {
      this._available = false;
      this.emit('error', error);
      if (!this._destroyed) {
        this.scheduleRetry();
      }
    }
  }

  /** List available tools from this MCP */
  async listTools(): Promise<McpToolDefinition[]> {
    return this.tools;
  }

  /** Refresh the tools list from the downstream MCP */
  private async refreshTools(): Promise<void> {
    const result = await this.sendRequest('tools/list', {});
    if (result.result && typeof result.result === 'object' && 'tools' in result.result) {
      this.tools = (result.result as { tools: McpToolDefinition[] }).tools;
    }
  }

  /** Call a tool on the downstream MCP */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args,
    });
    if (result.error) {
      throw new Error(`Tool call failed: ${result.error.message}`);
    }
    return result.result;
  }

  /** Send a JSON-RPC request and wait for response */
  private sendRequest(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.writeToProcess(request);
    });
  }

  /** Send a JSON-RPC notification (no response expected) */
  private sendNotification(method: string, params: Record<string, unknown>): void {
    const notification = {
      jsonrpc: '2.0' as const,
      method,
      params,
    };
    this.writeToProcess(notification);
  }

  /** Write a JSON message to the child process stdin */
  private writeToProcess(message: object): void {
    if (!this.process?.stdin?.writable) {
      throw new Error('Process stdin not writable');
    }
    const data = JSON.stringify(message) + '\n';
    this.process.stdin.write(data);
  }

  /** Handle data from child process stdout */
  private handleStdoutData(chunk: Buffer): void {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const message = JSON.parse(trimmed) as JsonRpcResponse;
        this.handleMessage(message);
      } catch {
        // Skip non-JSON lines
      }
    }
  }

  /** Handle a parsed JSON-RPC message */
  private handleMessage(message: JsonRpcResponse): void {
    if (message.id !== undefined && message.id !== null) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);
        pending.resolve(message);
      }
    }
  }

  /** Reject all pending requests */
  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  /** Schedule a retry with exponential backoff */
  private scheduleRetry(): void {
    if (this._destroyed) return;
    const delay = Math.min(1000 * Math.pow(2, this.retryCount), this.maxRetryDelay);
    this.retryCount++;
    this.retryTimer = setTimeout(() => {
      if (!this._destroyed) {
        this.connect().catch(() => {
          // Error handled in connect()
        });
      }
    }, delay);
  }

  /** Disconnect and clean up */
  async disconnect(): Promise<void> {
    this._destroyed = true;
    this._available = false;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    this.rejectAllPending(new Error('Proxy disconnected'));

    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }
}
