import type { Account, Campaign, Email, EmailTemplate, UserSettings, ActivityItem, FollowUpSequence, ScheduledEmail, UnsubscribeRecord, SendLog, SmtpAccount, SearchCache, InboxReply, PaginatedResult, AppNotification, GbpAudit, GbpPost, GbpPostTemplate, ReviewRequest, ClientReview, RankKeyword, Competitor, Citation, SocialContent, SocialContentTemplate, ReferralRecord, RetentionReminder, ClientCustomer, ClientReport } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

async function dbCall<T>(action: string, params?: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/db', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-secret': process.env.NEXT_PUBLIC_API_SECRET || '66727526705ef4998bfaebd2d49ba7827e3c8198585d0a2ed855e353cdd9de78',
    },
    body: JSON.stringify({ action, params: params || {} }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Database request failed');
  }
  const data = await res.json();
  return data.result as T;
}

// === Accounts (unified — replaces Leads + ClientSites) ===
export async function getAllAccounts(): Promise<Account[]> { return dbCall('getAllAccounts'); }
export async function getAccount(id: string): Promise<Account | undefined> { return dbCall('getAccount', { id }); }
export async function addAccount(account: Account): Promise<void> { await dbCall('addAccount', { account }); }
export async function updateAccount(account: Account): Promise<void> { await dbCall('updateAccount', { account }); }
export async function deleteAccount(id: string): Promise<void> { await dbCall('deleteAccount', { id }); }
export async function deleteAccounts(ids: string[]): Promise<void> { await dbCall('deleteAccounts', { ids }); }
export async function softDeleteAccount(id: string): Promise<void> { await dbCall('softDeleteAccount', { id }); }
export async function findDuplicateAccount(name: string, address: string): Promise<Account | undefined> { return dbCall('findDuplicateAccount', { name, address }); }
export async function getAccountsByStages(stages: string[]): Promise<Account[]> { return dbCall('getAccountsByStages', { stages }); }

// Backward compat aliases
/** @deprecated Use getAllAccounts */ export const getAllLeads = getAllAccounts;
/** @deprecated Use getAccount */ export const getLead = getAccount;
/** @deprecated Use addAccount */ export const addLead = addAccount;
/** @deprecated Use updateAccount */ export const updateLead = updateAccount;
/** @deprecated Use deleteAccount */ export const deleteLead = deleteAccount;
/** @deprecated Use deleteAccounts */ export const deleteLeads = deleteAccounts;
/** @deprecated Use findDuplicateAccount */ export const findDuplicateLead = findDuplicateAccount;
/** @deprecated Use getAllAccounts */ export const getAllClientSites = getAllAccounts;
/** @deprecated Use getAccount */ export const getClientSite = getAccount;
/** @deprecated Use addAccount */ export const addClientSite = addAccount;
/** @deprecated Use updateAccount */ export const updateClientSite = updateAccount;
/** @deprecated Use deleteAccount */ export const deleteClientSite = deleteAccount;

// === Campaigns ===
export async function getAllCampaigns(): Promise<Campaign[]> { return dbCall('getAllCampaigns'); }
export async function getCampaign(id: string): Promise<Campaign | undefined> { return dbCall('getCampaign', { id }); }
export async function addCampaign(campaign: Campaign): Promise<void> { await dbCall('addCampaign', { campaign }); }
export async function updateCampaign(campaign: Campaign): Promise<void> { await dbCall('updateCampaign', { campaign }); }
export async function deleteCampaign(id: string): Promise<void> { await dbCall('deleteCampaign', { id }); }

// === Emails ===
export async function getAllEmails(): Promise<Email[]> { return dbCall('getAllEmails'); }
export async function getEmailsByAccount(accountId: string): Promise<Email[]> { return dbCall('getEmailsByAccount', { accountId }); }
export async function getEmailsByCampaign(campaignId: string): Promise<Email[]> { return dbCall('getEmailsByCampaign', { campaignId }); }
export async function addEmail(email: Email): Promise<void> { await dbCall('addEmail', { email }); }
export async function updateEmail(email: Email): Promise<void> { await dbCall('updateEmail', { email }); }
/** @deprecated Use getEmailsByAccount */ export const getEmailsByLead = getEmailsByAccount;

