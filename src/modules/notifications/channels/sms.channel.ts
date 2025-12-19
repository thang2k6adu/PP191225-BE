import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SmsChannel {
  private readonly logger = new Logger(SmsChannel.name);

  async send(
    userId: string,
    title: string,
    message: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _data?: Record<string, any>,
  ): Promise<void> {
    // Implement SMS sending logic (Twilio, AWS SNS, etc.)
    this.logger.log(`SMS sent to user ${userId}: ${title} - ${message}`);
    // Placeholder implementation
  }
}
