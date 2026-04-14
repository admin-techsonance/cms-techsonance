import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createVendorSchema, updateVendorSchema } from '@/server/validation/procurement';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

function normalizeSupabaseVendorRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    name: row.name,
    contactPerson: row.contact_person ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    status: row.status,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const limit = searchParams.get('limit') ? Math.min(Number(searchParams.get('limit')), 100) : 50;
  const offset = searchParams.get('offset') ? Math.max(Number(searchParams.get('offset')), 0) : 0;
  const search = searchParams.get('search');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();

  if (id) {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', Number(id))
      .eq('tenant_id', tenantId)
      .single();
    if (error || !data) throw new NotFoundError('Vendor not found');
    return NextResponse.json(normalizeSupabaseVendorRow(data));
  }
  let query = supabase
    .from('vendors')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);
  if (search) {
    query = query.or(`name.ilike.%${search}%,contact_person.ilike.%${search}%,email.ilike.%${search}%`);
  }
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  return NextResponse.json({ success: true, data: ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseVendorRow), message: 'Vendors fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createVendorSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data, error } = await supabase.from('vendors').insert({
    name: payload.name,
    contact_person: payload.contactPerson ?? null,
    email: payload.email ?? null,
    phone: payload.phone ?? null,
    address: payload.address ?? null,
    status: payload.status ?? 'active',
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select('*').single();
  if (error || !data) throw error ?? new Error('Failed to create vendor');
  return NextResponse.json(normalizeSupabaseVendorRow(data), { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid vendor id is required');
  const payload = updateVendorSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data, error } = await supabase.from('vendors').update({
    ...(payload.name !== undefined ? { name: payload.name } : {}),
    ...(payload.contactPerson !== undefined ? { contact_person: payload.contactPerson ?? null } : {}),
    ...(payload.email !== undefined ? { email: payload.email ?? null } : {}),
    ...(payload.phone !== undefined ? { phone: payload.phone ?? null } : {}),
    ...(payload.address !== undefined ? { address: payload.address ?? null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    updated_at: new Date().toISOString(),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !data) throw new NotFoundError('Vendor not found');
  return NextResponse.json(normalizeSupabaseVendorRow(data));
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid vendor id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data, error } = await supabase
    .from('vendors')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !data) throw new NotFoundError('Vendor not found');
  return NextResponse.json({ success: true, vendor: normalizeSupabaseVendorRow(data) });
}, { requireAuth: true, roles: ['Manager'] });
