import { Injectable, Logger } from '@nestjs/common';
import { RealtimeGateway } from '../../websocket/realtime.gateway';

@Injectable()
export class WebsocketChannel {
  private readonly logger = new Logger(WebsocketChannel.name);

  constructor(private readonly realtimeGateway: RealtimeGateway) {}

  async send(
    userId: string,
    title: string,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    this.realtimeGateway.sendToUser(userId, 'notification', {
      title,
      message,
      data,
      timestamp: new Date(),
    });

    this.logger.log(`WebSocket notification sent to user ${userId}: ${title}`);
  }
}