// === Templates ===
export async function getAllTemplates(): Promise<EmailTemplate[]> { return dbCall('getAllTemplates'); }
export async function addTemplate(template: EmailTemplate): Promise<void> { await dbCall('addTemplate', { template }); }
export async function updateTemplate(template: EmailTemplate): Promise<void> { await dbCall('updateTemplate', { template }); }
export async function deleteTemplate(id: string): Promise<void> { await dbCall('deleteTemplate', { id }); }
export async function updateTemplateStats(templateId: string, field: 'sent' | 'opened' | 'responded'): Promise<void> { await dbCall('updateTemplateStats', { templateId, field }); }

// === Settings ===
export async function getSettings(): Promise<UserSettings> {
  const result = await dbCall<UserSettings | null>('getSettings');
  return result || DEFAULT_SETTINGS;
}
export async function saveSettings(settings: UserSettings): Promise<void> { await dbCall('saveSettings', { settings }); }

// === Activities ===
export async function getAllActivities(): Promise<ActivityItem[]> { return dbCall('getAllActivities'); }
export async function addActivity(activity: ActivityItem): Promise<void> { await dbCall('addActivity', { activity }); }

// === Scheduled Emails ===
export async function getScheduledEmails(): Promise<ScheduledEmail[]> { return dbCall('getScheduledEmails'); }
export async function addScheduledEmail(scheduledEmail: ScheduledEmail): Promise<void> { await dbCall('addScheduledEmail', { scheduledEmail }); }
export async function updateScheduledEmail(scheduledEmail: ScheduledEmail): Promise<void> { await dbCall('updateScheduledEmail', { scheduledEmail }); }
export async function getScheduledByStatus(status: ScheduledEmail['status']): Promise<ScheduledEmail[]> { return dbCall('getScheduledByStatus', { status }); }

// === Follow-Up Sequences ===
export async function getAllSequences(): Promise<FollowUpSequence[]> { return dbCall('getAllSequences'); }
export async function addSequence(sequence: FollowUpSequence): Promise<void> { await dbCall('addSequence', { sequence }); }
export async function updateSequence(sequence: FollowUpSequence): Promise<void> { await dbCall('updateSequence', { sequence }); }
export async function deleteSequence(id: string): Promise<void> { await dbCall('deleteSequence', { id }); }

// === Unsubscribes ===
export async function getAllUnsubscribes(): Promise<UnsubscribeRecord[]> { return dbCall('getAllUnsubscribes'); }
export async function addUnsubscribe(record: UnsubscribeRecord): Promise<void> { await dbCall('addUnsubscribe', { record }); }
export async function isEmailUnsubscribed(email: string): Promise<boolean> { return dbCall('isEmailUnsubscribed', { email }); }

// === Send Logs ===
export async function getSendLog(date: string): Promise<SendLog | undefined> { return dbCall('getSendLog', { date }); }
export async function incrementSendLog(date: string): Promise<void> { await dbCall('incrementSendLog', { date }); }
export async function getTodaySendCount(): Promise<number> { return dbCall('getTodaySendCount'); }

// === SMTP Accounts ===
export async function getAllSmtpAccounts(): Promise<SmtpAccount[]> { return dbCall('getAllSmtpAccounts'); }
export async function getSmtpAccount(id: string): Promise<SmtpAccount | undefined> { return dbCall('getSmtpAccount', { id }); }
export async function addSmtpAccount(account: SmtpAccount): Promise<void> { await dbCall('addSmtpAccount', { account }); }
export async function updateSmtpAccount(account: SmtpAccount): Promise<void> { await dbCall('updateSmtpAccount', { account }); }
export async function deleteSmtpAccount(id: string): Promise<void> { await dbCall('deleteSmtpAccount', { id }); }
export async function getActiveSmtpAccounts(): Promise<SmtpAccount[]> { return dbCall('getActiveSmtpAccounts'); }

// === Search Cache ===
export async function getSearchCache(query: string, location: string): Promise<SearchCache | undefined> { return dbCall('getSearchCache', { query, location }); }
export async function setSearchCache(cache: SearchCache): Promise<void> { await dbCall('setSearchCache', { cache }); }

