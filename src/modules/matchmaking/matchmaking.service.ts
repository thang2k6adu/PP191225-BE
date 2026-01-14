import { Injectable, ConflictException, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { MatchmakingRedisService } from './matchmaking-redis.service';
import { MatchmakingGateway } from './matchmaking.gateway';
import { LiveKitService } from '@/common/services/livekit.service';

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  private onlineUsers: Map<string, string> = new Map();
  private readonly MIN_USERS_FOR_MATCH = 2;
  private readonly instanceId = `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  private async findExistingActiveMember(userId: string) {
    const result = await this.prisma.roomMember.findFirst({
      where: {
        userId,
        status: { not: 'LEFT' },
        room: {
          status: { not: 'CLOSED' }, // Only consider active rooms
        },
      },
      include: { room: true },
    });

    console.log(`🔍 [MATCHMAKING] findExistingActiveMember for user ${userId}:`, {
      found: !!result,
      roomId: result?.roomId,
      memberStatus: result?.status,
      roomStatus: result?.room?.status,
      roomType: result?.room?.type,
    });

    return result;
  }

  constructor(
    private prisma: PrismaService,
    private roomsService: RoomsService,
    private redisService: MatchmakingRedisService,
    private livekitService: LiveKitService,
    private configService: ConfigService,
    @Inject(forwardRef(() => MatchmakingGateway))
    private gateway: MatchmakingGateway,
  ) {
    this.setupPubSubHandlers();
    this.logger.log(`🎮 Matchmaking service initialized on ${this.instanceId}`);
  }

  private setupPubSubHandlers(): void {
    this.redisService.onEvent('notify_user', (data: any) => {
      const { userId, targetInstanceId, event, payload } = data;

      if (targetInstanceId === this.instanceId) {
        const socketId = this.onlineUsers.get(userId);
        if (socketId) {
          this.gateway.sendToUser(userId, event, payload);
          this.logger.debug(`📨 Delivered ${event} to user ${userId} on this instance`);
        } else {
          this.logger.warn(`⚠️ User ${userId} not found on this instance`);
        }
      }
    });

    this.redisService.onEvent('match_created', (data: any) => {
      const { roomId, userIds, instanceId } = data;
      if (instanceId !== this.instanceId) {
        this.logger.log(
          `📊 Match ${roomId} created by instance ${instanceId} with ${userIds.length} users`,
        );
      }
    });
  }

  registerUser(userId: string, socketId: string): void {
    this.onlineUsers.set(userId, socketId);

    // Register in Redis for cross-instance visibility
    this.redisService.registerSocket(userId, socketId, this.instanceId).catch((error) => {
      this.logger.error(`Failed to register socket in Redis: ${error.message}`);
    });

    this.logger.log(`User registered: ${userId} with socket ${socketId} on ${this.instanceId}`);
  }

  async unregisterUser(userId: string): Promise<void> {
    this.onlineUsers.delete(userId);

    // Unregister from Redis
    await this.redisService.unregisterSocket(userId).catch((error) => {
      this.logger.error(`Failed to unregister socket in Redis: ${error.message}`);
    });

    const userState = await this.redisService.getUserState(userId);
    if (userState && userState.status === 'WAITING') {
      await this.redisService.removeFromQueue('random', userId);
      this.logger.log(`User ${userId} removed from queue on disconnect`);
    }

    this.logger.log(`User unregistered: ${userId}`);
  }

  async cancelMatchmaking(userId: string): Promise<void> {
    const userState = await this.redisService.getUserState(userId);

    // TODO: did it reset state ????, user will find match again after cancel and get error
    if (!userState || userState.status !== 'WAITING') {
      throw new ConflictException('User is not in matchmaking queue');
    }

    await this.redisService.removeFromQueue('random', userId);
    this.logger.log(`User ${userId} cancelled matchmaking`);
  }

  async joinMatchmaking(userId: string): Promise<{
    status: 'MATCHED' | 'WAITING';
    roomId?: string;
    livekitRoomName?: string;
    token?: string;
  }> {
    const existingMember = await this.findExistingActiveMember(userId);

    if (existingMember && existingMember.room.status !== 'CLOSED') {
      throw new ConflictException('User already in a room');
    }

    const userState = await this.redisService.getUserState(userId);
    if (userState && userState.status === 'WAITING') {
      throw new ConflictException('User already in matchmaking queue');
    }

    // TODO: nếu không ở instance này thì sao ???
    const socketId = this.onlineUsers.get(userId);
    if (!socketId) {
      throw new ConflictException('User not connected');
    }

    const availableRoom = await this.prisma.room.findFirst({
      where: {
        type: 'MATCH',
        visibility: 'PUBLIC',
        status: 'ACTIVE',
      },
      include: {
        members: {
          where: {
            status: { not: 'LEFT' },
          },
        },
      },
    });

    if (availableRoom && availableRoom.members.length < availableRoom.maxMembers) {
      // Join available room và emit event ngay lập tức
      await this.prisma.roomMember.create({
        data: {
          roomId: availableRoom.id,
          userId,
          status: 'JOINED',
        },
      });

      await this.prisma.user.update({
        where: { id: userId },
        data: { status: 'IN_ROOM' },
      });

      // Update Redis user state
      await this.redisService.setUserState(userId, {
        status: 'IN_ROOM',
        roomId: availableRoom.id,
        timestamp: Date.now(),
      });

      this.logger.log(`User ${userId} joined existing room ${availableRoom.id}`);

      await this.notifyMatchFound(availableRoom.id, availableRoom.livekitRoomName, [
        { userId, socketId },
      ]);

      return { status: 'WAITING' };
    }

    await this.redisService.addToQueue('random', {
      userId,
      joinedAt: Date.now(),
      socketId,
    });

    this.logger.log(`📊 User ${userId} added to queue`);

    const matchedUsers = await this.redisService.tryMatch('random', this.MIN_USERS_FOR_MATCH);

    if (matchedUsers.length > 0) {
      await this.createMatch(matchedUsers);
    }

    return { status: 'WAITING' };
  }

  private async createMatch(users: Array<{ userId: string; socketId?: string }>): Promise<void> {
    if (users.length < this.MIN_USERS_FOR_MATCH) {
      this.logger.warn(
        `❌ createMatch called with ${users.length} users (need ${this.MIN_USERS_FOR_MATCH})`,
      );
      return;
    }

    const userIds = users.map((u) => u.userId);
    const roomName = `match-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.logger.log(`🎮 Creating match for users: ${userIds.join(', ')}`);

    try {
      const existingMembers = await this.prisma.roomMember.findMany({
        where: {
          userId: { in: userIds },
          status: { not: 'LEFT' },
        },
        include: { room: true },
      });

      const invalidUsers = existingMembers
        .filter((m) => m.room.status !== 'CLOSED')
        .map((m) => m.userId);

      if (invalidUsers.length > 0) {
        this.logger.warn(`⚠️ Users already in rooms: ${invalidUsers.join(', ')}. Aborting.`);

        for (const user of users) {
          await this.redisService.addToQueue('random', {
            ...user,
            joinedAt: Date.now(),
          });
        }
        // TODO: 1 thằng trong room mà cả nhóm bị abort rất vô lý, chỉ nên đá khỏi queue,
        //  còn user thường vẫn nên check với min member, nếu đủ vẫn nên tạo room
        // oke nếu rollback thì bản chất queue vẫn dính case bẩn thôi, phải chờ hết ttl
        return;
      }

      const room = await this.prisma.room.create({
        data: {
          type: 'MATCH',
          topic: null,
          visibility: 'PUBLIC',
          status: 'ACTIVE',
          livekitRoomName: roomName,
          maxMembers: 10,
          startedAt: new Date(),
          members: {
            create: userIds.map((uid) => ({
              userId: uid,
              status: 'JOINED',
            })),
          },
        },
      });

      await this.prisma.user.updateMany({
        where: { id: { in: userIds } },
        data: { status: 'IN_ROOM' },
      });

      await this.livekitService.createRoom(roomName, {
        emptyTimeout: 600,
        maxParticipants: 10,
      });

      this.logger.log(`✅ Room created ${room.id} (${roomName}) for ${userIds.length} users`);

      await this.notifyMatchFound(room.id, roomName, users);

      await this.redisService.publishEvent('match_created', {
        roomId: room.id,
        roomName,
        userIds,
        instanceId: this.instanceId,
      });
    } catch (error) {
      this.logger.error(`❌ Failed to create match: ${error.message}`);

      for (const user of users) {
        await this.redisService.addToQueue('random', {
          ...user,
          joinedAt: Date.now(),
        });
      }

      try {
        await this.livekitService.deleteRoom(roomName);
      } catch (cleanupError) {
        this.logger.error(`Failed to cleanup room ${roomName}: ${cleanupError.message}`);
      }

      throw error;
    }
  }

  private async notifyMatchFound(
    roomId: string,
    livekitRoomName: string,
    users: Array<{ userId: string; socketId?: string }>,
  ): Promise<void> {
    const wsUrl = this.configService.get<string>('LIVEKIT_URL') || 'ws://localhost:7880';

    const notifications = users.map(async (user) => {
      try {
        const socketInfo = await this.redisService.getSocketInfo(user.userId);
        const isLocalInstance = socketInfo?.instanceId === this.instanceId;

        if (!socketInfo) {
          this.logger.warn(`⚠️ User ${user.userId} disconnected before match notification`);
          return { success: false, userId: user.userId };
        }

        const token = await this.livekitService.generateToken(livekitRoomName, user.userId, {
          ttl: 7200,
          canPublish: true,
          canSubscribe: true,
        });

        const payload = {
          roomId,
          livekitRoomName,
          token,
          wsUrl,
          matchedUsers: users.map((u) => u.userId),
          timestamp: new Date().toISOString(),
        };

        if (isLocalInstance) {
          this.gateway.sendToUser(user.userId, 'match_found', payload);
          this.logger.log(`✅ [Local] Notified user ${user.userId} about match ${roomId}`);
        } else {
          await this.redisService.publishEvent('notify_user', {
            userId: user.userId,
            targetInstanceId: socketInfo.instanceId,
            event: 'match_found',
            payload,
          });
          this.logger.log(
            `✅ [Remote] Published notification for user ${user.userId} to instance ${socketInfo.instanceId}`,
          );
        }

        return { success: true, userId: user.userId };
      } catch (error) {
        this.logger.error(`❌ Failed to notify user ${user.userId}: ${error.message}`);
        return { success: false, userId: user.userId, error: error.message };
      }
    });

    const results = await Promise.allSettled(notifications);

    const failed = results.filter(
      (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.success),
    );

    if (failed.length > 0) {
      this.logger.error(`⚠️ Failed to notify ${failed.length}/${users.length} users`);
    } else {
      this.logger.log(`✅ Successfully notified all ${users.length} users`);
    }
  }

  getUserSocketId(userId: string): string | undefined {
    return this.onlineUsers.get(userId);
  }

  async getStats() {
    return {
      onlineUsers: this.onlineUsers.size,
    };
  }
}
