import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private mailEnabled(): boolean {
    const raw =
      this.config.get<string>('MAIL_ENABLED') ?? process.env.MAIL_ENABLED;
    const v = raw?.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }

  private fromAddress(): string | null {
    const from =
      this.config.get<string>('MAIL_FROM')?.trim() ??
      process.env.MAIL_FROM?.trim();
    return from && from.length > 0 ? from : null;
  }

  private buildTransport(): nodemailer.Transporter | null {
    const smtpUrl =
      this.config.get<string>('SMTP_URL')?.trim() ??
      process.env.SMTP_URL?.trim();
    if (smtpUrl) {
      return nodemailer.createTransport(smtpUrl);
    }
    const host =
      this.config.get<string>('SMTP_HOST')?.trim() ??
      process.env.SMTP_HOST?.trim();
    const portRaw =
      this.config.get<string>('SMTP_PORT')?.trim() ??
      process.env.SMTP_PORT?.trim();
    const user =
      this.config.get<string>('SMTP_USER')?.trim() ??
      process.env.SMTP_USER?.trim();
    const pass =
      this.config.get<string>('SMTP_PASS')?.trim() ??
      process.env.SMTP_PASS?.trim();
    if (!host || !user || !pass) {
      return null;
    }
    const port = portRaw ? Number(portRaw) : 587;
    const secure =
      (this.config.get<string>('SMTP_SECURE') ?? process.env.SMTP_SECURE) ===
      '1';
    return nodemailer.createTransport({
      host,
      port: Number.isFinite(port) ? port : 587,
      secure,
      auth: { user, pass },
    });
  }

  isConfigured(): boolean {
    if (!this.mailEnabled()) {
      return false;
    }
    if (!this.fromAddress()) {
      return false;
    }
    if (!this.transporter) {
      this.transporter = this.buildTransport();
    }
    return this.transporter !== null;
  }

  /**
   * Sends a plain-text email. Swallows errors (callers should not fail user flows).
   */
  async sendMail(input: {
    to: string[];
    subject: string;
    text: string;
  }): Promise<void> {
    if (!this.isConfigured() || !this.transporter) {
      return;
    }
    const from = this.fromAddress();
    if (!from) {
      return;
    }
    const to = [...new Set(input.to.map((e) => e.trim()).filter(Boolean))];
    if (to.length === 0) {
      return;
    }
    try {
      await this.transporter.sendMail({
        from,
        to: to.join(', '),
        subject: input.subject.slice(0, 200),
        text: input.text,
      });
    } catch (e: unknown) {
      this.log.warn(
        `sendMail failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
