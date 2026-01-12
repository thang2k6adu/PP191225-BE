import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface QueuedUser {
  userId: string;
  joinedAt: number;
  socketId?: string;
}

@Injectable()
export class MatchmakingRedisService {
  private readonly logger = new Logger(MatchmakingRedisService.name);
  private redis: Redis | null = null;
  private isConnected = false;
  private readonly QUEUE_KEY_PREFIX = 'matchmaking:queue:';
  private readonly USER_STATE_KEY_PREFIX = 'matchmaking:user:';

  constructor(private configService: ConfigService) {
    this.initRedis();
  }

  private initRedis() {
    try {
      this.redis = new Redis({
        host: this.configService.get('redis.host'),
        port: this.configService.get('redis.port'),
        password: this.configService.get('redis.password'),
        lazyConnect: true,
        maxRetriesPerRequest: 0, // Fail fast, don't retry
        enableOfflineQueue: false, // Don't queue commands
        retryStrategy: () => null, // Disable reconnection
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
        this.logger.log('✅ Redis connected for matchmaking');
      });

      this.redis.on('error', () => {
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        this.isConnected = false;
      });

      // Try once - silent failure
      this.redis.connect().catch(() => {
        this.logger.warn('⚠️  Redis unavailable - matchmaking queue disabled');
      });
    } catch (error) {
      this.logger.error('Failed to initialize Redis:', error.message);
    }
  }

  private async ensureConnection(): Promise<boolean> {
    if (!this.redis) {
      throw new Error('Redis client not initialized');
    }
    if (!this.isConnected) {
      try {
        await this.redis.connect();
        return true;
      } catch (error) {
        this.logger.error('Redis connection failed:', error.message);
        return false;
      }
    }
    return true;
  }

  /**
   * Add user to matchmaking queue for a specific topic
   */
  async addToQueue(topic: string, user: QueuedUser): Promise<void> {
    if (!(await this.ensureConnection())) {
      throw new Error('Redis connection unavailable');
    }
    const queueKey = this.getQueueKey(topic);
    const userData = JSON.stringify(user);
    await this.redis!.lpush(queueKey, userData);

    // Also store user state with TTL (10 minutes)
    const userStateKey = this.getUserStateKey(user.userId);
    await this.redis!.setex(userStateKey, 600, JSON.stringify({ topic, status: 'WAITING' }));

    this.logger.log(`User ${user.userId} added to queue for topic: ${topic}`);
  }

  /**
   * Remove user from matchmaking queue
   */
  async removeFromQueue(topic: string, userId: string): Promise<boolean> {
    if (!(await this.ensureConnection())) {
      return false;
    }
    const queueKey = this.getQueueKey(topic);

    // Get all items and filter out the user
    const queueItems = await this.redis!.lrange(queueKey, 0, -1);
    const filtered = queueItems.filter((item) => {
      const user = JSON.parse(item) as QueuedUser;
      return user.userId !== userId;
    });

    // Replace queue with filtered items
    await this.redis!.del(queueKey);
    if (filtered.length > 0) {
      await this.redis!.rpush(queueKey, ...filtered);
    }

    // Remove user state
    const userStateKey = this.getUserStateKey(userId);
    await this.redis!.del(userStateKey);

    this.logger.log(`User ${userId} removed from queue for topic: ${topic}`);
    return true;
  }

  /**
   * Get current queue length for a topic
   */
  async getQueueLength(topic: string): Promise<number> {
    if (!(await this.ensureConnection())) {
      return 0;
    }
    const queueKey = this.getQueueKey(topic);
    return await this.redis!.llen(queueKey);
  }

  /**
   * Pop N users from the queue for matching
   */
  async popUsers(topic: string, count: number): Promise<QueuedUser[]> {
    if (!(await this.ensureConnection())) {
      return [];
    }
    const queueKey = this.getQueueKey(topic);
    const users: QueuedUser[] = [];

    for (let i = 0; i < count; i++) {
      const userData = await this.redis!.rpop(queueKey);
      if (!userData) break;

      const user = JSON.parse(userData) as QueuedUser;
      users.push(user);

      // Update user state
      const userStateKey = this.getUserStateKey(user.userId);
      await this.redis!.setex(userStateKey, 600, JSON.stringify({ topic, status: 'MATCHED' }));
    }

    this.logger.log(`Popped ${users.length} users from queue for topic: ${topic}`);
    return users;
  }

  /**
   * Get user's current matchmaking state
   */
  async getUserState(userId: string): Promise<{ topic: string; status: string } | null> {
    if (!(await this.ensureConnection())) {
      return null;
    }
    const userStateKey = this.getUserStateKey(userId);
    const state = await this.redis!.get(userStateKey);
    return state ? JSON.parse(state) : null;
  }

  /**
   * Get all users in queue for a topic (for debugging)
   */
  async getQueueUsers(topic: string): Promise<QueuedUser[]> {
    if (!(await this.ensureConnection())) {
      return [];
    }
    const queueKey = this.getQueueKey(topic);
    const queueItems = await this.redis!.lrange(queueKey, 0, -1);
    return queueItems.map((item) => JSON.parse(item) as QueuedUser);
  }

  /**
   * Clear entire queue for a topic (admin/debug)
   */
  async clearQueue(topic: string): Promise<void> {
    if (!(await this.ensureConnection())) {
      return;
    }
    const queueKey = this.getQueueKey(topic);
    await this.redis!.del(queueKey);
    this.logger.warn(`Queue cleared for topic: ${topic}`);
  }

  private getQueueKey(topic: string): string {
    return `${this.QUEUE_KEY_PREFIX}${topic}`;
  }

  private getUserStateKey(userId: string): string {
    return `${this.USER_STATE_KEY_PREFIX}${userId}`;
  }

  async onModuleDestroy() {
    if (this.redis && this.isConnected) {
      await this.redis.quit();
    }
  }
}
