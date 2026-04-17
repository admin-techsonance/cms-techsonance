import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError } from '@/server/http/errors';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

export const GET = withApiHandler(async (request, context) => {
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();

  let { data: settings } = await supabase
    .from('tenant_attendance_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  if (!settings) {
    // Return defaults if none exist
    settings = {
      tenant_id: tenantId,
      office_latitude: null,
      office_longitude: null,
      geofence_radius_meters: 500,
      allowed_ips: '',
      standard_work_hours: 9.0
    };
  }

  return NextResponse.json(settings);
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = await request.json();
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;

  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();

  const { data: updated, error } = await supabase.from('tenant_attendance_settings').upsert({
    tenant_id: tenantId,
    office_latitude: payload.office_latitude ?? null,
    office_longitude: payload.office_longitude ?? null,
    geofence_radius_meters: payload.geofence_radius_meters ?? 500,
    allowed_ips: payload.allowed_ips ?? '',
    standard_work_hours: payload.standard_work_hours ?? 9.0,
    updated_at: new Date().toISOString()
  }).select('*').single();

  if (error) throw new Error('Failed to update attendance settings');

  return NextResponse.json({ success: true, settings: updated });
}, { requireAuth: true, roles: ['Admin', 'SuperAdmin', 'Manager'] });
