import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { NotificationQueue } from '../queues/notification.queue';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { PushChannel } from './channels/push.channel';
import { WebsocketChannel } from './channels/websocket.channel';

export interface SendNotificationOptions {
  userId: string;
  type: 'email' | 'sms' | 'push' | 'websocket' | 'all';
  title: string;
  message: string;
  data?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private notificationQueue: NotificationQueue,
    private emailChannel: EmailChannel,
    private smsChannel: SmsChannel,
    private pushChannel: PushChannel,
    private websocketChannel: WebsocketChannel,
  ) {}

  async sendNotification(options: SendNotificationOptions): Promise<void> {
    // Save notification to database
    await this.prisma.notification.create({
      data: {
        userId: options.userId,
        type: options.type === 'all' ? 'email' : options.type,
        title: options.title,
        message: options.message,
        data: options.data || {},
        read: false,
      },
    });

    // Send via appropriate channel(s)
    if (options.type === 'all') {
      await Promise.allSettled([
        this.emailChannel.send(options.userId, options.title, options.message, options.data),
        this.pushChannel.send(options.userId, options.title, options.message, options.data),
        this.websocketChannel.send(options.userId, options.title, options.message, options.data),
      ]);
    } else {
      switch (options.type) {
        case 'email':
          await this.emailChannel.send(
            options.userId,
            options.title,
            options.message,
            options.data,
          );
          break;
        case 'sms':
          await this.smsChannel.send(options.userId, options.title, options.message, options.data);
          break;
        case 'push':
          await this.pushChannel.send(options.userId, options.title, options.message, options.data);
          break;
        case 'websocket':
          await this.websocketChannel.send(
            options.userId,
            options.title,
            options.message,
            options.data,
          );
          break;
      }
    }

    this.logger.log(`Notification sent to user ${options.userId}`);
  }

  async sendNotificationAsync(options: SendNotificationOptions): Promise<void> {
    await this.notificationQueue.sendNotification({
      userId: options.userId,
      type: options.type === 'all' ? 'email' : options.type,
      title: options.title,
      message: options.message,
      data: options.data,
    });
  }

  async getUserNotifications(userId: string, limit: number = 20) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });
  }
}
