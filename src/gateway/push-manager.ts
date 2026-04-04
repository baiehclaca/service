import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { NotificationEvent } from '../integrations/types.js';
import { ServiceEventBus } from './event-bus.js';

/** An active SSE connection */
interface SSEConnection {
  id: string;
  res: Response;
  heartbeatTimer: ReturnType<typeof setInterval>;
}

/**
 * Manages SSE connections and broadcasts notification events
 * to all connected clients.
 */
export class PushManager {
  private connections: Map<string, SSEConnection> = new Map();
  private eventBus: ServiceEventBus;

  constructor(eventBus: ServiceEventBus) {
    this.eventBus = eventBus;
    this.eventBus.on('notification', (event: NotificationEvent) => {
      this.broadcast(event);
    });
  }

  /** Add a new SSE connection */
  addConnection(res: Response): string {
    const id = randomUUID();

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send initial comment to establish connection
    res.write(': connected\n\n');

    // Heartbeat every 30 seconds
    const heartbeatTimer = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        this.removeConnection(id);
      }
    }, 30000);

    const connection: SSEConnection = { id, res, heartbeatTimer };
    this.connections.set(id, connection);

    // Clean up on close
    res.on('close', () => {
      this.removeConnection(id);
    });

    return id;
  }

  /** Remove an SSE connection */
  removeConnection(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      clearInterval(conn.heartbeatTimer);
      this.connections.delete(id);
    }
  }

  /** Broadcast a notification event to all SSE connections */
  broadcast(event: NotificationEvent): void {
    const sseData = `id: ${event.id}\nevent: notification\ndata: ${JSON.stringify(event)}\n\n`;

    for (const [id, conn] of this.connections) {
      try {
        conn.res.write(sseData);
      } catch {
        this.removeConnection(id);
      }
    }
  }

  /** Get number of active connections */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /** Shut down: close all connections */
  shutdown(): void {
    for (const [id, conn] of this.connections) {
      clearInterval(conn.heartbeatTimer);
      try {
        conn.res.end();
      } catch {
        // Ignore errors during shutdown
      }
    }
    this.connections.clear();
  }
}
