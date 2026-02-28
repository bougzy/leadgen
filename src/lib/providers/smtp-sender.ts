// SMTP email sender provider implementation

import nodemailer from 'nodemailer';
import type { EmailSenderProvider, EmailMessage, SendResult } from './index';
import type { SmtpAccount } from '@/types';
import { createTransport } from '../smtp-transport';
import { decrypt } from '../crypto';

/** Provider that uses a configured SmtpAccount */
export class SmtpSenderProvider implements EmailSenderProvider {
  name = 'smtp';
  private account: SmtpAccount;

  constructor(account: SmtpAccount) {
    this.account = account;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const transporter = createTransport(this.account);
      const info = await transporter.sendMail({
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { success: true, messageId: info.messageId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}

/** Provider that uses legacy Gmail credentials from settings */
export class GmailLegacyProvider implements EmailSenderProvider {
  name = 'gmail-legacy';
  private email: string;
  private password: string;

  constructor(email: string, encryptedPassword: string) {
    this.email = email;
    let pass = encryptedPassword;
    try { pass = decrypt(encryptedPassword); } catch { /* may be plaintext */ }
    this.password = pass;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: this.email, pass: this.password },
      });
      const info = await transporter.sendMail({
        from: message.from || this.email,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { success: true, messageId: info.messageId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}
