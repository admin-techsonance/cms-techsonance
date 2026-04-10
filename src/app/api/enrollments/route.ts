import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { employees, nfcTags, users } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { ConflictError, NotFoundError, BadRequestError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createEnrollmentSchema } from '@/server/validation/devices';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getRouteSupabase,
} from '@/server/supabase/route-helpers';
import { listSupabaseProfilesByAuthIds } from '@/server/supabase/users';

async function buildSupabaseEnrollmentEmployeeMap(accessToken: string, employeeIds: number[]) {
  if (!employeeIds.length) return new Map<number, Record<string, unknown>>();
  const supabase = getRouteSupabase(accessToken);
  const { data: employeeRows, error } = await supabase.from('employees').select('id,user_id,department,status').in('id', employeeIds);
  if (error) throw error;
  const rows = (employeeRows as { id: number; user_id: string; department: string; status: string }[] | null) ?? [];
  const profiles = await listSupabaseProfilesByAuthIds(rows.map((row) => row.user_id), accessToken);
  return new Map<number, Record<string, unknown>>(rows.map((row) => {
    const profile = profiles.get(row.user_id);
    return [Number(row.id), {
      id: Number(row.id),
      firstName: profile?.first_name ?? null,
      lastName: profile?.last_name ?? null,
      email: profile?.email ?? null,
      department: row.department,
      status: row.status,
      photoUrl: profile?.avatar_url ?? null,
    }];
  }));
}

function normalizeSupabaseEnrollmentRow(
  row: Record<string, unknown>,
  enrolledByMap: Map<string, number | null>,
  employeeMap: Map<number, Record<string, unknown>>
) {
  const enrolledBy = typeof row.enrolled_by === 'string' ? enrolledByMap.get(row.enrolled_by) ?? null : null;
  const employeeId = row.employee_id === null ? null : Number(row.employee_id);
  return {
    id: Number(row.id),
    tagUid: row.tag_uid,
    employeeId,
    status: row.status,
    enrolledAt: row.enrolled_at ?? null,
    enrolledBy,
    lastUsedAt: row.last_used_at ?? null,
    readerId: row.reader_id ?? null,
    createdAt: row.created_at ?? null,
    ...(employeeId ? { employee: employeeMap.get(employeeId) ?? null } : {}),
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const status = searchParams.get('status');
  const employeeIdParam = searchParams.get('employee_id');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    let query = getRouteSupabase(accessToken).from('nfc_tags').select('*', { count: 'exact' });
    if (status) query = query.eq('status', status);
    if (employeeIdParam) {
      const employeeId = Number(employeeIdParam);
      if (!Number.isInteger(employeeId) || employeeId <= 0) {
        throw new BadRequestError('Valid employee id is required');
      }
      query = query.eq('employee_id', employeeId);
    }
    const { data, count, error } = await query.order('enrolled_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const enrolledByMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.enrolled_by)).filter(Boolean));
    const employeeMap = await buildSupabaseEnrollmentEmployeeMap(
      accessToken,
      rows.map((row) => Number(row.employee_id)).filter((value) => Number.isInteger(value) && value > 0)
    );
    return apiSuccess(rows.map((row) => normalizeSupabaseEnrollmentRow(row, enrolledByMap, employeeMap)), 'Enrollments fetched successfully', {
      meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
    });
  }

  const conditions = [];

  if (status) conditions.push(eq(nfcTags.status, status));
  if (employeeIdParam) {
    const employeeId = Number(employeeIdParam);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      throw new BadRequestError('Valid employee id is required');
    }
    conditions.push(eq(nfcTags.employeeId, employeeId));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select({
    id: nfcTags.id,
    tagUid: nfcTags.tagUid,
    employeeId: nfcTags.employeeId,
    status: nfcTags.status,
    enrolledAt: nfcTags.enrolledAt,
    enrolledBy: nfcTags.enrolledBy,
    lastUsedAt: nfcTags.lastUsedAt,
    readerId: nfcTags.readerId,
    createdAt: nfcTags.createdAt,
    employee: {
      id: employees.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      department: employees.department,
    },
  }).from(nfcTags).innerJoin(employees, eq(nfcTags.employeeId, employees.id)).innerJoin(users, eq(employees.userId, users.id));
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(nfcTags);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [rows, countRows] = await Promise.all([
    query.orderBy(desc(nfcTags.enrolledAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  return apiSuccess(rows, 'Enrollments fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) },
  });
}, { requireAuth: true, roles: ['Admin'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createEnrollmentSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const [[employee], [existingTag]] = await Promise.all([
      supabase.from('employees').select('id').eq('id', payload.employeeId).single(),
      supabase.from('nfc_tags').select('id').eq('tag_uid', payload.tagUid).single(),
    ]);
    if (!employee.data) throw new NotFoundError('Employee not found');
    if (existingTag.data) throw new ConflictError('NFC tag is already enrolled');
    const now = new Date().toISOString();
    const { data: created, error } = await supabase.from('nfc_tags').insert({
      tag_uid: payload.tagUid.trim(),
      employee_id: payload.employeeId,
      status: 'active',
      enrolled_at: now,
      enrolled_by: actor.authUserId,
      created_at: now,
    }).select('*').single();
    if (error || !created) throw error ?? new Error('Failed to create enrollment');
    const enrolledByMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId]);
    const employeeMap = await buildSupabaseEnrollmentEmployeeMap(accessToken, [payload.employeeId]);
    return apiSuccess(normalizeSupabaseEnrollmentRow(created, enrolledByMap, employeeMap), 'Enrollment created successfully', { status: 201 });
  }

  const [[employee], [existingTag]] = await Promise.all([
    db.select().from(employees).where(eq(employees.id, payload.employeeId)).limit(1),
    db.select().from(nfcTags).where(eq(nfcTags.tagUid, payload.tagUid)).limit(1),
  ]);
  if (!employee) throw new NotFoundError('Employee not found');
  if (existingTag) throw new ConflictError('NFC tag is already enrolled');

  const now = new Date().toISOString();
  const [created] = await db.insert(nfcTags).values({
    tagUid: payload.tagUid,
    employeeId: payload.employeeId,
    status: 'active',
    enrolledAt: now,
    enrolledBy: context.auth!.user.id,
    createdAt: now,
  }).returning();

  return apiSuccess(created, 'Enrollment created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });
