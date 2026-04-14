import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { clientStatusSchema, createClientSchema, updateClientSchema } from '@/server/validation/clients';
import {
  buildLegacyUserIdMap,
  getAdminRouteSupabase,
  getCurrentSupabaseActor,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseClientRow(row: Record<string, unknown>, userMap: Map<string, number | null>) {
  const createdBy = typeof row.created_by === 'string' ? userMap.get(row.created_by) ?? null : null;
  return {
    id: Number(row.id),
    companyName: row.company_name,
    contactPerson: row.contact_person,
    email: row.email,
    phone: row.phone ?? null,
    address: row.address ?? null,
    industry: row.industry ?? null,
    status: row.status,
    createdBy,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    notes: row.notes ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();

  if (id) {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', Number(id))
      .eq('tenant_id', tenantId)
      .single();
      
    if (error || !data) throw new NotFoundError('Client not found');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(data.created_by)], tenantId);
    return NextResponse.json(normalizeSupabaseClientRow(data, userMap));
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const status = searchParams.get('status');
  const industry = searchParams.get('industry');
  
  let query = supabase
    .from('clients')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (search) {
    query = query.or(`company_name.ilike.%${search}%,contact_person.ilike.%${search}%,email.ilike.%${search}%`);
  }
  if (status) query = query.eq('status', clientStatusSchema.parse(status));
  if (industry) query = query.eq('industry', industry);

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  const userMap = await buildLegacyUserIdMap(
    accessToken,
    ((data as Record<string, unknown>[] | null) ?? []).map((row) => String(row.created_by)).filter(Boolean),
    tenantId
  );

  return NextResponse.json({
    success: true,
    data: ((data as Record<string, unknown>[] | null) ?? []).map((row) => normalizeSupabaseClientRow(row, userMap)),
    message: 'Clients fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createClientSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('clients').insert({
    company_name: payload.companyName.trim(),
    contact_person: payload.contactPerson.trim(),
    email: payload.email.toLowerCase().trim(),
    phone: payload.phone?.trim() || null,
    address: payload.address?.trim() || null,
    industry: payload.industry?.trim() || null,
    notes: payload.notes?.trim() || null,
    status: payload.status ?? 'active',
    tenant_id: tenantId,
    created_by: actor.authUserId,
    created_at: now,
    updated_at: now,
  }).select('*').single();

  if (error || !data) throw error ? new Error(error.message) : new Error('Failed to create client');
  const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId], tenantId);
  return NextResponse.json(normalizeSupabaseClientRow(data, userMap), { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid client id is required');

  const payload = updateClientSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!existing) throw new NotFoundError('Client not found');

  const { data, error } = await supabase.from('clients').update({
    ...(payload.companyName !== undefined ? { company_name: payload.companyName.trim() } : {}),
    ...(payload.contactPerson !== undefined ? { contact_person: payload.contactPerson.trim() } : {}),
    ...(payload.email !== undefined ? { email: payload.email.toLowerCase().trim() } : {}),
    ...(payload.phone !== undefined ? { phone: payload.phone?.trim() || null } : {}),
    ...(payload.address !== undefined ? { address: payload.address?.trim() || null } : {}),
    ...(payload.industry !== undefined ? { industry: payload.industry?.trim() || null } : {}),
    ...(payload.notes !== undefined ? { notes: payload.notes?.trim() || null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    updated_at: new Date().toISOString(),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();

  if (error || !data) throw error ? new Error(error.message) : new Error('Failed to update client');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.created_by)]);
  return NextResponse.json(normalizeSupabaseClientRow(data, userMap));
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid client id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data, error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !data) throw new NotFoundError('Client not found');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.created_by)]);
  return NextResponse.json({ message: 'Client deleted successfully', client: normalizeSupabaseClientRow(data, userMap) });
}, { requireAuth: true, roles: ['Manager'] });
