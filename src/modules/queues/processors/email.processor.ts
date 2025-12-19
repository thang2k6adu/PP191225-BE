import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { EmailJobData } from '../email.queue';
import { MailService } from '../../mail/mail.service';

@Processor('email')
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private mailService: MailService) {}

  @Process('send-email')
  async handleSendEmail(job: Job<EmailJobData>) {
    this.logger.log(`Processing email job ${job.id} to ${job.data.to}`);

    try {
      await this.mailService.sendEmail({
        to: job.data.to,
        subject: job.data.subject,
        template: job.data.template,
        context: job.data.context,
      });

      this.logger.log(`Email sent successfully to ${job.data.to}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to send email to ${job.data.to}: ${error.message}`);
      throw error;
    }
  }
}
