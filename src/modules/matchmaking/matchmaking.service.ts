import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import { LiveKitService } from '@/common/services/livekit.service';
import { UserState } from './enums/user-state.enum';
import { v4 as uuidv4 } from 'uuid';

/**
 * Interface for user info in matchmaking
 */
interface UserInfo {
  userId: string;
  socketId: string;
  name?: string;
  joinedAt: Date;
}

/**
 * Interface for room data
 */
interface RoomData {
  roomId: string;
  players: string[]; // Array of userIds
  createdAt: Date;
}

/**
 * Matchmaking Service
 * Handles matchmaking logic with in-memory store
 * Uses simple mutex lock to prevent race conditions
 */
@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  // In-memory data structures
  private waitingQueue: UserInfo[] = []; // Queue of users waiting for match
  private roomStore: Map<string, RoomData> = new Map(); // roomId -> RoomData
  private userState: Map<string, UserState> = new Map(); // userId -> UserState
  private onlineUsers: Map<string, string> = new Map(); // userId -> socketId
  private userRoomMap: Map<string, string> = new Map(); // userId -> roomId

  // Simple mutex lock for matchmaking operations
  private matchmakingLock = false;

  constructor(
    private prisma: PrismaService,
    private livekitService: LiveKitService,
    private configService: ConfigService,
  ) {}

  /**
   * Register user socket connection
   * Maps userId to socketId for communication
   */
  registerUser(userId: string, socketId: string): void {
    this.onlineUsers.set(userId, socketId);

    // Initialize user state if not exists
    if (!this.userState.has(userId)) {
      this.userState.set(userId, UserState.IDLE);
    }

    this.logger.log(`User registered: ${userId} with socket ${socketId}`);
  }

  /**
   * Unregister user socket connection
   * Handles cleanup when user disconnects
   */
  async unregisterUser(
    userId: string,
  ): Promise<{ shouldNotifyOpponent: boolean; opponentId?: string; roomId?: string }> {
    this.onlineUsers.delete(userId);

    const currentState = this.userState.get(userId);
    const result = {
      shouldNotifyOpponent: false,
      opponentId: undefined as string | undefined,
      roomId: undefined as string | undefined,
    };

    if (currentState === UserState.WAITING) {
      // Remove from waiting queue
      this.removeFromQueue(userId);
      this.logger.log(`User ${userId} removed from waiting queue on disconnect`);
    } else if (currentState === UserState.IN_ROOM) {
      // Cancel room and notify opponent
      const roomId = this.userRoomMap.get(userId);
      if (roomId) {
        const room = this.roomStore.get(roomId);
        if (room) {
          // Find opponent
          const opponentId = room.players.find((id) => id !== userId);
          if (opponentId) {
            result.shouldNotifyOpponent = true;
            result.opponentId = opponentId;
            result.roomId = roomId;

            // Reset opponent state
            this.userState.set(opponentId, UserState.IDLE);
            this.userRoomMap.delete(opponentId);
          }

          // Clean up room
          this.roomStore.delete(roomId);
          this.logger.log(`Room ${roomId} cancelled due to user ${userId} disconnect`);
        }
      }
    }

    // Reset user state
    this.userState.set(userId, UserState.IDLE);
    this.userRoomMap.delete(userId);

    this.logger.log(`User unregistered: ${userId}`);
    return result;
  }

  /**
   * Join matchmaking queue
   * Implements mutex lock to prevent race conditions
   */
  async joinMatchmaking(
    userId: string,
    userName?: string,
  ): Promise<{
    matched: boolean;
    roomId?: string;
    opponentId?: string;
    opponentSocketId?: string;
    opponentName?: string;
    livekitToken?: string;
    livekitUrl?: string;
  }> {
    // Wait for lock
    await this.acquireLock();

    try {
      // Validation: Check if user already in room
      const currentState = this.userState.get(userId);
      if (currentState === UserState.IN_ROOM) {
        throw new ConflictException('User already in a room');
      }

      // Validation: Check if user already in queue
      if (currentState === UserState.WAITING) {
        throw new ConflictException('User already in matchmaking queue');
      }

      const socketId = this.onlineUsers.get(userId);
      if (!socketId) {
        throw new ConflictException('User not connected');
      }

      // Check if there's someone waiting in queue
      if (this.waitingQueue.length > 0) {
        // Match found! Pop opponent from queue
        const opponent = this.waitingQueue.shift()!;

        // Verify opponent still online and waiting
        const opponentSocketId = this.onlineUsers.get(opponent.userId);
        const opponentState = this.userState.get(opponent.userId);

        if (!opponentSocketId || opponentState !== UserState.WAITING) {
          // Opponent disconnected or state changed, try next in queue
          this.logger.warn(`Opponent ${opponent.userId} no longer available, retrying...`);
          return this.joinMatchmaking(userId, userName); // Recursive retry
        }

        // Create room
        const roomId = uuidv4();
        const livekitRoomName = `lk-${roomId}`;

        // Create room in database
        await this.prisma.room.create({
          data: {
            id: roomId,
            type: 'PUBLIC',
            status: 'ACTIVE',
            maxMembers: 2,
            livekitRoomName,
            startedAt: new Date(),
            members: {
              create: [
                { userId: opponent.userId, status: 'JOINED' },
                { userId, status: 'JOINED' },
              ],
            },
          },
        });

        // Create LiveKit room
        try {
          await this.livekitService.createRoom(livekitRoomName, {
            emptyTimeout: 300,
            maxParticipants: 2,
          });
        } catch (error) {
          this.logger.error(`Failed to create LiveKit room: ${error.message}`);
          // Cleanup database room if LiveKit fails
          await this.prisma.room.delete({ where: { id: roomId } });
          throw error;
        }

        // Generate LiveKit tokens for both users
        const [userToken, opponentToken] = await Promise.all([
          this.livekitService.generateToken(userId, livekitRoomName),
          this.livekitService.generateToken(opponent.userId, livekitRoomName),
        ]);

        const room: RoomData = {
          roomId,
          players: [opponent.userId, userId],
          createdAt: new Date(),
        };

        this.roomStore.set(roomId, room);

        // Update states
        this.userState.set(userId, UserState.IN_ROOM);
        this.userState.set(opponent.userId, UserState.IN_ROOM);

        // Map users to room
        this.userRoomMap.set(userId, roomId);
        this.userRoomMap.set(opponent.userId, roomId);

        this.logger.log(
          `Match found! Room ${roomId} created for users ${opponent.userId} and ${userId}`,
        );

        // Store opponent token temporarily for gateway to send
        this.roomStore.set(`${roomId}:token:${opponent.userId}`, opponentToken as any);

        return {
          matched: true,
          roomId,
          opponentId: opponent.userId,
          opponentSocketId: opponentSocketId,
          opponentName: opponent.name,
          livekitToken: userToken,
          livekitUrl: this.configService.get<string>('livekit.url'),
        };
      } else {
        // No one waiting, add to queue
        this.waitingQueue.push({
          userId,
          socketId,
          name: userName,
          joinedAt: new Date(),
        });

        this.userState.set(userId, UserState.WAITING);

        this.logger.log(`User ${userId} added to waiting queue`);

        return {
          matched: false,
        };
      }
    } finally {
      // Release lock
      this.releaseLock();
    }
  }

  /**
   * Cancel matchmaking
   * Remove user from queue
   */
  cancelMatchmaking(userId: string): void {
    const currentState = this.userState.get(userId);

    if (currentState !== UserState.WAITING) {
      throw new ConflictException('User is not in matchmaking queue');
    }

    this.removeFromQueue(userId);
    this.userState.set(userId, UserState.IDLE);

    this.logger.log(`User ${userId} cancelled matchmaking`);
  }

  /**
   * Get user's current state
   */
  getUserState(userId: string): UserState {
    return this.userState.get(userId) || UserState.IDLE;
  }

  /**
   * Get user's current room
   */
  getUserRoom(userId: string): RoomData | null {
    const roomId = this.userRoomMap.get(userId);
    if (!roomId) return null;

    return this.roomStore.get(roomId) || null;
  }

  /**
   * Get socket ID for user
   */
  getUserSocketId(userId: string): string | undefined {
    return this.onlineUsers.get(userId);
  }

  /**
   * Get room by ID
   */
  getRoom(roomId: string): RoomData | undefined {
    return this.roomStore.get(roomId);
  }

  /**
   * Leave room
   * Handles when user leaves an active room
   */
  leaveRoom(userId: string): { opponentId?: string; roomId?: string } {
    const currentState = this.userState.get(userId);

    if (currentState !== UserState.IN_ROOM) {
      throw new ConflictException('User is not in a room');
    }

    const roomId = this.userRoomMap.get(userId);
    if (!roomId) {
      throw new NotFoundException('Room not found');
    }

    const room = this.roomStore.get(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Find opponent
    const opponentId = room.players.find((id) => id !== userId);

    // Clean up
    this.userState.set(userId, UserState.IDLE);
    this.userRoomMap.delete(userId);

    if (opponentId) {
      this.userState.set(opponentId, UserState.IDLE);
      this.userRoomMap.delete(opponentId);
    }

    this.roomStore.delete(roomId);

    this.logger.log(`User ${userId} left room ${roomId}`);

    return { opponentId, roomId };
  }

  /**
   * Get matchmaking statistics (for debugging/monitoring)
   */
  getStats() {
    return {
      waitingQueueSize: this.waitingQueue.length,
      activeRooms: this.roomStore.size,
      onlineUsers: this.onlineUsers.size,
      stateDistribution: {
        idle: Array.from(this.userState.values()).filter((s) => s === UserState.IDLE).length,
        waiting: Array.from(this.userState.values()).filter((s) => s === UserState.WAITING).length,
        inRoom: Array.from(this.userState.values()).filter((s) => s === UserState.IN_ROOM).length,
      },
    };
  }

  // Private helper methods

  /**
   * Remove user from waiting queue
   */
  private removeFromQueue(userId: string): void {
    const index = this.waitingQueue.findIndex((user) => user.userId === userId);
    if (index !== -1) {
      this.waitingQueue.splice(index, 1);
    }
  }

  /**
   * Acquire mutex lock for matchmaking operations
   * Simple spinlock implementation
   */
  private async acquireLock(): Promise<void> {
    while (this.matchmakingLock) {
      // Wait 10ms and retry
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    this.matchmakingLock = true;
  }

  /**
   * Release mutex lock
   */
  private releaseLock(): void {
    this.matchmakingLock = false;
  }

  /**
   * Get opponent's LiveKit token (helper for gateway)
   */
  getOpponentToken(roomId: string, userId: string): string | undefined {
    const token = this.roomStore.get(`${roomId}:token:${userId}`) as any;
    // Clean up after retrieval
    this.roomStore.delete(`${roomId}:token:${userId}`);
    return token;
  }
}
