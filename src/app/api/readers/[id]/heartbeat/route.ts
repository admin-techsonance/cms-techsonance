import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/db';
import { readerDevices } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { apiError, apiSuccess } from '@/server/http/response';
import { ApiError, BadRequestError, NotFoundError } from '@/server/http/errors';
import { getRouteSupabase } from '@/server/supabase/route-helpers';

function normalizeSupabaseReaderRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    readerId: row.reader_id,
    name: row.name,
    location: row.location,
    type: row.type,
    status: row.status,
    ipAddress: row.ip_address ?? null,
    config: row.config ?? null,
    lastHeartbeat: row.last_heartbeat ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const readerId = Number(id);
    if (!Number.isInteger(readerId) || readerId <= 0) {
      throw new BadRequestError('Valid reader device id is required');
    }

    if (isSupabaseDatabaseEnabled()) {
      const authHeader = _request.headers.get('authorization');
      const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
      if (!accessToken) throw new BadRequestError('Authorization token is required');
      const supabase = getRouteSupabase(accessToken);
      const { data: existing } = await supabase.from('reader_devices').select('*').eq('id', readerId).single();
      if (!existing) throw new NotFoundError('Reader device not found');
      const now = new Date().toISOString();
      const { data: updated, error } = await supabase.from('reader_devices').update({
        last_heartbeat: now,
        status: existing.status === 'offline' ? 'online' : existing.status,
        updated_at: now,
      }).eq('id', readerId).select('*').single();
      if (error || !updated) throw error ?? new Error('Failed to update reader heartbeat');
      return apiSuccess(normalizeSupabaseReaderRow(updated), 'Heartbeat received successfully');
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
