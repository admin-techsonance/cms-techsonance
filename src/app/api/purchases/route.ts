import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { purchases, vendors } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createPurchaseSchema, updatePurchaseSchema } from '@/server/validation/procurement';

async function assertVendorExists(vendorId: number) {
  const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!vendor) throw new NotFoundError('Vendor not found');
}

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const limit = searchParams.get('limit') ? Math.min(Number(searchParams.get('limit')), 100) : 50;
  const offset = searchParams.get('offset') ? Math.max(Number(searchParams.get('offset')), 0) : 0;
  const id = searchParams.get('id') ? Number(searchParams.get('id')) : undefined;
  const vendorId = searchParams.get('vendorId') ? Number(searchParams.get('vendorId')) : undefined;
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

export const POST = withApiHandler(async (request) => {
  const payload = createPurchaseSchema.parse(await request.json());
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

export const PUT = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid purchase id is required');
  const payload = updatePurchaseSchema.parse(await request.json());
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

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid purchase id is required');
  const [deleted] = await db.delete(purchases).where(eq(purchases.id, id)).returning();
  if (!deleted) throw new NotFoundError('Purchase not found');
  return NextResponse.json({ success: true, purchase: deleted });
}, { requireAuth: true, roles: ['Manager'] });

