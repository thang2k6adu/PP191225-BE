import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/notifications',
})
export class WebsocketChannel {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketChannel.name);

  async send(
    userId: string,
    title: string,
    message: string,
    data?: Record<string, any>,
  ): Promise<void> {
    // Send notification to specific user's room
    this.server.to(`user:${userId}`).emit('notification', {
      title,
      message,
      data,
      timestamp: new Date(),
    });

    this.logger.log(`WebSocket notification sent to user ${userId}: ${title}`);
  }

  handleConnection(client: any) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: any) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }
}
