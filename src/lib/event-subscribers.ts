// Event Subscribers — cross-module event reactions
// Registered once on server startup via background-jobs.ts

import { eventBus, type SystemEvent } from './event-bus';
import { randomUUID } from 'crypto';

// Lazy import to avoid circular deps — db-server functions loaded on first use
let dbModule: typeof import('./db-server') | null = null;
async function getDb() {
  if (!dbModule) dbModule = await import('./db-server');
  return dbModule;
}

export function registerEventSubscribers(): void {
  // email.replied → advance lifecycle to 'engaged' if currently 'contacted'
  eventBus.on('email.replied', async (event: SystemEvent) => {
    if (!event.accountId) return;
    const db = await getDb();
    const account = await db.getAccount(event.accountId);
    if (account && account.lifecycleStage === 'contacted') {
      await db.updateAccount({
        ...account,
        lifecycleStage: 'engaged',
        pipelineStage: 'engaged',
        updatedAt: new Date().toISOString(),
      });
    }
  });

  // email.sent → log activity
  eventBus.on('email.sent', async (event: SystemEvent) => {
    const db = await getDb();
    await db.addActivity({
      id: randomUUID(),
      type: 'email_sent',
      description: `Email sent to ${event.data.to || 'unknown'}`,
      timestamp: new Date().toISOString(),
      accountId: event.accountId,
    });
  });

  // email.bounced → log activity + create notification
  eventBus.on('email.bounced', async (event: SystemEvent) => {
    const db = await getDb();
    await db.addActivity({
      id: randomUUID(),
      type: 'email_bounced',
      description: `Email bounced: ${event.data.error || 'unknown error'}`,
      timestamp: new Date().toISOString(),
      accountId: event.accountId,
    });
    await db.addNotification({
      id: randomUUID(),
      type: 'bounce_detected',
      title: 'Email Bounced',
      message: `An email to account ${event.accountId} bounced: ${event.data.error || 'unknown'}`,
      isRead: false,
      accountId: event.accountId,
      createdAt: new Date().toISOString(),
    });
  });

  // lifecycle.changed → log activity
  eventBus.on('lifecycle.changed', async (event: SystemEvent) => {
    const db = await getDb();
    await db.addActivity({
      id: randomUUID(),
      type: 'lead_status_changed',
      description: `Lifecycle changed from ${event.data.from} to ${event.data.to}`,
      timestamp: new Date().toISOString(),
      accountId: event.accountId,
    });
  });

  // review.received → log activity + check for negative review alert
  eventBus.on('review.received', async (event: SystemEvent) => {
    const db = await getDb();
    const rating = event.data.rating as number;
    await db.addActivity({
      id: randomUUID(),
      type: 'response_received',
      description: `New ${rating}-star review received`,
      timestamp: new Date().toISOString(),
      accountId: event.accountId,
    });
    if (rating <= 2) {
      await db.addNotification({
        id: randomUUID(),
        type: 'reply_received',
        title: 'Negative Review Alert',
        message: `A ${rating}-star review was received for account ${event.accountId}. Immediate attention recommended.`,
        isRead: false,
        accountId: event.accountId,
        createdAt: new Date().toISOString(),
      });
    }
  });

  // task.failed → create notification
  eventBus.on('task.failed', async (event: SystemEvent) => {
    const db = await getDb();
    await db.addNotification({
      id: randomUUID(),
      type: 'send_failed',
      title: 'Automation Task Failed',
      message: `Task ${event.data.taskType} failed: ${event.data.error}`,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  });

  console.log('[EventSubscribers] All event subscribers registered');
}
