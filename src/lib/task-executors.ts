// Task Executors — individual handler functions for each AutomationTaskType.
// Each executor receives an AutomationTask and performs the associated work.
// Executors are pure async functions with no scheduling logic.

import { randomUUID } from 'crypto';
import nodemailer from 'nodemailer';
import type { AutomationTask, AutomationTaskType, AppNotification, Email, EmailStatus, SmtpAccount } from '@/types';
import * as db from './db-server';
import { getDb } from './mongodb';
import { appendUnsubscribeFooter, getWarmupLimit } from './utils';
import { textToTrackedHtml } from './email-html';
import { createTransport, pickNextAccount } from './smtp-transport';
import { decrypt } from './crypto';
import { eventBus } from './event-bus';

// ─── Shared helpers ──────────────────────────────────────────────────────────

async function notify(type: AppNotification['type'], title: string, message: string, accountId?: string, actionUrl?: string) {
  try {
    await db.addNotification({
      id: randomUUID(),
      type,
      title,
      message,
      isRead: false,
      accountId,
      actionUrl,
      createdAt: new Date().toISOString(),
    });
  } catch { /* notifications are best-effort */ }
}

async function updateCampaignEmailStatus(campaignId: string | undefined, accountId: string, status: EmailStatus) {
  if (!campaignId) return;
  try {
    const campaign = await db.getCampaign(campaignId);
    if (!campaign) return;
    campaign.emailStatuses[accountId] = status;
    campaign.updatedAt = new Date().toISOString();
    await db.updateCampaign(campaign);
  } catch { /* best-effort */ }
}

function getSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

// ─── Executor: SEND_EMAIL ────────────────────────────────────────────────────
// Processes all pending scheduled emails up to the daily limit.

