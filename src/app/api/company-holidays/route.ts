import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { companyHolidays } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { companyHolidaySchema, updateCompanyHolidaySchema } from '@/server/validation/settings';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

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

export const POST = withApiHandler(async (request) => {
  const payload = companyHolidaySchema.parse(await request.json());
  const year = payload.year ?? Number(payload.date.slice(0, 4));

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

export const PUT = withApiHandler(async (request) => {
  const holidayId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(holidayId) || holidayId <= 0) {
    throw new BadRequestError('Valid company holiday id is required');
  }

  const payload = updateCompanyHolidaySchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update a company holiday');
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

export const DELETE = withApiHandler(async (request) => {
  const holidayId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(holidayId) || holidayId <= 0) {
    throw new BadRequestError('Valid company holiday id is required');
  }

  const [existing] = await db.select().from(companyHolidays).where(eq(companyHolidays.id, holidayId)).limit(1);
  if (!existing) {
    throw new NotFoundError('Company holiday not found');
  }

  const [deleted] = await db.delete(companyHolidays).where(eq(companyHolidays.id, holidayId)).returning();
  return apiSuccess(deleted, 'Company holiday deleted successfully');
}, { requireAuth: true, roles: ['Admin'] });
