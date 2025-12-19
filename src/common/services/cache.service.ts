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
    // Note: This requires cache store that supports pattern matching
    // For Redis, you might need to use ioredis directly
    const keys = await this.getKeysByPattern(pattern);
    for (const key of keys) {
      await this.del(key);
    }
  }

  private async getKeysByPattern(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _pattern: string,
  ): Promise<string[]> {
    // This is a simplified version
    // In production, use Redis SCAN command for pattern matching
    return [];
  }
}
