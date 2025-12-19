import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
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
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('mail.host'),
      port: this.configService.get<number>('mail.port'),
      secure: this.configService.get<boolean>('mail.secure'),
      auth: {
        user: this.configService.get<string>('mail.user'),
        pass: this.configService.get<string>('mail.password'),
      },
    });
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    try {
      const html = await this.renderTemplate(options.template, options.context);

      await this.transporter.sendMail({
        from: this.configService.get<string>('mail.from'),
        to: options.to,
        subject: options.subject,
        html,
      });

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
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      this.logger.error(`Mail connection verification failed: ${error.message}`);
      return false;
    }
  }
}