// === Inbox Replies ===
export async function getAllInboxReplies(): Promise<InboxReply[]> { return dbCall('getAllInboxReplies'); }
export async function addInboxReply(reply: InboxReply): Promise<void> { await dbCall('addInboxReply', { reply }); }
export async function updateInboxReply(reply: InboxReply): Promise<void> { await dbCall('updateInboxReply', { reply }); }

// === Paginated Queries ===
export async function getAccountsPaginated(page: number, pageSize: number, filters?: { status?: string; industry?: string; search?: string; lifecycleStage?: string }, sort?: { field: string; direction: 'asc' | 'desc' }): Promise<PaginatedResult<Account>> { return dbCall('getAccountsPaginated', { page, pageSize, filters, sort }); }
export async function getEmailsPaginated(page: number, pageSize: number, filters?: { status?: string; accountId?: string; search?: string }): Promise<PaginatedResult<Email>> { return dbCall('getEmailsPaginated', { page, pageSize, filters }); }
export async function getScheduledEmailsPaginated(page: number, pageSize: number, filters?: { status?: string }): Promise<PaginatedResult<ScheduledEmail>> { return dbCall('getScheduledEmailsPaginated', { page, pageSize, filters }); }
export async function getInboxRepliesPaginated(page: number, pageSize: number, filters?: { isRead?: boolean; category?: string }): Promise<PaginatedResult<InboxReply>> { return dbCall('getInboxRepliesPaginated', { page, pageSize, filters }); }
/** @deprecated Use getAccountsPaginated */ export const getLeadsPaginated = getAccountsPaginated;

// === Notifications ===
export async function getNotifications(): Promise<AppNotification[]> { return dbCall('getNotifications'); }
export async function addNotification(notification: AppNotification): Promise<void> { await dbCall('addNotification', { notification }); }
export async function markNotificationRead(id: string): Promise<void> { await dbCall('markNotificationRead', { id }); }
export async function markAllNotificationsRead(): Promise<void> { await dbCall('markAllNotificationsRead'); }
export async function getUnreadNotificationCount(): Promise<number> { return dbCall('getUnreadNotificationCount'); }

// === Data Management ===
export async function clearAllData(): Promise<void> { await dbCall('clearAllData'); }
export async function exportAllData() { return dbCall('exportAllData'); }
export async function importAllData(data: Record<string, unknown>): Promise<void> { await dbCall('importAllData', { data }); }

// === GBP Audits ===
export async function getGbpAuditsByAccount(accountId: string): Promise<GbpAudit[]> { return dbCall('getGbpAuditsByAccount', { accountId }); }
export async function getLatestGbpAudit(accountId: string): Promise<GbpAudit | undefined> { return dbCall('getLatestGbpAudit', { accountId }); }
export async function addGbpAudit(audit: GbpAudit): Promise<void> { await dbCall('addGbpAudit', { audit }); }
export async function updateGbpAudit(audit: GbpAudit): Promise<void> { await dbCall('updateGbpAudit', { audit }); }
export async function deleteGbpAudit(id: string): Promise<void> { await dbCall('deleteGbpAudit', { id }); }
/** @deprecated Use getGbpAuditsByAccount */ export const getGbpAuditsByClient = getGbpAuditsByAccount;

// === GBP Posts ===
export async function getGbpPostsByAccount(accountId: string): Promise<GbpPost[]> { return dbCall('getGbpPostsByAccount', { accountId }); }
export async function addGbpPost(post: GbpPost): Promise<void> { await dbCall('addGbpPost', { post }); }
export async function updateGbpPost(post: GbpPost): Promise<void> { await dbCall('updateGbpPost', { post }); }
export async function deleteGbpPost(id: string): Promise<void> { await dbCall('deleteGbpPost', { id }); }
export async function getGbpPostsByDateRange(accountId: string, startDate: string, endDate: string): Promise<GbpPost[]> { return dbCall('getGbpPostsByDateRange', { accountId, startDate, endDate }); }
/** @deprecated Use getGbpPostsByAccount */ export const getGbpPostsByClient = getGbpPostsByAccount;

// === GBP Post Templates ===
export async function getAllGbpPostTemplates(): Promise<GbpPostTemplate[]> { return dbCall('getAllGbpPostTemplates'); }
export async function addGbpPostTemplate(template: GbpPostTemplate): Promise<void> { await dbCall('addGbpPostTemplate', { template }); }
export async function updateGbpPostTemplate(template: GbpPostTemplate): Promise<void> { await dbCall('updateGbpPostTemplate', { template }); }
export async function deleteGbpPostTemplate(id: string): Promise<void> { await dbCall('deleteGbpPostTemplate', { id }); }

