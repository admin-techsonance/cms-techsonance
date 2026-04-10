import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { companyHolidays } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { companyHolidaySchema, updateCompanyHolidaySchema } from '@/server/validation/settings';
import { getRouteSupabase } from '@/server/supabase/route-helpers';

function normalizeSupabaseCompanyHoliday(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    date: row.date,
    reason: row.reason,
    year: Number(row.year),
    createdAt: row.created_at ?? null,
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
      const holidayId = Number(id);
      if (!Number.isInteger(holidayId) || holidayId <= 0) {
        throw new BadRequestError('Valid company holiday id is required');
      }

      const { data: holiday, error } = await supabase.from('company_holidays').select('*').eq('id', holidayId).single();
      if (error || !holiday) throw new NotFoundError('Company holiday not found');
      return apiSuccess(normalizeSupabaseCompanyHoliday(holiday), 'Company holiday fetched successfully');
    }

    const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
    const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
    const year = searchParams.get('year');
    let query = getRouteSupabase(accessToken).from('company_holidays').select('*', { count: 'exact' });

    if (year !== null) {
      const parsedYear = Number(year);
      if (!Number.isInteger(parsedYear) || parsedYear < 1000 || parsedYear > 9999) {
        throw new BadRequestError('Year must be a valid 4-digit number');
      }
      query = query.eq('year', parsedYear);
    }

    const { data, count, error } = await query
      .order('date', { ascending: searchParams.get('order') !== 'desc' })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    return apiSuccess(
      ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseCompanyHoliday),
      'Company holidays fetched successfully',
      { meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) } }
    );
  }

  if (id) {
    const holidayId = Number(id);
    if (!Number.isInteger(holidayId) || holidayId <= 0) {
      throw new BadRequestError('Valid company holiday id is required');
    }

    const [holiday] = await db.select().from(companyHolidays).where(eq(companyHolidays.id, holidayId)).limit(1);
    if (!holiday) {
      throw new NotFoundError('Company holiday not found');
    }

    return apiSuccess(holiday, 'Company holiday fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const year = searchParams.get('year');
  const sortOrder = searchParams.get('order') === 'desc' ? 'desc' : 'asc';

  const conditions = [];
  if (year !== null) {
    const parsedYear = Number(year);
    if (!Number.isInteger(parsedYear) || parsedYear < 1000 || parsedYear > 9999) {
      throw new BadRequestError('Year must be a valid 4-digit number');
    }
    conditions.push(eq(companyHolidays.year, parsedYear));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(companyHolidays);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(companyHolidays);

  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [rows, countRows] = await Promise.all([
    query.orderBy(sortOrder === 'asc' ? asc(companyHolidays.date) : desc(companyHolidays.date)).limit(limit).offset(offset),
    countQuery,
  ]);

  return apiSuccess(rows, 'Company holidays fetched successfully', {
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(countRows[0]?.count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = companyHolidaySchema.parse(await request.json());
  const year = payload.year ?? Number(payload.date.slice(0, 4));

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('company_holidays').select('id').eq('date', payload.date).single();
    if (existing) {
      throw new ConflictError('A company holiday already exists for that date');
    }

    const { data: created, error } = await supabase.from('company_holidays').insert({
      date: payload.date,
      reason: payload.reason.trim(),
      year,
      created_at: new Date().toISOString(),
    }).select('*').single();
    if (error || !created) throw error ?? new Error('Failed to create company holiday');
    return apiSuccess(normalizeSupabaseCompanyHoliday(created), 'Company holiday created successfully', { status: 201 });
  }

  const [existing] = await db.select().from(companyHolidays).where(eq(companyHolidays.date, payload.date)).limit(1);
  if (existing) {
    throw new ConflictError('A company holiday already exists for that date');
  }

  const [created] = await db.insert(companyHolidays).values({
    date: payload.date,
    reason: payload.reason,
    year,
    createdAt: new Date().toISOString(),
  }).returning();

  return apiSuccess(created, 'Company holiday created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const PUT = withApiHandler(async (request, context) => {
  const holidayId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(holidayId) || holidayId <= 0) {
    throw new BadRequestError('Valid company holiday id is required');
  }

  const payload = updateCompanyHolidaySchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update a company holiday');
  }

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('company_holidays').select('*').eq('id', holidayId).single();
    if (!existing) {
      throw new NotFoundError('Company holiday not found');
    }

    const nextDate = payload.date ?? String(existing.date);
    const { data: duplicate } = await supabase.from('company_holidays').select('id').eq('date', nextDate).single();
    if (duplicate && Number(duplicate.id) !== holidayId) {
      throw new ConflictError('A company holiday already exists for that date');
    }

    const { data: updated, error } = await supabase.from('company_holidays').update({
      ...(payload.date !== undefined ? { date: payload.date } : {}),
      ...(payload.reason !== undefined ? { reason: payload.reason.trim() } : {}),
      year: payload.year ?? Number(nextDate.slice(0, 4)),
    }).eq('id', holidayId).select('*').single();
    if (error || !updated) throw error ?? new Error('Failed to update company holiday');
    return apiSuccess(normalizeSupabaseCompanyHoliday(updated), 'Company holiday updated successfully');
  }

  const [existing] = await db.select().from(companyHolidays).where(eq(companyHolidays.id, holidayId)).limit(1);
  if (!existing) {
    throw new NotFoundError('Company holiday not found');
  }

  const nextDate = payload.date ?? existing.date;
  const [duplicate] = await db.select().from(companyHolidays).where(eq(companyHolidays.date, nextDate)).limit(1);
  if (duplicate && duplicate.id !== holidayId) {
    throw new ConflictError('A company holiday already exists for that date');
  }

  const [updated] = await db.update(companyHolidays).set({
    ...(payload.date !== undefined ? { date: payload.date } : {}),
    ...(payload.reason !== undefined ? { reason: payload.reason } : {}),
    year: payload.year ?? Number(nextDate.slice(0, 4)),
  }).where(eq(companyHolidays.id, holidayId)).returning();

  return apiSuccess(updated, 'Company holiday updated successfully');
}, { requireAuth: true, roles: ['Admin'] });

export const DELETE = withApiHandler(async (request, context) => {
  const holidayId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(holidayId) || holidayId <= 0) {
    throw new BadRequestError('Valid company holiday id is required');
  }

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('company_holidays').select('id').eq('id', holidayId).single();
    if (!existing) {
      throw new NotFoundError('Company holiday not found');
    }

    const { data: deleted, error } = await supabase.from('company_holidays').delete().eq('id', holidayId).select('*').single();
    if (error || !deleted) throw error ?? new Error('Failed to delete company holiday');
    return apiSuccess(normalizeSupabaseCompanyHoliday(deleted), 'Company holiday deleted successfully');
  }

  const [existing] = await db.select().from(companyHolidays).where(eq(companyHolidays.id, holidayId)).limit(1);
  if (!existing) {
    throw new NotFoundError('Company holiday not found');
  }

  const [deleted] = await db.delete(companyHolidays).where(eq(companyHolidays.id, holidayId)).returning();
  return apiSuccess(deleted, 'Company holiday deleted successfully');
}, { requireAuth: true, roles: ['Admin'] });
