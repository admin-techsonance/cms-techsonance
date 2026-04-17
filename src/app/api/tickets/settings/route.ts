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
    .from('helpdesk_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  if (!settings) {
    settings = {
      tenant_id: tenantId,
      it_support_email: '',
      hr_support_email: ''
    };
  }

  return NextResponse.json(settings);
}, { requireAuth: true, roles: ['Admin', 'SuperAdmin', 'Manager', 'Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = await request.json();
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;

  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();

  const { data: updated, error } = await supabase.from('helpdesk_settings').upsert({
    tenant_id: tenantId,
    it_support_email: payload.it_support_email ?? '',
    hr_support_email: payload.hr_support_email ?? '',
    updated_at: new Date().toISOString()
  }).select('*').single();

  if (error) throw new Error('Failed to update helpdesk routing settings');

  return NextResponse.json({ success: true, settings: updated });
}, { requireAuth: true, roles: ['Admin', 'SuperAdmin', 'Manager'] });
