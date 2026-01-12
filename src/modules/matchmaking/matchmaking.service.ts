import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { PUBLIC_TOPICS } from '@/config/app.config';

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  private onlineUsers: Map<string, string> = new Map();

  constructor(
    private prisma: PrismaService,
    private roomsService: RoomsService,
  ) {}

  registerUser(userId: string, socketId: string): void {
    this.onlineUsers.set(userId, socketId);
    this.logger.log(`User registered: ${userId} with socket ${socketId}`);
  }

  async unregisterUser(userId: string): Promise<void> {
    this.onlineUsers.delete(userId);
    this.logger.log(`User unregistered: ${userId}`);
  }

  async cancelMatchmaking(userId: string): Promise<void> {
    // No queue anymore, user just needs to leave the room
    this.logger.log(`User ${userId} cancelled matchmaking (no-op, user should leave room)`);
  }

  async joinMatchmaking(
    userId: string,
    topic: string,
  ): Promise<{
    roomId: string;
    livekitRoomName: string;
    token: string;
    topic: string;
    isNewRoom: boolean;
  }> {
    if (!PUBLIC_TOPICS.includes(topic as any)) {
      throw new ConflictException(`Invalid topic: ${topic}`);
    }

    const socketId = this.onlineUsers.get(userId);
    if (!socketId) {
      throw new ConflictException('User not connected');
    }

    // Find or create public room and join immediately
    const result = await this.roomsService.findOrCreatePublicRoom(topic, userId);

    this.logger.log(
      `User ${userId} joined ${result.isNewRoom ? 'new' : 'existing'} room ${result.roomId} for topic ${topic}`,
    );

    return result;
  }

  getUserSocketId(userId: string): string | undefined {
    return this.onlineUsers.get(userId);
  }

  async getStats() {
    const stats: any = {
      onlineUsers: this.onlineUsers.size,
      publicRooms: {},
    };

    // Get count of active public rooms by topic
    for (const topic of PUBLIC_TOPICS) {
      const count = await this.prisma.room.count({
        where: {
          type: 'PUBLIC',
          topic,
          status: 'ACTIVE',
        },
      });
      stats.publicRooms[topic] = count;
    }

    return stats;
  }
}
