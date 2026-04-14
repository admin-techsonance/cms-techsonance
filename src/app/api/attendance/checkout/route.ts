import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { checkOutSchema } from '@/server/validation/attendance';
import { getCurrentSupabaseActor, getAdminRouteSupabase } from '@/server/supabase/route-helpers';
import { listSupabaseProfilesByAuthIds } from '@/server/supabase/users';

async function resolveSupabaseEmployeeForCheckout(accessToken: string, tenantId: string, tagUid?: string | null, employeeId?: number | null) {
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
    if (!tag.employee_id) throw new ConflictError('NFC tag is not assigned to an employee');
    return { employeeId: Number(tag.employee_id), tag };
  }
  if (!employeeId) throw new BadRequestError('Either tagUid or employeeId must be provided');
  return { employeeId, tag: null };
}

export const POST = withApiHandler(async (request, context) => {
  const payload = checkOutSchema.parse(await request.json());
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const resolved = await resolveSupabaseEmployeeForCheckout(accessToken, tenantId, payload.tagUid, payload.employeeId);
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

  const today = new Date().toISOString().split('T')[0];
  const { data: activeCheckIn } = await supabase.from('attendance_records').select('*')
    .eq('employee_id', resolved.employeeId)
    .eq('date', today)
    .eq('tenant_id', tenantId)
    .is('time_out', null)
    .single();
  if (!activeCheckIn) throw new NotFoundError('No active check-in found for today');

  const now = new Date().toISOString();
  const durationMinutes = Math.floor((new Date(now).getTime() - new Date(String(activeCheckIn.time_in)).getTime()) / 60000);
  const { data: updated, error } = await supabase
    .from('attendance_records')
    .update({
      time_out: now,
      duration: durationMinutes,
    })
    .eq('id', activeCheckIn.id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !updated) throw error ?? new Error('Failed to update attendance record');

  if (resolved.tag) {
    await supabase
      .from('nfc_tags')
      .update({ last_used_at: now })
      .eq('tag_uid', String(resolved.tag.tag_uid))
      .eq('tenant_id', tenantId);
  }

  return NextResponse.json({ ...updated, employee: employeeView });
}, { requireAuth: true, roles: ['Employee'] });
