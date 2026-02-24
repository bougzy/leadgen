// One-time data migrations that run on server startup
// Each migration checks a flag in the 'system' collection before running

import { randomUUID } from 'crypto';
import * as db from './db-server';
import { getDb } from './mongodb';
import { encrypt } from './crypto';
import type { SmtpAccount } from '@/types';
import { SMTP_PRESETS } from '@/types';

export async function runMigrations(): Promise<void> {
  await migrateSmtpToAccount();
}

/**
 * Migrates legacy settings.smtpEmail/smtpPassword to a proper SmtpAccount
 * with encrypted password and provider detection.
 */
async function migrateSmtpToAccount(): Promise<void> {
  try {
    const database = await getDb();
    const systemCol = database.collection<{ key: string; value: string }>('system');

    // Check if migration already ran
    const migrated = await systemCol.findOne({ key: 'smtp_migration_done' });
    if (migrated) return;

    const settings = await db.getSettings();
    if (settings.smtpEmail && settings.smtpPassword) {
      // Detect provider from email domain
      const domain = settings.smtpEmail.split('@')[1]?.toLowerCase() || '';
      let provider: 'gmail' | 'zoho' | 'outlook' | 'custom' = 'custom';
      if (domain === 'gmail.com') provider = 'gmail';
      else if (domain.includes('zoho')) provider = 'zoho';
      else if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com') provider = 'outlook';

      const preset = SMTP_PRESETS[provider];

      const account: SmtpAccount = {
        id: randomUUID(),
        label: `${provider.charAt(0).toUpperCase() + provider.slice(1)} (migrated)`,
        provider,
        email: settings.smtpEmail,
        smtpHost: preset.smtpHost || 'smtp.gmail.com',
        smtpPort: preset.smtpPort || 465,
        smtpSecure: preset.smtpSecure ?? true,
        username: settings.smtpEmail,
        encryptedPassword: encrypt(settings.smtpPassword),
        imapHost: preset.imapHost,
        imapPort: preset.imapPort,
        imapSecure: preset.imapSecure,
        dailyLimit: preset.dailyLimit || 500,
        isActive: true,
        sendCount: 0,
        createdAt: new Date().toISOString(),
      };

      await db.addSmtpAccount(account);
      console.log(`[Migration] Migrated SMTP account for ${settings.smtpEmail} (${provider})`);
    }

    // Mark migration as done
    await systemCol.updateOne(
      { key: 'smtp_migration_done' },
      { $set: { key: 'smtp_migration_done', value: new Date().toISOString() } },
      { upsert: true },
    );
  } catch (err) {
    console.error('[Migration] SMTP migration error:', err);
  }
}