// === Review Requests ===
export async function getReviewRequestsByAccount(accountId: string): Promise<ReviewRequest[]> { return dbCall('getReviewRequestsByAccount', { accountId }); }
export async function addReviewRequest(request: ReviewRequest): Promise<void> { await dbCall('addReviewRequest', { request }); }
export async function updateReviewRequest(request: ReviewRequest): Promise<void> { await dbCall('updateReviewRequest', { request }); }
export async function deleteReviewRequest(id: string): Promise<void> { await dbCall('deleteReviewRequest', { id }); }
export async function getPendingReviewRequests(): Promise<ReviewRequest[]> { return dbCall('getPendingReviewRequests'); }
/** @deprecated Use getReviewRequestsByAccount */ export const getReviewRequestsByClient = getReviewRequestsByAccount;

// === Client Reviews ===
export async function getClientReviewsByAccount(accountId: string): Promise<ClientReview[]> { return dbCall('getClientReviewsByAccount', { accountId }); }
export async function addClientReview(review: ClientReview): Promise<void> { await dbCall('addClientReview', { review }); }
export async function updateClientReview(review: ClientReview): Promise<void> { await dbCall('updateClientReview', { review }); }
export async function deleteClientReview(id: string): Promise<void> { await dbCall('deleteClientReview', { id }); }
export async function getNegativeReviewsByAccount(accountId: string): Promise<ClientReview[]> { return dbCall('getNegativeReviewsByAccount', { accountId }); }
/** @deprecated Use getClientReviewsByAccount */ export const getClientReviewsByClient = getClientReviewsByAccount;
/** @deprecated Use getNegativeReviewsByAccount */ export const getNegativeReviewsByClient = getNegativeReviewsByAccount;

// === Rank Keywords ===
export async function getRankKeywordsByAccount(accountId: string): Promise<RankKeyword[]> { return dbCall('getRankKeywordsByAccount', { accountId }); }
export async function addRankKeyword(keyword: RankKeyword): Promise<void> { await dbCall('addRankKeyword', { keyword }); }
export async function updateRankKeyword(keyword: RankKeyword): Promise<void> { await dbCall('updateRankKeyword', { keyword }); }
export async function deleteRankKeyword(id: string): Promise<void> { await dbCall('deleteRankKeyword', { id }); }
/** @deprecated Use getRankKeywordsByAccount */ export const getRankKeywordsByClient = getRankKeywordsByAccount;

// === Competitors ===
export async function getCompetitorsByAccount(accountId: string): Promise<Competitor[]> { return dbCall('getCompetitorsByAccount', { accountId }); }
export async function addCompetitor(competitor: Competitor): Promise<void> { await dbCall('addCompetitor', { competitor }); }
export async function updateCompetitor(competitor: Competitor): Promise<void> { await dbCall('updateCompetitor', { competitor }); }
export async function deleteCompetitor(id: string): Promise<void> { await dbCall('deleteCompetitor', { id }); }
/** @deprecated Use getCompetitorsByAccount */ export const getCompetitorsByClient = getCompetitorsByAccount;

// === Citations ===
export async function getCitationsByAccount(accountId: string): Promise<Citation[]> { return dbCall('getCitationsByAccount', { accountId }); }
export async function addCitation(citation: Citation): Promise<void> { await dbCall('addCitation', { citation }); }
export async function updateCitation(citation: Citation): Promise<void> { await dbCall('updateCitation', { citation }); }
export async function deleteCitation(id: string): Promise<void> { await dbCall('deleteCitation', { id }); }
/** @deprecated Use getCitationsByAccount */ export const getCitationsByClient = getCitationsByAccount;

