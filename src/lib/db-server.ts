// SERVER-ONLY: This module must only be imported in Next.js API routes / server components.
// Do NOT import this file from client-side code.

import { getDb } from './mongodb';
import { encrypt, decrypt } from './crypto';
import type {
  Lead,
  Campaign,
  Email,
  EmailTemplate,
  UserSettings,
  ActivityItem,
  FollowUpSequence,
  ScheduledEmail,
  UnsubscribeRecord,
  SendLog,
  SmtpAccount,
  SearchCache,
  InboxReply,
  PaginatedResult,
  AppNotification,
} from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

// Projection to strip MongoDB's internal _id field from all results
const noId = { projection: { _id: 0 } };

// ============================================================
// Leads
// ============================================================

export async function getAllLeads(): Promise<Lead[]> {
  const db = await getDb();
  return db.collection<Lead>('leads').find({}, noId).toArray() as Promise<Lead[]>;
}

export async function getLead(id: string): Promise<Lead | undefined> {
  const db = await getDb();
  const doc = await db.collection<Lead>('leads').findOne({ id }, noId);
  return (doc as Lead) ?? undefined;
}

export async function addLead(lead: Lead): Promise<void> {
  const db = await getDb();
  await db.collection('leads').replaceOne(
    { id: lead.id },
    lead,
    { upsert: true },
  );
}

export async function updateLead(lead: Lead): Promise<void> {
  const db = await getDb();
  await db.collection('leads').replaceOne(
    { id: lead.id },
    lead,
    { upsert: true },
  );
}

export async function deleteLead(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('leads').deleteOne({ id });
}

export async function deleteLeads(ids: string[]): Promise<void> {
  const db = await getDb();
  await db.collection('leads').deleteMany({ id: { $in: ids } });
}

export async function findDuplicateLead(
  name: string,
  address: string,
): Promise<Lead | undefined> {
  const db = await getDb();
  const doc = await db.collection<Lead>('leads').findOne(
    {
      name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
      location: { $regex: new RegExp(`^${escapeRegex(address)}$`, 'i') },
    },
    noId,
  );
  return (doc as Lead) ?? undefined;
}

