import { Module, forwardRef } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { PushChannel } from './channels/push.channel';
import { WebsocketChannel } from './channels/websocket.channel';
import { PrismaService } from '@/database/prisma.service';
import { MailModule } from '../mail/mail.module';
import { QueuesModule } from '../queues/queues.module';

@Module({
  imports: [MailModule, forwardRef(() => QueuesModule)],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    EmailChannel,
    SmsChannel,
    PushChannel,
    WebsocketChannel,
    PrismaService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
