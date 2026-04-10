import { MongoClient } from 'mongodb';
import { env } from '@/server/config/env';
import { logger } from '@/server/logging/logger';

let clientPromise: Promise<MongoClient> | null = null;

function isMongoConfigured() {
  return Boolean(env.MONGODB_URI && env.MONGODB_DB_NAME);
}

async function getMongoClient() {
  if (!isMongoConfigured()) {
    return null;
  }

  if (!clientPromise) {
    clientPromise = MongoClient.connect(env.MONGODB_URI!);
  }

  return clientPromise;
}

async function insertDocument(collectionName: string, document: Record<string, unknown>) {
  const client = await getMongoClient();

  if (!client) {
    return;
  }

  try {
    await client
      .db(env.MONGODB_DB_NAME)
      .collection(collectionName)
      .insertOne({
        ...document,
        createdAt: new Date(),
      });
  } catch (error) {
    logger.warn('mongo_log_failed', {
      collectionName,
      error: error instanceof Error ? error.message : 'Unknown Mongo logging failure',
    });
  }
}

export async function logAuthEvent(document: {
  action: string;
  requestId?: string | null;
  email?: string | null;
  userId?: number | null;
  path?: string | null;
  status?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown> | null;
}) {
  await insertDocument('auth_events', document);
}

export async function logApplicationError(document: {
  requestId?: string | null;
  path?: string | null;
  method?: string | null;
  category: string;
  message: string;
  details?: Record<string, unknown> | null;
}) {
  await insertDocument('application_errors', document);
}
