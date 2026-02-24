import type { Lead, Campaign, Email, EmailTemplate, UserSettings, ActivityItem, FollowUpSequence, ScheduledEmail, UnsubscribeRecord, SendLog, SmtpAccount, SearchCache, InboxReply, PaginatedResult, AppNotification } from '@/types';
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

// === Leads ===
export async function getAllLeads(): Promise<Lead[]> { return dbCall('getAllLeads'); }
export async function getLead(id: string): Promise<Lead | undefined> { return dbCall('getLead', { id }); }
export async function addLead(lead: Lead): Promise<void> { await dbCall('addLead', { lead }); }
export async function updateLead(lead: Lead): Promise<void> { await dbCall('updateLead', { lead }); }
export async function deleteLead(id: string): Promise<void> { await dbCall('deleteLead', { id }); }
export async function deleteLeads(ids: string[]): Promise<void> { await dbCall('deleteLeads', { ids }); }
export async function findDuplicateLead(name: string, address: string): Promise<Lead | undefined> { return dbCall('findDuplicateLead', { name, address }); }

// === Campaigns ===
export async function getAllCampaigns(): Promise<Campaign[]> { return dbCall('getAllCampaigns'); }
export async function getCampaign(id: string): Promise<Campaign | undefined> { return dbCall('getCampaign', { id }); }
export async function addCampaign(campaign: Campaign): Promise<void> { await dbCall('addCampaign', { campaign }); }
export async function updateCampaign(campaign: Campaign): Promise<void> { await dbCall('updateCampaign', { campaign }); }
export async function deleteCampaign(id: string): Promise<void> { await dbCall('deleteCampaign', { id }); }

// === Emails ===
export async function getAllEmails(): Promise<Email[]> { return dbCall('getAllEmails'); }
export async function getEmailsByLead(leadId: string): Promise<Email[]> { return dbCall('getEmailsByLead', { leadId }); }
export async function getEmailsByCampaign(campaignId: string): Promise<Email[]> { return dbCall('getEmailsByCampaign', { campaignId }); }
export async function addEmail(email: Email): Promise<void> { await dbCall('addEmail', { email }); }
export async function updateEmail(email: Email): Promise<void> { await dbCall('updateEmail', { email }); }

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
export async function getLeadsPaginated(page: number, pageSize: number, filters?: { status?: string; industry?: string; search?: string }, sort?: { field: string; direction: 'asc' | 'desc' }): Promise<PaginatedResult<Lead>> { return dbCall('getLeadsPaginated', { page, pageSize, filters, sort }); }
export async function getEmailsPaginated(page: number, pageSize: number, filters?: { status?: string; leadId?: string; search?: string }): Promise<PaginatedResult<Email>> { return dbCall('getEmailsPaginated', { page, pageSize, filters }); }
export async function getScheduledEmailsPaginated(page: number, pageSize: number, filters?: { status?: string }): Promise<PaginatedResult<ScheduledEmail>> { return dbCall('getScheduledEmailsPaginated', { page, pageSize, filters }); }
export async function getInboxRepliesPaginated(page: number, pageSize: number, filters?: { isRead?: boolean; category?: string }): Promise<PaginatedResult<InboxReply>> { return dbCall('getInboxRepliesPaginated', { page, pageSize, filters }); }

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
