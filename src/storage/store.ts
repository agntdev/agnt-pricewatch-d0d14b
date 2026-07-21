import type { UserProfile, WatchlistItem, AlertEvent } from "./types.js";

/**
 * DomainStore — persistent storage for durable domain data (user profiles,
 * watchlist items, alert events). Uses in-memory Maps as a fallback for the
 * test harness; production bots inject a Redis-backed implementation.
 *
 * Keys are explicit (no keyspace scans). Index records track collections:
 *   - `userIds` → number[] (all registered user ids)
 *   - `watchlist:<userId>` → string[] (tickers for a user)
 */

export interface DomainStore {
  // User profiles
  getUserProfile(userId: number): Promise<UserProfile | undefined>;
  setUserProfile(userId: number, profile: UserProfile): Promise<void>;
  getAllUserIds(): Promise<number[]>;

  // Watchlist items
  getWatchlist(userId: number): Promise<WatchlistItem[]>;
  getWatchlistItem(userId: number, ticker: string): Promise<WatchlistItem | undefined>;
  setWatchlistItem(userId: number, item: WatchlistItem): Promise<void>;
  removeWatchlistItem(userId: number, ticker: string): Promise<boolean>;

  // Alert events
  addAlertEvent(event: AlertEvent): Promise<void>;
  getAlertEvents(userId: number, limit?: number): Promise<AlertEvent[]>;
  getRecentAlertEvents(limit?: number): Promise<AlertEvent[]>;
}

/** In-memory implementation for tests and development. */
export class MemDomainStore implements DomainStore {
  private profiles = new Map<number, UserProfile>();
  private watchlists = new Map<string, WatchlistItem>();
  private watchlistIndex = new Map<number, string[]>();
  private alertEvents: AlertEvent[] = [];

  private wlKey(userId: number, ticker: string): string {
    return `${userId}:${ticker}`;
  }

  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    return this.profiles.get(userId);
  }

  async setUserProfile(userId: number, profile: UserProfile): Promise<void> {
    this.profiles.set(userId, profile);
  }

  async getAllUserIds(): Promise<number[]> {
    return [...this.profiles.keys()];
  }

  async getWatchlist(userId: number): Promise<WatchlistItem[]> {
    const tickers = this.watchlistIndex.get(userId) ?? [];
    return tickers
      .map((t) => this.watchlists.get(this.wlKey(userId, t)))
      .filter((item): item is WatchlistItem => item !== undefined);
  }

  async getWatchlistItem(userId: number, ticker: string): Promise<WatchlistItem | undefined> {
    return this.watchlists.get(this.wlKey(userId, ticker));
  }

  async setWatchlistItem(userId: number, item: WatchlistItem): Promise<void> {
    this.watchlists.set(this.wlKey(userId, item.ticker), item);
    const idx = this.watchlistIndex.get(userId) ?? [];
    if (!idx.includes(item.ticker)) {
      idx.push(item.ticker);
      this.watchlistIndex.set(userId, idx);
    }
  }

  async removeWatchlistItem(userId: number, ticker: string): Promise<boolean> {
    const key = this.wlKey(userId, ticker);
    const existed = this.watchlists.delete(key);
    if (existed) {
      const idx = this.watchlistIndex.get(userId) ?? [];
      const i = idx.indexOf(ticker);
      if (i >= 0) idx.splice(i, 1);
      if (idx.length === 0) this.watchlistIndex.delete(userId);
    }
    return existed;
  }

  async addAlertEvent(event: AlertEvent): Promise<void> {
    this.alertEvents.push(event);
  }

  async getAlertEvents(userId: number, limit = 20): Promise<AlertEvent[]> {
    return this.alertEvents
      .filter((e) => e.userId === userId)
      .slice(-limit);
  }

  async getRecentAlertEvents(limit = 20): Promise<AlertEvent[]> {
    return this.alertEvents.slice(-limit);
  }
}

/** Resolve the domain store: use a Redis-backed store if REDIS_URL is set,
 *  otherwise fall back to in-memory (dev / test harness). */
export function resolveDomainStore(
  env: { REDIS_URL?: string } = typeof process === "undefined" ? {} : process.env,
): DomainStore {
  if (env.REDIS_URL) {
    return createRedisDomainStore(env.REDIS_URL);
  }
  return new MemDomainStore();
}

/** Redis-backed domain store. Uses explicit keys (no KEYS/SCAN). */
function createRedisDomainStore(url: string): DomainStore {
  // Lazy-load ioredis (same pattern as session/redis.ts)
  let clientPromise: Promise<any> | null = null;
  const getClient = () =>
    (clientPromise ??= (async () => {
      const { createRequire } = await import("node:module");
      const require = createRequire(import.meta.url);
      const ioredis: any = require("ioredis");
      const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
      return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
    })());

  const k = (prefix: string, ...parts: (string | number)[]) =>
    `domain:${prefix}:${parts.join(":")}`;

  const getJson = async <T>(key: string): Promise<T | undefined> => {
    const client = await getClient();
    const raw = await client.get(key);
    if (raw == null) return undefined;
    try { return JSON.parse(raw) as T; } catch { return undefined; }
  };

  const setJson = async (key: string, value: unknown): Promise<void> => {
    const client = await getClient();
    await client.set(key, JSON.stringify(value));
  };

  return {
    async getUserProfile(userId) {
      return getJson<UserProfile>(k("profile", userId));
    },
    async setUserProfile(userId, profile) {
      await setJson(k("profile", userId), profile);
      // Maintain user ID index
      const client = await getClient();
      await client.sadd("domain:userIds", String(userId));
    },
    async getAllUserIds() {
      const client = await getClient();
      const members = await client.smembers("domain:userIds");
      return members.map(Number);
    },
    async getWatchlist(userId) {
      const client = await getClient();
      const tickers = await client.smembers(k("wlIdx", userId));
      const items: WatchlistItem[] = [];
      for (const t of tickers) {
        const item = await getJson<WatchlistItem>(k("wl", userId, t));
        if (item) items.push(item);
      }
      return items;
    },
    async getWatchlistItem(userId, ticker) {
      return getJson<WatchlistItem>(k("wl", userId, ticker));
    },
    async setWatchlistItem(userId, item) {
      await setJson(k("wl", userId, item.ticker), item);
      const client = await getClient();
      await client.sadd(k("wlIdx", userId), item.ticker);
    },
    async removeWatchlistItem(userId, ticker) {
      const client = await getClient();
      const removed = await client.del(k("wl", userId, ticker));
      await client.srem(k("wlIdx", userId), ticker);
      return removed > 0;
    },
    async addAlertEvent(event) {
      const client = await getClient();
      const idx = await client.llen("domain:alerts");
      await client.lpush("domain:alerts", JSON.stringify(event));
      // Keep only last 500 alert events
      if (idx >= 500) {
        await client.ltrim("domain:alerts", 0, 499);
      }
    },
    async getAlertEvents(userId, limit = 20) {
      const client = await getClient();
      const all = await client.lrange("domain:alerts", 0, -1);
      return all
        .map((raw: string) => JSON.parse(raw) as AlertEvent)
        .filter((e: AlertEvent) => e.userId === userId)
        .slice(-limit);
    },
    async getRecentAlertEvents(limit = 20) {
      const client = await getClient();
      const all = await client.lrange("domain:alerts", 0, limit - 1);
      return all.map((raw: string) => JSON.parse(raw) as AlertEvent).reverse();
    },
  };
}
