import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, params } = body;

    // Validate action is a non-empty string
    if (typeof action !== 'string' || action.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid action' }, { status: 400 });
    }

    // Dispatch to the right function
    let result: unknown;

    switch (action) {
      // Leads
      case 'getAllLeads': result = await db.getAllLeads(); break;
      case 'getLead': result = await db.getLead(params.id); break;
      case 'addLead': await db.addLead(params.lead); result = { ok: true }; break;
      case 'updateLead': await db.updateLead(params.lead); result = { ok: true }; break;
      case 'deleteLead': await db.deleteLead(params.id); result = { ok: true }; break;
      case 'deleteLeads': await db.deleteLeads(params.ids); result = { ok: true }; break;
      case 'findDuplicateLead': result = await db.findDuplicateLead(params.name, params.address); break;

      // Campaigns
      case 'getAllCampaigns': result = await db.getAllCampaigns(); break;
      case 'getCampaign': result = await db.getCampaign(params.id); break;
      case 'addCampaign': await db.addCampaign(params.campaign); result = { ok: true }; break;
      case 'updateCampaign': await db.updateCampaign(params.campaign); result = { ok: true }; break;
      case 'deleteCampaign': await db.deleteCampaign(params.id); result = { ok: true }; break;

      // Emails
      case 'getAllEmails': result = await db.getAllEmails(); break;
      case 'getEmailsByLead': result = await db.getEmailsByLead(params.leadId); break;
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
      case 'getLeadsPaginated': result = await db.getLeadsPaginated(params.page, params.pageSize, params.filters, params.sort); break;
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
