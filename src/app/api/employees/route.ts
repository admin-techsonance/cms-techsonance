import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, ConflictError } from '@/server/http/errors';
import { employeeStatusSchema, createEmployeeSchema, updateEmployeeSchema } from '@/server/validation/employees';
import {
  buildLegacyUserIdMap,
  getAdminRouteSupabase,
  normalizeSupabaseEmployeeRecord,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();

  if (id) {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', Number(id))
      .eq('tenant_id', tenantId)
      .single();
    if (error || !data) throw new NotFoundError('Employee not found');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(data.user_id)], tenantId);
    return NextResponse.json(normalizeSupabaseEmployeeRecord(data, userMap));
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const userId = searchParams.get('userId');
  const department = searchParams.get('department');
  const status = searchParams.get('status');
  const sortField = searchParams.get('sort') ?? 'created_at';
  const ascending = searchParams.get('order') === 'asc';
  
  let query = supabase
    .from('employees')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (search) {
    query = query.or(`employee_id.ilike.%${search}%,department.ilike.%${search}%,designation.ilike.%${search}%`);
  }
  if (userId) {
    const authUserId = await resolveAuthUserIdFromLegacyUserId(accessToken, Number(userId), tenantId);
    query = query.eq('user_id', authUserId);
  }
  if (department) {
    query = query.ilike('department', `%${department}%`);
  }
  if (status) {
    query = query.eq('status', employeeStatusSchema.parse(status));
  }

  const { data, count, error } = await query
    .order(
      sortField === 'department'
        ? 'department'
        : sortField === 'designation'
          ? 'designation'
          : sortField === 'dateOfJoining'
            ? 'date_of_joining'
            : sortField === 'status'
              ? 'status'
              : 'created_at',
      { ascending }
    )
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  const userMap = await buildLegacyUserIdMap(
    accessToken,
    ((data as Record<string, unknown>[] | null) ?? [])
      .map((row) => String(row.user_id))
      .filter(Boolean),
    tenantId
  );

  return NextResponse.json({
    success: true,
    data: ((data as Record<string, unknown>[] | null) ?? []).map((row) => normalizeSupabaseEmployeeRecord(row, userMap)),
    message: 'Employees fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createEmployeeSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const authUserId = await resolveAuthUserIdFromLegacyUserId(accessToken, payload.userId, tenantId);

  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', authUserId)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!existingUser) throw new NotFoundError('User with provided userId does not exist');

  const { data: duplicate } = await supabase
    .from('employees')
    .select('id')
    .eq('employee_id', payload.employeeId.trim())
    .eq('tenant_id', tenantId)
    .maybeSingle();
    
  if (duplicate) throw new ConflictError('Employee with this employeeId already exists');

  const now = new Date().toISOString();
  const { data, error } = await supabase.from('employees').insert({
    user_id: authUserId,
    employee_id: payload.employeeId.trim(),
    department: payload.department.trim(),
    designation: payload.designation.trim(),
    date_of_joining: payload.dateOfJoining,
    date_of_birth: payload.dateOfBirth ?? null,
    skills: payload.skills ?? null,
    salary: payload.salary ?? null,
    status: payload.status ?? 'active',
    tenant_id: tenantId,
    created_at: now,
    updated_at: now,
  }).select('*').single();

  if (error || !data) throw error ? new Error(error.message) : new Error('Failed to create employee');
  const userMap = await buildLegacyUserIdMap(accessToken, [authUserId], tenantId);
  return NextResponse.json(normalizeSupabaseEmployeeRecord(data, userMap), { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid employee id is required');

  const payload = updateEmployeeSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: existingEmployee } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!existingEmployee) throw new NotFoundError('Employee not found');

  if (payload.employeeId && payload.employeeId.trim() !== existingEmployee.employee_id) {
    const { data: duplicate } = await supabase
      .from('employees')
      .select('id')
      .eq('employee_id', payload.employeeId.trim())
      .eq('tenant_id', tenantId)
      .maybeSingle();
      
    if (duplicate) throw new ConflictError('Employee with this employeeId already exists');
  }

  const { data, error } = await supabase.from('employees').update({
    ...(payload.employeeId !== undefined ? { employee_id: payload.employeeId.trim() } : {}),
    ...(payload.department !== undefined ? { department: payload.department.trim() } : {}),
    ...(payload.designation !== undefined ? { designation: payload.designation.trim() } : {}),
    ...(payload.dateOfJoining !== undefined ? { date_of_joining: payload.dateOfJoining } : {}),
    ...(payload.dateOfBirth !== undefined ? { date_of_birth: payload.dateOfBirth ?? null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.skills !== undefined ? { skills: payload.skills ?? null } : {}),
    ...(payload.salary !== undefined ? { salary: payload.salary ?? null } : {}),
    updated_at: new Date().toISOString(),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();

  if (error || !data) throw error ? new Error(error.message) : new Error('Failed to update employee');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.user_id)], tenantId);
  return NextResponse.json(normalizeSupabaseEmployeeRecord(data, userMap));
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid employee id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data, error } = await supabase.from('employees').update({
    status: 'resigned',
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();

  if (error || !data) throw new NotFoundError('Employee not found');

  await supabase.from('users').update({
    is_active: false,
    updated_at: new Date().toISOString(),
  }).eq('id', data.user_id).eq('tenant_id', tenantId);

  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.user_id)], tenantId);
  return NextResponse.json({
    message: 'Employee resigned and account deactivated successfully',
    employee: normalizeSupabaseEmployeeRecord(data, userMap),
  });
}, { requireAuth: true, roles: ['Manager'] });
