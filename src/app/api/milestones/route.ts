import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createMilestoneSchema, milestoneStatusSchema, updateMilestoneSchema } from '@/server/validation/milestones';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

function normalizeSupabaseMilestoneRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    title: row.title,
    description: row.description ?? null,
    dueDate: row.due_date,
    status: row.status,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
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
    const milestoneId = Number(id);
    if (!Number.isInteger(milestoneId) || milestoneId <= 0) {
      throw new BadRequestError('Valid milestone id is required');
    }
    const { data: milestone, error } = await supabase
      .from('milestones')
      .select('*')
      .eq('id', milestoneId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !milestone) throw new NotFoundError('Milestone not found');
    return NextResponse.json(normalizeSupabaseMilestoneRow(milestone));
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const projectId = searchParams.get('projectId');
  const status = searchParams.get('status');
  const sortField = searchParams.get('sort') ?? 'dueDate';
  const ascending = searchParams.get('order') !== 'desc';
  
  let query = supabase
    .from('milestones')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);
  if (projectId) query = query.eq('project_id', Number(projectId));
  if (status) query = query.eq('status', milestoneStatusSchema.parse(status));

  const sortColumn = sortField === 'createdAt' ? 'created_at' : sortField === 'status' ? 'status' : 'due_date';
  const { data, count, error } = await query.order(sortColumn, { ascending }).range(offset, offset + limit - 1);
  if (error) throw error;

  return NextResponse.json({
    success: true,
    data: ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseMilestoneRow),
    message: 'Milestones fetched successfully',
    errors: null,
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createMilestoneSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', payload.projectId)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!project) throw new NotFoundError('Project not found');

  const dueDateISO = new Date(payload.dueDate).toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const { data: created, error } = await supabase.from('milestones').insert({
    project_id: payload.projectId,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    due_date: dueDateISO,
    status: payload.status ?? 'pending',
    tenant_id: tenantId,
    created_at: now,
    updated_at: now,
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create milestone');
  return NextResponse.json(normalizeSupabaseMilestoneRow(created), { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid milestone id is required');
  const payload = updateMilestoneSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('milestones')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!existing) throw new NotFoundError('Milestone not found');

  const { data: updated, error } = await supabase.from('milestones').update({
    ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
    ...(payload.description !== undefined ? { description: payload.description?.trim() || null } : {}),
    ...(payload.dueDate !== undefined ? { due_date: new Date(payload.dueDate).toISOString().slice(0, 10) } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    updated_at: new Date().toISOString(),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !updated) throw error ?? new Error('Failed to update milestone');
  return NextResponse.json(normalizeSupabaseMilestoneRow(updated));
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid milestone id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: deleted, error } = await supabase
    .from('milestones')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !deleted) throw new NotFoundError('Milestone not found');
  return NextResponse.json({ message: 'Milestone deleted successfully', milestone: normalizeSupabaseMilestoneRow(deleted) });
}, { requireAuth: true, roles: ['Manager'] });
