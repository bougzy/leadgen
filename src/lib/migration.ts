// One-time data migrations that run on server startup
// Each migration checks a flag in the 'system' collection before running

import { randomUUID } from 'crypto';
import * as db from './db-server';
import { getDb } from './mongodb';
import { encrypt } from './crypto';
import type { SmtpAccount, Account, LifecycleStage } from '@/types';
import { SMTP_PRESETS, statusToLifecycle, clientStatusToLifecycle, lifecycleToPipelineStage } from '@/types';

export async function runMigrations(): Promise<void> {
  await migrateSmtpToAccount();
  await migrateToUnifiedAccounts();
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

/**
 * V2 Migration: Merges `leads` + `client_sites` collections into unified `accounts` collection.
 * - Transforms Lead documents → Account (map name→businessName, email→contactEmail, status→lifecycleStage)
 * - Transforms ClientSite documents → Account (map status→lifecycleStage)
 * - Deduplicates by businessName+location (ClientSite data wins for overlapping fields)
 * - Renames foreign keys: leadId→accountId, clientSiteId→accountId across all collections
 * - Keeps old collections intact as backup
 */
async function migrateToUnifiedAccounts(): Promise<void> {
  try {
    const database = await getDb();
    const systemCol = database.collection<{ key: string; value: string }>('system');

    // Check if migration already ran
    const migrated = await systemCol.findOne({ key: 'v2_unified_accounts_done' });
    if (migrated) return;

    const now = new Date().toISOString();

    // 1. Read all leads
    const leadsCol = database.collection('leads');
    const leads = await leadsCol.find({}).toArray();

    // 2. Read all client_sites
    const clientSitesCol = database.collection('client_sites');
    const clientSites = await clientSitesCol.find({}).toArray();

    // If neither collection has data, skip migration
    if (leads.length === 0 && clientSites.length === 0) {
      console.log('[Migration V2] No leads or client_sites found — skipping');
      await systemCol.updateOne(
        { key: 'v2_unified_accounts_done' },
        { $set: { key: 'v2_unified_accounts_done', value: now } },
        { upsert: true },
      );
      return;
    }

    // 3. Transform leads → accounts
    const accountMap = new Map<string, Account>();

    for (const lead of leads) {
      const lifecycleStage = statusToLifecycle(lead.status || 'new');
      const account: Account = {
        id: lead.id || randomUUID(),
        businessName: lead.name || lead.businessName || '',
        contactName: lead.contactName || '',
        contactEmail: lead.email || lead.contactEmail || '',
        contactPhone: lead.phone || lead.contactPhone || '',
        industry: lead.industry || '',
        location: lead.location || '',
        address: lead.address || '',
        website: lead.website || '',
        socialMedia: lead.socialMedia,
        gbpUrl: lead.gbpUrl,
        gbpPlaceId: lead.gbpPlaceId,
        tags: lead.tags || [],
        leadScore: lead.leadScore || 0,
        lifecycleStage,
        pipelineStage: lead.pipelineStage || lifecycleToPipelineStage(lifecycleStage),
        unsubscribed: lead.unsubscribed,
        excludeFromSequences: lead.excludeFromSequences,
        lastContacted: lead.lastContacted,
        services: lead.services || [],
        serviceArea: lead.serviceArea || [],
        monthlyFee: lead.monthlyFee,
        contractStartDate: lead.contractStartDate,
        dealValue: lead.dealValue,
        notes: lead.notes || '',
        source: lead.source || 'manual',
        customData: lead.customData,
        dateAdded: lead.dateAdded || now,
        updatedAt: lead.updatedAt || now,
      };
      const key = `${(account.businessName || '').toLowerCase()}|${(account.location || '').toLowerCase()}`;
      accountMap.set(key, account);
    }

    // 4. Transform client_sites → accounts (merging into existing if duplicate)
    for (const cs of clientSites) {
      const lifecycleStage = clientStatusToLifecycle(cs.status || 'active');
      const key = `${(cs.businessName || '').toLowerCase()}|${(cs.location || '').toLowerCase()}`;
      const existing = accountMap.get(key);

      if (existing) {
        // Merge — client site data wins for overlapping fields
        existing.lifecycleStage = lifecycleStage;
        existing.pipelineStage = lifecycleToPipelineStage(lifecycleStage);
        existing.services = cs.services || existing.services;
        existing.serviceArea = cs.serviceArea || existing.serviceArea;
        existing.monthlyFee = cs.monthlyFee ?? existing.monthlyFee;
        existing.contractStartDate = cs.contractStartDate || existing.contractStartDate;
        existing.gbpUrl = cs.gbpUrl || existing.gbpUrl;
        existing.gbpPlaceId = cs.gbpPlaceId || existing.gbpPlaceId;
        existing.contactEmail = cs.contactEmail || existing.contactEmail;
        existing.contactPhone = cs.contactPhone || existing.contactPhone;
        existing.website = cs.website || existing.website;
        existing.updatedAt = now;
        // Also need to update all clientSiteId references to use the existing account's id
        await renameClientSiteReferences(database, cs.id, existing.id);
      } else {
        const account: Account = {
          id: cs.id || randomUUID(),
          businessName: cs.businessName || '',
          contactName: cs.contactName || '',
          contactEmail: cs.contactEmail || '',
          contactPhone: cs.contactPhone || '',
          industry: cs.industry || '',
          location: cs.location || '',
          address: cs.address || '',
          website: cs.website || '',
          socialMedia: cs.socialMedia,
          gbpUrl: cs.gbpUrl,
          gbpPlaceId: cs.gbpPlaceId,
          tags: cs.tags || [],
          leadScore: cs.leadScore || 50,
          lifecycleStage,
          pipelineStage: lifecycleToPipelineStage(lifecycleStage),
          services: cs.services || [],
          serviceArea: cs.serviceArea || [],
          monthlyFee: cs.monthlyFee,
          contractStartDate: cs.contractStartDate,
          notes: cs.notes || '',
          source: 'manual',
          dateAdded: cs.createdAt || cs.dateAdded || now,
          updatedAt: now,
        };
        accountMap.set(key, account);
      }
    }

    // 5. Write all accounts to the accounts collection
    const accounts = Array.from(accountMap.values());
    if (accounts.length > 0) {
      const accountsCol = database.collection('accounts');
      // Use ordered bulk write for idempotency
      const ops = accounts.map((a) => ({
        replaceOne: {
          filter: { id: a.id },
          replacement: a,
          upsert: true,
        },
      }));
      await accountsCol.bulkWrite(ops);
      console.log(`[Migration V2] Migrated ${accounts.length} accounts`);
    }

    // 6. Rename foreign keys in related collections
    const renameOps = [
      // leadId → accountId
      { collection: 'emails', from: 'leadId', to: 'accountId' },
      { collection: 'scheduled_emails', from: 'leadId', to: 'accountId' },
      { collection: 'unsubscribes', from: 'leadId', to: 'accountId' },
      { collection: 'activities', from: 'leadId', to: 'accountId' },
      { collection: 'notifications', from: 'leadId', to: 'accountId' },
      // leadIds → accountIds
      { collection: 'campaigns', from: 'leadIds', to: 'accountIds' },
      // matchedLeadId → matchedAccountId
      { collection: 'inbox_replies', from: 'matchedLeadId', to: 'matchedAccountId' },
      // clientSiteId → accountId for all client module collections
      { collection: 'gbp_audits', from: 'clientSiteId', to: 'accountId' },
      { collection: 'gbp_posts', from: 'clientSiteId', to: 'accountId' },
      { collection: 'review_requests', from: 'clientSiteId', to: 'accountId' },
      { collection: 'client_reviews', from: 'clientSiteId', to: 'accountId' },
      { collection: 'rank_keywords', from: 'clientSiteId', to: 'accountId' },
      { collection: 'competitors', from: 'clientSiteId', to: 'accountId' },
      { collection: 'citations', from: 'clientSiteId', to: 'accountId' },
      { collection: 'social_contents', from: 'clientSiteId', to: 'accountId' },
      { collection: 'referral_records', from: 'clientSiteId', to: 'accountId' },
      { collection: 'retention_reminders', from: 'clientSiteId', to: 'accountId' },
      { collection: 'client_customers', from: 'clientSiteId', to: 'accountId' },
      { collection: 'client_reports', from: 'clientSiteId', to: 'accountId' },
    ];

    for (const op of renameOps) {
      try {
        await database.collection(op.collection).updateMany(
          { [op.from]: { $exists: true } },
          { $rename: { [op.from]: op.to } },
        );
      } catch {
        // Collection may not exist — ignore
      }
    }

    // Also rename 'name' → 'businessName', 'email' → 'contactEmail', 'phone' → 'contactPhone'
    // in the accounts collection (for any directly-migrated lead data)
    // This is already handled above in the transformation step.

    console.log('[Migration V2] Foreign key renames complete');

    // 7. Mark migration as done
    await systemCol.updateOne(
      { key: 'v2_unified_accounts_done' },
      { $set: { key: 'v2_unified_accounts_done', value: now } },
      { upsert: true },
    );

    console.log('[Migration V2] Unified accounts migration complete');
  } catch (err) {
    console.error('[Migration V2] Error:', err);
  }
}

/**
 * When merging a ClientSite into an existing Account (deduplication),
 * update all references from the old clientSiteId to the account's id.
 */
async function renameClientSiteReferences(database: import('mongodb').Db, oldId: string, newId: string): Promise<void> {
  const collections = [
    'gbp_audits', 'gbp_posts', 'review_requests', 'client_reviews',
    'rank_keywords', 'competitors', 'citations', 'social_contents',
    'referral_records', 'retention_reminders', 'client_customers', 'client_reports',
  ];
  for (const col of collections) {
    try {
      await database.collection(col).updateMany(
        { $or: [{ clientSiteId: oldId }, { accountId: oldId }] },
        { $set: { accountId: newId } },
      );
    } catch {
      // ignore
    }
  }
}
