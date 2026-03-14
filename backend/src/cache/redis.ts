import Redis from 'ioredis';
import { config } from '../config';

let client: Redis | null = null;
let connected = false;

/**
 * Returns the shared Redis client, creating it lazily on first call.
 * Returns null if Redis is not reachable (caching will be skipped gracefully).
 */
export function getRedisClient(): Redis | null {
  if (client) return client;

  try {
    client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
    });

    client.on('connect', () => {
      connected = true;
      console.log('[Redis] Connected');
    });

    client.on('error', (err: Error) => {
      if (connected) {
        console.error('[Redis] Connection error:', err.message);
      }
      connected = false;
    });

    client.connect().catch(() => {
      console.warn('[Redis] Not reachable — API response caching disabled');
    });

    return client;
  } catch {
    console.warn('[Redis] Failed to initialise — caching disabled');
    return null;
  }
}

/**
 * Retrieves a cached value by key.
 * Returns null if cache miss, Redis unavailable, or parse error.
 */
export async function cacheGet(key: string): Promise<string | null> {
  const redis = getRedisClient();
  if (!redis || !connected) return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

/**
 * Stores a value in the cache with an optional TTL (seconds).
 * Silently skips if Redis is unavailable.
 */
export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds = config.cache.ttl,
): Promise<void> {
  const redis = getRedisClient();
  if (!redis || !connected) return;
  try {
    await redis.setex(key, ttlSeconds, value);
  } catch {
    // Non-fatal — analysis can proceed without caching
  }
}