async function executeSendEmail(_task: AutomationTask): Promise<void> {
  const settings = await db.getSettings();
  const accounts = await db.getActiveSmtpAccounts();
  const hasAccounts = accounts.length > 0;
  const hasLegacy = !!(settings.smtpEmail && settings.smtpPassword);

  if (!hasAccounts && !hasLegacy) return;

  const pending = await db.getScheduledByStatus('pending');
  const now = new Date();

  for (const scheduled of pending) {
    if (new Date(scheduled.scheduledAt) > now) continue;

    const todayCount = await db.getTodaySendCount();
    const effectiveLimit = settings.warmupEnabled
      ? Math.min(settings.dailySendLimit, getWarmupLimit(settings.warmupDayCount))
      : settings.dailySendLimit;

    if (todayCount >= effectiveLimit) {
      console.log('[Executor:SEND_EMAIL] Daily send limit reached.');
      await notify('daily_limit_reached', 'Daily Send Limit Reached',
        `Today's send limit of ${effectiveLimit} emails has been reached. Remaining emails will be sent tomorrow.`,
        undefined, '/scheduled');
      break;
    }

    try {
      const isUnsub = await db.isEmailUnsubscribed(scheduled.to);
      if (isUnsub) {
        await db.updateScheduledEmail({ ...scheduled, status: 'cancelled', error: 'Recipient unsubscribed' });
        continue;
      }

      const trackingId = randomUUID();
      const baseUrl = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://leadgen.vercel.app';
      const htmlBody = textToTrackedHtml(scheduled.body, trackingId, baseUrl);

      let transporter: nodemailer.Transporter;
      let senderEmail: string;
      let usedAccount: SmtpAccount | null = null;

      if (hasAccounts) {
        usedAccount = pickNextAccount(accounts);
        if (!usedAccount) {
          console.log('[Executor:SEND_EMAIL] All SMTP accounts at daily limit.');
          break;
        }
        transporter = createTransport(usedAccount);
        senderEmail = usedAccount.email;
      } else {
        let legacyPass = settings.smtpPassword!;
        try { legacyPass = decrypt(legacyPass); } catch { /* may be plaintext */ }
        transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: settings.smtpEmail!, pass: legacyPass },
        });
        senderEmail = settings.smtpEmail!;
      }

      await transporter.sendMail({
        from: senderEmail,
        to: scheduled.to,
        subject: scheduled.subject,
        text: scheduled.body,
        html: htmlBody,
      });

      await db.updateScheduledEmail({
        ...scheduled,
        status: 'sent',
        sentAt: now.toISOString(),
        smtpAccountId: usedAccount?.id,
      });

      if (usedAccount) {
        usedAccount.sendCount += 1;
        usedAccount.lastUsedAt = now.toISOString();
        await db.updateSmtpAccount(usedAccount);
      }

      const emailRecord: Email = {
        id: randomUUID(),
        accountId: scheduled.accountId,
        campaignId: scheduled.campaignId,
        subject: scheduled.subject,
        body: scheduled.body,
        variation: 'medium',
        status: 'sent',
        templateUsed: scheduled.sequenceId ? 'follow_up' : 'scheduled',
        trackingId,
        createdAt: scheduled.createdAt,
        sentAt: now.toISOString(),
      };
      await db.addEmail(emailRecord);

      const account = await db.getAccount(scheduled.accountId);
      if (account) {
        await db.updateAccount({
          ...account,
          lifecycleStage: account.lifecycleStage === 'prospect' ? 'contacted' : account.lifecycleStage,
          lastContacted: now.toISOString(),
          updatedAt: now.toISOString(),
        });
      }

      const todayDate = now.toISOString().split('T')[0];
      await db.incrementSendLog(todayDate);

      await db.addActivity({
        id: randomUUID(),
        type: 'email_sent',
        description: `Sent scheduled email to ${scheduled.to}${usedAccount ? ` via ${usedAccount.label}` : ''}`,
        timestamp: now.toISOString(),
        accountId: scheduled.accountId,
        campaignId: scheduled.campaignId,
      });

      await updateCampaignEmailStatus(scheduled.campaignId, scheduled.accountId, 'sent');
      console.log(`[Executor:SEND_EMAIL] Sent to ${scheduled.to}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      const isBounce = /\b(550|551|552|553|554)\b/.test(errorMsg);

      await db.updateScheduledEmail({ ...scheduled, status: 'failed', error: errorMsg });
      await updateCampaignEmailStatus(scheduled.campaignId, scheduled.accountId, isBounce ? 'bounced' : 'drafted');

      if (isBounce) {
        await db.addActivity({
          id: randomUUID(),
          type: 'email_bounced',
          description: `Email to ${scheduled.to} bounced: ${errorMsg}`,
          timestamp: now.toISOString(),
          accountId: scheduled.accountId,
        });
        await notify('bounce_detected', 'Email Bounced', `Email to ${scheduled.to} bounced: ${errorMsg}`, scheduled.accountId, '/scheduled');
      } else {
        await notify('send_failed', 'Email Send Failed', `Failed to send email to ${scheduled.to}: ${errorMsg}`, scheduled.accountId, '/scheduled');
      }
    }
  }
}

// ─── Executor: FOLLOWUP_STEP ────────────────────────────────────────────────
// Evaluates all accounts for pending follow-up sequence steps and queues them.

async function executeFollowUpStep(_task: AutomationTask): Promise<void> {
  const sequences = await db.getAllSequences();
  const activeSequence = sequences.find((s) => s.isActive);
  if (!activeSequence || activeSequence.steps.length === 0) return;

  const settings = await db.getSettings();
  const smtpAccounts = await db.getActiveSmtpAccounts();
  if (smtpAccounts.length === 0 && !settings.smtpEmail) return;

  const allEmails = await db.getAllEmails();
  const allAccounts = await db.getAllAccounts();
  const scheduledEmails = await db.getScheduledByStatus('pending');
  const now = new Date();

  const emailsByAccount = new Map<string, Email[]>();
  for (const email of allEmails) {
    const existing = emailsByAccount.get(email.accountId) || [];
    existing.push(email);
    emailsByAccount.set(email.accountId, existing);
  }

  for (const acct of allAccounts) {
    if (!acct.contactEmail || acct.unsubscribed) continue;
    if (acct.excludeFromSequences) continue;

    const skipStages = ['engaged', 'qualified', 'won', 'active_client'];
    if (skipStages.includes(acct.lifecycleStage)) continue;

    const acctEmails = emailsByAccount.get(acct.id) || [];
    if (acctEmails.length === 0) continue;

    const sentEmails = acctEmails
      .filter((e) => e.sentAt)
      .sort((a, b) => new Date(a.sentAt!).getTime() - new Date(b.sentAt!).getTime());

    if (sentEmails.length === 0) continue;

    const followUpsSent = sentEmails.filter((e) => e.templateUsed === 'follow_up').length;
    const nextStepIndex = followUpsSent;
    if (nextStepIndex >= activeSequence.steps.length) continue;

    const step = activeSequence.steps[nextStepIndex];
    const lastSentEmail = sentEmails[sentEmails.length - 1];
    const daysSinceLastEmail = (now.getTime() - new Date(lastSentEmail.sentAt!).getTime()) / 86_400_000;
    if (daysSinceLastEmail < step.delayDays) continue;

    if (step.condition === 'no_reply') {
      if (sentEmails.some((e) => e.respondedAt)) continue;
    } else if (step.condition === 'no_open') {
      if (sentEmails.some((e) => e.openedAt)) continue;
    }

    const alreadyScheduled = scheduledEmails.some(
      (se) => se.accountId === acct.id && se.sequenceId === activeSequence.id && se.stepIndex === nextStepIndex
    );
    if (alreadyScheduled) continue;

    const subject = step.subject
      .replace(/\{business_name\}/g, acct.businessName)
      .replace(/\{contact_name\}/g, acct.contactName || '')
      .replace(/\{first_name\}/g, (acct.contactName || '').split(' ')[0])
      .replace(/\{your_name\}/g, settings.name);

    let body = step.body
      .replace(/\{business_name\}/g, acct.businessName)
      .replace(/\{contact_name\}/g, acct.contactName || '')
      .replace(/\{first_name\}/g, (acct.contactName || '').split(' ')[0])
      .replace(/\{your_name\}/g, settings.name)
      .replace(/\{your_email\}/g, settings.email)
      .replace(/\{service_offering\}/g, settings.serviceOffering)
      .replace(/\{value_prop\}/g, settings.valueProp);

    const trackingId = randomUUID();
    body = appendUnsubscribeFooter(body, acct.contactEmail, settings.unsubscribeMessage, settings.businessAddress, trackingId);

    await db.addScheduledEmail({
      id: randomUUID(),
      accountId: acct.id,
      sequenceId: activeSequence.id,
      stepIndex: nextStepIndex,
      to: acct.contactEmail,
      subject,
      body,
      scheduledAt: now.toISOString(),
      status: 'pending',
      createdAt: now.toISOString(),
    });

    await db.addActivity({
      id: randomUUID(),
      type: 'follow_up_sent',
      description: `Queued follow-up #${nextStepIndex + 1} for ${acct.businessName}`,
      timestamp: now.toISOString(),
      accountId: acct.id,
    });

    console.log(`[Executor:FOLLOWUP_STEP] Scheduled follow-up #${nextStepIndex + 1} for ${acct.businessName}`);
  }
}

