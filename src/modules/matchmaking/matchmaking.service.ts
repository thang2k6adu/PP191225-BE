import { Injectable, ConflictException, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { MatchmakingRedisService } from './matchmaking-redis.service';
import { RealtimeGateway } from '../websocket/realtime.gateway';
import { LiveKitService } from '@/common/services/livekit.service';
import {
  buildParticipantDisplayName,
  buildParticipantMetadata,
} from '@/common/utils/livekit-participant.util';
import { findAvailableRoom, tryIncrementRoomMembers } from '@/common/utils/room-capacity.util';

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  private onlineUsers: Map<string, Set<string>> = new Map();
  private disconnectGraceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly disconnectGraceMs = 5000;
  private readonly MIN_USERS_FOR_MATCH = 2;
  private readonly MATCHMAKING_TOPIC = 'random';

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

    console.log(`[MATCHMAKING] findExistingActiveMember for user ${userId}:`, {
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
    @Inject(forwardRef(() => RealtimeGateway))
    private gateway: RealtimeGateway,
  ) {
    this.logger.log('Matchmaking service initialized');
  }

  registerUser(userId: string, socketId: string): void {
    this.clearDisconnectGrace(userId);

    const sockets = this.onlineUsers.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    this.onlineUsers.set(userId, sockets);

    this.logger.log(`User registered: ${userId} with socket ${socketId}`);
  }

  async unregisterUser(userId: string, socketId: string): Promise<void> {
    const sockets = this.onlineUsers.get(userId);

    if (!sockets || !sockets.has(socketId)) {
      this.logger.warn(
        `Ignoring stale disconnect for user ${userId}: socket ${socketId} not in active set`,
      );
      return;
    }

    sockets.delete(socketId);

    if (sockets.size > 0) {
      this.onlineUsers.set(userId, sockets);
      this.logger.log(
        `User ${userId} socket ${socketId} removed; ${sockets.size} connection(s) remain`,
      );
      return;
    }

    this.onlineUsers.delete(userId);
    this.scheduleDisconnectCleanup(userId, socketId);
  }

  private clearDisconnectGrace(userId: string): void {
    const timer = this.disconnectGraceTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectGraceTimers.delete(userId);
    }
  }

  private scheduleDisconnectCleanup(userId: string, socketId: string): void {
    this.clearDisconnectGrace(userId);

    const timer = setTimeout(() => {
      this.disconnectGraceTimers.delete(userId);
      void this.finalizeUserDisconnect(userId, socketId);
    }, this.disconnectGraceMs);

    this.disconnectGraceTimers.set(userId, timer);
    this.logger.log(
      `User ${userId} has no active sockets; queue cleanup scheduled in ${this.disconnectGraceMs}ms`,
    );
  }

  private async finalizeUserDisconnect(userId: string, socketId: string): Promise<void> {
    if (this.isUserConnectedLocally(userId)) {
      this.logger.log(`Skipping disconnect cleanup for ${userId}; user reconnected`);
      return;
    }

    const userState = await this.redisService.getUserState(userId);
    if (userState && (userState.status === 'WAITING' || userState.status === 'MATCHED')) {
      await this.redisService.removeFromQueue(this.MATCHMAKING_TOPIC, userId);
      this.logger.log(`User ${userId} removed from queue after disconnect grace period`);
    }

    this.logger.log(`User unregistered: ${userId} from socket ${socketId}`);
  }

  isUserConnectedLocally(userId: string): boolean {
    const sockets = this.onlineUsers.get(userId);
    return !!sockets && sockets.size > 0;
  }

  async cancelMatchmaking(userId: string): Promise<void> {
    const userState = await this.redisService.getUserState(userId);

    // TODO: did it reset state ????, user will find match again after cancel and get error
    if (!userState || userState.status !== 'WAITING') {
      throw new ConflictException('User is not in matchmaking queue');
    }

    await this.redisService.removeFromQueue(this.MATCHMAKING_TOPIC, userId);
    this.logger.log(`User ${userId} cancelled matchmaking`);
  }

  private hasActiveMatchmakingSocket(userId: string): boolean {
    return this.isUserConnectedLocally(userId);
  }

  private async reconcileMatchmakingOnJoin(userId: string): Promise<{ status: 'WAITING' } | null> {
    const userState = await this.redisService.getUserState(userId);
    const inQueue = await this.redisService.isUserInQueue(this.MATCHMAKING_TOPIC, userId);
    const hasSocket = this.hasActiveMatchmakingSocket(userId);

    if (userState?.status === 'WAITING') {
      if (hasSocket && inQueue) {
        this.logger.log(`User ${userId} already waiting in queue (idempotent)`);
        return { status: 'WAITING' };
      }
      await this.redisService.removeFromQueue(this.MATCHMAKING_TOPIC, userId);
      this.logger.log(`Cleared stale WAITING matchmaking state for ${userId}`);
      return null;
    }

    if (inQueue && hasSocket) {
      await this.redisService.setUserState(userId, {
        topic: this.MATCHMAKING_TOPIC,
        status: 'WAITING',
      });
      this.logger.log(`User ${userId} restored WAITING state for active queue entry`);
      return { status: 'WAITING' };
    }

    if (inQueue || userState?.status === 'MATCHED') {
      await this.redisService.removeFromQueue(this.MATCHMAKING_TOPIC, userId);
      this.logger.log(`Cleared stale matchmaking state for ${userId}`);
    }

    return null;
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

    if (!this.isUserConnectedLocally(userId)) {
      throw new ConflictException('User not connected');
    }

    const socketId = this.getUserSocketId(userId);

    const idempotentWait = await this.reconcileMatchmakingOnJoin(userId);
    if (idempotentWait) {
      return idempotentWait;
    }

    const availableRoom = await findAvailableRoom(this.prisma, {
      type: 'MATCH',
      visibility: 'PUBLIC',
      status: 'ACTIVE',
    });

    this.logger.log(
      `Current member: ${availableRoom?.currentMembers ?? 0} / ${availableRoom?.maxMembers ?? 0}`,
    );

    if (availableRoom) {
      const joinedExistingRoom = await this.prisma.$transaction(async (tx) => {
        const previousMember = await tx.roomMember.findUnique({
          where: {
            roomId_userId: {
              roomId: availableRoom.id,
              userId,
            },
          },
        });

        if (previousMember && previousMember.status !== 'LEFT') {
          return true;
        }

        const incremented = await tryIncrementRoomMembers(tx, availableRoom.id);
        if (!incremented) {
          return false;
        }

        if (previousMember) {
          await tx.roomMember.update({
            where: { id: previousMember.id },
            data: {
              status: 'JOINED',
              leftAt: null,
            },
          });
        } else {
          await tx.roomMember.create({
            data: {
              roomId: availableRoom.id,
              userId,
              status: 'JOINED',
            },
          });
        }

        return true;
      });

      if (joinedExistingRoom) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { status: 'IN_ROOM' },
        });

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
    }

    await this.redisService.addToQueue(this.MATCHMAKING_TOPIC, {
      userId,
      joinedAt: Date.now(),
      socketId,
    });

    this.logger.log(`User ${userId} added to queue`);

    const matchedUsers = await this.redisService.tryMatch(
      this.MATCHMAKING_TOPIC,
      this.MIN_USERS_FOR_MATCH,
    );

    if (matchedUsers.length > 0) {
      await this.createMatch(matchedUsers);
    }

    return { status: 'WAITING' };
  }

  private async createMatch(users: Array<{ userId: string; socketId?: string }>): Promise<void> {
    if (users.length < this.MIN_USERS_FOR_MATCH) {
      this.logger.warn(
        ` createMatch called with ${users.length} users (need ${this.MIN_USERS_FOR_MATCH})`,
      );
      return;
    }

    const userIds = users.map((u) => u.userId);
    const roomName = `match-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.logger.log(`Creating match for users: ${userIds.join(', ')}`);

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
        this.logger.warn(` Users already in rooms: ${invalidUsers.join(', ')}. Aborting.`);

        for (const user of users) {
          await this.redisService.addToQueue(this.MATCHMAKING_TOPIC, {
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
          currentMembers: userIds.length,
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

      this.logger.log(` Room created ${room.id} (${roomName}) for ${userIds.length} users`);

      await this.notifyMatchFound(room.id, roomName, users);
    } catch (error) {
      this.logger.error(` Failed to create match: ${error.message}`);

      for (const user of users) {
        await this.redisService.addToQueue(this.MATCHMAKING_TOPIC, {
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

    const dbUsers = await this.prisma.user.findMany({
      where: { id: { in: users.map((u) => u.userId) } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
      },
    });
    const userById = new Map(dbUsers.map((u) => [u.id, u]));

    const notifications = users.map(async (user) => {
      try {
        const dbUser = userById.get(user.userId);
        if (!dbUser) {
          this.logger.warn(`User ${user.userId} not found for LiveKit token`);
          return { success: false, userId: user.userId };
        }

        const token = await this.livekitService.generateToken(livekitRoomName, user.userId, {
          ttl: 7200,
          canPublish: true,
          canSubscribe: true,
          name: buildParticipantDisplayName(dbUser),
          metadata: buildParticipantMetadata(dbUser),
        });

        const payload = {
          roomId,
          livekitRoomName,
          token,
          wsUrl,
          matchedUsers: users.map((u) => u.userId),
          timestamp: new Date().toISOString(),
        };

        this.gateway.sendToUser(user.userId, 'match_found', payload);
        this.logger.log(`Notified user ${user.userId} about match ${roomId}`);

        return { success: true, userId: user.userId };
      } catch (error) {
        this.logger.error(`Failed to notify user ${user.userId}: ${error.message}`);
        return { success: false, userId: user.userId, error: error.message };
      }
    });

    const results = await Promise.allSettled(notifications);

    const failed = results.filter(
      (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.success),
    );

    if (failed.length > 0) {
      this.logger.error(`Failed to notify ${failed.length}/${users.length} users`);
    } else {
      this.logger.log(` Successfully notified all ${users.length} users`);
    }
  }

  getUserSocketId(userId: string): string | undefined {
    const sockets = this.onlineUsers.get(userId);
    if (!sockets || sockets.size === 0) {
      return undefined;
    }
    return sockets.values().next().value;
  }

  async getStats() {
    return {
      onlineUsers: this.onlineUsers.size,
    };
  }
}
