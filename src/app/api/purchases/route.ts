import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { purchases, vendors } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createPurchaseSchema, updatePurchaseSchema } from '@/server/validation/procurement';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { getRouteSupabase } from '@/server/supabase/route-helpers';

async function assertVendorExists(vendorId: number) {
  const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!vendor) throw new NotFoundError('Vendor not found');
}

async function assertSupabaseVendorExists(accessToken: string, vendorId: number) {
  const supabase = getRouteSupabase(accessToken);
  const { data } = await supabase.from('vendors').select('id').eq('id', vendorId).single();
  if (!data) throw new NotFoundError('Vendor not found');
}

function normalizeSupabaseVendor(vendor: Record<string, unknown> | null | undefined) {
  if (!vendor) return null;
  return {
    id: Number(vendor.id),
    name: vendor.name,
    contactPerson: vendor.contact_person ?? null,
    email: vendor.email ?? null,
    phone: vendor.phone ?? null,
    address: vendor.address ?? null,
    status: vendor.status,
    createdAt: vendor.created_at ?? null,
    updatedAt: vendor.updated_at ?? null,
  };
}

function normalizeSupabasePurchaseRow(row: Record<string, unknown>, vendorName?: string | null, vendor?: Record<string, unknown> | null) {
  return {
    id: Number(row.id),
    vendorId: Number(row.vendor_id),
    date: row.date,
    amount: row.amount,
    description: row.description ?? null,
    status: row.status,
    billUrl: row.bill_url ?? null,
    dueDate: row.due_date ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    ...(vendorName !== undefined ? { vendorName } : {}),
    ...(vendor !== undefined ? { vendor: normalizeSupabaseVendor(vendor) } : {}),
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const limit = searchParams.get('limit') ? Math.min(Number(searchParams.get('limit')), 100) : 50;
  const offset = searchParams.get('offset') ? Math.max(Number(searchParams.get('offset')), 0) : 0;
  const id = searchParams.get('id') ? Number(searchParams.get('id')) : undefined;
  const vendorId = searchParams.get('vendorId') ? Number(searchParams.get('vendorId')) : undefined;
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    if (id) {
      const { data: purchase, error } = await supabase.from('purchases').select('*').eq('id', id).single();
      if (error || !purchase) throw new NotFoundError('Purchase not found');
      const { data: vendor } = await supabase.from('vendors').select('*').eq('id', purchase.vendor_id).maybeSingle();
      return NextResponse.json(normalizeSupabasePurchaseRow(purchase, vendor?.name ? String(vendor.name) : 'Unknown Vendor', vendor ?? null));
    }
    let query = supabase.from('purchases').select('*', { count: 'exact' });
    if (vendorId) query = query.eq('vendor_id', vendorId);
    const { data, count, error } = await query.order('date', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const vendorIds = Array.from(new Set(rows.map((row) => Number(row.vendor_id))));
    const { data: vendorsData } = vendorIds.length
      ? await supabase.from('vendors').select('*').in('id', vendorIds)
      : { data: [] as Record<string, unknown>[] };
    const vendorMap = new Map<number, Record<string, unknown>>((((vendorsData as Record<string, unknown>[] | null) ?? []).map((row) => [Number(row.id), row])));
    return NextResponse.json({
      success: true,
      data: rows.map((row) => {
        const vendor = vendorMap.get(Number(row.vendor_id));
        return normalizeSupabasePurchaseRow(row, vendor?.name ? String(vendor.name) : 'Unknown Vendor', vendor ?? null);
      }),
      message: 'Purchases fetched successfully',
      errors: null,
      meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
    });
  }
  if (id) {
    const result = await db.select({ purchase: purchases, vendor: vendors }).from(purchases).leftJoin(vendors, eq(purchases.vendorId, vendors.id)).where(eq(purchases.id, id));
    if (result.length === 0) throw new NotFoundError('Purchase not found');
    const { purchase, vendor } = result[0];
    return NextResponse.json({ ...purchase, vendorName: vendor?.name ?? 'Unknown Vendor', vendor });
  }
  let query = db.select({ purchase: purchases, vendor: vendors }).from(purchases).leftJoin(vendors, eq(purchases.vendorId, vendors.id));
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(purchases);
  if (vendorId) {
    query = query.where(eq(purchases.vendorId, vendorId)) as typeof query;
    countQuery = countQuery.where(eq(purchases.vendorId, vendorId)) as typeof countQuery;
  }
  const [rows, countRows] = await Promise.all([query.orderBy(desc(purchases.date)).limit(limit).offset(offset), countQuery]);
  return NextResponse.json({
    success: true,
    data: rows.map(({ purchase, vendor }) => ({ ...purchase, vendorName: vendor?.name ?? 'Unknown Vendor', vendor })),
    message: 'Purchases fetched successfully',
    errors: null,
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createPurchaseSchema.parse(await request.json());
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    await assertSupabaseVendorExists(accessToken, payload.vendorId);
    const supabase = getRouteSupabase(accessToken);
    const { data, error } = await supabase.from('purchases').insert({
      vendor_id: payload.vendorId,
      date: payload.date,
      amount: payload.amount,
      description: payload.description ?? null,
      status: payload.status ?? 'pending',
      bill_url: payload.billUrl ?? null,
      due_date: payload.dueDate ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to create purchase');
    return NextResponse.json(normalizeSupabasePurchaseRow(data), { status: 201 });
  }
  await assertVendorExists(payload.vendorId);
  const [created] = await db.insert(purchases).values({
    vendorId: payload.vendorId,
    date: payload.date,
    amount: payload.amount,
    description: payload.description ?? null,
    status: payload.status ?? 'pending',
    billUrl: payload.billUrl ?? null,
    dueDate: payload.dueDate ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid purchase id is required');
  const payload = updatePurchaseSchema.parse(await request.json());
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    if (payload.vendorId !== undefined) await assertSupabaseVendorExists(accessToken, payload.vendorId);
    const supabase = getRouteSupabase(accessToken);
    const { data, error } = await supabase.from('purchases').update({
      ...(payload.vendorId !== undefined ? { vendor_id: payload.vendorId } : {}),
      ...(payload.date !== undefined ? { date: payload.date } : {}),
      ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
      ...(payload.description !== undefined ? { description: payload.description ?? null } : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      ...(payload.billUrl !== undefined ? { bill_url: payload.billUrl ?? null } : {}),
      ...(payload.dueDate !== undefined ? { due_date: payload.dueDate ?? null } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').single();
    if (error || !data) throw new NotFoundError('Purchase not found');
    return NextResponse.json(normalizeSupabasePurchaseRow(data));
  }
  if (payload.vendorId !== undefined) await assertVendorExists(payload.vendorId);
  const [updated] = await db.update(purchases).set({
    ...(payload.vendorId !== undefined ? { vendorId: payload.vendorId } : {}),
    ...(payload.date !== undefined ? { date: payload.date } : {}),
    ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
    ...(payload.description !== undefined ? { description: payload.description ?? null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.billUrl !== undefined ? { billUrl: payload.billUrl ?? null } : {}),
    ...(payload.dueDate !== undefined ? { dueDate: payload.dueDate ?? null } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(purchases.id, id)).returning();
  if (!updated) throw new NotFoundError('Purchase not found');
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid purchase id is required');
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data, error } = await supabase.from('purchases').delete().eq('id', id).select('*').single();
    if (error || !data) throw new NotFoundError('Purchase not found');
    return NextResponse.json({ success: true, purchase: normalizeSupabasePurchaseRow(data) });
  }
  const [deleted] = await db.delete(purchases).where(eq(purchases.id, id)).returning();
  if (!deleted) throw new NotFoundError('Purchase not found');
  return NextResponse.json({ success: true, purchase: deleted });
}, { requireAuth: true, roles: ['Manager'] });
