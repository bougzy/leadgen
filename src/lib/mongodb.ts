import { MongoClient, Db } from 'mongodb';
import { CONFIG } from './config';

const MONGODB_URI = CONFIG.MONGODB_URI;
const DB_NAME = 'leadgen';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;

  if (!client) {
    client = new MongoClient(MONGODB_URI);
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
      database.collection('leads').createIndex({ status: 1 }),
      database.collection('leads').createIndex({ industry: 1 }),
      database.collection('leads').createIndex({ leadScore: -1 }),
      database.collection('emails').createIndex({ leadId: 1 }),
      database.collection('emails').createIndex({ campaignId: 1 }),
      database.collection('emails').createIndex({ trackingId: 1 }),
      database.collection('activities').createIndex({ timestamp: -1 }),
      database.collection('scheduled_emails').createIndex({ status: 1 }),
      database.collection('scheduled_emails').createIndex({ scheduledAt: 1 }),
      database.collection('unsubscribes').createIndex({ email: 1 }),
      database.collection('send_logs').createIndex({ date: 1 }),
      database.collection('smtp_accounts').createIndex({ isActive: 1 }),
      database.collection('search_cache').createIndex({ query: 1, location: 1 }),
      database.collection('search_cache').createIndex({ expiresAt: 1 }),
      database.collection('inbox_replies').createIndex({ receivedAt: -1 }),
      database.collection('inbox_replies').createIndex({ matchedLeadId: 1 }),
      database.collection('inbox_replies').createIndex({ messageId: 1 }, { unique: true }),
      database.collection('notifications').createIndex({ createdAt: -1 }),
      database.collection('notifications').createIndex({ isRead: 1 }),
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
