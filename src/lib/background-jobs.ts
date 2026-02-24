// Server-side background job processor
// Runs via Next.js instrumentation — NOT in the browser

import { randomUUID } from 'crypto';
import nodemailer from 'nodemailer';
import * as db from './db-server';
import { getDb } from './mongodb';
import { appendUnsubscribeFooter, getWarmupLimit } from './utils';
import { textToTrackedHtml } from './email-html';
import { createTransport, pickNextAccount } from './smtp-transport';
import { decrypt } from './crypto';
import type { AppNotification, Campaign, Email, EmailStatus, SmtpAccount } from '@/types';

let started = false;

// ─── Concurrency guards ─────────────────────────────────────────────────────
let processingEmails = false;
let processingFollowUps = false;
let processingWarmup = false;
let processingImap = false;

// ─── Notification helper (best-effort) ──────────────────────────────────────

async function notify(type: AppNotification['type'], title: string, message: string, leadId?: string, actionUrl?: string) {
  try {
    const { randomUUID: uuid } = await import('crypto');
    await db.addNotification({
      id: uuid(),
      type,
      title,
      message,
      isRead: false,
      leadId,
      actionUrl,
      createdAt: new Date().toISOString(),
    });
  } catch { /* notifications are best-effort */ }
}

// ─── Campaign status helper ──────────────────────────────────────────────────

async function updateCampaignEmailStatus(campaignId: string | undefined, leadId: string, status: EmailStatus) {
  if (!campaignId) return;
  try {
    const campaign = await db.getCampaign(campaignId);
    if (!campaign) return;
    campaign.emailStatuses[leadId] = status;
    campaign.updatedAt = new Date().toISOString();
    await db.updateCampaign(campaign);
  } catch { /* best-effort */ }
}

// ─── Public entry point ──────────────────────────────────────────────────────

export function startBackgroundJobs() {
  if (started) return;
  started = true;
  console.log('[BackgroundJobs] Starting server-side background processors...');

  // Scheduled email processor — every 60 seconds
  setInterval(processScheduledEmails, 60_000);
  setTimeout(processScheduledEmails, 5_000); // initial delay

  // Follow-up engine — every 5 minutes
  setInterval(processFollowUps, 300_000);
  setTimeout(processFollowUps, 10_000);

  // Warmup counter — every hour
  setInterval(checkWarmupCounter, 3_600_000);
  setTimeout(checkWarmupCounter, 3_000);

  // Daily SMTP send count reset — every hour
  setInterval(resetDailyCounts, 3_600_000);
  setTimeout(resetDailyCounts, 4_000);

  // IMAP reply detection — every 5 minutes
  setInterval(processImapPolling, 300_000);
  setTimeout(processImapPolling, 15_000);
}

// ─── Scheduled Email Processor ───────────────────────────────────────────────

