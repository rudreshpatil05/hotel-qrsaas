import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

export const redis = config.REDIS_URL ? new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false }) : null;
redis?.on('error', (error: Error) => logger.warn({ message: 'Redis connection failed', error: error.message }));
export async function getCached<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try { const value = await redis.get(key); return value ? JSON.parse(value) as T : null; } catch (error) { logger.warn({ message: 'Redis read failed', key, error: error instanceof Error ? error.message : 'unknown' }); return null; }
}
export async function setCached(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
  if (!redis) return;
  try { await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds); } catch (error) { logger.warn({ message: 'Redis write failed', key, error: error instanceof Error ? error.message : 'unknown' }); }
}
export async function invalidateCache(prefix: string): Promise<void> {
  if (!redis) return;
  try { const keys = await redis.keys(`${prefix}*`); if (keys.length) await redis.del(...keys); } catch (error) { logger.warn({ message: 'Redis invalidation failed', prefix, error: error instanceof Error ? error.message : 'unknown' }); }
}
