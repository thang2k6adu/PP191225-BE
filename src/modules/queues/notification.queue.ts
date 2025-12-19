import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

export interface NotificationJobData {
  userId: string;
  type: 'email' | 'sms' | 'push' | 'websocket';
  title: string;
  message: string;
  data?: Record<string, any>;
  priority?: number;
}

@Injectable()
export class NotificationQueue {
  constructor(@InjectQueue('notification') private notificationQueue: Queue) {}

  async sendNotification(data: NotificationJobData) {
    return this.notificationQueue.add('send-notification', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      priority: data.priority || 0,
    });
  }

  async sendBulkNotifications(notifications: NotificationJobData[]) {
    const jobs = notifications.map((notification) => ({
      name: 'send-notification',
      data: notification,
      opts: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        priority: notification.priority || 0,
      },
    }));

    return this.notificationQueue.addBulk(jobs);
  }
}
