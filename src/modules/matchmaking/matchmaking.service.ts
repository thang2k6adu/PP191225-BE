import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import { MatchmakingRedisService } from './matchmaking-redis.service';
import { RoomsService } from '../rooms/rooms.service';
import { PUBLIC_TOPICS } from '@/config/app.config';

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  private onlineUsers: Map<string, string> = new Map();
  private readonly MIN_USERS_FOR_MATCH = 2;

  constructor(
    private prisma: PrismaService,
    private redisService: MatchmakingRedisService,
    private roomsService: RoomsService,
    private configService: ConfigService,
  ) {}

  registerUser(userId: string, socketId: string): void {
    this.onlineUsers.set(userId, socketId);
    this.logger.log(`User registered: ${userId} with socket ${socketId}`);
  }

  async unregisterUser(userId: string): Promise<void> {
    this.onlineUsers.delete(userId);

    const userState = await this.redisService.getUserState(userId);
    if (userState && userState.status === 'WAITING') {
      await this.redisService.removeFromQueue(userState.topic, userId);
      this.logger.log(`User ${userId} removed from queue on disconnect`);
    }

    this.logger.log(`User unregistered: ${userId}`);
  }

  async joinMatchmaking(
    userId: string,
    topic: string,
  ): Promise<{
    status: 'MATCHED' | 'WAITING';
    roomId?: string;
    livekitRoomName?: string;
    token?: string;
    opponentId?: string;
    opponentSocketId?: string;
    suggestPublicRooms?: Array<{
      id: string;
      topic: string;
      currentMembers: number;
    }>;
  }> {
    if (!PUBLIC_TOPICS.includes(topic as any)) {
      throw new ConflictException(`Invalid topic: ${topic}`);
    }

    const existingMember = await this.prisma.roomMember.findFirst({
      where: {
        userId,
        status: { not: 'LEFT' },
      },
      include: { room: true },
    });

    if (existingMember && existingMember.room.status !== 'CLOSED') {
      throw new ConflictException('User already in a room');
    }

    const userState = await this.redisService.getUserState(userId);
    if (userState && userState.status === 'WAITING') {
      throw new ConflictException('User already in matchmaking queue');
    }

    const socketId = this.onlineUsers.get(userId);
    if (!socketId) {
      throw new ConflictException('User not connected');
    }

    const queueLength = await this.redisService.getQueueLength(topic);

    if (queueLength >= this.MIN_USERS_FOR_MATCH - 1) {
      await this.redisService.addToQueue(topic, {
        userId,
        joinedAt: Date.now(),
        socketId,
      });

      const users = await this.redisService.popUsers(topic, this.MIN_USERS_FOR_MATCH);

      if (users.length < this.MIN_USERS_FOR_MATCH) {
        for (const user of users) {
          await this.redisService.addToQueue(topic, user);
        }

        const publicRooms = await this.getPublicRoomsSuggestions();

        return {
          status: 'WAITING',
          suggestPublicRooms: publicRooms,
        };
      }

      const userIds = users.map((u) => u.userId);
      const matchResult = await this.roomsService.createMatchRoom(userIds, topic);

      const currentUserToken = matchResult.tokens.find((t) => t.userId === userId);

      const opponent = users.find((u) => u.userId !== userId);

      this.logger.log(`Match created! Room ${matchResult.roomId} for topic ${topic}`);

      return {
        status: 'MATCHED',
        roomId: matchResult.roomId,
        livekitRoomName: matchResult.livekitRoomName,
        token: currentUserToken?.token,
        opponentId: opponent?.userId,
        opponentSocketId: opponent?.socketId,
      };
    } else {
      await this.redisService.addToQueue(topic, {
        userId,
        joinedAt: Date.now(),
        socketId,
      });

      this.logger.log(
        `User ${userId} added to queue for topic ${topic}. Queue length: ${queueLength + 1}`,
      );

      const publicRooms = await this.getPublicRoomsSuggestions();

      return {
        status: 'WAITING',
        suggestPublicRooms: publicRooms,
      };
    }
  }

  async cancelMatchmaking(userId: string): Promise<void> {
    const userState = await this.redisService.getUserState(userId);

    if (!userState || userState.status !== 'WAITING') {
      throw new ConflictException('User is not in matchmaking queue');
    }

    await this.redisService.removeFromQueue(userState.topic, userId);
    this.logger.log(`User ${userId} cancelled matchmaking for topic ${userState.topic}`);
  }

  getUserSocketId(userId: string): string | undefined {
    return this.onlineUsers.get(userId);
  }

  async getStats() {
    const stats: any = {
      onlineUsers: this.onlineUsers.size,
      queues: {},
    };

    for (const topic of PUBLIC_TOPICS) {
      const length = await this.redisService.getQueueLength(topic);
      stats.queues[topic] = length;
    }

    return stats;
  }

  private async getPublicRoomsSuggestions() {
    const publicRooms = await this.roomsService.getPublicRooms();
    return publicRooms
      .map((room) => ({
        id: room.id,
        topic: room.topic!,
        currentMembers: room.currentMembers,
      }))
      .slice(0, 3);
  }
}