// === Social Content ===
export async function getSocialContentsByAccount(accountId: string): Promise<SocialContent[]> { return dbCall('getSocialContentsByAccount', { accountId }); }
export async function addSocialContent(content: SocialContent): Promise<void> { await dbCall('addSocialContent', { content }); }
export async function updateSocialContent(content: SocialContent): Promise<void> { await dbCall('updateSocialContent', { content }); }
export async function deleteSocialContent(id: string): Promise<void> { await dbCall('deleteSocialContent', { id }); }
export async function getSocialContentsByDateRange(accountId: string, startDate: string, endDate: string): Promise<SocialContent[]> { return dbCall('getSocialContentsByDateRange', { accountId, startDate, endDate }); }
/** @deprecated Use getSocialContentsByAccount */ export const getSocialContentsByClient = getSocialContentsByAccount;

// === Social Content Templates ===
export async function getAllSocialContentTemplates(): Promise<SocialContentTemplate[]> { return dbCall('getAllSocialContentTemplates'); }
export async function addSocialContentTemplate(template: SocialContentTemplate): Promise<void> { await dbCall('addSocialContentTemplate', { template }); }
export async function updateSocialContentTemplate(template: SocialContentTemplate): Promise<void> { await dbCall('updateSocialContentTemplate', { template }); }
export async function deleteSocialContentTemplate(id: string): Promise<void> { await dbCall('deleteSocialContentTemplate', { id }); }

// === Referral Records ===
export async function getReferralsByAccount(accountId: string): Promise<ReferralRecord[]> { return dbCall('getReferralsByAccount', { accountId }); }
export async function addReferralRecord(record: ReferralRecord): Promise<void> { await dbCall('addReferralRecord', { record }); }
export async function updateReferralRecord(record: ReferralRecord): Promise<void> { await dbCall('updateReferralRecord', { record }); }
export async function deleteReferralRecord(id: string): Promise<void> { await dbCall('deleteReferralRecord', { id }); }
export async function getReferralByCode(referralCode: string): Promise<ReferralRecord | undefined> { return dbCall('getReferralByCode', { referralCode }); }
/** @deprecated Use getReferralsByAccount */ export const getReferralsByClient = getReferralsByAccount;

// === Retention Reminders ===
export async function getRetentionRemindersByAccount(accountId: string): Promise<RetentionReminder[]> { return dbCall('getRetentionRemindersByAccount', { accountId }); }
export async function addRetentionReminder(reminder: RetentionReminder): Promise<void> { await dbCall('addRetentionReminder', { reminder }); }
export async function updateRetentionReminder(reminder: RetentionReminder): Promise<void> { await dbCall('updateRetentionReminder', { reminder }); }
export async function deleteRetentionReminder(id: string): Promise<void> { await dbCall('deleteRetentionReminder', { id }); }
export async function getPendingRetentionReminders(): Promise<RetentionReminder[]> { return dbCall('getPendingRetentionReminders'); }
/** @deprecated Use getRetentionRemindersByAccount */ export const getRetentionRemindersByClient = getRetentionRemindersByAccount;

// === Client Customers ===
export async function getClientCustomersByAccount(accountId: string): Promise<ClientCustomer[]> { return dbCall('getClientCustomersByAccount', { accountId }); }
export async function getClientCustomer(id: string): Promise<ClientCustomer | undefined> { return dbCall('getClientCustomer', { id }); }
export async function addClientCustomer(customer: ClientCustomer): Promise<void> { await dbCall('addClientCustomer', { customer }); }
export async function updateClientCustomer(customer: ClientCustomer): Promise<void> { await dbCall('updateClientCustomer', { customer }); }
export async function deleteClientCustomer(id: string): Promise<void> { await dbCall('deleteClientCustomer', { id }); }
/** @deprecated Use getClientCustomersByAccount */ export const getClientCustomersByClient = getClientCustomersByAccount;

// === Client Reports ===
export async function getClientReportsByAccount(accountId: string): Promise<ClientReport[]> { return dbCall('getClientReportsByAccount', { accountId }); }
export async function getClientReport(accountId: string, month: string): Promise<ClientReport | undefined> { return dbCall('getClientReport', { accountId, month }); }
export async function addClientReport(report: ClientReport): Promise<void> { await dbCall('addClientReport', { report }); }
export async function updateClientReport(report: ClientReport): Promise<void> { await dbCall('updateClientReport', { report }); }
export async function deleteClientReport(id: string): Promise<void> { await dbCall('deleteClientReport', { id }); }
/** @deprecated Use getClientReportsByAccount */ export const getClientReportsByClient = getClientReportsByAccount;
