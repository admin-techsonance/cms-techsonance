import { NextResponse } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { attendanceRecords, employees, nfcTags, users } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { checkOutSchema } from '@/server/validation/attendance';
import { getCurrentSupabaseActor, getRouteSupabase } from '@/server/supabase/route-helpers';
import { listSupabaseProfilesByAuthIds } from '@/server/supabase/users';

async function resolveEmployeeForCheckout(tagUid?: string | null, employeeId?: number | null) {
  if (tagUid) {
    const [tag] = await db.select().from(nfcTags).where(eq(nfcTags.tagUid, tagUid)).limit(1);
    if (!tag) throw new NotFoundError('NFC tag not found');
    if (tag.status !== 'active') throw new ConflictError('NFC tag is not active');
    if (!tag.employeeId) throw new ConflictError('NFC tag is not assigned to an employee');
    return { employeeId: tag.employeeId, tag };
  }
  if (!employeeId) throw new BadRequestError('Either tagUid or employeeId must be provided');
  return { employeeId, tag: null };
}

async function resolveSupabaseEmployeeForCheckout(accessToken: string, tagUid?: string | null, employeeId?: number | null) {
  const supabase = getRouteSupabase(accessToken);
  if (tagUid) {
    const { data: tag } = await supabase.from('nfc_tags').select('*').eq('tag_uid', tagUid).single();
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

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const resolved = await resolveSupabaseEmployeeForCheckout(accessToken, payload.tagUid, payload.employeeId);
    const { data: employee } = await supabase.from('employees').select('*').eq('id', resolved.employeeId).single();
    if (!employee) throw new NotFoundError('Employee not found');
    const profiles = await listSupabaseProfilesByAuthIds([String(employee.user_id)], accessToken);
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
      .is('time_out', null)
      .single();
    if (!activeCheckIn) throw new NotFoundError('No active check-in found for today');

    const now = new Date().toISOString();
    const durationMinutes = Math.floor((new Date(now).getTime() - new Date(String(activeCheckIn.time_in)).getTime()) / 60000);
    const { data: updated, error } = await supabase.from('attendance_records').update({
      time_out: now,
      duration: durationMinutes,
    }).eq('id', activeCheckIn.id).select('*').single();
    if (error || !updated) throw error ?? new Error('Failed to update attendance record');

    if (resolved.tag) {
      await supabase.from('nfc_tags').update({ last_used_at: now }).eq('tag_uid', String(resolved.tag.tag_uid));
    }

    return NextResponse.json({ ...updated, employee: employeeView });
  }

  const resolved = await resolveEmployeeForCheckout(payload.tagUid, payload.employeeId);

  const [employee] = await db.select({
    id: employees.id,
    name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`.as('name'),
    email: users.email,
    department: employees.department,
    photoUrl: users.avatarUrl,
  }).from(employees).innerJoin(users, eq(employees.userId, users.id)).where(eq(employees.id, resolved.employeeId)).limit(1);
  if (!employee) throw new NotFoundError('Employee not found');

  const userRole = context.auth!.user.role;
  const isAdminLike = userRole === 'Admin' || userRole === 'SuperAdmin' || userRole === 'Manager';
  if (!isAdminLike) {
    const [selfEmployee] = await db.select().from(employees).where(eq(employees.userId, context.auth!.user.id)).limit(1);
    if (!selfEmployee || selfEmployee.id !== resolved.employeeId) {
      throw new BadRequestError('Insufficient permissions. You can only log your own attendance.');
    }
  }

  const today = new Date().toISOString().split('T')[0];
  const [activeCheckIn] = await db.select().from(attendanceRecords).where(and(
    eq(attendanceRecords.employeeId, resolved.employeeId),
    eq(attendanceRecords.date, today),
    isNull(attendanceRecords.timeOut),
  )).limit(1);

  if (!activeCheckIn) throw new NotFoundError('No active check-in found for today');

  const now = new Date().toISOString();
  const durationMinutes = Math.floor((new Date(now).getTime() - new Date(activeCheckIn.timeIn).getTime()) / 60000);
  const [updated] = await db.update(attendanceRecords).set({
    timeOut: now,
    duration: durationMinutes,
  }).where(eq(attendanceRecords.id, activeCheckIn.id)).returning();

  if (resolved.tag) {
    await db.update(nfcTags).set({ lastUsedAt: now }).where(eq(nfcTags.tagUid, resolved.tag.tagUid));
  }

  return NextResponse.json({ ...updated, employee });
}, { requireAuth: true, roles: ['Employee'] });
