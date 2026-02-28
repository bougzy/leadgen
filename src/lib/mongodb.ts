import { MongoClient, Db } from 'mongodb';
import { CONFIG } from './config';

const MONGODB_URI = CONFIG.MONGODB_URI;
const DB_NAME = 'leadgen';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;

  if (!client) {
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30_000,
    });
    await client.connect();
  }

  db = client.db(DB_NAME);

  // Create indexes on first connection
  await ensureIndexes(db);

  return db;
}

async function ensureIndexes(database: Db): Promise<void> {
  try {
    await Promise.all([
      // Accounts (unified)
      database.collection('accounts').createIndex({ lifecycleStage: 1 }),
      database.collection('accounts').createIndex({ industry: 1 }),
      database.collection('accounts').createIndex({ leadScore: -1 }),
      database.collection('accounts').createIndex({ deletedAt: 1 }),
      database.collection('accounts').createIndex({ businessName: 1, location: 1 }),

      // Emails
      database.collection('emails').createIndex({ accountId: 1 }),
      database.collection('emails').createIndex({ campaignId: 1 }),
      database.collection('emails').createIndex({ trackingId: 1 }),

      // Activities
      database.collection('activities').createIndex({ timestamp: -1 }),

      // Scheduled Emails
      database.collection('scheduled_emails').createIndex({ status: 1 }),
      database.collection('scheduled_emails').createIndex({ scheduledAt: 1 }),
      database.collection('scheduled_emails').createIndex({ accountId: 1 }),

      // Unsubscribes
      database.collection('unsubscribes').createIndex({ email: 1 }),

      // Send Logs
      database.collection('send_logs').createIndex({ date: 1 }),

      // SMTP Accounts
      database.collection('smtp_accounts').createIndex({ isActive: 1 }),

      // Search Cache
      database.collection('search_cache').createIndex({ query: 1, location: 1 }),
      database.collection('search_cache').createIndex({ expiresAt: 1 }),

      // Inbox Replies
      database.collection('inbox_replies').createIndex({ receivedAt: -1 }),
      database.collection('inbox_replies').createIndex({ matchedAccountId: 1 }),
      database.collection('inbox_replies').createIndex({ messageId: 1 }, { unique: true }),

      // Notifications
      database.collection('notifications').createIndex({ createdAt: -1 }),
      database.collection('notifications').createIndex({ isRead: 1 }),

      // GBP
      database.collection('gbp_audits').createIndex({ accountId: 1, createdAt: -1 }),
      database.collection('gbp_posts').createIndex({ accountId: 1, scheduledDate: -1 }),

      // Reviews
      database.collection('review_requests').createIndex({ accountId: 1, status: 1 }),
      database.collection('client_reviews').createIndex({ accountId: 1, reviewDate: -1 }),

      // SEO
      database.collection('rank_keywords').createIndex({ accountId: 1 }),
      database.collection('citations').createIndex({ accountId: 1 }),
      database.collection('competitors').createIndex({ accountId: 1 }),

      // Social
      database.collection('social_contents').createIndex({ accountId: 1, scheduledDate: -1 }),

      // Retention
      database.collection('referral_records').createIndex({ accountId: 1 }),
      database.collection('retention_reminders').createIndex({ accountId: 1, status: 1, scheduledDate: 1 }),
      database.collection('client_customers').createIndex({ accountId: 1 }),
      database.collection('client_reports').createIndex({ accountId: 1, month: 1 }),

      // Automation Tasks
      database.collection('automation_tasks').createIndex({ status: 1, scheduledAt: 1 }),
      database.collection('automation_tasks').createIndex({ type: 1 }),
      database.collection('automation_tasks').createIndex({ accountId: 1 }),

      // Event Log
      database.collection('event_log').createIndex({ timestamp: -1 }),
      database.collection('event_log').createIndex({ type: 1, timestamp: -1 }),
      database.collection('event_log').createIndex({ accountId: 1, timestamp: -1 }),
    ]);
  } catch {
    // Indexes may already exist — silent fail is fine
  }
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
