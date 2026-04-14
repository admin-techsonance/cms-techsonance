import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError, ConflictError } from '@/server/http/errors';
import { createAttendanceSchema, attendanceStatusSchema } from '@/server/validation/attendance-admin';
import { getCurrentSupabaseActor, getAdminRouteSupabase } from '@/server/supabase/route-helpers';
import { listSupabaseProfilesByAuthIds } from '@/server/supabase/users';

async function buildAttendanceEmployeeMap(accessToken: string, tenantId: string, employeeIds: number[]) {
  if (!employeeIds.length) {
    return new Map<number, {
      id: number;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      department: string | null;
      photoUrl: string | null;
      status: string | null;
    }>();
  }

  const supabase = getAdminRouteSupabase();
  const { data } = await supabase
    .from('employees')
    .select('*')
    .in('id', employeeIds)
    .eq('tenant_id', tenantId);
    
  const employeeRows = (data as Record<string, unknown>[] | null) ?? [];
  const profileMap = await listSupabaseProfilesByAuthIds(
    employeeRows.map((row) => String(row.user_id)).filter(Boolean),
    { accessToken, tenantId, useAdmin: true }
  );

  return new Map(
    employeeRows.map((row) => {
      const profile = profileMap.get(String(row.user_id));
      return [
        Number(row.id),
        {
          id: Number(row.id),
          firstName: profile?.first_name ?? null,
          lastName: profile?.last_name ?? null,
          email: profile?.email ?? null,
          department: typeof row.department === 'string' ? row.department : null,
          photoUrl: profile?.avatar_url ?? null,
          status: typeof row.status === 'string' ? row.status : null,
        },
      ];
    })
  );
}

