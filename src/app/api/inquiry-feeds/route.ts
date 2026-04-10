import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { inquiries, inquiryFeeds } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createInquiryFeedSchema, updateInquiryFeedSchema } from '@/server/validation/crm';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getRouteSupabase,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseInquiryFeedRow(row: Record<string, unknown>, userMap: Map<string, number | null>) {
  const commentedBy = typeof row.commented_by === 'string' ? userMap.get(row.commented_by) ?? null : null;
  return {
    id: Number(row.id),
    inquiryId: Number(row.inquiry_id),
    commentedBy,
    technology: row.technology ?? null,
    description: row.description,
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
      const feedId = Number(id);
      if (!Number.isInteger(feedId) || feedId <= 0) throw new BadRequestError('Valid inquiry feed id is required');
      const { data, error } = await supabase.from('inquiry_feeds').select('*').eq('id', feedId).single();
      if (error || !data) throw new NotFoundError('Inquiry feed not found');
      const userMap = await buildLegacyUserIdMap(accessToken, [String(data.commented_by)].filter(Boolean));
      return apiSuccess(normalizeSupabaseInquiryFeedRow(data, userMap), 'Inquiry feed fetched successfully');
    }
    const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
    const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
    const inquiryIdParam = searchParams.get('inquiryId');
    let query = supabase.from('inquiry_feeds').select('*', { count: 'exact' });
    if (inquiryIdParam) {
      const inquiryId = Number(inquiryIdParam);
      if (!Number.isInteger(inquiryId) || inquiryId <= 0) throw new BadRequestError('Valid inquiry id is required');
      query = query.eq('inquiry_id', inquiryId);
    }
    const { data, count, error } = await query.order('created_at', { ascending: true }).range(offset, offset + limit - 1);
    if (error) throw error;
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.commented_by)).filter(Boolean));
    return apiSuccess(rows.map((row) => normalizeSupabaseInquiryFeedRow(row, userMap)), 'Inquiry feeds fetched successfully', {
      meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
    });
  }

  if (id) {
    const feedId = Number(id);
    if (!Number.isInteger(feedId) || feedId <= 0) {
      throw new BadRequestError('Valid inquiry feed id is required');
    }

    const [feed] = await db.select().from(inquiryFeeds).where(eq(inquiryFeeds.id, feedId)).limit(1);
    if (!feed) {
      throw new NotFoundError('Inquiry feed not found');
    }

    return apiSuccess(feed, 'Inquiry feed fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const inquiryIdParam = searchParams.get('inquiryId');
  const conditions = [];

  if (inquiryIdParam) {
    const inquiryId = Number(inquiryIdParam);
    if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
      throw new BadRequestError('Valid inquiry id is required');
    }
    conditions.push(eq(inquiryFeeds.inquiryId, inquiryId));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(inquiryFeeds);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(inquiryFeeds);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [rows, countRows] = await Promise.all([
    query.orderBy(asc(inquiryFeeds.createdAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  return apiSuccess(rows, 'Inquiry feeds fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createInquiryFeedSchema.parse(await request.json());
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: inquiry } = await supabase.from('inquiries').select('id').eq('id', payload.inquiryId).single();
    if (!inquiry) throw new NotFoundError('Inquiry not found');
    const { data, error } = await supabase.from('inquiry_feeds').insert({
      inquiry_id: payload.inquiryId,
      commented_by: actor.authUserId,
      technology: payload.technology ?? null,
      description: payload.description,
      created_at: new Date().toISOString(),
    }).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to create inquiry feed');
    const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId]);
    return apiSuccess(normalizeSupabaseInquiryFeedRow(data, userMap), 'Inquiry feed created successfully', { status: 201 });
  }
  const [inquiry] = await db.select().from(inquiries).where(eq(inquiries.id, payload.inquiryId)).limit(1);
  if (!inquiry) {
    throw new NotFoundError('Inquiry not found');
  }

  const [created] = await db.insert(inquiryFeeds).values({
    inquiryId: payload.inquiryId,
    commentedBy: context.auth!.user.id,
    technology: payload.technology ?? null,
    description: payload.description,
    createdAt: new Date().toISOString(),
  }).returning();

  return apiSuccess(created, 'Inquiry feed created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const feedId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(feedId) || feedId <= 0) {
    throw new BadRequestError('Valid inquiry feed id is required');
  }

  const payload = updateInquiryFeedSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update an inquiry feed');
  }

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('inquiry_feeds').select('*').eq('id', feedId).single();
    if (!existing) throw new NotFoundError('Inquiry feed not found');
    const user = context.auth!.user;
    const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
    if (!isAdminLike && existing.commented_by !== actor.authUserId) {
      throw new ForbiddenError('You do not have permission to update this inquiry feed');
    }
    const { data, error } = await supabase.from('inquiry_feeds').update({
      ...(payload.technology !== undefined ? { technology: payload.technology } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
    }).eq('id', feedId).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to update inquiry feed');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(data.commented_by)].filter(Boolean));
    return apiSuccess(normalizeSupabaseInquiryFeedRow(data, userMap), 'Inquiry feed updated successfully');
  }

  const [existing] = await db.select().from(inquiryFeeds).where(eq(inquiryFeeds.id, feedId)).limit(1);
  if (!existing) {
    throw new NotFoundError('Inquiry feed not found');
  }

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.commentedBy !== user.id) {
    throw new ForbiddenError('You do not have permission to update this inquiry feed');
  }

  const [updated] = await db.update(inquiryFeeds).set({
    ...(payload.technology !== undefined ? { technology: payload.technology } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
  }).where(eq(inquiryFeeds.id, feedId)).returning();

  return apiSuccess(updated, 'Inquiry feed updated successfully');
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const feedId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(feedId) || feedId <= 0) {
    throw new BadRequestError('Valid inquiry feed id is required');
  }

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('inquiry_feeds').select('*').eq('id', feedId).single();
    if (!existing) throw new NotFoundError('Inquiry feed not found');
    const user = context.auth!.user;
    const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
    if (!isAdminLike && existing.commented_by !== actor.authUserId) {
      throw new ForbiddenError('You do not have permission to delete this inquiry feed');
    }
    const { data, error } = await supabase.from('inquiry_feeds').delete().eq('id', feedId).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to delete inquiry feed');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(data.commented_by)].filter(Boolean));
    return apiSuccess(normalizeSupabaseInquiryFeedRow(data, userMap), 'Inquiry feed deleted successfully');
  }

  const [existing] = await db.select().from(inquiryFeeds).where(eq(inquiryFeeds.id, feedId)).limit(1);
  if (!existing) {
    throw new NotFoundError('Inquiry feed not found');
  }

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.commentedBy !== user.id) {
    throw new ForbiddenError('You do not have permission to delete this inquiry feed');
  }

  const [deleted] = await db.delete(inquiryFeeds).where(eq(inquiryFeeds.id, feedId)).returning();
  return apiSuccess(deleted, 'Inquiry feed deleted successfully');
}, { requireAuth: true, roles: ['Employee'] });
