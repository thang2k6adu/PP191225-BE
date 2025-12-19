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
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/',
})
export class AppWebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AppWebSocketGateway.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      client.data.userId = payload.id;
      client.data.user = payload;

      // Join user's personal room
      await client.join(`user:${payload.id}`);

      this.logger.log(`Client ${client.id} connected as user ${payload.id}`);
    } catch (error) {
      this.logger.error(`Authentication failed for client ${client.id}: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() room: string) {
    client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);
    return { event: 'joined-room', room };
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(@ConnectedSocket() client: Socket, @MessageBody() room: string) {
    client.leave(room);
    this.logger.log(`Client ${client.id} left room ${room}`);
    return { event: 'left-room', room };
  }

  @SubscribeMessage('message')
  handleMessage(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    this.logger.log(`Message from ${client.id}: ${JSON.stringify(data)}`);
    // Broadcast to all clients in the same room
    client.to(data.room || 'default').emit('message', {
      ...data,
      from: client.data.userId,
      timestamp: new Date(),
    });
    return { event: 'message-sent', data };
  }

  // Helper method to send to specific user
  sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  // Helper method to broadcast to room
  broadcastToRoom(room: string, event: string, data: any) {
    this.server.to(room).emit(event, data);
  }
}
