import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  async reset(): Promise<void> {
    await this.cacheManager.reset();
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const client = this.getRedisClient();
    if (!client) return;

    const pipeline = client.pipeline();
    const keys = await this.getKeysByPattern(pattern);

    for (const key of keys) {
      pipeline.del(key);
    }

    await pipeline.exec();
  }

  private getRedisClient(): any {
    const store = (this.cacheManager as any)?.stores?.[0] || (this.cacheManager as any)?.store;
    return (store as any)?.client;
  }

  private async getKeysByPattern(pattern: string): Promise<string[]> {
    const client = this.getRedisClient();
    if (!client) {
      return [];
    }

    if (typeof client.scanIterator === 'function') {
      const keys: string[] = [];
      for await (const key of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        keys.push(String(key));
      }
      return keys;
    }

    if (typeof client.keys === 'function') {
      const keys = await client.keys(pattern);
      if (Array.isArray(keys)) {
        return keys.map((key) => String(key));
      }
    }

    return [];
  }
}
