import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MatchmakingService } from '../matchmaking/matchmaking.service';

/**
 * Unified realtime gateway (default namespace `/`).
 * One authenticated connection per session; user-scoped rooms for delivery.
 */
@WebSocketGateway({
  namespace: '/',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject(forwardRef(() => MatchmakingService))
    private matchmakingService: MatchmakingService,
  ) {}

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken;
    }

    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }

    return undefined;
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.emit('error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      client.data.userId = payload.id;
      client.data.user = payload;

      await client.join(`user:${payload.id}`);
      this.matchmakingService.registerUser(payload.id, client.id);

      this.logger.log(`Client ${client.id} connected as user ${payload.id}`);

      client.emit('connected', {
        userId: payload.id,
        message: 'Successfully connected to realtime server',
      });
    } catch (error) {
      this.logger.error(`Authentication failed for client ${client.id}: ${error.message}`);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;

    if (!userId) {
      this.logger.log(`Client ${client.id} disconnected (no userId)`);
      return;
    }

    this.logger.log(`Client ${client.id} (user ${userId}) disconnected`);
    await this.matchmakingService.unregisterUser(userId, client.id);
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    const userId = client.data.userId;

    if (!userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    const { roomId } = data;
    await client.join(`room:${roomId}`);

    this.logger.log(`User ${userId} joined Socket.IO room ${roomId}`);

    client.emit('room_joined', {
      roomId,
      message: 'Successfully joined room',
    });

    client.to(`room:${roomId}`).emit('player_joined', {
      userId,
      roomId,
    });

    return { success: true, roomId };
  }

  @SubscribeMessage('leave_room')
  async handleLeaveRoom(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;

    if (!userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    this.logger.log(`User ${userId} requested leave via WebSocket - should use REST API`);

    client.emit('info', {
      message: 'Please use REST API POST /rooms/:roomId/leave',
    });

    return { success: false, message: 'Use REST API endpoint' };
  }

  sendToUser(userId: string, event: string, data: unknown): void {
    this.server.to(`user:${userId}`).emit(event, data);
    this.logger.debug(`Sent '${event}' event to user ${userId}`);
  }

  sendToUsers(userIds: string[], event: string, data: unknown): void {
    userIds.forEach((userId) => {
      this.sendToUser(userId, event, data);
    });
    this.logger.log(`Sent '${event}' event to ${userIds.length} users`);
  }

  broadcastToRoom(roomId: string, event: string, data: unknown): void {
    this.server.to(`room:${roomId}`).emit(event, data);
  }
}
