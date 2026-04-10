import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface SendEmailOptions {
  to: string;
  subject: string;
  template: string;
  context: Record<string, any>;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('mail.resendApiKey');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn('RESEND_API_KEY is not defined. Email service will not work properly.');
    }
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    if (!this.resend) {
      this.logger.error('Cannot send email: Resend client is not initialized');
      return;
    }

    try {
      const html = await this.renderTemplate(options.template, options.context);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { data, error } = await this.resend.emails.send({
        from: this.configService.get<string>('mail.from'),
        to: options.to,
        subject: options.subject,
        html,
      });

      if (error) {
        throw new Error(error.message);
      }

      this.logger.log(`Email sent successfully to ${options.to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}: ${error.message}`);
      throw error;
    }
  }

  async sendBulkEmails(emails: SendEmailOptions[]): Promise<void> {
    const promises = emails.map((email) => this.sendEmail(email));
    await Promise.allSettled(promises);
  }

  private async renderTemplate(
    templateName: string,
    context: Record<string, any>,
  ): Promise<string> {
    try {
      const templatePath = join(
        process.cwd(),
        'src',
        'modules',
        'mail',
        'templates',
        `${templateName}.hbs`,
      );
      const templateContent = readFileSync(templatePath, 'utf-8');
      const template = handlebars.compile(templateContent);
      return template(context);
    } catch (error) {
      this.logger.error(`Failed to render template ${templateName}: ${error.message}`);
      // Fallback to simple HTML
      return this.getDefaultTemplate(context);
    }
  }

  private getDefaultTemplate(context: Record<string, any>): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${context.subject || 'Email'}</title>
        </head>
        <body>
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            ${context.message || context.body || ''}
          </div>
        </body>
      </html>
    `;
  }

  async verifyConnection(): Promise<boolean> {
    if (this.resend) {
      return true; // We assume the instance is ready since it's HTTP based
    }
    return false;
  }
}
