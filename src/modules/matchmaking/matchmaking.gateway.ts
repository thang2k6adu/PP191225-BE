import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MatchmakingService } from './matchmaking.service';
import { MatchFoundDto } from './dto/match-found.dto';

/**
 * Matchmaking Gateway
 * Handles WebSocket connections and events for matchmaking
 */
@WebSocketGateway({
  namespace: '/matchmaking',
})
export class MatchmakingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MatchmakingGateway.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private matchmakingService: MatchmakingService,
  ) {}

  /**
   * Handle client connection
   * Verify JWT token and register user
   */
  async handleConnection(client: Socket) {
    try {
      // Extract token from auth or authorization header
      const token =
        client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.emit('error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

      // Verify JWT token
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      // Store user data in socket
      client.data.userId = payload.id;
      client.data.user = payload;

      // Register user in matchmaking service
      this.matchmakingService.registerUser(payload.id, client.id);

      // Join user's personal room for direct messaging
      await client.join(`user:${payload.id}`);

      this.logger.log(`Client ${client.id} connected as user ${payload.id}`);

      // Send connection success event
      client.emit('connected', {
        userId: payload.id,
        message: 'Successfully connected to matchmaking server',
      });
    } catch (error) {
      this.logger.error(`Authentication failed for client ${client.id}: ${error.message}`);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   * Clean up user state and notify opponent if needed
   */
  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;

    if (!userId) {
      this.logger.log(`Client ${client.id} disconnected (no userId)`);
      return;
    }

    this.logger.log(`Client ${client.id} (user ${userId}) disconnected`);

    // Unregister user and handle cleanup
    const result = await this.matchmakingService.unregisterUser(userId);

    // Notify opponent if user was in a room
    if (result.shouldNotifyOpponent && result.opponentId) {
      const opponentSocketId = this.matchmakingService.getUserSocketId(result.opponentId);

      if (opponentSocketId) {
        this.server.to(`user:${result.opponentId}`).emit('opponent_disconnected', {
          message: 'Your opponent has disconnected',
          roomId: result.roomId,
        });

        this.logger.log(`Notified user ${result.opponentId} about opponent ${userId} disconnect`);
      }
    }
  }

  /**
   * Handle JOIN_ROOM event from client
   * Client explicitly joins a room after match is found
   */
  @SubscribeMessage('join_room')
  async handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    const userId = client.data.userId;

    if (!userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    const { roomId } = data;

    // Verify room exists and user is part of it
    const room = this.matchmakingService.getRoom(roomId);
    if (!room) {
      client.emit('error', { message: 'Room not found' });
      return;
    }

    if (!room.players.includes(userId)) {
      client.emit('error', { message: 'You are not part of this room' });
      return;
    }

    // Join socket.io room
    await client.join(`room:${roomId}`);

    this.logger.log(`User ${userId} joined room ${roomId}`);

    // Emit confirmation
    client.emit('room_joined', {
      roomId,
      message: 'Successfully joined room',
    });

    // Notify other players in room
    client.to(`room:${roomId}`).emit('player_joined', {
      userId,
      roomId,
    });

    return { success: true, roomId };
  }

  /**
   * Handle LEAVE_ROOM event from client
   * Client explicitly leaves a room
   */
  @SubscribeMessage('leave_room')
  async handleLeaveRoom(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;

    if (!userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      const result = this.matchmakingService.leaveRoom(userId);

      // Leave socket.io room
      if (result.roomId) {
        await client.leave(`room:${result.roomId}`);

        // Notify opponent
        if (result.opponentId) {
          this.server.to(`user:${result.opponentId}`).emit('opponent_left', {
            message: 'Your opponent has left the room',
            roomId: result.roomId,
          });
        }

        this.logger.log(`User ${userId} left room ${result.roomId}`);
      }

      client.emit('room_left', {
        message: 'Successfully left room',
      });

      return { success: true };
    } catch (error) {
      client.emit('error', { message: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send MATCH_FOUND event to both users
   * Called by controller when match is created
   */
  sendMatchFound(
    userId: string,
    userName: string,
    opponentId: string,
    opponentName: string | undefined,
    matchData: MatchFoundDto,
  ) {
    // Send to first user (current user who just joined)
    this.server.to(`user:${userId}`).emit('match_found', {
      roomId: matchData.roomId,
      opponentId: matchData.opponentId,
      opponentName: matchData.opponentName,
      message: 'Match found!',
    });

    // Send to opponent (user who was waiting in queue)
    this.server.to(`user:${opponentId}`).emit('match_found', {
      roomId: matchData.roomId,
      opponentId: userId,
      opponentName: userName,
      message: 'Match found!',
    });

    this.logger.log(`Match found event sent to users ${userId} and ${opponentId}`);
  }

  /**
   * Broadcast message to a room
   * Helper method for game-specific events
   */
  broadcastToRoom(roomId: string, event: string, data: any) {
    this.server.to(`room:${roomId}`).emit(event, data);
  }

  /**
   * Send message to specific user
   * Helper method for user-specific events
   */
  sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
