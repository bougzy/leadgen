// SERVER-ONLY: This module must only be imported in Next.js API routes / server components.
// Do NOT import this file from client-side code.

import { getDb } from './mongodb';
import { encrypt, decrypt } from './crypto';
import type {
  Account,
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
  GbpAudit,
  GbpPost,
  GbpPostTemplate,
  ReviewRequest,
  ClientReview,
  RankKeyword,
  Competitor,
  Citation,
  SocialContent,
  SocialContentTemplate,
  ReferralRecord,
  RetentionReminder,
  ClientCustomer,
  ClientReport,
  AutomationTask,
  EventLogEntry,
  LifecycleStage,
} from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

// Projection to strip MongoDB's internal _id field from all results
const noId = { projection: { _id: 0 } };

// ============================================================
// Accounts (unified — replaces Leads + ClientSites)
// ============================================================

export async function getAllAccounts(): Promise<Account[]> {
  const db = await getDb();
  return db.collection<Account>('accounts').find({ deletedAt: { $exists: false } }, noId).toArray() as Promise<Account[]>;
}

export async function getAccount(id: string): Promise<Account | undefined> {
  const db = await getDb();
  const doc = await db.collection<Account>('accounts').findOne({ id }, noId);
  return (doc as Account) ?? undefined;
}

export async function addAccount(account: Account): Promise<void> {
  const db = await getDb();
  await db.collection('accounts').replaceOne(
    { id: account.id },
    account,
    { upsert: true },
  );
}

export async function updateAccount(account: Account): Promise<void> {
  const db = await getDb();
  await db.collection('accounts').replaceOne(
    { id: account.id },
    account,
    { upsert: true },
  );
}

export async function deleteAccount(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('accounts').deleteOne({ id });
}

export async function deleteAccounts(ids: string[]): Promise<void> {
  const db = await getDb();
  await db.collection('accounts').deleteMany({ id: { $in: ids } });
}

export async function softDeleteAccount(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('accounts').updateOne(
    { id },
    { $set: { deletedAt: new Date().toISOString() } },
  );
}

export async function findDuplicateAccount(
  name: string,
  address: string,
): Promise<Account | undefined> {
  const db = await getDb();
  const doc = await db.collection<Account>('accounts').findOne(
    {
      businessName: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
      location: { $regex: new RegExp(`^${escapeRegex(address)}$`, 'i') },
    },
    noId,
  );
  return (doc as Account) ?? undefined;
}

export async function getAccountsByStages(stages: LifecycleStage[]): Promise<Account[]> {
  const db = await getDb();
  return db.collection<Account>('accounts').find({
    lifecycleStage: { $in: stages },
    deletedAt: { $exists: false },
  }, noId).toArray() as Promise<Account[]>;
}

/** Escape special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Backward compat aliases
/** @deprecated Use getAllAccounts */
export const getAllLeads = getAllAccounts;
/** @deprecated Use getAccount */
export const getLead = getAccount;
/** @deprecated Use addAccount */
export const addLead = addAccount;
/** @deprecated Use updateAccount */
export const updateLead = updateAccount;
/** @deprecated Use deleteAccount */
export const deleteLead = deleteAccount;
/** @deprecated Use deleteAccounts */
export const deleteLeads = deleteAccounts;
/** @deprecated Use findDuplicateAccount */
export const findDuplicateLead = findDuplicateAccount;
/** @deprecated Use getAllAccounts */
export const getAllClientSites = getAllAccounts;
/** @deprecated Use getAccount */
export const getClientSite = getAccount;
/** @deprecated Use addAccount */
export const addClientSite = addAccount;
/** @deprecated Use updateAccount */
export const updateClientSite = updateAccount;
/** @deprecated Use deleteAccount */
export const deleteClientSite = deleteAccount;

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

