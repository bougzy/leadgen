// Provider-agnostic SMTP transport factory with account rotation
// Supports Gmail, Zoho, Outlook, and any custom SMTP server

import nodemailer from 'nodemailer';
import type { SmtpAccount } from '@/types';
import { decrypt } from './crypto';

export function createTransport(account: SmtpAccount): nodemailer.Transporter {
  let password: string;
  try {
    password = decrypt(account.encryptedPassword);
  } catch (err) {
    throw new Error(`Failed to decrypt password for ${account.email}: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    auth: {
      user: account.username,
      pass: password,
    },
  });
}

/**
 * Pick the next account to send from using round-robin rotation.
 * Skips accounts that have hit their daily limit.
 * Prefers the account used least recently.
 */
export function pickNextAccount(accounts: SmtpAccount[]): SmtpAccount | null {
  const available = accounts
    .filter(a => a.isActive && a.sendCount < a.dailyLimit)
    .sort((a, b) => {
      const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
      const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
      return aTime - bTime;
    });

  return available[0] ?? null;
}
