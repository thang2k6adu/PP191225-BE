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

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];

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

      this.matchmakingService.registerUser(payload.id, client.id);

      await client.join(`user:${payload.id}`);

      this.logger.log(`Client ${client.id} connected as user ${payload.id}`);

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

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;

    if (!userId) {
      this.logger.log(`Client ${client.id} disconnected (no userId)`);
      return;
    }

    this.logger.log(`Client ${client.id} (user ${userId}) disconnected`);

    await this.matchmakingService.unregisterUser(userId);
    this.logger.log(`User ${userId} unregistered and cleaned up`);
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    const userId = client.data.userId;

    if (!userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    const { roomId } = data;

    // TODO: Query database to verify user is member of this room

    await client.join(`room:${roomId}`);

    this.logger.log(`User ${userId} joined Socket.IO room ${roomId}`);

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

  sendMatchFound(
    userId: string,
    socketId: string,
    matchData: {
      roomId: string;
      livekitRoomName: string;
      token: string;
      opponentId: string;
    },
  ) {
    this.server.to(socketId).emit('match_found', {
      roomId: matchData.roomId,
      livekitRoomName: matchData.livekitRoomName,
      token: matchData.token,
      opponentId: matchData.opponentId,
      message: 'Match found!',
    });

    this.logger.log(`Match found event sent to user ${userId}`);
  }

  broadcastToRoom(roomId: string, event: string, data: any) {
    this.server.to(`room:${roomId}`).emit(event, data);
  }

  sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
