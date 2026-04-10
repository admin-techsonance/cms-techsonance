import { NextResponse } from 'next/server';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { clientStatusSchema, createClientSchema, updateClientSchema } from '@/server/validation/clients';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getRouteSupabase,
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

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);

    if (id) {
      const { data, error } = await supabase.from('clients').select('*').eq('id', Number(id)).single();
      if (error || !data) throw new NotFoundError('Client not found');
      const userMap = await buildLegacyUserIdMap(accessToken, [String(data.created_by)]);
      return NextResponse.json(normalizeSupabaseClientRow(data, userMap));
    }

    const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
    const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const industry = searchParams.get('industry');
    let query = supabase.from('clients').select('*', { count: 'exact' });

    if (search) {
      query = query.or(`company_name.ilike.%${search}%,contact_person.ilike.%${search}%,email.ilike.%${search}%`);
    }
    if (status) query = query.eq('status', clientStatusSchema.parse(status));
    if (industry) query = query.eq('industry', industry);

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const userMap = await buildLegacyUserIdMap(
      accessToken,
      ((data as Record<string, unknown>[] | null) ?? []).map((row) => String(row.created_by)).filter(Boolean)
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
  }

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

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
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
      created_by: actor.authUserId,
      created_at: now,
      updated_at: now,
    }).select('*').single();

    if (error || !data) throw error ?? new Error('Failed to create client');
    const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId]);
    return NextResponse.json(normalizeSupabaseClientRow(data, userMap), { status: 201 });
  }

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

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid client id is required');

  const payload = updateClientSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('clients').select('*').eq('id', id).single();
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
    }).eq('id', id).select('*').single();

    if (error || !data) throw error ?? new Error('Failed to update client');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(data.created_by)]);
    return NextResponse.json(normalizeSupabaseClientRow(data, userMap));
  }

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

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid client id is required');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data, error } = await supabase.from('clients').delete().eq('id', id).select('*').single();
    if (error || !data) throw new NotFoundError('Client not found');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(data.created_by)]);
    return NextResponse.json({ message: 'Client deleted successfully', client: normalizeSupabaseClientRow(data, userMap) });
  }

  const [deleted] = await db.delete(clients).where(eq(clients.id, id)).returning();
  if (!deleted) throw new NotFoundError('Client not found');
  return NextResponse.json({ message: 'Client deleted successfully', client: deleted });
}, { requireAuth: true, roles: ['Manager'] });
