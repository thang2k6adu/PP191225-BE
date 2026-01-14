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
  private subscriber: Redis | null = null;
  private isConnected = false;
  private readonly QUEUE_KEY_PREFIX = 'matchmaking:queue:';
  private readonly USER_STATE_KEY_PREFIX = 'matchmaking:user:';
  private readonly SOCKET_KEY_PREFIX = 'matchmaking:socket:';
  private readonly PUBSUB_CHANNEL = 'matchmaking:events';
  private eventHandlers = new Map<string, (data: any) => void>();

  private readonly TRY_POP_LUA = `
    local queueKey = KEYS[1]
    local minUsers = tonumber(ARGV[1])

    local len = redis.call("LLEN", queueKey)
    if len < minUsers then
      return nil
    end

    local result = {}
    for i = 1, minUsers do
      local item = redis.call("RPOP", queueKey)
      if item then
        table.insert(result, item)
      end
    end
    return result
  `;

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
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        retryStrategy: () => null,
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

  async addToQueue(topic: string, user: QueuedUser): Promise<void> {
    if (!(await this.ensureConnection())) {
      throw new Error('Redis connection unavailable');
    }
    const queueKey = this.getQueueKey(topic);
    const userData = JSON.stringify(user);
    await this.redis!.lpush(queueKey, userData);

    const userStateKey = this.getUserStateKey(user.userId);
    // TODO: nếu user chờ quá 10' mà ko match được chắc chắn lỗi, nên tiếp tục xử lý
    await this.redis!.setex(userStateKey, 600, JSON.stringify({ topic, status: 'WAITING' }));

    this.logger.log(`User ${user.userId} added to queue for topic: ${topic}`);
  }

  async removeFromQueue(topic: string, userId: string): Promise<boolean> {
    if (!(await this.ensureConnection())) {
      return false;
    }
    const queueKey = this.getQueueKey(topic);

    const queueItems = await this.redis!.lrange(queueKey, 0, -1);
    const filtered = queueItems.filter((item) => {
      const user = JSON.parse(item) as QueuedUser;
      return user.userId !== userId;
    });

    await this.redis!.del(queueKey);
    if (filtered.length > 0) {
      await this.redis!.rpush(queueKey, ...filtered);
    }

    const userStateKey = this.getUserStateKey(userId);
    await this.redis!.del(userStateKey);

    this.logger.log(`User ${userId} removed from queue for topic: ${topic}`);
    return true;
  }

  async tryMatch(topic: string, minUsers: number): Promise<QueuedUser[]> {
    if (!(await this.ensureConnection())) {
      return [];
    }

    const queueKey = this.getQueueKey(topic);

    try {
      const result = await this.redis!.eval(this.TRY_POP_LUA, 1, queueKey, minUsers);

      if (!result || (Array.isArray(result) && result.length === 0)) {
        return [];
      }

      const users = (result as string[]).map((item) => JSON.parse(item) as QueuedUser);

      for (const user of users) {
        const userStateKey = this.getUserStateKey(user.userId);
        await this.redis!.setex(userStateKey, 600, JSON.stringify({ topic, status: 'MATCHED' }));
      }

      this.logger.log(`✅ Matched ${users.length} users from queue for topic: ${topic}`);
      return users;
    } catch (error) {
      this.logger.error(`❌ tryMatch failed: ${error.message}`);
      return [];
    }
  }

  async getUserState(userId: string): Promise<{ topic: string; status: string } | null> {
    if (!(await this.ensureConnection())) {
      return null;
    }
    const userStateKey = this.getUserStateKey(userId);
    const state = await this.redis!.get(userStateKey);
    return state ? JSON.parse(state) : null;
  }

  async getQueueUsers(topic: string): Promise<QueuedUser[]> {
    if (!(await this.ensureConnection())) {
      return [];
    }
    const queueKey = this.getQueueKey(topic);
    const queueItems = await this.redis!.lrange(queueKey, 0, -1);
    return queueItems.map((item) => JSON.parse(item) as QueuedUser);
  }

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

  async registerSocket(userId: string, socketId: string, instanceId: string): Promise<void> {
    if (!(await this.ensureConnection())) return;

    const key = `${this.SOCKET_KEY_PREFIX}${userId}`;
    await this.redis!.setex(
      key,
      3600,
      JSON.stringify({ socketId, instanceId, connectedAt: Date.now() }),
    );
  }

  async unregisterSocket(userId: string): Promise<void> {
    if (!(await this.ensureConnection())) return;

    const key = `${this.SOCKET_KEY_PREFIX}${userId}`;
    await this.redis!.del(key);
  }

  async getSocketInfo(userId: string): Promise<{ socketId: string; instanceId: string } | null> {
    if (!(await this.ensureConnection())) return null;

    const key = `${this.SOCKET_KEY_PREFIX}${userId}`;
    const data = await this.redis!.get(key);
    return data ? JSON.parse(data) : null;
  }

  async publishEvent(event: string, data: any): Promise<void> {
    if (!(await this.ensureConnection())) return;

    const message = JSON.stringify({ event, data, timestamp: Date.now() });
    await this.redis!.publish(this.PUBSUB_CHANNEL, message);
    this.logger.debug(`📡 Published event: ${event}`);
  }

  onEvent(event: string, handler: (data: any) => void): void {
    this.eventHandlers.set(event, handler);
  }

  private handlePubSubMessage(channel: string, message: string): void {
    try {
      const { event, data } = JSON.parse(message);
      const handler = this.eventHandlers.get(event);

      if (handler) {
        handler(data);
      }
    } catch (error) {
      this.logger.error(`Failed to handle pub/sub message: ${error.message}`);
    }
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
    if (this.redis && this.isConnected) {
      await this.redis.quit();
    }
  }
}
