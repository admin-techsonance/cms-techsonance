import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/db';
import { readerDevices } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { authenticateRequest } from '@/server/auth/session';
import { apiError, apiSuccess } from '@/server/http/response';
import { ApiError, BadRequestError, NotFoundError } from '@/server/http/errors';
import { updateReaderSchema } from '@/server/validation/devices';
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

function parseReaderId(id: string) {
  const readerId = Number(id);
  if (!Number.isInteger(readerId) || readerId <= 0) {
    throw new BadRequestError('Valid reader device id is required');
  }
  return readerId;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request, { required: true, roles: ['Admin'] });
    const { id } = await params;
    const readerId = parseReaderId(id);
    const payload = updateReaderSchema.parse(await request.json());

    if (Object.keys(payload).length === 0) {
      throw new BadRequestError('At least one field is required to update a reader device');
    }

    if (isSupabaseDatabaseEnabled()) {
      const accessToken = auth?.accessToken;
      if (!accessToken) throw new BadRequestError('Authorization token is required');
      const supabase = getRouteSupabase(accessToken);
      const { data: existing } = await supabase.from('reader_devices').select('*').eq('id', readerId).single();
      if (!existing) throw new NotFoundError('Reader device not found');
      const { data: updated, error } = await supabase.from('reader_devices').update({
        ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
        ...(payload.location !== undefined ? { location: payload.location.trim() } : {}),
        ...(payload.type !== undefined ? { type: payload.type } : {}),
        ...(payload.status !== undefined ? { status: payload.status } : {}),
        ...(payload.ipAddress !== undefined ? { ip_address: payload.ipAddress?.trim() || null } : {}),
        ...(payload.config !== undefined ? { config: payload.config ?? null } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', readerId).select('*').single();
      if (error || !updated) throw error ?? new Error('Failed to update reader device');
      return apiSuccess(normalizeSupabaseReaderRow(updated), 'Reader device updated successfully');
    }

    const [existing] = await db.select().from(readerDevices).where(eq(readerDevices.id, readerId)).limit(1);
    if (!existing) throw new NotFoundError('Reader device not found');

    const [updated] = await db.update(readerDevices).set({
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.location !== undefined ? { location: payload.location } : {}),
      ...(payload.type !== undefined ? { type: payload.type } : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      ...(payload.ipAddress !== undefined ? { ipAddress: payload.ipAddress } : {}),
      ...(payload.config !== undefined
        ? { config: payload.config == null ? null : typeof payload.config === 'string' ? payload.config : JSON.stringify(payload.config) }
        : {}),
      updatedAt: new Date().toISOString(),
    }).where(eq(readerDevices.id, readerId)).returning();

    return apiSuccess(updated, 'Reader device updated successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      return apiError(error.message, { status: error.statusCode, errors: error.details });
    }
    return apiError(error instanceof Error ? error.message : 'Internal server error');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request, { required: true, roles: ['Admin'] });
    const { id } = await params;
    const readerId = parseReaderId(id);
    if (isSupabaseDatabaseEnabled()) {
      const accessToken = auth?.accessToken;
      if (!accessToken) throw new BadRequestError('Authorization token is required');
      const supabase = getRouteSupabase(accessToken);
      const { data: existing } = await supabase.from('reader_devices').select('*').eq('id', readerId).single();
      if (!existing) throw new NotFoundError('Reader device not found');
      const { data: deleted, error } = await supabase.from('reader_devices').delete().eq('id', readerId).select('*').single();
      if (error || !deleted) throw error ?? new Error('Failed to delete reader device');
      return apiSuccess(normalizeSupabaseReaderRow(deleted), 'Reader device deleted successfully');
    }

    const [existing] = await db.select().from(readerDevices).where(eq(readerDevices.id, readerId)).limit(1);
    if (!existing) throw new NotFoundError('Reader device not found');

    const [deleted] = await db.delete(readerDevices).where(eq(readerDevices.id, readerId)).returning();
    return apiSuccess(deleted, 'Reader device deleted successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      return apiError(error.message, { status: error.statusCode, errors: error.details });
    }
    return apiError(error instanceof Error ? error.message : 'Internal server error');
  }
}
