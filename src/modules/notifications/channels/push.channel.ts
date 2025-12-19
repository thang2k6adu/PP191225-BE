import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PushChannel {
  private readonly logger = new Logger(PushChannel.name);

  async send(
    userId: string,
    title: string,
    message: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _data?: Record<string, any>,
  ): Promise<void> {
    // Implement push notification logic (FCM, APNS, etc.)
    this.logger.log(`Push notification sent to user ${userId}: ${title} - ${message}`);
    // Placeholder implementation
  }
}
