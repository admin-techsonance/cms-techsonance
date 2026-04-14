import { withApiHandler } from '@/server/http/handler';
import { ConflictError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createManualAttendanceSchema } from '@/server/validation/attendance-admin';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';
import { listSupabaseProfilesByAuthIds } from '@/server/supabase/users';

export const POST = withApiHandler(async (request, context) => {
  const payload = createManualAttendanceSchema.parse(await request.json());
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new NotFoundError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: employeeRow } = await supabase
    .from('employees')
    .select('*')
    .eq('id', payload.employeeId)
    .eq('tenant_id', tenantId)
    .single();
  if (!employeeRow) throw new NotFoundError('Employee not found');
  const profiles = await listSupabaseProfilesByAuthIds([String(employeeRow.user_id)], { 
    useAdmin: true, 
    tenantId 
  });
  const profile = profiles.get(String(employeeRow.user_id));

  const checkInDate = new Date(payload.checkIn);
  const date = checkInDate.toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from('attendance_records')
    .select('id')
    .eq('employee_id', payload.employeeId)
    .eq('date', date)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (existing) throw new ConflictError('Attendance record already exists for this employee on this date');

  let duration: number | null = null;
  let status = 'present';
  if (payload.checkOut) {
    const checkOutDate = new Date(payload.checkOut);
    duration = Math.floor((checkOutDate.getTime() - checkInDate.getTime()) / 60000);
    if (checkInDate.getHours() > 9 || (checkInDate.getHours() === 9 && checkInDate.getMinutes() > 15)) {
      status = 'late';
    }
  }

  const metadata = {
    notes: payload.notes ?? '',
    createdBy: context.auth!.user.id,
    createdByName: `${context.auth!.user.firstName} ${context.auth!.user.lastName}`,
    manualEntry: true,
    entryReason: 'Manual attendance entry by HR/Admin',
  };

  const { data: created, error } = await supabase.from('attendance_records').insert({
    employee_id: payload.employeeId,
    date,
    time_in: payload.checkIn,
    time_out: payload.checkOut ?? null,
    duration,
    status,
    check_in_method: 'manual',
    location: null,
    reader_id: null,
    tag_uid: null,
    location_latitude: null,
    location_longitude: null,
    idempotency_key: null,
    synced_at: null,
    metadata,
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create manual attendance entry');

  return apiSuccess({
    ...created,
    employee: {
      id: Number(employeeRow.id),
      employeeId: employeeRow.employee_id,
      fullName: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim(),
      name: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim(),
      email: profile?.email ?? null,
      department: employeeRow.department,
      photoUrl: profile?.avatar_url ?? null,
    },
  }, 'Manual attendance entry created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });
