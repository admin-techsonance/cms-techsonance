import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createPerformanceReviewSchema, updatePerformanceReviewSchema } from '@/server/validation/hr';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getAdminRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

function normalizeSupabasePerformanceReviewRow(
  row: Record<string, unknown>,
  userMap: Map<string, number | null>
) {
  const reviewerId = typeof row.reviewer_id === 'string' ? userMap.get(row.reviewer_id) ?? null : null;
  return {
    id: Number(row.id),
    employeeId: Number(row.employee_id),
    reviewerId,
    rating: Number(row.rating),
    reviewPeriod: row.review_period,
    comments: row.comments ?? null,
    createdAt: row.created_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  if (id) {
    const reviewId = Number(id);
    if (!Number.isInteger(reviewId) || reviewId <= 0) throw new BadRequestError('Valid performance review id is required');
    const { data: review, error } = await supabase
      .from('performance_reviews')
      .select('*')
      .eq('id', reviewId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !review) throw new NotFoundError('Performance review not found');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(review.reviewer_id)].filter(Boolean));
    return NextResponse.json(normalizeSupabasePerformanceReviewRow(review, userMap));
  }
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const employeeId = searchParams.get('employeeId');
  const reviewerId = searchParams.get('reviewerId');
  const rating = searchParams.get('rating');
  const reviewPeriod = searchParams.get('reviewPeriod');
  
  let query = supabase
    .from('performance_reviews')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);
  if (employeeId) query = query.eq('employee_id', Number(employeeId));
  if (reviewerId) query = query.eq('reviewer_id', await resolveAuthUserIdFromLegacyUserId(accessToken, Number(reviewerId)));
  if (rating) query = query.eq('rating', Number(rating));
  if (reviewPeriod) query = query.eq('review_period', reviewPeriod);
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.reviewer_id)).filter(Boolean));
  return NextResponse.json({
    success: true,
    data: rows.map((row) => normalizeSupabasePerformanceReviewRow(row, userMap)),
    message: 'Performance reviews fetched successfully',
    errors: null,
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
  });
}, { requireAuth: true, roles: ['Manager'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createPerformanceReviewSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('id', payload.employeeId)
    .eq('tenant_id', tenantId)
    .single();
  if (!employee) throw new NotFoundError('Employee not found');
  const reviewerId = payload.reviewerId ? await resolveAuthUserIdFromLegacyUserId(accessToken, payload.reviewerId) : actor.authUserId;
  const { data: reviewer } = await supabase
    .from('users')
    .select('id')
    .eq('id', reviewerId)
    .eq('tenant_id', tenantId)
    .single();
  if (!reviewer) throw new NotFoundError('Reviewer not found');
  const { data: created, error } = await supabase.from('performance_reviews').insert({
    employee_id: payload.employeeId,
    reviewer_id: reviewerId,
    rating: payload.rating,
    review_period: payload.reviewPeriod.trim(),
    comments: payload.comments?.trim() || null,
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create performance review');
  const userMap = await buildLegacyUserIdMap(accessToken, [reviewerId]);
  return NextResponse.json(normalizeSupabasePerformanceReviewRow(created, userMap), { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid performance review id is required');
  const payload = updatePerformanceReviewSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: updated, error } = await supabase.from('performance_reviews').update({
    ...(payload.rating !== undefined ? { rating: payload.rating } : {}),
    ...(payload.reviewPeriod !== undefined ? { review_period: payload.reviewPeriod.trim() } : {}),
    ...(payload.comments !== undefined ? { comments: payload.comments?.trim() || null } : {}),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !updated) throw new NotFoundError('Performance review not found');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(updated.reviewer_id)].filter(Boolean));
  return NextResponse.json(normalizeSupabasePerformanceReviewRow(updated, userMap));
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid performance review id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: deleted, error } = await supabase
    .from('performance_reviews')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !deleted) throw new NotFoundError('Performance review not found');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(deleted.reviewer_id)].filter(Boolean));
  return NextResponse.json({ message: 'Performance review deleted successfully', review: normalizeSupabasePerformanceReviewRow(deleted, userMap) });
}, { requireAuth: true, roles: ['Manager'] });