export const GET = withApiHandler(async (request, context) => {
  const user = context.auth!.user;
  const searchParams = new URL(request.url).searchParams;
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const employeeIdParam = searchParams.get('employee_id');
  const readerId = searchParams.get('reader_id');
  const status = searchParams.get('status');
  const source = searchParams.get('source');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const actor = await getCurrentSupabaseActor(accessToken);
  let employeeId: number | null = employeeIdParam ? Number(employeeIdParam) : null;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';

  if (!isAdminLike) {
    const { data: selfEmployee } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', actor.authUserId)
      .eq('tenant_id', tenantId)
      .single();
    if (!selfEmployee) return NextResponse.json([]);
    employeeId = selfEmployee.id;
  }

  let modernQuery = supabase
    .from('attendance_records')
    .select('*')
    .eq('tenant_id', tenantId);
  if (startDate) modernQuery = modernQuery.gte('date', startDate);
  if (endDate) modernQuery = modernQuery.lte('date', endDate);
  if (employeeId) modernQuery = modernQuery.eq('employee_id', employeeId);
  if (readerId) modernQuery = modernQuery.eq('reader_id', readerId);
  if (status) modernQuery = modernQuery.eq('status', attendanceStatusSchema.parse(status));

  let legacyQuery = supabase
    .from('attendance')
    .select('*')
    .eq('tenant_id', tenantId);
  if (startDate) legacyQuery = legacyQuery.gte('date', startDate);
  if (endDate) legacyQuery = legacyQuery.lte('date', endDate);
  if (employeeId) legacyQuery = legacyQuery.eq('employee_id', employeeId);
  if (status) legacyQuery = legacyQuery.eq('status', attendanceStatusSchema.parse(status));

  const [nfcResult, legacyResult] = await Promise.all([
    source === 'legacy'
      ? Promise.resolve({ data: [] as Record<string, unknown>[] })
      : modernQuery.order('date', { ascending: false }).order('time_in', { ascending: false }).range(0, limit + offset - 1),
    source === 'nfc' || readerId
      ? Promise.resolve({ data: [] as Record<string, unknown>[] })
      : legacyQuery.order('date', { ascending: false }).range(0, limit + offset - 1),
  ]);

  const allEmployeeIds = [
    ...(((nfcResult.data as Record<string, unknown>[] | null) ?? []).map((row) => Number(row.employee_id))),
    ...(((legacyResult.data as Record<string, unknown>[] | null) ?? []).map((row) => Number(row.employee_id))),
  ];
  const employeeMap = await buildAttendanceEmployeeMap(accessToken, tenantId, Array.from(new Set(allEmployeeIds)));

  const normalizedModern = (((nfcResult.data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    id: `nfc_${row.id}`,
    employeeId: Number(row.employee_id),
    date: row.date,
    timeIn: row.time_in ?? null,
    timeOut: row.time_out ?? null,
    locationLatitude: row.location_latitude ?? null,
    locationLongitude: row.location_longitude ?? null,
    duration: row.duration ?? null,
    status: row.status,
    checkInMethod: row.check_in_method,
    readerId: row.reader_id ?? null,
    location: row.location ?? null,
    tagUid: row.tag_uid ?? null,
    idempotencyKey: row.idempotency_key ?? null,
    syncedAt: row.synced_at ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.created_at ?? null,
    employee: employeeMap.get(Number(row.employee_id)) ?? null,
    _source: 'nfc',
  })));

  const normalizedLegacy = (((legacyResult.data as Record<string, unknown>[] | null) ?? []).map((row) => {
    const checkIn = row.check_in ?? null;
    const checkOut = row.check_out ?? null;
    return {
      id: `legacy_${row.id}`,
      employeeId: Number(row.employee_id),
      date: row.date,
      timeIn: checkIn,
      timeOut: checkOut,
      locationLatitude: null,
      locationLongitude: null,
      duration: checkIn && checkOut ? Math.floor((new Date(String(checkOut)).getTime() - new Date(String(checkIn)).getTime()) / 60000) : null,
      status: row.status,
      checkInMethod: 'legacy',
      readerId: null,
      location: null,
      tagUid: null,
      idempotencyKey: null,
      syncedAt: null,
      metadata: row.notes ? JSON.stringify({ notes: row.notes }) : null,
      createdAt: checkIn || row.date,
      employee: employeeMap.get(Number(row.employee_id)) ?? null,
      _source: 'legacy',
    };
  }));

  const nfcKeys = new Set(normalizedModern.map((row) => `${row.employeeId}_${row.date}`));
  const merged = [...normalizedModern, ...normalizedLegacy.filter((row) => !nfcKeys.has(`${row.employeeId}_${row.date}`))]
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || String(b.timeIn ?? '').localeCompare(String(a.timeIn ?? '')))
    .slice(offset, offset + limit);

  return NextResponse.json({
    success: true,
    data: merged,
    message: 'Attendance fetched successfully',
    errors: null,
    meta: { page: Math.floor(offset / limit) + 1, limit, total: merged.length },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createAttendanceSchema.parse(await request.json());
  const user = context.auth!.user;

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const actor = await getCurrentSupabaseActor(accessToken);
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike) {
    const { data: selfEmployee } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', actor.authUserId)
      .eq('tenant_id', tenantId)
      .single();
    if (!selfEmployee || selfEmployee.id !== payload.employeeId) {
      throw new ForbiddenError('Insufficient permissions. You can only log your own attendance.');
    }
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('id', payload.employeeId)
    .eq('tenant_id', tenantId)
    .single();
  if (!employee) throw new NotFoundError('Employee not found');

  const { data: existingModern } = await supabase
    .from('attendance_records')
    .select('id')
    .eq('employee_id', payload.employeeId)
    .eq('date', payload.date)
    .eq('tenant_id', tenantId)
    .maybeSingle();
    
  const { data: existingLegacy } = await supabase
    .from('attendance')
    .select('id')
    .eq('employee_id', payload.employeeId)
    .eq('date', payload.date)
    .eq('tenant_id', tenantId)
    .maybeSingle();
    
  if (existingModern || existingLegacy) {
    throw new ConflictError('Attendance record already exists for this employee on this date.');
  }

  const duration = payload.duration ?? (payload.timeOut ? Math.floor((new Date(payload.timeOut).getTime() - new Date(payload.timeIn).getTime()) / 60000) : null);
  const { data, error } = await supabase.from('attendance_records').insert({
    employee_id: payload.employeeId,
    date: payload.date,
    time_in: payload.timeIn,
    time_out: payload.timeOut ?? null,
    duration,
    status: payload.status,
    check_in_method: 'manual',
    location: payload.location ?? null,
    reader_id: payload.readerId ?? null,
    metadata: payload.notes ? { notes: payload.notes, createdBy: actor.legacyUserId } : { createdBy: actor.legacyUserId },
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  }).select('*').single();

  if (error || !data) throw error ?? new Error('Failed to create attendance');
  return NextResponse.json({
    id: data.id,
    employeeId: Number(data.employee_id),
    date: data.date,
    timeIn: data.time_in,
    timeOut: data.time_out,
    duration: data.duration,
    status: data.status,
    checkInMethod: data.check_in_method,
    readerId: data.reader_id,
    location: data.location,
    metadata: data.metadata,
    createdAt: data.created_at,
  }, { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });
