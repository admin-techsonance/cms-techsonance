import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { checkInSchema } from '@/server/validation/attendance';
import { getCurrentSupabaseActor, getAdminRouteSupabase } from '@/server/supabase/route-helpers';
import { listSupabaseProfilesByAuthIds } from '@/server/supabase/users';

async function resolveSupabaseEmployee(accessToken: string, tenantId: string, tagUid?: string | null, employeeId?: number | null) {
  const supabase = getAdminRouteSupabase();
  if (tagUid) {
    const { data: tag } = await supabase
      .from('nfc_tags')
      .select('*')
      .eq('tag_uid', tagUid)
      .eq('tenant_id', tenantId)
      .single();
    if (!tag) throw new NotFoundError('NFC tag not found');
    if (tag.status !== 'active') throw new ConflictError('NFC tag is not active');
    if (!tag.employee_id) throw new ConflictError('NFC tag is not assigned to any employee');
    return { employeeId: Number(tag.employee_id), checkInMethod: 'nfc' as const, tag };
  }
  if (!employeeId) throw new BadRequestError('Either tagUid or employeeId must be provided');
  return { employeeId, checkInMethod: 'manual' as const, tag: null };
}

export const POST = withApiHandler(async (request, context) => {
  const payload = checkInSchema.parse(await request.json());
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();

  if (payload.idempotencyKey) {
    const { data: existingByKey } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('idempotency_key', payload.idempotencyKey)
      .eq('tenant_id', tenantId)
      .single();
    if (existingByKey) {
      return NextResponse.json({ ...existingByKey, message: 'Check-in already processed (idempotency)' });
    }
  }

  const resolved = await resolveSupabaseEmployee(accessToken, tenantId, payload.tagUid, payload.employeeId);
  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('id', resolved.employeeId)
    .eq('tenant_id', tenantId)
    .single();
  if (!employee) throw new NotFoundError('Employee not found');
  const profiles = await listSupabaseProfilesByAuthIds([String(employee.user_id)], { accessToken, tenantId, useAdmin: true });
  const profile = profiles.get(String(employee.user_id));
  const employeeView = {
    id: Number(employee.id),
    name: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim(),
    email: profile?.email ?? null,
    department: employee.department,
    photoUrl: profile?.avatar_url ?? null,
  };

  const isAdminLike = actor.role === 'Admin' || actor.role === 'SuperAdmin' || actor.role === 'Manager';
  if (!isAdminLike && String(employee.user_id) !== actor.authUserId) {
    throw new BadRequestError('Insufficient permissions. You can only log your own attendance.');
  }

  const nowDate = new Date();
  const today = nowDate.toISOString().split('T')[0];
  const minuteStart = new Date(nowDate);
  minuteStart.setSeconds(0, 0);
  const minuteEnd = new Date(minuteStart.getTime() + 60_000);
  const { data: sameMinuteRecord } = await supabase.from('attendance_records').select('*')
    .eq('employee_id', resolved.employeeId)
    .eq('date', today)
    .eq('tenant_id', tenantId)
    .gte('time_in', minuteStart.toISOString())
    .lt('time_in', minuteEnd.toISOString())
    .single();
  if (sameMinuteRecord) {
    return NextResponse.json({ ...sameMinuteRecord, employee: employeeView, message: 'Check-in already exists for this minute' });
  }

  if (resolved.tag) {
    await supabase.from('nfc_tags').update({
      last_used_at: nowDate.toISOString(),
      reader_id: payload.readerId || resolved.tag.reader_id,
    })
    .eq('tag_uid', String(resolved.tag.tag_uid))
    .eq('tenant_id', tenantId);
  }

  const metadata = payload.metadata ?? null;
  const { data: created, error } = await supabase.from('attendance_records').insert({
    employee_id: resolved.employeeId,
    date: today,
    time_in: nowDate.toISOString(),
    time_out: null,
    location_latitude: payload.locationLatitude ?? null,
    location_longitude: payload.locationLongitude ?? null,
    duration: null,
    status: 'present',
    check_in_method: resolved.checkInMethod,
    reader_id: payload.readerId ?? null,
    location: payload.location ?? null,
    tag_uid: payload.tagUid ?? null,
    idempotency_key: payload.idempotencyKey ?? null,
    synced_at: null,
    metadata,
    tenant_id: tenantId,
    created_at: nowDate.toISOString(),
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create attendance record');

  return NextResponse.json({ ...created, employee: employeeView, message: 'Check-in successful' }, { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });
