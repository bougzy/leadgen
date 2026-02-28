import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db-server';
import { accountSchema } from '@/lib/schemas';

// Validate account payloads for write operations (best-effort — logs but doesn't block)
function validateAccount(data: unknown): { valid: boolean; error?: string } {
  const result = accountSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    console.warn(`[API/db] Account validation warning: ${issues}`);
    return { valid: false, error: issues };
  }
  return { valid: true };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, params } = body;

    // Validate action is a non-empty string
    if (typeof action !== 'string' || action.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid action' }, { status: 400 });
    }

    // Input size guard — reject absurdly large payloads
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 5_000_000) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    // Validate write actions
    if (action === 'addAccount' || action === 'updateAccount') {
      validateAccount(params?.account);
    }

    // Dispatch to the right function
    let result: unknown;

    switch (action) {
      // Accounts (unified — replaces Leads + ClientSites)
      case 'getAllAccounts':
      case 'getAllLeads':
      case 'getAllClientSites':
        result = await db.getAllAccounts(); break;
      case 'getAccount':
      case 'getLead':
      case 'getClientSite':
        result = await db.getAccount(params.id); break;
      case 'addAccount':
        await db.addAccount(params.account); result = { ok: true }; break;
      case 'addLead':
        await db.addAccount(params.lead || params.account); result = { ok: true }; break;
      case 'addClientSite':
        await db.addAccount(params.site || params.account); result = { ok: true }; break;
      case 'updateAccount':
        await db.updateAccount(params.account); result = { ok: true }; break;
      case 'updateLead':
        await db.updateAccount(params.lead || params.account); result = { ok: true }; break;
      case 'updateClientSite':
        await db.updateAccount(params.site || params.account); result = { ok: true }; break;
      case 'deleteAccount':
      case 'deleteLead':
      case 'deleteClientSite':
        await db.deleteAccount(params.id); result = { ok: true }; break;
      case 'deleteAccounts':
      case 'deleteLeads':
        await db.deleteAccounts(params.ids); result = { ok: true }; break;
      case 'softDeleteAccount':
        await db.softDeleteAccount(params.id); result = { ok: true }; break;
      case 'findDuplicateAccount':
      case 'findDuplicateLead':
        result = await db.findDuplicateAccount(params.name, params.address); break;
      case 'getAccountsByStages':
        result = await db.getAccountsByStages(params.stages); break;

      // Campaigns
      case 'getAllCampaigns': result = await db.getAllCampaigns(); break;
      case 'getCampaign': result = await db.getCampaign(params.id); break;
      case 'addCampaign': await db.addCampaign(params.campaign); result = { ok: true }; break;
      case 'updateCampaign': await db.updateCampaign(params.campaign); result = { ok: true }; break;
      case 'deleteCampaign': await db.deleteCampaign(params.id); result = { ok: true }; break;

      // Emails
      case 'getAllEmails': result = await db.getAllEmails(); break;
      case 'getEmailsByAccount':
        result = await db.getEmailsByAccount(params.accountId); break;
      case 'getEmailsByLead':
        result = await db.getEmailsByAccount(params.leadId || params.accountId); break;
      case 'getEmailsByCampaign': result = await db.getEmailsByCampaign(params.campaignId); break;
      case 'addEmail': await db.addEmail(params.email); result = { ok: true }; break;
      case 'updateEmail': await db.updateEmail(params.email); result = { ok: true }; break;

      // Templates
      case 'getAllTemplates': result = await db.getAllTemplates(); break;
      case 'addTemplate': await db.addTemplate(params.template); result = { ok: true }; break;
      case 'updateTemplate': await db.updateTemplate(params.template); result = { ok: true }; break;
      case 'deleteTemplate': await db.deleteTemplate(params.id); result = { ok: true }; break;
      case 'updateTemplateStats': await db.updateTemplateStats(params.templateId, params.field); result = { ok: true }; break;

      // Settings
      case 'getSettings': result = await db.getSettings(); break;
      case 'saveSettings': await db.saveSettings(params.settings); result = { ok: true }; break;

      // Activities
      case 'getAllActivities': result = await db.getAllActivities(); break;
      case 'addActivity': await db.addActivity(params.activity); result = { ok: true }; break;

      // Scheduled Emails
      case 'getScheduledEmails': result = await db.getScheduledEmails(); break;
      case 'addScheduledEmail': await db.addScheduledEmail(params.scheduledEmail); result = { ok: true }; break;
      case 'updateScheduledEmail': await db.updateScheduledEmail(params.scheduledEmail); result = { ok: true }; break;
      case 'getScheduledByStatus': result = await db.getScheduledByStatus(params.status); break;

      // Sequences
      case 'getAllSequences': result = await db.getAllSequences(); break;
      case 'addSequence': await db.addSequence(params.sequence); result = { ok: true }; break;
      case 'updateSequence': await db.updateSequence(params.sequence); result = { ok: true }; break;
      case 'deleteSequence': await db.deleteSequence(params.id); result = { ok: true }; break;

      // Unsubscribes
      case 'getAllUnsubscribes': result = await db.getAllUnsubscribes(); break;
      case 'addUnsubscribe': await db.addUnsubscribe(params.record); result = { ok: true }; break;
      case 'isEmailUnsubscribed': result = await db.isEmailUnsubscribed(params.email); break;

      // Send Logs
      case 'getSendLog': result = await db.getSendLog(params.date); break;
      case 'incrementSendLog': await db.incrementSendLog(params.date); result = { ok: true }; break;
      case 'getTodaySendCount': result = await db.getTodaySendCount(); break;

      // SMTP Accounts
      case 'getAllSmtpAccounts': result = await db.getAllSmtpAccounts(); break;
      case 'getSmtpAccount': result = await db.getSmtpAccount(params.id); break;
      case 'addSmtpAccount': await db.addSmtpAccount(params.account); result = { ok: true }; break;
      case 'updateSmtpAccount': await db.updateSmtpAccount(params.account); result = { ok: true }; break;
      case 'deleteSmtpAccount': await db.deleteSmtpAccount(params.id); result = { ok: true }; break;
      case 'getActiveSmtpAccounts': result = await db.getActiveSmtpAccounts(); break;

      // Search Cache
      case 'getSearchCache': result = await db.getSearchCache(params.query, params.location); break;
      case 'setSearchCache': await db.setSearchCache(params.cache); result = { ok: true }; break;

      // Inbox Replies
      case 'getAllInboxReplies': result = await db.getAllInboxReplies(); break;
      case 'addInboxReply': await db.addInboxReply(params.reply); result = { ok: true }; break;
      case 'updateInboxReply': await db.updateInboxReply(params.reply); result = { ok: true }; break;

      // Paginated Queries
      case 'getAccountsPaginated':
      case 'getLeadsPaginated':
        result = await db.getAccountsPaginated(params.page, params.pageSize, params.filters, params.sort); break;
      case 'getEmailsPaginated': result = await db.getEmailsPaginated(params.page, params.pageSize, params.filters); break;
      case 'getScheduledEmailsPaginated': result = await db.getScheduledEmailsPaginated(params.page, params.pageSize, params.filters); break;
      case 'getInboxRepliesPaginated': result = await db.getInboxRepliesPaginated(params.page, params.pageSize, params.filters); break;

      // Notifications
      case 'getNotifications': result = await db.getNotifications(); break;
      case 'addNotification': await db.addNotification(params.notification); result = { ok: true }; break;
      case 'markNotificationRead': await db.markNotificationRead(params.id); result = { ok: true }; break;
      case 'markAllNotificationsRead': await db.markAllNotificationsRead(); result = { ok: true }; break;
      case 'getUnreadNotificationCount': result = await db.getUnreadNotificationCount(); break;

      // Data Management
      case 'clearAllData': await db.clearAllData(); result = { ok: true }; break;
      case 'exportAllData': result = await db.exportAllData(); break;
      case 'importAllData': await db.importAllData(params.data); result = { ok: true }; break;

      // GBP Audits
      case 'getGbpAuditsByAccount':
      case 'getGbpAuditsByClient':
        result = await db.getGbpAuditsByAccount(params.accountId || params.clientSiteId); break;
      case 'getLatestGbpAudit':
        result = await db.getLatestGbpAudit(params.accountId || params.clientSiteId); break;
      case 'addGbpAudit': await db.addGbpAudit(params.audit); result = { ok: true }; break;
      case 'updateGbpAudit': await db.updateGbpAudit(params.audit); result = { ok: true }; break;
      case 'deleteGbpAudit': await db.deleteGbpAudit(params.id); result = { ok: true }; break;

      // GBP Posts
      case 'getGbpPostsByAccount':
      case 'getGbpPostsByClient':
        result = await db.getGbpPostsByAccount(params.accountId || params.clientSiteId); break;
      case 'addGbpPost': await db.addGbpPost(params.post); result = { ok: true }; break;
      case 'updateGbpPost': await db.updateGbpPost(params.post); result = { ok: true }; break;
      case 'deleteGbpPost': await db.deleteGbpPost(params.id); result = { ok: true }; break;
      case 'getGbpPostsByDateRange':
        result = await db.getGbpPostsByDateRange(params.accountId || params.clientSiteId, params.startDate, params.endDate); break;

      // GBP Post Templates
      case 'getAllGbpPostTemplates': result = await db.getAllGbpPostTemplates(); break;
      case 'addGbpPostTemplate': await db.addGbpPostTemplate(params.template); result = { ok: true }; break;
      case 'updateGbpPostTemplate': await db.updateGbpPostTemplate(params.template); result = { ok: true }; break;
      case 'deleteGbpPostTemplate': await db.deleteGbpPostTemplate(params.id); result = { ok: true }; break;

      // Review Requests
      case 'getReviewRequestsByAccount':
      case 'getReviewRequestsByClient':
        result = await db.getReviewRequestsByAccount(params.accountId || params.clientSiteId); break;
      case 'addReviewRequest': await db.addReviewRequest(params.request); result = { ok: true }; break;
      case 'updateReviewRequest': await db.updateReviewRequest(params.request); result = { ok: true }; break;
      case 'deleteReviewRequest': await db.deleteReviewRequest(params.id); result = { ok: true }; break;
      case 'getPendingReviewRequests': result = await db.getPendingReviewRequests(); break;

      // Client Reviews
      case 'getClientReviewsByAccount':
      case 'getClientReviewsByClient':
        result = await db.getClientReviewsByAccount(params.accountId || params.clientSiteId); break;
      case 'addClientReview': await db.addClientReview(params.review); result = { ok: true }; break;
      case 'updateClientReview': await db.updateClientReview(params.review); result = { ok: true }; break;
      case 'deleteClientReview': await db.deleteClientReview(params.id); result = { ok: true }; break;
      case 'getNegativeReviewsByAccount':
      case 'getNegativeReviewsByClient':
        result = await db.getNegativeReviewsByAccount(params.accountId || params.clientSiteId); break;

      // Rank Keywords
      case 'getRankKeywordsByAccount':
      case 'getRankKeywordsByClient':
        result = await db.getRankKeywordsByAccount(params.accountId || params.clientSiteId); break;
      case 'addRankKeyword': await db.addRankKeyword(params.keyword); result = { ok: true }; break;
      case 'updateRankKeyword': await db.updateRankKeyword(params.keyword); result = { ok: true }; break;
      case 'deleteRankKeyword': await db.deleteRankKeyword(params.id); result = { ok: true }; break;

      // Competitors
      case 'getCompetitorsByAccount':
      case 'getCompetitorsByClient':
        result = await db.getCompetitorsByAccount(params.accountId || params.clientSiteId); break;
      case 'addCompetitor': await db.addCompetitor(params.competitor); result = { ok: true }; break;
      case 'updateCompetitor': await db.updateCompetitor(params.competitor); result = { ok: true }; break;
      case 'deleteCompetitor': await db.deleteCompetitor(params.id); result = { ok: true }; break;

      // Citations
      case 'getCitationsByAccount':
      case 'getCitationsByClient':
        result = await db.getCitationsByAccount(params.accountId || params.clientSiteId); break;
      case 'addCitation': await db.addCitation(params.citation); result = { ok: true }; break;
      case 'updateCitation': await db.updateCitation(params.citation); result = { ok: true }; break;
      case 'deleteCitation': await db.deleteCitation(params.id); result = { ok: true }; break;

      // Social Content
      case 'getSocialContentsByAccount':
      case 'getSocialContentsByClient':
        result = await db.getSocialContentsByAccount(params.accountId || params.clientSiteId); break;
      case 'addSocialContent': await db.addSocialContent(params.content); result = { ok: true }; break;
      case 'updateSocialContent': await db.updateSocialContent(params.content); result = { ok: true }; break;
      case 'deleteSocialContent': await db.deleteSocialContent(params.id); result = { ok: true }; break;
      case 'getSocialContentsByDateRange':
        result = await db.getSocialContentsByDateRange(params.accountId || params.clientSiteId, params.startDate, params.endDate); break;

      // Social Content Templates
      case 'getAllSocialContentTemplates': result = await db.getAllSocialContentTemplates(); break;
      case 'addSocialContentTemplate': await db.addSocialContentTemplate(params.template); result = { ok: true }; break;
      case 'updateSocialContentTemplate': await db.updateSocialContentTemplate(params.template); result = { ok: true }; break;
      case 'deleteSocialContentTemplate': await db.deleteSocialContentTemplate(params.id); result = { ok: true }; break;

      // Referral Records
      case 'getReferralsByAccount':
      case 'getReferralsByClient':
        result = await db.getReferralsByAccount(params.accountId || params.clientSiteId); break;
      case 'addReferralRecord': await db.addReferralRecord(params.record); result = { ok: true }; break;
      case 'updateReferralRecord': await db.updateReferralRecord(params.record); result = { ok: true }; break;
      case 'deleteReferralRecord': await db.deleteReferralRecord(params.id); result = { ok: true }; break;
      case 'getReferralByCode': result = await db.getReferralByCode(params.referralCode); break;

      // Retention Reminders
      case 'getRetentionRemindersByAccount':
      case 'getRetentionRemindersByClient':
        result = await db.getRetentionRemindersByAccount(params.accountId || params.clientSiteId); break;
      case 'addRetentionReminder': await db.addRetentionReminder(params.reminder); result = { ok: true }; break;
      case 'updateRetentionReminder': await db.updateRetentionReminder(params.reminder); result = { ok: true }; break;
      case 'deleteRetentionReminder': await db.deleteRetentionReminder(params.id); result = { ok: true }; break;
      case 'getPendingRetentionReminders': result = await db.getPendingRetentionReminders(); break;

      // Client Customers
      case 'getClientCustomersByAccount':
      case 'getClientCustomersByClient':
        result = await db.getClientCustomersByAccount(params.accountId || params.clientSiteId); break;
      case 'getClientCustomer': result = await db.getClientCustomer(params.id); break;
      case 'addClientCustomer': await db.addClientCustomer(params.customer); result = { ok: true }; break;
      case 'updateClientCustomer': await db.updateClientCustomer(params.customer); result = { ok: true }; break;
      case 'deleteClientCustomer': await db.deleteClientCustomer(params.id); result = { ok: true }; break;

      // Client Reports
      case 'getClientReportsByAccount':
      case 'getClientReportsByClient':
        result = await db.getClientReportsByAccount(params.accountId || params.clientSiteId); break;
      case 'getClientReport':
        result = await db.getClientReport(params.accountId || params.clientSiteId, params.month); break;
      case 'addClientReport': await db.addClientReport(params.report); result = { ok: true }; break;
      case 'updateClientReport': await db.updateClientReport(params.report); result = { ok: true }; break;
      case 'deleteClientReport': await db.deleteClientReport(params.id); result = { ok: true }; break;

      // Automation Tasks
      case 'getDueTasks': result = await db.getDueTasks(params.limit || 10); break;
      case 'addAutomationTask': await db.addAutomationTask(params.task); result = { ok: true }; break;
      case 'updateAutomationTask': await db.updateAutomationTask(params.task); result = { ok: true }; break;
      case 'getAutomationTasksByStatus': result = await db.getAutomationTasksByStatus(params.status); break;

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ result });
  } catch (err) {
    console.error('DB API error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
