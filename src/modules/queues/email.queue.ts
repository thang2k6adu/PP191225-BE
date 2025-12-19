import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

export interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  context: Record<string, any>;
  priority?: number;
}

@Injectable()
export class EmailQueue {
  constructor(@InjectQueue('email') private emailQueue: Queue) {}

  async sendEmail(data: EmailJobData) {
    return this.emailQueue.add('send-email', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      priority: data.priority || 0,
    });
  }

  async sendBulkEmails(emails: EmailJobData[]) {
    const jobs = emails.map((email) => ({
      name: 'send-email',
      data: email,
      opts: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        priority: email.priority || 0,
      },
    }));

    return this.emailQueue.addBulk(jobs);
  }

  async scheduleEmail(data: EmailJobData, delay: number) {
    return this.emailQueue.add('send-email', data, {
      delay,
      attempts: 3,
    });
  }
}
