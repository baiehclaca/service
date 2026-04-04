import type { NotificationStore } from '../gateway/notification-store.js';
import type { StoredNotification } from '../integrations/types.js';

/**
 * Search tools: full-text search across notification history using FTS5.
 * A-MCP-15
 */
export class SearchTools {
  private store: NotificationStore;

  constructor(store: NotificationStore) {
    this.store = store;
  }

  /** Search notifications using FTS5 full-text search. */
  searchNotifications(query: string, limit: number = 50): StoredNotification[] {
    return this.store.search(query, limit);
  }
}
