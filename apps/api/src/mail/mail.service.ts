import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>("SMTP_HOST")?.trim();
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get<string>("SMTP_PORT") ?? "587"),
        secure: this.config.get<string>("SMTP_SECURE") === "1" || this.config.get<string>("SMTP_SECURE") === "true",
        auth: {
          user: this.config.get<string>("SMTP_USER") ?? "",
          pass: this.config.get<string>("SMTP_PASS") ?? "",
        },
      });
    }
  }

  isConfigured(): boolean {
    return this.transporter != null;
  }

  async sendMail(options: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    attachments?: Mail.Attachment[];
  }): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`Email would be sent to ${options.to}`);
      return;
    }
    const from =
      this.config.get<string>("SMTP_FROM") ??
      this.config.get<string>("SMTP_USER") ??
      "no-reply@localhost";
    await this.transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
    });
    this.logger.log(`Mail sent to ${options.to}: ${options.subject}`);
  }
}
