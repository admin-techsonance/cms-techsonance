import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { getAdminRouteSupabase, getCurrentSupabaseActor } from '@/server/supabase/route-helpers';

export const GET = withApiHandler(async (request, context) => {
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();

  let query = supabase.from('attendance_requests').select(`
    *,
    employees!inner(id, user_id, department)
  `).eq('tenant_id', tenantId);

  // If not admin, they can only see their own pending requests
  if (!isAdminLike) {
    query = query.eq('employees.user_id', actor.authUserId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;

  return NextResponse.json(data);
}, { requireAuth: true, roles: ['Employee'] });

export const PATCH = withApiHandler(async (request, context) => {
  const { id, action, rejection_reason } = await request.json(); // action: 'approve' | 'reject'
  const user = context.auth!.user;
  
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  if (!['approve', 'reject'].includes(action)) {
    throw new BadRequestError('Invalid action. Must be approve or reject');
  }

  const supabase = getAdminRouteSupabase();

  // Fetch the request
  const { data: attendanceRequest, error: reqError } = await supabase
    .from('attendance_requests')
    .select('*, employees!inner(id, user_id)')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (reqError || !attendanceRequest) throw new NotFoundError('Attendance request not found');
  if (attendanceRequest.status !== 'pending') throw new BadRequestError('Request is not pending');

  if (action === 'reject') {
    // Just update status
    await supabase.from('attendance_requests').update({ 
      status: 'rejected',
      metadata: { ...attendanceRequest.metadata, rejection_reason }
    }).eq('id', id);

    // Notify employee
    await supabase.from('notifications').insert({
      user_id: attendanceRequest.employees.user_id,
      title: 'Attendance Rejected',
      message: `Your weekend attendance request for ${attendanceRequest.date} was rejected. Reason: ${rejection_reason || 'None provided'}`,
      type: 'error',
      link: '/dashboard/attendance',
      is_read: false,
      tenant_id: tenantId,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, message: 'Rejected successfully' });
  }

  if (action === 'approve') {
    // 1. Move to attendance_records
    const { data: maxRecord } = await supabase
      .from('attendance_records')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextId = (maxRecord?.id || 0) + 1;

    const { error: insertError } = await supabase.from('attendance_records').insert({
      id: nextId,
      employee_id: attendanceRequest.employee_id,
      date: attendanceRequest.date,
      time_in: attendanceRequest.time_in,
      time_out: attendanceRequest.time_out,
      duration: attendanceRequest.duration,
      status: 'present',
      check_in_method: attendanceRequest.check_in_method,
      location: attendanceRequest.location,
      reader_id: attendanceRequest.reader_id,
      metadata: attendanceRequest.metadata,
      tenant_id: tenantId,
      created_at: new Date().toISOString(),
    });

    if (insertError) throw new Error('Failed to migrate approved record to attendance_records');

    // 2. Mark as approved
    await supabase.from('attendance_requests').update({ status: 'approved' }).eq('id', id);

    // Notify employee
    await supabase.from('notifications').insert({
      user_id: attendanceRequest.employees.user_id,
      title: 'Attendance Approved',
      message: `Your weekend attendance request for ${attendanceRequest.date} was approved!`,
      type: 'success',
      link: '/dashboard/attendance',
      is_read: false,
      tenant_id: tenantId,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, message: 'Approved successfully' });
  }

}, { requireAuth: true, roles: ['Admin', 'SuperAdmin', 'Manager'] });
