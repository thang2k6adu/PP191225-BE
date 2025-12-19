import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { NotificationJobData } from '../notification.queue';
import { NotificationsService } from '../../notifications/notifications.service';

@Processor('notification')
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private notificationsService: NotificationsService) {}

  @Process('send-notification')
  async handleSendNotification(job: Job<NotificationJobData>) {
    this.logger.log(`Processing notification job ${job.id} for user ${job.data.userId}`);

    try {
      await this.notificationsService.sendNotification({
        userId: job.data.userId,
        type: job.data.type,
        title: job.data.title,
        message: job.data.message,
        data: job.data.data,
      });

      this.logger.log(`Notification sent successfully to user ${job.data.userId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to send notification to user ${job.data.userId}: ${error.message}`);
      throw error;
    }
  }
}