// ─── Executor: WARMUP_INCREMENT ──────────────────────────────────────────────

async function executeWarmupIncrement(_task: AutomationTask): Promise<void> {
  const settings = await db.getSettings();
  if (!settings.warmupEnabled) return;

  const database = await getDb();
  const systemCol = database.collection<{ key: string; value: string }>('system');

  const today = new Date().toISOString().split('T')[0];
  const lastWarmupDoc = await systemCol.findOne({ key: 'last_warmup_date' });

  if (lastWarmupDoc?.value !== today) {
    const updated = { ...settings, warmupDayCount: settings.warmupDayCount + 1 };
    await db.saveSettings(updated);

    await systemCol.updateOne(
      { key: 'last_warmup_date' },
      { $set: { key: 'last_warmup_date', value: today } },
      { upsert: true },
    );

    console.log(`[Executor:WARMUP_INCREMENT] Day ${updated.warmupDayCount} (limit: ${getWarmupLimit(updated.warmupDayCount)})`);

    const milestoneDays = [7, 14, 21];
    if (milestoneDays.includes(updated.warmupDayCount)) {
      await notify('warmup_milestone', 'Warmup Progress',
        `Your email warmup has reached day ${updated.warmupDayCount}. Current daily limit: ${getWarmupLimit(updated.warmupDayCount)} emails.`);
    }
  }
}

