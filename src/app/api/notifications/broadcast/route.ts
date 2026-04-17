import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError } from '@/server/http/errors';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';
import { getDashboardType, type UserRole } from '@/lib/permissions';

export const POST = withApiHandler(async (request, context) => {
  const payload = await request.json();
  const { title, message, type } = payload;

  if (!title || !message || !type) {
    throw new BadRequestError('Title, message, and type are required');
  }

  const user = context.auth!.user;
  const tenantId = user.tenantId;

  if (!tenantId) throw new BadRequestError('Tenant is missing');

  // Strict UI-level auth check
  if (getDashboardType(user.role as UserRole) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized to broadcast' }, { status: 403 });
  }

  const supabase = getAdminRouteSupabase();

  // Fetch all active employees
  const { data: employees, error: fetchError } = await supabase
    .from('employees')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (fetchError) throw fetchError;
  if (!employees || employees.length === 0) {
    return NextResponse.json({ message: 'No active employees found to notify' });
  }

  // Map to notification rows
  const notificationsToInsert = employees.map(emp => ({
    user_id: emp.user_id,
    title: title.trim(),
    message: message.trim(),
    type: type,
    is_read: false,
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  }));

  // Bulk insert
  const { error: insertError } = await supabase
    .from('notifications')
    .insert(notificationsToInsert);

  if (insertError) throw insertError;

  return NextResponse.json({ 
    success: true, 
    message: `Broadcast sent to ${notificationsToInsert.length} employees`,
    broadcastCount: notificationsToInsert.length 
  }, { status: 201 });
}, { requireAuth: true, roles: ['Manager', 'Admin', 'SuperAdmin', 'ceo', 'cto', 'management', 'hr_manager'] });
