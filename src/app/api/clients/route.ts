import { NextResponse } from 'next/server';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { clientStatusSchema, createClientSchema, updateClientSchema } from '@/server/validation/clients';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  if (id) {
    const [client] = await db.select().from(clients).where(eq(clients.id, Number(id))).limit(1);
    if (!client) throw new NotFoundError('Client not found');
    return NextResponse.json(client);
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const status = searchParams.get('status');
  const industry = searchParams.get('industry');
  const conditions = [];

  if (search) {
    conditions.push(or(
      like(clients.companyName, `%${search}%`),
      like(clients.contactPerson, `%${search}%`),
      like(clients.email, `%${search}%`)
    ));
  }
  if (status) conditions.push(eq(clients.status, clientStatusSchema.parse(status)));
  if (industry) conditions.push(eq(clients.industry, industry));

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(clients);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(clients);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [results, countRows] = await Promise.all([
    query.orderBy(desc(clients.createdAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  return NextResponse.json({
    success: true,
    data: results,
    message: 'Clients fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(countRows[0]?.count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createClientSchema.parse(await request.json());
  const now = new Date().toISOString();
  const [created] = await db.insert(clients).values({
    companyName: payload.companyName.trim(),
    contactPerson: payload.contactPerson.trim(),
    email: payload.email.toLowerCase().trim(),
    phone: payload.phone?.trim() || null,
    address: payload.address?.trim() || null,
    industry: payload.industry?.trim() || null,
    notes: payload.notes?.trim() || null,
    status: payload.status ?? 'active',
    createdBy: context.auth!.user.id,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid client id is required');

  const payload = updateClientSchema.parse(await request.json());
  const [existing] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Client not found');

  const [updated] = await db.update(clients).set({
    ...(payload.companyName !== undefined ? { companyName: payload.companyName.trim() } : {}),
    ...(payload.contactPerson !== undefined ? { contactPerson: payload.contactPerson.trim() } : {}),
    ...(payload.email !== undefined ? { email: payload.email.toLowerCase().trim() } : {}),
    ...(payload.phone !== undefined ? { phone: payload.phone?.trim() || null } : {}),
    ...(payload.address !== undefined ? { address: payload.address?.trim() || null } : {}),
    ...(payload.industry !== undefined ? { industry: payload.industry?.trim() || null } : {}),
    ...(payload.notes !== undefined ? { notes: payload.notes?.trim() || null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(clients.id, id)).returning();

  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid client id is required');
  const [deleted] = await db.delete(clients).where(eq(clients.id, id)).returning();
  if (!deleted) throw new NotFoundError('Client not found');
  return NextResponse.json({ message: 'Client deleted successfully', client: deleted });
}, { requireAuth: true, roles: ['Manager'] });