// ─── Executor: SMTP_RESET ────────────────────────────────────────────────────

async function executeSmtpReset(_task: AutomationTask): Promise<void> {
  const database = await getDb();
  const systemCol = database.collection<{ key: string; value: string }>('system');

  const today = new Date().toISOString().split('T')[0];
  const lastResetDoc = await systemCol.findOne({ key: 'last_smtp_reset_date' });

  if (lastResetDoc?.value !== today) {
    await db.resetDailySmtpCounts();
    await systemCol.updateOne(
      { key: 'last_smtp_reset_date' },
      { $set: { key: 'last_smtp_reset_date', value: today } },
      { upsert: true },
    );
    console.log('[Executor:SMTP_RESET] Reset daily SMTP send counts');
  }
}

// ─── Executor: CHECK_IMAP ────────────────────────────────────────────────────

async function executeCheckImap(_task: AutomationTask): Promise<void> {
  const settings = await db.getSettings();
  if (!settings.imapPollingEnabled) return;

  const { pollImapAccount } = await import('./imap-poller');
  const accounts = await db.getActiveSmtpAccounts();
  const imapAccounts = accounts.filter((a) => !!a.imapHost);
  if (imapAccounts.length === 0) return;

  for (const account of imapAccounts) {
    const newReplyCount = await pollImapAccount(account);
    if (newReplyCount > 0) {
      await notify('reply_received', 'New Reply Detected',
        `${newReplyCount} new repl${newReplyCount === 1 ? 'y' : 'ies'} detected in ${account.email}.`,
        undefined, '/inbox');
    }
  }
}

// ─── Executor: SEND_REVIEW_REQUEST ──────────────────────────────────────────

async function executeSendReviewRequest(_task: AutomationTask): Promise<void> {
  const pending = await db.getPendingReviewRequests();
  if (pending.length === 0) return;

  const now = new Date();

  for (const req of pending) {
    if (!req.customerEmail) continue;

    const acct = await db.getAccount(req.accountId);
    if (!acct) continue;

    const jobTime = new Date(req.jobDate).getTime();
    const hoursSinceJob = (now.getTime() - jobTime) / 3_600_000;

    if (req.status === 'pending' && hoursSinceJob >= 2) {
      const subject = 'How was your experience with {business_name}?'
        .replace(/\{business_name\}/g, acct.businessName);
      const body = 'Hi {customer_name},\n\nThank you for choosing {business_name} for your recent {service}! We hope everything went well.\n\nIf you had a great experience, we\'d really appreciate it if you could leave us a quick review on Google. It only takes a minute and helps other people in {neighborhood} find us.\n\n{review_link}\n\nThank you so much!\n\nBest regards,\n{business_name}'
        .replace(/\{customer_name\}/g, req.customerName)
        .replace(/\{business_name\}/g, acct.businessName)
        .replace(/\{service\}/g, req.jobDescription)
        .replace(/\{neighborhood\}/g, acct.location || '')
        .replace(/\{review_link\}/g, req.reviewLink);

      await db.addScheduledEmail({
        id: randomUUID(),
        accountId: req.accountId,
        to: req.customerEmail,
        subject,
        body,
        scheduledAt: now.toISOString(),
        status: 'pending',
        createdAt: now.toISOString(),
      });

      await db.updateReviewRequest({ ...req, status: 'initial_sent', initialSentAt: now.toISOString() });
      console.log(`[Executor:SEND_REVIEW_REQUEST] Queued initial review request for ${req.customerName}`);

    } else if (req.status === 'initial_sent' && req.initialSentAt) {
      const hoursSinceInitial = (now.getTime() - new Date(req.initialSentAt).getTime()) / 3_600_000;

      if (hoursSinceInitial >= 48) {
        const subject = 'Quick reminder from {business_name}'
          .replace(/\{business_name\}/g, acct.businessName);
        const body = 'Hi {customer_name},\n\nJust a friendly reminder — if you have a moment, we\'d love to hear about your experience with {business_name}.\n\nYour review helps us improve and helps neighbors in {neighborhood} find quality {service}.\n\n{review_link}\n\nThanks again for your business!\n\n{business_name}'
          .replace(/\{customer_name\}/g, req.customerName)
          .replace(/\{business_name\}/g, acct.businessName)
          .replace(/\{service\}/g, req.jobDescription)
          .replace(/\{neighborhood\}/g, acct.location || '')
          .replace(/\{review_link\}/g, req.reviewLink);

        await db.addScheduledEmail({
          id: randomUUID(),
          accountId: req.accountId,
          to: req.customerEmail,
          subject,
          body,
          scheduledAt: now.toISOString(),
          status: 'pending',
          createdAt: now.toISOString(),
        });

        await db.updateReviewRequest({ ...req, status: 'followup_sent', followupSentAt: now.toISOString() });
        console.log(`[Executor:SEND_REVIEW_REQUEST] Queued follow-up review request for ${req.customerName}`);
      }
    }
  }
}

