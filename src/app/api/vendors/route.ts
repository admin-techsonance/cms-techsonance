import { NextResponse } from 'next/server';
import { desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { vendors } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createVendorSchema, updateVendorSchema } from '@/server/validation/procurement';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const limit = searchParams.get('limit') ? Math.min(Number(searchParams.get('limit')), 100) : 50;
  const offset = searchParams.get('offset') ? Math.max(Number(searchParams.get('offset')), 0) : 0;
  const search = searchParams.get('search');
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

export const POST = withApiHandler(async (request) => {
  const payload = createVendorSchema.parse(await request.json());
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

export const PUT = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid vendor id is required');
  const payload = updateVendorSchema.parse(await request.json());
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

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid vendor id is required');
  const [deleted] = await db.delete(vendors).where(eq(vendors.id, id)).returning();
  if (!deleted) throw new NotFoundError('Vendor not found');
  return NextResponse.json({ success: true, vendor: deleted });
}, { requireAuth: true, roles: ['Manager'] });

