import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/server/http/response';
import { ApiError, BadRequestError, NotFoundError } from '@/server/http/errors';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';
import { getSupabaseUserFromAccessToken } from '@/server/auth/supabase-auth';
import { getSupabaseProfileByAuthUserId } from '@/server/supabase/users';

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

    const authHeader = _request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    
    // Get tenantId from profile
    const authUser = await getSupabaseUserFromAccessToken(accessToken);
    const profile = await getSupabaseProfileByAuthUserId(authUser.id, { useAdmin: true });
    const tenantId = profile.tenant_id;

    const supabase = getAdminRouteSupabase();
    const { data: existing } = await supabase
      .from('reader_devices')
      .select('*')
      .eq('id', readerId)
      .eq('tenant_id', tenantId)
      .single();
    if (!existing) throw new NotFoundError('Reader device not found');
    const now = new Date().toISOString();
    const { data: updated, error } = await supabase.from('reader_devices').update({
      last_heartbeat: now,
      status: existing.status === 'offline' ? 'online' : existing.status,
      updated_at: now,
    })
    .eq('id', readerId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
    if (error || !updated) throw error ?? new Error('Failed to update reader heartbeat');
    return apiSuccess(normalizeSupabaseReaderRow(updated), 'Heartbeat received successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      return apiError(error.message, { status: error.statusCode, errors: error.details });
    }
    return apiError(error instanceof Error ? error.message : 'Internal server error');
  }
}