export async function getEmailsByAccount(accountId: string): Promise<Email[]> {
  const db = await getDb();
  return db.collection<Email>('emails').find({ accountId }, noId).toArray() as Promise<Email[]>;
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

/** @deprecated Use getEmailsByAccount */
export const getEmailsByLead = getEmailsByAccount;

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

export async function getAccountsPaginated(
  page: number,
  pageSize: number,
  filters?: { status?: string; industry?: string; search?: string; lifecycleStage?: string },
  sort?: { field: string; direction: 'asc' | 'desc' },
): Promise<PaginatedResult<Account>> {
  const db = await getDb();
  const filter: Record<string, unknown> = { deletedAt: { $exists: false } };

  if (filters?.lifecycleStage) {
    filter.lifecycleStage = filters.lifecycleStage;
  }
  if (filters?.status) {
    // backward compat: map old status to lifecycleStage
    filter.lifecycleStage = filters.status;
  }
  if (filters?.industry) {
    filter.industry = filters.industry;
  }
  if (filters?.search) {
    const regex = { $regex: new RegExp(escapeRegex(filters.search), 'i') };
    filter.$or = [
      { businessName: regex },
      { contactEmail: regex },
      { contactName: regex },
      { location: regex },
      { industry: regex },
    ];
  }

  const sortField = sort?.field || 'dateAdded';
  const sortDirection = sort?.direction === 'asc' ? 1 : -1;

  const total = await db.collection<Account>('accounts').countDocuments(filter);
  const totalPages = Math.ceil(total / pageSize);
  const skip = (page - 1) * pageSize;

  const data = await db
    .collection<Account>('accounts')
    .find(filter, noId)
    .sort({ [sortField]: sortDirection })
    .skip(skip)
    .limit(pageSize)
    .toArray() as Account[];

  return { data, total, page, pageSize, totalPages };
}

/** @deprecated Use getAccountsPaginated */
export const getLeadsPaginated = getAccountsPaginated;

export async function getEmailsPaginated(
  page: number,
  pageSize: number,
  filters?: { status?: string; accountId?: string; leadId?: string; search?: string },
): Promise<PaginatedResult<Email>> {
  const db = await getDb();
  const filter: Record<string, unknown> = {};

  if (filters?.status) {
    filter.status = filters.status;
  }
  if (filters?.accountId || filters?.leadId) {
    filter.accountId = filters.accountId || filters.leadId;
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
// GBP Audits
// ============================================================

export async function getGbpAuditsByAccount(accountId: string): Promise<GbpAudit[]> {
  const db = await getDb();
  return db.collection<GbpAudit>('gbp_audits').find({ accountId }, noId).sort({ createdAt: -1 }).toArray() as Promise<GbpAudit[]>;
}

export async function getLatestGbpAudit(accountId: string): Promise<GbpAudit | undefined> {
  const db = await getDb();
  const doc = await db.collection<GbpAudit>('gbp_audits').findOne({ accountId }, { ...noId, sort: { createdAt: -1 } });
  return (doc as GbpAudit) ?? undefined;
}

export async function addGbpAudit(audit: GbpAudit): Promise<void> {
  const db = await getDb();
  await db.collection('gbp_audits').replaceOne({ id: audit.id }, audit, { upsert: true });
}

export async function updateGbpAudit(audit: GbpAudit): Promise<void> {
  const db = await getDb();
  await db.collection('gbp_audits').replaceOne({ id: audit.id }, audit, { upsert: true });
}

export async function deleteGbpAudit(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('gbp_audits').deleteOne({ id });
}

/** @deprecated Use getGbpAuditsByAccount */
export const getGbpAuditsByClient = getGbpAuditsByAccount;

// ============================================================
// GBP Posts
// ============================================================

export async function getGbpPostsByAccount(accountId: string): Promise<GbpPost[]> {
  const db = await getDb();
  return db.collection<GbpPost>('gbp_posts').find({ accountId }, noId).sort({ scheduledDate: -1 }).toArray() as Promise<GbpPost[]>;
}

export async function addGbpPost(post: GbpPost): Promise<void> {
  const db = await getDb();
  await db.collection('gbp_posts').replaceOne({ id: post.id }, post, { upsert: true });
}

export async function updateGbpPost(post: GbpPost): Promise<void> {
  const db = await getDb();
  await db.collection('gbp_posts').replaceOne({ id: post.id }, post, { upsert: true });
}

export async function deleteGbpPost(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('gbp_posts').deleteOne({ id });
}

export async function getGbpPostsByDateRange(accountId: string, startDate: string, endDate: string): Promise<GbpPost[]> {
  const db = await getDb();
  return db.collection<GbpPost>('gbp_posts').find({
    accountId,
    scheduledDate: { $gte: startDate, $lte: endDate },
  }, noId).sort({ scheduledDate: 1 }).toArray() as Promise<GbpPost[]>;
}

/** @deprecated Use getGbpPostsByAccount */
export const getGbpPostsByClient = getGbpPostsByAccount;

// ============================================================
// GBP Post Templates
// ============================================================

export async function getAllGbpPostTemplates(): Promise<GbpPostTemplate[]> {
  const db = await getDb();
  return db.collection<GbpPostTemplate>('gbp_post_templates').find({}, noId).toArray() as Promise<GbpPostTemplate[]>;
}

export async function addGbpPostTemplate(template: GbpPostTemplate): Promise<void> {
  const db = await getDb();
  await db.collection('gbp_post_templates').replaceOne({ id: template.id }, template, { upsert: true });
}

export async function updateGbpPostTemplate(template: GbpPostTemplate): Promise<void> {
  const db = await getDb();
  await db.collection('gbp_post_templates').replaceOne({ id: template.id }, template, { upsert: true });
}

export async function deleteGbpPostTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('gbp_post_templates').deleteOne({ id });
}

// ============================================================
// Review Requests
// ============================================================

export async function getReviewRequestsByAccount(accountId: string): Promise<ReviewRequest[]> {
  const db = await getDb();
  return db.collection<ReviewRequest>('review_requests').find({ accountId }, noId).sort({ createdAt: -1 }).toArray() as Promise<ReviewRequest[]>;
}

export async function addReviewRequest(request: ReviewRequest): Promise<void> {
  const db = await getDb();
  await db.collection('review_requests').replaceOne({ id: request.id }, request, { upsert: true });
}

export async function updateReviewRequest(request: ReviewRequest): Promise<void> {
  const db = await getDb();
  await db.collection('review_requests').replaceOne({ id: request.id }, request, { upsert: true });
}

export async function deleteReviewRequest(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('review_requests').deleteOne({ id });
}

export async function getPendingReviewRequests(): Promise<ReviewRequest[]> {
  const db = await getDb();
  return db.collection<ReviewRequest>('review_requests').find({
    status: { $in: ['pending', 'initial_sent'] },
  }, noId).toArray() as Promise<ReviewRequest[]>;
}

/** @deprecated Use getReviewRequestsByAccount */
export const getReviewRequestsByClient = getReviewRequestsByAccount;

// ============================================================
// Client Reviews
// ============================================================

export async function getClientReviewsByAccount(accountId: string): Promise<ClientReview[]> {
  const db = await getDb();
  return db.collection<ClientReview>('client_reviews').find({ accountId }, noId).sort({ reviewDate: -1 }).toArray() as Promise<ClientReview[]>;
}

export async function addClientReview(review: ClientReview): Promise<void> {
  const db = await getDb();
  await db.collection('client_reviews').replaceOne({ id: review.id }, review, { upsert: true });
}

export async function updateClientReview(review: ClientReview): Promise<void> {
  const db = await getDb();
  await db.collection('client_reviews').replaceOne({ id: review.id }, review, { upsert: true });
}

export async function deleteClientReview(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('client_reviews').deleteOne({ id });
}

export async function getNegativeReviewsByAccount(accountId: string): Promise<ClientReview[]> {
  const db = await getDb();
  return db.collection<ClientReview>('client_reviews').find({ accountId, isNegative: true }, noId).sort({ reviewDate: -1 }).toArray() as Promise<ClientReview[]>;
}

/** @deprecated Use getClientReviewsByAccount */
export const getClientReviewsByClient = getClientReviewsByAccount;
/** @deprecated Use getNegativeReviewsByAccount */
export const getNegativeReviewsByClient = getNegativeReviewsByAccount;

// ============================================================
// Rank Keywords
// ============================================================

export async function getRankKeywordsByAccount(accountId: string): Promise<RankKeyword[]> {
  const db = await getDb();
  return db.collection<RankKeyword>('rank_keywords').find({ accountId }, noId).toArray() as Promise<RankKeyword[]>;
}

export async function addRankKeyword(keyword: RankKeyword): Promise<void> {
  const db = await getDb();
  await db.collection('rank_keywords').replaceOne({ id: keyword.id }, keyword, { upsert: true });
}

export async function updateRankKeyword(keyword: RankKeyword): Promise<void> {
  const db = await getDb();
  await db.collection('rank_keywords').replaceOne({ id: keyword.id }, keyword, { upsert: true });
}

export async function deleteRankKeyword(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('rank_keywords').deleteOne({ id });
}

/** @deprecated Use getRankKeywordsByAccount */
export const getRankKeywordsByClient = getRankKeywordsByAccount;

// ============================================================
// Competitors
// ============================================================

export async function getCompetitorsByAccount(accountId: string): Promise<Competitor[]> {
  const db = await getDb();
  return db.collection<Competitor>('competitors').find({ accountId }, noId).toArray() as Promise<Competitor[]>;
}

export async function addCompetitor(competitor: Competitor): Promise<void> {
  const db = await getDb();
  await db.collection('competitors').replaceOne({ id: competitor.id }, competitor, { upsert: true });
}

export async function updateCompetitor(competitor: Competitor): Promise<void> {
  const db = await getDb();
  await db.collection('competitors').replaceOne({ id: competitor.id }, competitor, { upsert: true });
}

export async function deleteCompetitor(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('competitors').deleteOne({ id });
}

/** @deprecated Use getCompetitorsByAccount */
export const getCompetitorsByClient = getCompetitorsByAccount;

// ============================================================
// Citations
// ============================================================

export async function getCitationsByAccount(accountId: string): Promise<Citation[]> {
  const db = await getDb();
  return db.collection<Citation>('citations').find({ accountId }, noId).toArray() as Promise<Citation[]>;
}

export async function addCitation(citation: Citation): Promise<void> {
  const db = await getDb();
  await db.collection('citations').replaceOne({ id: citation.id }, citation, { upsert: true });
}

export async function updateCitation(citation: Citation): Promise<void> {
  const db = await getDb();
  await db.collection('citations').replaceOne({ id: citation.id }, citation, { upsert: true });
}

export async function deleteCitation(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('citations').deleteOne({ id });
}

/** @deprecated Use getCitationsByAccount */
export const getCitationsByClient = getCitationsByAccount;

// ============================================================
// Social Content
// ============================================================

export async function getSocialContentsByAccount(accountId: string): Promise<SocialContent[]> {
  const db = await getDb();
  return db.collection<SocialContent>('social_contents').find({ accountId }, noId).sort({ scheduledDate: -1 }).toArray() as Promise<SocialContent[]>;
}

export async function addSocialContent(content: SocialContent): Promise<void> {
  const db = await getDb();
  await db.collection('social_contents').replaceOne({ id: content.id }, content, { upsert: true });
}

export async function updateSocialContent(content: SocialContent): Promise<void> {
  const db = await getDb();
  await db.collection('social_contents').replaceOne({ id: content.id }, content, { upsert: true });
}

export async function deleteSocialContent(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('social_contents').deleteOne({ id });
}

export async function getSocialContentsByDateRange(accountId: string, startDate: string, endDate: string): Promise<SocialContent[]> {
  const db = await getDb();
  return db.collection<SocialContent>('social_contents').find({
    accountId,
    scheduledDate: { $gte: startDate, $lte: endDate },
  }, noId).sort({ scheduledDate: 1 }).toArray() as Promise<SocialContent[]>;
}

/** @deprecated Use getSocialContentsByAccount */
export const getSocialContentsByClient = getSocialContentsByAccount;

// ============================================================
// Social Content Templates
// ============================================================

export async function getAllSocialContentTemplates(): Promise<SocialContentTemplate[]> {
  const db = await getDb();
  return db.collection<SocialContentTemplate>('social_content_templates').find({}, noId).toArray() as Promise<SocialContentTemplate[]>;
}

export async function addSocialContentTemplate(template: SocialContentTemplate): Promise<void> {
  const db = await getDb();
  await db.collection('social_content_templates').replaceOne({ id: template.id }, template, { upsert: true });
}

export async function updateSocialContentTemplate(template: SocialContentTemplate): Promise<void> {
  const db = await getDb();
  await db.collection('social_content_templates').replaceOne({ id: template.id }, template, { upsert: true });
}

export async function deleteSocialContentTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('social_content_templates').deleteOne({ id });
}

// ============================================================
// Referral Records
// ============================================================

export async function getReferralsByAccount(accountId: string): Promise<ReferralRecord[]> {
  const db = await getDb();
  return db.collection<ReferralRecord>('referral_records').find({ accountId }, noId).sort({ createdAt: -1 }).toArray() as Promise<ReferralRecord[]>;
}

export async function addReferralRecord(record: ReferralRecord): Promise<void> {
  const db = await getDb();
  await db.collection('referral_records').replaceOne({ id: record.id }, record, { upsert: true });
}

export async function updateReferralRecord(record: ReferralRecord): Promise<void> {
  const db = await getDb();
  await db.collection('referral_records').replaceOne({ id: record.id }, record, { upsert: true });
}

export async function deleteReferralRecord(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('referral_records').deleteOne({ id });
}

export async function getReferralByCode(referralCode: string): Promise<ReferralRecord | undefined> {
  const db = await getDb();
  const doc = await db.collection<ReferralRecord>('referral_records').findOne({ referralCode }, noId);
  return (doc as ReferralRecord) ?? undefined;
}

/** @deprecated Use getReferralsByAccount */
export const getReferralsByClient = getReferralsByAccount;

// ============================================================
// Retention Reminders
// ============================================================

export async function getRetentionRemindersByAccount(accountId: string): Promise<RetentionReminder[]> {
  const db = await getDb();
  return db.collection<RetentionReminder>('retention_reminders').find({ accountId }, noId).sort({ scheduledDate: -1 }).toArray() as Promise<RetentionReminder[]>;
}

export async function addRetentionReminder(reminder: RetentionReminder): Promise<void> {
  const db = await getDb();
  await db.collection('retention_reminders').replaceOne({ id: reminder.id }, reminder, { upsert: true });
}

export async function updateRetentionReminder(reminder: RetentionReminder): Promise<void> {
  const db = await getDb();
  await db.collection('retention_reminders').replaceOne({ id: reminder.id }, reminder, { upsert: true });
}

export async function deleteRetentionReminder(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('retention_reminders').deleteOne({ id });
}

export async function getPendingRetentionReminders(): Promise<RetentionReminder[]> {
  const db = await getDb();
  return db.collection<RetentionReminder>('retention_reminders').find({
    status: 'pending',
    scheduledDate: { $lte: new Date().toISOString() },
  }, noId).toArray() as Promise<RetentionReminder[]>;
}

/** @deprecated Use getRetentionRemindersByAccount */
export const getRetentionRemindersByClient = getRetentionRemindersByAccount;

// ============================================================
// Client Customers
// ============================================================

export async function getClientCustomersByAccount(accountId: string): Promise<ClientCustomer[]> {
  const db = await getDb();
  return db.collection<ClientCustomer>('client_customers').find({ accountId }, noId).sort({ updatedAt: -1 }).toArray() as Promise<ClientCustomer[]>;
}

export async function getClientCustomer(id: string): Promise<ClientCustomer | undefined> {
  const db = await getDb();
  const doc = await db.collection<ClientCustomer>('client_customers').findOne({ id }, noId);
  return (doc as ClientCustomer) ?? undefined;
}

export async function addClientCustomer(customer: ClientCustomer): Promise<void> {
  const db = await getDb();
  await db.collection('client_customers').replaceOne({ id: customer.id }, customer, { upsert: true });
}

export async function updateClientCustomer(customer: ClientCustomer): Promise<void> {
  const db = await getDb();
  await db.collection('client_customers').replaceOne({ id: customer.id }, customer, { upsert: true });
}

export async function deleteClientCustomer(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('client_customers').deleteOne({ id });
}

/** @deprecated Use getClientCustomersByAccount */
export const getClientCustomersByClient = getClientCustomersByAccount;

// ============================================================
// Client Reports
// ============================================================

export async function getClientReportsByAccount(accountId: string): Promise<ClientReport[]> {
  const db = await getDb();
  return db.collection<ClientReport>('client_reports').find({ accountId }, noId).sort({ month: -1 }).toArray() as Promise<ClientReport[]>;
}

export async function getClientReport(accountId: string, month: string): Promise<ClientReport | undefined> {
  const db = await getDb();
  const doc = await db.collection<ClientReport>('client_reports').findOne({ accountId, month }, noId);
  return (doc as ClientReport) ?? undefined;
}

export async function addClientReport(report: ClientReport): Promise<void> {
  const db = await getDb();
  await db.collection('client_reports').replaceOne({ id: report.id }, report, { upsert: true });
}

export async function updateClientReport(report: ClientReport): Promise<void> {
  const db = await getDb();
  await db.collection('client_reports').replaceOne({ id: report.id }, report, { upsert: true });
}

export async function deleteClientReport(id: string): Promise<void> {
  const db = await getDb();
  await db.collection('client_reports').deleteOne({ id });
}

/** @deprecated Use getClientReportsByAccount */
export const getClientReportsByClient = getClientReportsByAccount;

// ============================================================
// Automation Tasks
// ============================================================

export async function getDueTasks(limit: number): Promise<AutomationTask[]> {
  const db = await getDb();
  return db.collection<AutomationTask>('automation_tasks').find({
    status: 'pending',
    scheduledAt: { $lte: new Date().toISOString() },
  }, noId)
    .sort({ priority: -1, scheduledAt: 1 })
    .limit(limit)
    .toArray() as Promise<AutomationTask[]>;
}

export async function addAutomationTask(task: AutomationTask): Promise<void> {
  const db = await getDb();
  await db.collection('automation_tasks').replaceOne({ id: task.id }, task, { upsert: true });
}

export async function updateAutomationTask(task: AutomationTask): Promise<void> {
  const db = await getDb();
  await db.collection('automation_tasks').replaceOne({ id: task.id }, task, { upsert: true });
}

export async function getAutomationTasksByStatus(status: AutomationTask['status']): Promise<AutomationTask[]> {
  const db = await getDb();
  return db.collection<AutomationTask>('automation_tasks').find({ status }, noId).toArray() as Promise<AutomationTask[]>;
}

// ============================================================
// Event Log
// ============================================================

export async function addEventLogEntry(entry: EventLogEntry): Promise<void> {
  const db = await getDb();
  await db.collection('event_log').insertOne(entry);
}

export async function getEventLog(limit = 100): Promise<EventLogEntry[]> {
  const db = await getDb();
  return db.collection<EventLogEntry>('event_log')
    .find({}, noId)
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray() as Promise<EventLogEntry[]>;
}

// ============================================================
// Data Management
// ============================================================

const ALL_COLLECTIONS = [
  'accounts',
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
  'gbp_audits',
  'gbp_posts',
  'gbp_post_templates',
  'review_requests',
  'client_reviews',
  'rank_keywords',
  'competitors',
  'citations',
  'social_contents',
  'social_content_templates',
  'referral_records',
  'retention_reminders',
  'client_customers',
  'client_reports',
  'automation_tasks',
  'event_log',
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