// ─── Executor: SEND_RETENTION_REMINDER ──────────────────────────────────────

async function executeSendRetentionReminder(_task: AutomationTask): Promise<void> {
  const pending = await db.getPendingRetentionReminders();
  if (pending.length === 0) return;

  const now = new Date();

  for (const reminder of pending) {
    if (!reminder.customerEmail) continue;

    const acct = await db.getAccount(reminder.accountId);
    if (!acct) continue;

    const season = getSeason();
    const subject = reminder.reminderType === 'seasonal_refresh'
      ? `Time for your ${season} refresh!`
      : `Maintenance reminder from ${acct.businessName}`;

    const body = reminder.message
      .replace(/\{customer_name\}/g, reminder.customerName)
      .replace(/\{business_name\}/g, acct.businessName)
      .replace(/\{service\}/g, acct.services?.[0] || 'service')
      .replace(/\{season\}/g, season)
      .replace(/\{phone\}/g, acct.contactPhone || '');

    await db.addScheduledEmail({
      id: randomUUID(),
      accountId: reminder.accountId,
      to: reminder.customerEmail,
      subject,
      body,
      scheduledAt: now.toISOString(),
      status: 'pending',
      createdAt: now.toISOString(),
    });

    await db.updateRetentionReminder({ ...reminder, status: 'sent', sentAt: now.toISOString() });
    console.log(`[Executor:SEND_RETENTION_REMINDER] Queued for ${reminder.customerName}`);
  }
}

// ─── Executor: GENERATE_REPORT ──────────────────────────────────────────────

async function executeGenerateReport(task: AutomationTask): Promise<void> {
  const accountId = task.accountId || (task.payload.accountId as string);
  if (!accountId) throw new Error('GENERATE_REPORT requires an accountId');

  eventBus.emit({ type: 'task.completed', data: { taskId: task.id, taskType: 'GENERATE_REPORT', accountId } });
  console.log(`[Executor:GENERATE_REPORT] Completed for account ${accountId}`);
}

// ─── Executor: COMPUTE_ANALYTICS ────────────────────────────────────────────

async function executeComputeAnalytics(_task: AutomationTask): Promise<void> {
  eventBus.emit({ type: 'task.completed', data: { taskId: _task.id, taskType: 'COMPUTE_ANALYTICS' } });
  console.log('[Executor:COMPUTE_ANALYTICS] Completed');
}

// ─── Registry ────────────────────────────────────────────────────────────────

export type TaskExecutor = (task: AutomationTask) => Promise<void>;

const executorMap: Record<AutomationTaskType, TaskExecutor> = {
  SEND_EMAIL: executeSendEmail,
  FOLLOWUP_STEP: executeFollowUpStep,
  WARMUP_INCREMENT: executeWarmupIncrement,
  SMTP_RESET: executeSmtpReset,
  CHECK_IMAP: executeCheckImap,
  SEND_REVIEW_REQUEST: executeSendReviewRequest,
  SEND_REVIEW_FOLLOWUP: executeSendReviewRequest, // same logic handles both states
  SEND_RETENTION_REMINDER: executeSendRetentionReminder,
  GENERATE_REPORT: executeGenerateReport,
  COMPUTE_ANALYTICS: executeComputeAnalytics,
};

/** Get the executor function for a given task type */
export function getExecutor(taskType: AutomationTaskType): TaskExecutor | undefined {
  return executorMap[taskType];
}