async function processScheduledEmails(): Promise<void> {
  if (processingEmails) return;
  processingEmails = true;

  try {
    const settings = await db.getSettings();
    const accounts = await db.getActiveSmtpAccounts();
    const hasAccounts = accounts.length > 0;
    const hasLegacy = !!(settings.smtpEmail && settings.smtpPassword);

    if (!hasAccounts && !hasLegacy) return;

    const pending = await db.getScheduledByStatus('pending');
    const now = new Date();

    for (const scheduled of pending) {
      if (new Date(scheduled.scheduledAt) > now) continue;

      // Check daily send limit
      const todayCount = await db.getTodaySendCount();
      const effectiveLimit = settings.warmupEnabled
        ? Math.min(settings.dailySendLimit, getWarmupLimit(settings.warmupDayCount))
        : settings.dailySendLimit;

      if (todayCount >= effectiveLimit) {
        console.log('[BackgroundJobs] Daily send limit reached, stopping email processing.');
        await notify(
          'daily_limit_reached',
          'Daily Send Limit Reached',
          `Today's send limit of ${effectiveLimit} emails has been reached. Remaining emails will be sent tomorrow.`,
          undefined,
          '/scheduled',
        );
        break;
      }

      try {
        // Check if recipient has unsubscribed since this email was queued
        const isUnsub = await db.isEmailUnsubscribed(scheduled.to);
        if (isUnsub) {
          await db.updateScheduledEmail({ ...scheduled, status: 'cancelled', error: 'Recipient unsubscribed' });
          console.log(`[BackgroundJobs] Skipped ${scheduled.to} — unsubscribed`);
          continue;
        }

        const trackingId = randomUUID();
        const baseUrl = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://leadgen.vercel.app';

        const htmlBody = textToTrackedHtml(scheduled.body, trackingId, baseUrl);

        let transporter: nodemailer.Transporter;
        let senderEmail: string;
        let usedAccount: SmtpAccount | null = null;

        if (hasAccounts) {
          // Use multi-account rotation
          usedAccount = pickNextAccount(accounts);
          if (!usedAccount) {
            console.log('[BackgroundJobs] All SMTP accounts at daily limit.');
            break;
          }
          transporter = createTransport(usedAccount);
          senderEmail = usedAccount.email;
        } else {
          // Legacy fallback: single Gmail account
          let legacyPass = settings.smtpPassword!;
          try { legacyPass = decrypt(legacyPass); } catch { /* may be plaintext or ENCRYPTION_KEY missing */ }
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

        // Mark as sent
        await db.updateScheduledEmail({
          ...scheduled,
          status: 'sent',
          sentAt: now.toISOString(),
          smtpAccountId: usedAccount?.id,
        });

        // Update account send count
        if (usedAccount) {
          usedAccount.sendCount += 1;
          usedAccount.lastUsedAt = now.toISOString();
          await db.updateSmtpAccount(usedAccount);
        }

        // Create email record
        const emailRecord: Email = {
          id: randomUUID(),
          leadId: scheduled.leadId,
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

        // Update lead status
        const lead = await db.getLead(scheduled.leadId);
        if (lead) {
          await db.updateLead({
            ...lead,
            status: lead.status === 'new' ? 'contacted' : lead.status,
            lastContacted: now.toISOString(),
          });
        }

        // Increment the daily send log
        const todayDate = now.toISOString().split('T')[0];
        await db.incrementSendLog(todayDate);

        // Record activity
        await db.addActivity({
          id: randomUUID(),
          type: 'email_sent',
          description: `Sent scheduled email to ${scheduled.to}${usedAccount ? ` via ${usedAccount.label}` : ''}`,
          timestamp: now.toISOString(),
          leadId: scheduled.leadId,
          campaignId: scheduled.campaignId,
        });

        // Update campaign email status
        await updateCampaignEmailStatus(scheduled.campaignId, scheduled.leadId, 'sent');

        console.log(`[BackgroundJobs] Sent email to ${scheduled.to}${usedAccount ? ` via ${usedAccount.label}` : ''}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        const isBounce = /\b(550|551|552|553|554)\b/.test(errorMsg);

        await db.updateScheduledEmail({
          ...scheduled,
          status: 'failed',
          error: errorMsg,
        });

        // Update campaign status on failure
        await updateCampaignEmailStatus(scheduled.campaignId, scheduled.leadId, isBounce ? 'bounced' : 'drafted');

        if (isBounce) {
          await db.addActivity({
            id: randomUUID(),
            type: 'email_bounced',
            description: `Email to ${scheduled.to} bounced: ${errorMsg}`,
            timestamp: now.toISOString(),
            leadId: scheduled.leadId,
          });
          console.warn(`[BackgroundJobs] Bounce detected for ${scheduled.to}: ${errorMsg}`);
          await notify(
            'bounce_detected',
            'Email Bounced',
            `Email to ${scheduled.to} bounced: ${errorMsg}`,
            scheduled.leadId,
            '/scheduled',
          );
        } else {
          console.error(`[BackgroundJobs] Failed to send email to ${scheduled.to}: ${errorMsg}`);
          await notify(
            'send_failed',
            'Email Send Failed',
            `Failed to send email to ${scheduled.to}: ${errorMsg}`,
            scheduled.leadId,
            '/scheduled',
          );
        }
      }
    }
  } catch (err) {
    console.error('[BackgroundJobs] processScheduledEmails error:', err);
  } finally {
    processingEmails = false;
  }
}

// ─── Follow-Up Sequence Engine ───────────────────────────────────────────────

async function processFollowUps(): Promise<void> {
  if (processingFollowUps) return;
  processingFollowUps = true;

  try {
    const sequences = await db.getAllSequences();
    const activeSequence = sequences.find((s) => s.isActive);
    if (!activeSequence || activeSequence.steps.length === 0) return;

    const settings = await db.getSettings();
    const accounts = await db.getActiveSmtpAccounts();
    if (accounts.length === 0 && !settings.smtpEmail) return;

    const allEmails = await db.getAllEmails();
    const allLeads = await db.getAllLeads();
    const scheduledEmails = await db.getScheduledByStatus('pending');
    const now = new Date();

    const emailsByLead = new Map<string, Email[]>();
    for (const email of allEmails) {
      const existing = emailsByLead.get(email.leadId) || [];
      existing.push(email);
      emailsByLead.set(email.leadId, existing);
    }

    for (const lead of allLeads) {
      if (!lead.email || lead.unsubscribed) continue;
      if (lead.excludeFromSequences) continue;

      const skipStatuses = ['responded', 'qualified', 'closed'];
      if (skipStatuses.includes(lead.status)) continue;

      const leadEmails = emailsByLead.get(lead.id) || [];
      if (leadEmails.length === 0) continue;

      const sentEmails = leadEmails
        .filter((e) => e.sentAt)
        .sort((a, b) => new Date(a.sentAt!).getTime() - new Date(b.sentAt!).getTime());

      if (sentEmails.length === 0) continue;

      const followUpsSent = sentEmails.filter((e) => e.templateUsed === 'follow_up').length;
      const nextStepIndex = followUpsSent;

      if (nextStepIndex >= activeSequence.steps.length) continue;

      const step = activeSequence.steps[nextStepIndex];
      const lastSentEmail = sentEmails[sentEmails.length - 1];
      const daysSinceLastEmail =
        (now.getTime() - new Date(lastSentEmail.sentAt!).getTime()) / 86_400_000;

      if (daysSinceLastEmail < step.delayDays) continue;

      if (step.condition === 'no_reply') {
        const anyReplied = sentEmails.some((e) => e.respondedAt);
        if (anyReplied) continue;
      } else if (step.condition === 'no_open') {
        const anyOpened = sentEmails.some((e) => e.openedAt);
        if (anyOpened) continue;
      }

      const alreadyScheduled = scheduledEmails.some(
        (se) =>
          se.leadId === lead.id &&
          se.sequenceId === activeSequence.id &&
          se.stepIndex === nextStepIndex
      );
      if (alreadyScheduled) continue;

      const subject = step.subject
        .replace(/\{business_name\}/g, lead.name)
        .replace(/\{contact_name\}/g, lead.contactName || '')
        .replace(/\{first_name\}/g, (lead.contactName || '').split(' ')[0])
        .replace(/\{your_name\}/g, settings.name);

      let body = step.body
        .replace(/\{business_name\}/g, lead.name)
        .replace(/\{contact_name\}/g, lead.contactName || '')
        .replace(/\{first_name\}/g, (lead.contactName || '').split(' ')[0])
        .replace(/\{your_name\}/g, settings.name)
        .replace(/\{your_email\}/g, settings.email)
        .replace(/\{service_offering\}/g, settings.serviceOffering)
        .replace(/\{value_prop\}/g, settings.valueProp);

      const trackingId = randomUUID();
      body = appendUnsubscribeFooter(
        body,
        lead.email,
        settings.unsubscribeMessage,
        settings.businessAddress,
        trackingId
      );

      await db.addScheduledEmail({
        id: randomUUID(),
        leadId: lead.id,
        sequenceId: activeSequence.id,
        stepIndex: nextStepIndex,
        to: lead.email,
        subject,
        body,
        scheduledAt: now.toISOString(),
        status: 'pending',
        createdAt: now.toISOString(),
      });

      await db.addActivity({
        id: randomUUID(),
        type: 'follow_up_sent',
        description: `Queued follow-up #${nextStepIndex + 1} for ${lead.name}`,
        timestamp: now.toISOString(),
        leadId: lead.id,
      });

      console.log(`[BackgroundJobs] Scheduled follow-up #${nextStepIndex + 1} for ${lead.name}`);
    }
  } catch (err) {
    console.error('[BackgroundJobs] processFollowUps error:', err);
  } finally {
    processingFollowUps = false;
  }
}

// ─── Warmup Day Counter ──────────────────────────────────────────────────────

async function checkWarmupCounter(): Promise<void> {
  if (processingWarmup) return;
  processingWarmup = true;

  try {
    const settings = await db.getSettings();
    if (!settings.warmupEnabled) return;

    const database = await getDb();
    const systemCol = database.collection<{ key: string; value: string }>('system');

    const today = new Date().toISOString().split('T')[0];
    const lastWarmupDoc = await systemCol.findOne({ key: 'last_warmup_date' });
    const lastWarmupDate = lastWarmupDoc?.value;

    if (lastWarmupDate !== today) {
      const updated = { ...settings, warmupDayCount: settings.warmupDayCount + 1 };
      await db.saveSettings(updated);

      await systemCol.updateOne(
        { key: 'last_warmup_date' },
        { $set: { key: 'last_warmup_date', value: today } },
        { upsert: true }
      );

      console.log(
        `[BackgroundJobs] Warmup day incremented to ${updated.warmupDayCount} (limit: ${getWarmupLimit(updated.warmupDayCount)})`
      );

      // Notify on milestone days
      const milestoneDays = [7, 14, 21];
      if (milestoneDays.includes(updated.warmupDayCount)) {
        await notify(
          'warmup_milestone',
          'Warmup Progress',
          `Your email warmup has reached day ${updated.warmupDayCount}. Current daily limit: ${getWarmupLimit(updated.warmupDayCount)} emails.`,
        );
      }
    }
  } catch (err) {
    console.error('[BackgroundJobs] checkWarmupCounter error:', err);
  } finally {
    processingWarmup = false;
  }
}

// ─── Daily SMTP Count Reset ──────────────────────────────────────────────────

async function resetDailyCounts(): Promise<void> {
  try {
    const database = await getDb();
    const systemCol = database.collection<{ key: string; value: string }>('system');

    const today = new Date().toISOString().split('T')[0];
    const lastResetDoc = await systemCol.findOne({ key: 'last_smtp_reset_date' });

    if (lastResetDoc?.value !== today) {
      await db.resetDailySmtpCounts();
      await systemCol.updateOne(
        { key: 'last_smtp_reset_date' },
        { $set: { key: 'last_smtp_reset_date', value: today } },
        { upsert: true }
      );
      console.log('[BackgroundJobs] Reset daily SMTP send counts');
    }
  } catch (err) {
    console.error('[BackgroundJobs] resetDailyCounts error:', err);
  }
}

// ─── IMAP Reply Detection ────────────────────────────────────────────────────

async function processImapPolling(): Promise<void> {
  if (processingImap) return;
  processingImap = true;

  try {
    const settings = await db.getSettings();
    if (!settings.imapPollingEnabled) return;

    // Dynamic import to avoid loading imapflow unless IMAP is enabled
    const { pollImapAccount } = await import('./imap-poller');
    const accounts = await db.getActiveSmtpAccounts();
    const imapAccounts = accounts.filter((a) => !!a.imapHost);

    if (imapAccounts.length === 0) return;

    for (const account of imapAccounts) {
      const newReplyCount = await pollImapAccount(account);

      if (newReplyCount > 0) {
        await notify(
          'reply_received',
          'New Reply Detected',
          `${newReplyCount} new repl${newReplyCount === 1 ? 'y' : 'ies'} detected in ${account.email}.`,
          undefined,
          '/inbox',
        );
      }
    }
  } catch (err) {
    console.error('[BackgroundJobs] IMAP polling error:', err);
  } finally {
    processingImap = false;
  }
}