/** Escape special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// Campaigns
// ============================================================

export async function getAllCampaigns(): Promise<Campaign[]> {
  const db = await getDb();
  return db.collection<Campaign>('campaigns').find({}, noId).toArray() as Promise<Campaign[]>;
}

export async function getCampaign(id: string): Promise<Campaign | undefined> {
  const db = await getDb();
  const doc = await db.collection<Campaign>('campaigns').findOne({ id }, noId);
  return (doc as Campaign) ?? undefined;
}

export async function addCampaign(campaign: Campaign): Promise<void> {
  const db = await getDb();
  await db.collection('campaigns').replaceOne(
    { id: campaign.id },
    campaign,
    { upsert: true },
  );
}

export async function updateCampaign(campaign: Campaign): Promise<void> {
  const db = await getDb();
  await db.collection('campaigns').replaceOne(
    { id: campaign.id },
    campaign,
    { upsert: true },
  );
}

export async function deleteCampaign(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('campaigns').deleteOne({ id });
}

// ============================================================
// Emails
// ============================================================

export async function getAllEmails(): Promise<Email[]> {
  const db = await getDb();
  return db.collection<Email>('emails').find({}, noId).toArray() as Promise<Email[]>;
}

export async function getEmailsByLead(leadId: string): Promise<Email[]> {
  const db = await getDb();
  return db.collection<Email>('emails').find({ leadId }, noId).toArray() as Promise<Email[]>;
}

export async function getEmailsByCampaign(campaignId: string): Promise<Email[]> {
  const db = await getDb();
  return db.collection<Email>('emails').find({ campaignId }, noId).toArray() as Promise<Email[]>;
}

export async function addEmail(email: Email): Promise<void> {
  const db = await getDb();
  await db.collection('emails').replaceOne(
    { id: email.id },
    email,
    { upsert: true },
  );
}

export async function updateEmail(email: Email): Promise<void> {
  const db = await getDb();
  await db.collection('emails').replaceOne(
    { id: email.id },
    email,
    { upsert: true },
  );
}

// ============================================================
// Templates
// ============================================================

export async function getAllTemplates(): Promise<EmailTemplate[]> {
  const db = await getDb();
  return db.collection<EmailTemplate>('templates').find({}, noId).toArray() as Promise<EmailTemplate[]>;
}

export async function addTemplate(template: EmailTemplate): Promise<void> {
  const db = await getDb();
  await db.collection('templates').replaceOne(
    { id: template.id },
    template,
    { upsert: true },
  );
}

export async function updateTemplate(template: EmailTemplate): Promise<void> {
  const db = await getDb();
  await db.collection('templates').replaceOne(
    { id: template.id },
    template,
    { upsert: true },
  );
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('templates').deleteOne({ id });
}

export async function updateTemplateStats(
  templateId: string,
  field: 'sent' | 'opened' | 'responded',
): Promise<void> {
  const db = await getDb();
  await db.collection('templates').updateOne(
    { id: templateId },
    {
      $inc: { [`stats.${field}`]: 1 },
      $setOnInsert: {
        id: templateId,
        'stats.sent': field === 'sent' ? 0 : 0,
        'stats.opened': field === 'opened' ? 0 : 0,
        'stats.responded': field === 'responded' ? 0 : 0,
      },
    },
    { upsert: true },
  );
}

// ============================================================
// Settings
// ============================================================

export async function getSettings(): Promise<UserSettings> {
  const db = await getDb();
  const doc = await db
    .collection<UserSettings>('settings')
    .findOne({ id: 'user-settings' }, noId);
  return (doc as UserSettings) ?? { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  const toSave = { ...settings };
  // Encrypt legacy SMTP password before storing
  if (toSave.smtpPassword && !toSave.smtpPassword.match(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/)) {
    try { toSave.smtpPassword = encrypt(toSave.smtpPassword); } catch { /* leave as-is if ENCRYPTION_KEY not set */ }
  }
  const database = await getDb();
  await database.collection('settings').replaceOne(
    { id: 'user-settings' },
    toSave,
    { upsert: true },
  );
  // Clear warmup date tracker when warmup is disabled so re-enabling starts fresh
  if (!toSave.warmupEnabled) {
    await database.collection('system').deleteOne({ key: 'last_warmup_date' });
  }
}

// ============================================================
// Activities
// ============================================================

export async function getAllActivities(): Promise<ActivityItem[]> {
  const db = await getDb();
  return db
    .collection<ActivityItem>('activities')
    .find({}, noId)
    .sort({ timestamp: -1 })
    .toArray() as Promise<ActivityItem[]>;
}

export async function addActivity(activity: ActivityItem): Promise<void> {
  const db = await getDb();
  await db.collection('activities').replaceOne(
    { id: activity.id },
    activity,
    { upsert: true },
  );
}

// ============================================================
// Scheduled Emails
// ============================================================

export async function getScheduledEmails(): Promise<ScheduledEmail[]> {
  const db = await getDb();
  return db
    .collection<ScheduledEmail>('scheduled_emails')
    .find({}, noId)
    .toArray() as Promise<ScheduledEmail[]>;
}

export async function addScheduledEmail(
  scheduledEmail: ScheduledEmail,
): Promise<void> {
  const db = await getDb();
  await db.collection('scheduled_emails').replaceOne(
    { id: scheduledEmail.id },
    scheduledEmail,
    { upsert: true },
  );
}

export async function updateScheduledEmail(
  scheduledEmail: ScheduledEmail,
): Promise<void> {
  const db = await getDb();
  await db.collection('scheduled_emails').replaceOne(
    { id: scheduledEmail.id },
    scheduledEmail,
    { upsert: true },
  );
}

export async function getScheduledByStatus(
  status: string,
): Promise<ScheduledEmail[]> {
  const db = await getDb();
  return db
    .collection('scheduled_emails')
    .find({ status }, noId)
    .toArray() as unknown as Promise<ScheduledEmail[]>;
}

// ============================================================
// Follow-Up Sequences
// ============================================================

export async function getAllSequences(): Promise<FollowUpSequence[]> {
  const db = await getDb();
  return db
    .collection<FollowUpSequence>('sequences')
    .find({}, noId)
    .toArray() as Promise<FollowUpSequence[]>;
}

export async function addSequence(sequence: FollowUpSequence): Promise<void> {
  const db = await getDb();
  await db.collection('sequences').replaceOne(
    { id: sequence.id },
    sequence,
    { upsert: true },
  );
}

export async function updateSequence(sequence: FollowUpSequence): Promise<void> {
  const db = await getDb();
  await db.collection('sequences').replaceOne(
    { id: sequence.id },
    sequence,
    { upsert: true },
  );
}

export async function deleteSequence(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('sequences').deleteOne({ id });
}

// ============================================================
// Unsubscribes
// ============================================================

export async function getAllUnsubscribes(): Promise<UnsubscribeRecord[]> {
  const db = await getDb();
  return db
    .collection<UnsubscribeRecord>('unsubscribes')
    .find({}, noId)
    .toArray() as Promise<UnsubscribeRecord[]>;
}

export async function addUnsubscribe(record: UnsubscribeRecord): Promise<void> {
  const db = await getDb();
  await db.collection('unsubscribes').replaceOne(
    { id: record.id },
    record,
    { upsert: true },
  );
}

export async function isEmailUnsubscribed(email: string): Promise<boolean> {
  const db = await getDb();
  const doc = await db
    .collection('unsubscribes')
    .findOne({ email }, { projection: { _id: 1 } });
  return doc !== null;
}

// ============================================================
// Send Logs
// ============================================================

export async function getSendLog(date: string): Promise<SendLog | undefined> {
  const db = await getDb();
  const doc = await db
    .collection<SendLog>('send_logs')
    .findOne({ date }, noId);
  return (doc as SendLog) ?? undefined;
}

export async function incrementSendLog(date: string): Promise<void> {
  const db = await getDb();
  await db.collection('send_logs').updateOne(
    { date },
    {
      $inc: { count: 1 },
      $setOnInsert: { id: date, date },
    },
    { upsert: true },
  );
}

export async function getTodaySendCount(): Promise<number> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const log = await getSendLog(today);
  return log?.count ?? 0;
}

// ============================================================
// SMTP Accounts
// ============================================================

export async function getAllSmtpAccounts(): Promise<SmtpAccount[]> {
  const db = await getDb();
  return db.collection<SmtpAccount>('smtp_accounts').find({}, noId).toArray() as Promise<SmtpAccount[]>;
}

export async function getSmtpAccount(id: string): Promise<SmtpAccount | undefined> {
  const db = await getDb();
  const doc = await db.collection<SmtpAccount>('smtp_accounts').findOne({ id }, noId);
  return (doc as SmtpAccount) ?? undefined;
}

export async function addSmtpAccount(account: SmtpAccount): Promise<void> {
  const db = await getDb();
  await db.collection('smtp_accounts').replaceOne(
    { id: account.id },
    account,
    { upsert: true },
  );
}

export async function updateSmtpAccount(account: SmtpAccount): Promise<void> {
  const db = await getDb();
  await db.collection('smtp_accounts').replaceOne(
    { id: account.id },
    account,
    { upsert: true },
  );
}

export async function deleteSmtpAccount(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('smtp_accounts').deleteOne({ id });
}

export async function getActiveSmtpAccounts(): Promise<SmtpAccount[]> {
  const db = await getDb();
  return db.collection<SmtpAccount>('smtp_accounts').find({ isActive: true }, noId).toArray() as Promise<SmtpAccount[]>;
}

export async function resetDailySmtpCounts(): Promise<void> {
  const db = await getDb();
  await db.collection('smtp_accounts').updateMany({}, { $set: { sendCount: 0 } });
}

// ============================================================
// Search Cache
// ============================================================

export async function getSearchCache(query: string, location: string): Promise<SearchCache | undefined> {
  const db = await getDb();
  const doc = await db.collection<SearchCache>('search_cache').findOne(
    {
      query: query.toLowerCase(),
      location: location.toLowerCase(),
      expiresAt: { $gt: new Date().toISOString() },
    },
    noId,
  );
  return (doc as SearchCache) ?? undefined;
}

export async function setSearchCache(cache: SearchCache): Promise<void> {
  const db = await getDb();
  await db.collection('search_cache').replaceOne(
    { id: cache.id },
    cache,
    { upsert: true },
  );
}

// ============================================================
// Inbox Replies
// ============================================================

export async function getAllInboxReplies(): Promise<InboxReply[]> {
  const db = await getDb();
  return db.collection<InboxReply>('inbox_replies')
    .find({}, noId)
    .sort({ receivedAt: -1 })
    .toArray() as Promise<InboxReply[]>;
}

export async function addInboxReply(reply: InboxReply): Promise<void> {
  const db = await getDb();
  await db.collection('inbox_replies').replaceOne(
    { id: reply.id },
    reply,
    { upsert: true },
  );
}

export async function updateInboxReply(reply: InboxReply): Promise<void> {
  const db = await getDb();
  await db.collection('inbox_replies').replaceOne(
    { id: reply.id },
    reply,
    { upsert: true },
  );
}

export async function getInboxReplyByMessageId(messageId: string): Promise<InboxReply | undefined> {
  const db = await getDb();
  const doc = await db.collection<InboxReply>('inbox_replies').findOne({ messageId }, noId);
  return (doc as InboxReply) ?? undefined;
}

// ============================================================
// Paginated Queries
// ============================================================

export async function getLeadsPaginated(
  page: number,
  pageSize: number,
  filters?: { status?: string; industry?: string; search?: string },
  sort?: { field: string; direction: 'asc' | 'desc' },
): Promise<PaginatedResult<Lead>> {
  const db = await getDb();
  const filter: Record<string, unknown> = {};

  if (filters?.status) {
    filter.status = filters.status;
  }
  if (filters?.industry) {
    filter.industry = filters.industry;
  }
  if (filters?.search) {
    const regex = { $regex: new RegExp(escapeRegex(filters.search), 'i') };
    filter.$or = [
      { name: regex },
      { email: regex },
      { contactName: regex },
      { location: regex },
      { industry: regex },
    ];
  }

  const sortField = sort?.field || 'dateAdded';
  const sortDirection = sort?.direction === 'asc' ? 1 : -1;

  const total = await db.collection<Lead>('leads').countDocuments(filter);
  const totalPages = Math.ceil(total / pageSize);
  const skip = (page - 1) * pageSize;

  const data = await db
    .collection<Lead>('leads')
    .find(filter, noId)
    .sort({ [sortField]: sortDirection })
    .skip(skip)
    .limit(pageSize)
    .toArray() as Lead[];

  return { data, total, page, pageSize, totalPages };
}

export async function getEmailsPaginated(
  page: number,
  pageSize: number,
  filters?: { status?: string; leadId?: string; search?: string },
): Promise<PaginatedResult<Email>> {
  const db = await getDb();
  const filter: Record<string, unknown> = {};

  if (filters?.status) {
    filter.status = filters.status;
  }
  if (filters?.leadId) {
    filter.leadId = filters.leadId;
  }
  if (filters?.search) {
    const regex = { $regex: new RegExp(escapeRegex(filters.search), 'i') };
    filter.$or = [
      { subject: regex },
      { body: regex },
    ];
  }

  const total = await db.collection<Email>('emails').countDocuments(filter);
  const totalPages = Math.ceil(total / pageSize);
  const skip = (page - 1) * pageSize;

  const data = await db
    .collection<Email>('emails')
    .find(filter, noId)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .toArray() as Email[];

  return { data, total, page, pageSize, totalPages };
}

export async function getScheduledEmailsPaginated(
  page: number,
  pageSize: number,
  filters?: { status?: string },
): Promise<PaginatedResult<ScheduledEmail>> {
  const db = await getDb();
  const filter: Record<string, unknown> = {};

  if (filters?.status) {
    filter.status = filters.status;
  }

  const total = await db.collection<ScheduledEmail>('scheduled_emails').countDocuments(filter);
  const totalPages = Math.ceil(total / pageSize);
  const skip = (page - 1) * pageSize;

  const data = await db
    .collection<ScheduledEmail>('scheduled_emails')
    .find(filter, noId)
    .sort({ scheduledAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .toArray() as ScheduledEmail[];

  return { data, total, page, pageSize, totalPages };
}

export async function getInboxRepliesPaginated(
  page: number,
  pageSize: number,
  filters?: { isRead?: boolean; category?: string },
): Promise<PaginatedResult<InboxReply>> {
  const db = await getDb();
  const filter: Record<string, unknown> = {};

  if (filters?.isRead !== undefined) {
    filter.isRead = filters.isRead;
  }
  if (filters?.category) {
    filter.replyCategory = filters.category;
  }

  const total = await db.collection<InboxReply>('inbox_replies').countDocuments(filter);
  const totalPages = Math.ceil(total / pageSize);
  const skip = (page - 1) * pageSize;

  const data = await db
    .collection<InboxReply>('inbox_replies')
    .find(filter, noId)
    .sort({ receivedAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .toArray() as InboxReply[];

  return { data, total, page, pageSize, totalPages };
}

// ============================================================
// Notifications
// ============================================================

export async function getNotifications(): Promise<AppNotification[]> {
  const db = await getDb();
  return db
    .collection<AppNotification>('notifications')
    .find({}, noId)
    .sort({ createdAt: -1 })
    .toArray() as Promise<AppNotification[]>;
}

export async function addNotification(notification: AppNotification): Promise<void> {
  const db = await getDb();
  await db.collection('notifications').replaceOne(
    { id: notification.id },
    notification,
    { upsert: true },
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('notifications').updateOne(
    { id },
    { $set: { isRead: true } },
  );
}

export async function markAllNotificationsRead(): Promise<void> {
  const db = await getDb();
  await db.collection('notifications').updateMany(
    { isRead: false },
    { $set: { isRead: true } },
  );
}

export async function getUnreadNotificationCount(): Promise<number> {
  const db = await getDb();
  return db.collection('notifications').countDocuments({ isRead: false });
}

// ============================================================
// Data Management
// ============================================================

const ALL_COLLECTIONS = [
  'leads',
  'campaigns',
  'emails',
  'templates',
  'settings',
  'activities',
  'scheduled_emails',
  'sequences',
  'unsubscribes',
  'send_logs',
  'smtp_accounts',
  'search_cache',
  'inbox_replies',
  'notifications',
] as const;

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  await Promise.all(
    ALL_COLLECTIONS.map((col) =>
      db.collection(col).drop().catch(() => {
        // Collection may not exist — ignore
      }),
    ),
  );
}

export async function exportAllData(): Promise<Record<string, unknown[]>> {
  const db = await getDb();
  const result: Record<string, unknown[]> = {};
  await Promise.all(
    ALL_COLLECTIONS.map(async (col) => {
      result[col] = await db.collection(col).find({}, noId).toArray();
    }),
  );
  return result;
}

export async function importAllData(
  data: Record<string, unknown[]>,
): Promise<void> {
  const db = await getDb();
  await Promise.all(
    ALL_COLLECTIONS.map(async (col) => {
      const items = data[col];
      if (Array.isArray(items) && items.length > 0) {
        await db.collection(col).insertMany(items as Record<string, unknown>[]);
      }
    }),
  );
}
