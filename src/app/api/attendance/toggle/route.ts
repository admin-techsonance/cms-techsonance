import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { attendanceToggleSchema } from '@/server/validation/attendance-admin';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';
import { listSupabaseProfilesByAuthIds } from '@/server/supabase/users';

export const POST = withApiHandler(async (request, context) => {
  const payload = attendanceToggleSchema.parse(await request.json());
  const authHeader = request.headers.get('authorization');
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  let finalEmployeeId = payload.employeeId ?? null;
  let checkInMethod = 'manual';

  if (payload.tagUid) {
    const { data: tag } = await supabase
      .from('nfc_tags')
      .select('*')
      .eq('tag_uid', payload.tagUid)
      .eq('tenant_id', tenantId)
      .single();
    if (!tag) throw new NotFoundError('NFC tag not found');
    if (tag.status !== 'active') throw new UnprocessableEntityError('NFC tag is not active');
    if (!tag.employee_id) throw new BadRequestError('NFC tag is not assigned to an employee');
    finalEmployeeId = Number(tag.employee_id);
    checkInMethod = 'nfc';
    await supabase.from('nfc_tags').update({
      last_used_at: new Date().toISOString(),
      reader_id: payload.readerId ?? tag.reader_id,
    })
    .eq('tag_uid', payload.tagUid)
    .eq('tenant_id', tenantId);
  }

  if (!finalEmployeeId) throw new BadRequestError('A valid employee identifier is required');
  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('id', finalEmployeeId)
    .eq('tenant_id', tenantId)
    .single();
  if (!employee) throw new NotFoundError('Employee not found');
  const profiles = await listSupabaseProfilesByAuthIds([String(employee.user_id)], { 
    useAdmin: true, 
    tenantId 
  });
  const profile = profiles.get(String(employee.user_id));
  const employeeView = {
    id: Number(employee.id),
    name: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim(),
    email: profile?.email ?? null,
    department: employee.department,
    photoUrl: profile?.avatar_url ?? null,
  };

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const { data: activeCheckIn } = await supabase.from('attendance_records').select('*')
    .eq('employee_id', finalEmployeeId)
    .eq('date', today)
    .eq('tenant_id', tenantId)
    .is('time_out', null)
    .maybeSingle();

  if (activeCheckIn) {
    const duration = Math.floor((new Date(now).getTime() - new Date(String(activeCheckIn.time_in)).getTime()) / 60000);
    const { data: updated, error } = await supabase.from('attendance_records').update({
      time_out: now,
      duration,
    })
    .eq('id', activeCheckIn.id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
    if (error || !updated) throw error ?? new Error('Failed to toggle checkout');

    return apiSuccess({
      action: 'checkout',
      ...updated,
      employee: employeeView,
    }, `Time Out recorded successfully. Duration: ${duration} minutes`);
  }

  if (payload.idempotencyKey) {
    const { data: existing } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('idempotency_key', payload.idempotencyKey)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (existing) {
      return apiSuccess({
        action: 'checkin',
        ...existing,
        employee: employeeView,
      }, 'Check-in already processed');
    }
  }

  const { data: created, error } = await supabase.from('attendance_records').insert({
    employee_id: finalEmployeeId,
    date: today,
    time_in: now,
    time_out: null,
    location_latitude: payload.locationLatitude ?? null,
    location_longitude: payload.locationLongitude ?? null,
    duration: null,
    status: 'present',
    check_in_method: checkInMethod,
    reader_id: payload.readerId ?? null,
    location: payload.location ?? null,
    tag_uid: payload.tagUid ?? null,
    idempotency_key: payload.idempotencyKey ?? null,
    synced_at: null,
    metadata: payload.metadata ?? null,
    tenant_id: tenantId,
    created_at: now,
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to toggle checkin');

  return apiSuccess({
    action: 'checkin',
    ...created,
    employee: employeeView,
  }, 'Time In recorded successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });
