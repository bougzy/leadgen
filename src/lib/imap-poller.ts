// IMAP Inbox Poller — polls IMAP inboxes for replies to sent emails.
// SERVER-ONLY: This module must only be imported in Next.js API routes / server components.

import { ImapFlow } from 'imapflow';
import { decrypt } from './crypto';
import { classifyReply } from './utils';
import { generateId, createActivity } from './utils';
import * as db from './db-server';
import type { SmtpAccount, InboxReply } from '@/types';

/**
 * Poll a single IMAP account for new reply emails.
 * Returns the number of new replies found.
 */
export async function pollImapAccount(account: SmtpAccount): Promise<number> {
  // Skip if account has no IMAP configuration
  if (!account.imapHost || !account.imapPort) {
    return 0;
  }

  let newReplyCount = 0;

  try {
    const password = decrypt(account.encryptedPassword);

    const client = new ImapFlow({
      host: account.imapHost!,
      port: account.imapPort!,
      secure: account.imapSecure ?? true,
      auth: { user: account.username, pass: password },
      logger: false,
    });

    await client.connect();

    let lock;
    try {
      lock = await client.getMailboxLock('INBOX');

      // Search for unseen messages from the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const uids = await client.search({
        seen: false,
        since: sevenDaysAgo,
      }, { uid: true });

      if (!uids || uids.length === 0) {
        lock.release();
        await client.logout();
        return 0;
      }

      // Pre-fetch all sent emails for matching
      const allEmails = await db.getAllEmails();

      for (const uid of uids) {
        try {
          const message = await client.fetchOne(String(uid), {
            uid: true,
            envelope: true,
            source: true,
          });

          if (!message || !message.envelope) continue;

          const envelope = message.envelope;
          const subject = envelope.subject || '';
          const fromAddress = envelope.from?.[0]?.address || '';
          const fromName = envelope.from?.[0]?.name || '';
          const messageId = envelope.messageId || '';
          const inReplyTo = envelope.inReplyTo || undefined;
          const receivedDate = envelope.date
            ? new Date(envelope.date).toISOString()
            : new Date().toISOString();

          // Only process replies: subject starts with "Re:" or has inReplyTo header
          const isReply =
            /^re:/i.test(subject.trim()) || !!inReplyTo;

          if (!isReply) continue;

          // Check if we already processed this message
          if (messageId) {
            const existing = await db.getInboxReplyByMessageId(messageId);
            if (existing) continue;
          }

          // Extract body snippet from message source (first 500 chars, strip HTML)
          let bodySnippet = '';
          if (message.source) {
            const sourceStr = message.source.toString('utf-8');
            // Try to extract the body part after headers (separated by double newline)
            const bodyStart = sourceStr.indexOf('\r\n\r\n');
            if (bodyStart !== -1) {
              bodySnippet = sourceStr
                .slice(bodyStart + 4)
                .replace(/<[^>]*>/g, '') // strip HTML tags
                .replace(/\r\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim()
                .slice(0, 500);
            } else {
              bodySnippet = sourceStr
                .replace(/<[^>]*>/g, '')
                .trim()
                .slice(0, 500);
            }
          }

          // Classify the reply
          const replyCategory = classifyReply(bodySnippet);

          // Try to match to a sent email
          let matchedEmailId: string | undefined;
          let matchedLeadId: string | undefined;

          // Match by inReplyTo header
          if (inReplyTo) {
            const matchedEmail = allEmails.find(
              (e) => e.trackingId === inReplyTo || e.id === inReplyTo
            );
            if (matchedEmail) {
              matchedEmailId = matchedEmail.id;
              matchedLeadId = matchedEmail.leadId;
            }
          }

          // If not matched by inReplyTo, try matching by subject
          if (!matchedEmailId) {
            const cleanSubject = subject
              .replace(/^re:\s*/i, '')
              .trim()
              .toLowerCase();

            if (cleanSubject) {
              const matchedEmail = allEmails.find(
                (e) => e.subject.trim().toLowerCase() === cleanSubject
              );
              if (matchedEmail) {
                matchedEmailId = matchedEmail.id;
                matchedLeadId = matchedEmail.leadId;
              }
            }
          }

          // Create InboxReply record
          const reply: InboxReply = {
            id: generateId(),
            fromEmail: fromAddress,
            fromName: fromName || undefined,
            subject,
            bodySnippet,
            messageId,
            inReplyTo,
            matchedEmailId,
            matchedLeadId,
            replyCategory,
            isRead: false,
            receivedAt: receivedDate,
            detectedAt: new Date().toISOString(),
            accountId: account.id,
          };

          await db.addInboxReply(reply);
          newReplyCount++;

          // If matched to a lead, update lead and email records
          if (matchedLeadId) {
            const lead = await db.getLead(matchedLeadId);

            if (lead) {
              if (replyCategory === 'interested') {
                lead.status = 'responded';
                lead.pipelineStage = 'engaged';
                await db.updateLead(lead);
              } else if (replyCategory === 'unsubscribe') {
                lead.unsubscribed = true;
                await db.updateLead(lead);

                // Add unsubscribe record
                if (lead.email) {
                  await db.addUnsubscribe({
                    id: generateId(),
                    email: lead.email,
                    leadId: lead.id,
                    reason: 'Detected via IMAP reply',
                    unsubscribedAt: new Date().toISOString(),
                  });
                }
              }
            }

            // Update matched email record
            if (matchedEmailId) {
              const matchedEmail = allEmails.find((e) => e.id === matchedEmailId);
              if (matchedEmail) {
                matchedEmail.respondedAt = new Date().toISOString();
                matchedEmail.status = 'responded';
                await db.updateEmail(matchedEmail);
              }
            }

            // Create activity record
            const activity = createActivity(
              'response_received',
              `Reply detected from ${fromAddress}: ${replyCategory}`,
              matchedLeadId,
            );
            await db.addActivity(activity);
          }
        } catch (msgErr) {
          console.error(
            `[IMAP] Error processing message uid=${uid} for account ${account.email}:`,
            msgErr
          );
        }
      }
    } finally {
      if (lock) lock.release();
      await client.logout();
    }
  } catch (err) {
    console.error(
      `[IMAP] Error polling account ${account.email} (${account.id}):`,
      err
    );
  }

  return newReplyCount;
}

/**
 * Poll all active IMAP accounts sequentially.
 * Avoids parallel connections to prevent overwhelming IMAP servers.
 */
export async function pollAllImapAccounts(): Promise<void> {
  try {
    const accounts = await db.getActiveSmtpAccounts();

    // Filter to accounts with IMAP configured
    const imapAccounts = accounts.filter((a) => !!a.imapHost);

    if (imapAccounts.length === 0) {
      console.log('[IMAP] No IMAP-configured accounts found. Skipping poll.');
      return;
    }

    console.log(
      `[IMAP] Polling ${imapAccounts.length} IMAP account(s)...`
    );

    for (const account of imapAccounts) {
      const count = await pollImapAccount(account);
      console.log(
        `[IMAP] Account ${account.email}: ${count} new repl${count === 1 ? 'y' : 'ies'} found.`
      );
    }

    console.log('[IMAP] Polling complete.');
  } catch (err) {
    console.error('[IMAP] Error in pollAllImapAccounts:', err);
  }
}
