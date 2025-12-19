import { Injectable } from '@nestjs/common';
import { MailService } from '../../mail/mail.service';

@Injectable()
export class EmailChannel {
  constructor(private mailService: MailService) {}

  async send(
    userId: string,
    title: string,
    message: string,
    data?: Record<string, any>,
  ): Promise<void> {
    // In a real implementation, fetch user email from database
    // For now, using a placeholder
    const userEmail = data?.email || 'user@example.com';

    await this.mailService.sendEmail({
      to: userEmail,
      subject: title,
      template: 'notification',
      context: {
        title,
        message,
        ...data,
      },
    });
  }
}
