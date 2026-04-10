import { NextResponse } from 'next/server';
import { desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { vendors } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createVendorSchema, updateVendorSchema } from '@/server/validation/procurement';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { getRouteSupabase } from '@/server/supabase/route-helpers';

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
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    if (id) {
      const { data, error } = await supabase.from('vendors').select('*').eq('id', Number(id)).single();
      if (error || !data) throw new NotFoundError('Vendor not found');
      return NextResponse.json(normalizeSupabaseVendorRow(data));
    }
    let query = supabase.from('vendors').select('*', { count: 'exact' });
    if (search) {
      query = query.or(`name.ilike.%${search}%,contact_person.ilike.%${search}%,email.ilike.%${search}%`);
    }
    const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    return NextResponse.json({ success: true, data: ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseVendorRow), message: 'Vendors fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) } });
  }
  if (id) {
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, Number(id))).limit(1);
    if (!vendor) throw new NotFoundError('Vendor not found');
    return NextResponse.json(vendor);
  }
  let query = db.select().from(vendors);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(vendors);
  if (search) {
    const condition = or(like(vendors.name, `%${search}%`), like(vendors.contactPerson, `%${search}%`), like(vendors.email, `%${search}%`));
    query = query.where(condition) as typeof query;
    countQuery = countQuery.where(condition) as typeof countQuery;
  }
  const [rows, countRows] = await Promise.all([query.orderBy(desc(vendors.createdAt)).limit(limit).offset(offset), countQuery]);
  return NextResponse.json({ success: true, data: rows, message: 'Vendors fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createVendorSchema.parse(await request.json());
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data, error } = await supabase.from('vendors').insert({
      name: payload.name,
      contact_person: payload.contactPerson ?? null,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      address: payload.address ?? null,
      status: payload.status ?? 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to create vendor');
    return NextResponse.json(normalizeSupabaseVendorRow(data), { status: 201 });
  }
  const [created] = await db.insert(vendors).values({
    name: payload.name,
    contactPerson: payload.contactPerson ?? null,
    email: payload.email ?? null,
    phone: payload.phone ?? null,
    address: payload.address ?? null,
    status: payload.status ?? 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid vendor id is required');
  const payload = updateVendorSchema.parse(await request.json());
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data, error } = await supabase.from('vendors').update({
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.contactPerson !== undefined ? { contact_person: payload.contactPerson ?? null } : {}),
      ...(payload.email !== undefined ? { email: payload.email ?? null } : {}),
      ...(payload.phone !== undefined ? { phone: payload.phone ?? null } : {}),
      ...(payload.address !== undefined ? { address: payload.address ?? null } : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').single();
    if (error || !data) throw new NotFoundError('Vendor not found');
    return NextResponse.json(normalizeSupabaseVendorRow(data));
  }
  const [updated] = await db.update(vendors).set({
    ...(payload.name !== undefined ? { name: payload.name } : {}),
    ...(payload.contactPerson !== undefined ? { contactPerson: payload.contactPerson ?? null } : {}),
    ...(payload.email !== undefined ? { email: payload.email ?? null } : {}),
    ...(payload.phone !== undefined ? { phone: payload.phone ?? null } : {}),
    ...(payload.address !== undefined ? { address: payload.address ?? null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(vendors.id, id)).returning();
  if (!updated) throw new NotFoundError('Vendor not found');
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid vendor id is required');
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data, error } = await supabase.from('vendors').delete().eq('id', id).select('*').single();
    if (error || !data) throw new NotFoundError('Vendor not found');
    return NextResponse.json({ success: true, vendor: normalizeSupabaseVendorRow(data) });
  }
  const [deleted] = await db.delete(vendors).where(eq(vendors.id, id)).returning();
  if (!deleted) throw new NotFoundError('Vendor not found');
  return NextResponse.json({ success: true, vendor: deleted });
}, { requireAuth: true, roles: ['Manager'] });
