import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/db';
import { readerDevices } from '@/db/schema';
import { apiError, apiSuccess } from '@/server/http/response';
import { ApiError, BadRequestError, NotFoundError } from '@/server/http/errors';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const readerId = Number(id);
    if (!Number.isInteger(readerId) || readerId <= 0) {
      throw new BadRequestError('Valid reader device id is required');
    }

    const [existing] = await db.select().from(readerDevices).where(eq(readerDevices.id, readerId)).limit(1);
    if (!existing) throw new NotFoundError('Reader device not found');

    const now = new Date().toISOString();
    const [updated] = await db.update(readerDevices).set({
      lastHeartbeat: now,
      status: existing.status === 'offline' ? 'online' : existing.status,
      updatedAt: now,
    }).where(eq(readerDevices.id, readerId)).returning();

    return apiSuccess(updated, 'Heartbeat received successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      return apiError(error.message, { status: error.statusCode, errors: error.details });
    }
    return apiError(error instanceof Error ? error.message : 'Internal server error');
  }
}
