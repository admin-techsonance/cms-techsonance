import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, ConflictError } from '@/server/http/errors';
import { createUserSchema, updateUserSchema, userRoleSchema } from '@/server/validation/users';
import { getSupabaseAdminClient } from '@/server/supabase/admin';
import { getCurrentSupabaseActor, getAdminRouteSupabase } from '@/server/supabase/route-helpers';
import { getSupabaseProfileByEmail, getSupabaseProfileByLegacyUserId } from '@/server/supabase/users';

function normalizeSupabaseUser(user: Record<string, unknown>) {
  return {
    id: Number(user.legacy_user_id),
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
    avatarUrl: user.avatar_url ?? null,
    phone: user.phone ?? null,
    twoFactorEnabled: Boolean(user.two_factor_enabled ?? false),
    isActive: Boolean(user.is_active),
    lastLogin: user.last_login ?? null,
    createdAt: user.created_at ?? null,
    updatedAt: user.updated_at ?? null,
  };
}

async function getNextLegacyUserId(tenantId: string) {
  const supabase = getAdminRouteSupabase();
  const { data } = await supabase
    .from('users')
    .select('legacy_user_id')
    .eq('tenant_id', tenantId)
    .order('legacy_user_id', { ascending: false })
    .limit(1);

  const currentMax = Number((data as { legacy_user_id: number | null }[] | null)?.[0]?.legacy_user_id ?? 0);
  return currentMax + 1;
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();

  if (id) {
    const profile = await getSupabaseProfileByLegacyUserId(Number(id), { 
      accessToken, 
      tenantId,
      useAdmin: true 
    }).catch(() => null);
    if (!profile) throw new NotFoundError('User not found');
    return NextResponse.json(normalizeSupabaseUser(profile as unknown as Record<string, unknown>));
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const role = searchParams.get('role');
  const isActive = searchParams.get('isActive');
  let query = supabase
    .from('users')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (search) {
    query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  }
  if (role) {
    query = query.eq('role', userRoleSchema.parse(role));
  }
  if (isActive === 'true' || isActive === 'false') {
    query = query.eq('is_active', isActive === 'true');
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return NextResponse.json({
    success: true,
    data: ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseUser),
    message: 'Users fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Admin'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createUserSchema.parse(await request.json());
  const normalizedEmail = payload.email.toLowerCase().trim();

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const admin = getSupabaseAdminClient() as any;

  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', normalizedEmail)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (existingUser) {
    throw new ConflictError('Email already exists');
  }

  const legacyUserId = await getNextLegacyUserId(tenantId);
  const authUserId = crypto.randomUUID();
  const { error: authError } = await admin.auth.admin.createUser({
    id: authUserId,
    email: normalizedEmail,
    password: payload.password,
    email_confirm: true,
    user_metadata: {
      firstName: payload.firstName.trim(),
      lastName: payload.lastName.trim(),
    },
    app_metadata: {
      tenant_id: actor.tenantId,
      role: payload.role,
      legacy_user_id: legacyUserId,
    },
  });

  if (authError) throw authError;

  const now = new Date().toISOString();
  const { error: tenantUserError } = await admin.from('tenant_users').insert({
    tenant_id: actor.tenantId,
    user_id: authUserId,
    email: normalizedEmail,
    first_name: payload.firstName.trim(),
    last_name: payload.lastName.trim(),
    role: payload.role,
    status: payload.isActive ?? true ? 'active' : 'inactive',
    created_at: now,
    updated_at: now,
  });
  if (tenantUserError) throw tenantUserError;

  const { data, error } = await admin.from('users').insert({
    id: authUserId,
    tenant_id: actor.tenantId,
    legacy_user_id: legacyUserId,
    email: normalizedEmail,
    first_name: payload.firstName.trim(),
    last_name: payload.lastName.trim(),
    role: payload.role,
    avatar_url: payload.avatarUrl?.trim() || null,
    phone: payload.phone?.trim() || null,
    two_factor_enabled: payload.twoFactorEnabled ?? false,
    is_active: payload.isActive ?? true,
    created_at: now,
    updated_at: now,
    last_login: null,
  }).select('*').single();

  if (error || !data) throw error ?? new Error('Failed to create user');
  return NextResponse.json(normalizeSupabaseUser(data), { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const PUT = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = Number(searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Valid user id is required');
  }

  const payload = updateUserSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const admin = getSupabaseAdminClient() as any;
  const existingUser = await getSupabaseProfileByLegacyUserId(id, { 
    accessToken, 
    tenantId,
    useAdmin: true 
  }).catch(() => null);
  if (!existingUser) {
    throw new NotFoundError('User not found');
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.email !== undefined) {
    const normalizedEmail = payload.email.toLowerCase().trim();
    const emailOwner = await getSupabaseProfileByEmail(normalizedEmail, { 
      accessToken, 
      tenantId,
      useAdmin: true 
    }).catch(() => null);
    if (emailOwner && emailOwner.id !== existingUser.id) {
      throw new ConflictError('Email already exists');
    }
    updates.email = normalizedEmail;
  }

  if (payload.firstName !== undefined) updates.first_name = payload.firstName.trim();
  if (payload.lastName !== undefined) updates.last_name = payload.lastName.trim();
  if (payload.role !== undefined) updates.role = payload.role;
  if (payload.avatarUrl !== undefined) updates.avatar_url = payload.avatarUrl?.trim() || null;
  if (payload.phone !== undefined) updates.phone = payload.phone?.trim() || null;
  if (payload.twoFactorEnabled !== undefined) updates.two_factor_enabled = payload.twoFactorEnabled;
  if (payload.isActive !== undefined) updates.is_active = payload.isActive;
  if (payload.lastLogin !== undefined) updates.last_login = payload.lastLogin;

  if (payload.email !== undefined || payload.password || payload.role !== undefined) {
    const adminPayload: Record<string, unknown> = {
      ...(payload.email !== undefined ? { email: payload.email.toLowerCase().trim() } : {}),
      ...(payload.password ? { password: payload.password } : {}),
    };
    if (payload.role !== undefined) {
      adminPayload.app_metadata = {
        tenant_id: existingUser.tenant_id,
        role: payload.role,
        legacy_user_id: existingUser.legacy_user_id,
      };
    }
    const { error: adminError } = await admin.auth.admin.updateUserById(existingUser.id, adminPayload);
    if (adminError) throw adminError;
  }

  const { data, error } = await admin
    .from('users')
    .update(updates)
    .eq('id', existingUser.id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !data) {
    throw new NotFoundError('User not found');
  }

  return NextResponse.json(normalizeSupabaseUser(data));
}, { requireAuth: true, roles: ['Admin'] });

export const DELETE = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = Number(searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Valid user id is required');
  }

  if (context.auth?.user.id === id) {
    throw new ConflictError('You cannot deactivate your own account');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const admin = getSupabaseAdminClient() as any;
  const existingUser = await getSupabaseProfileByLegacyUserId(id, { 
    accessToken, 
    tenantId,
    useAdmin: true 
  }).catch(() => null);
  
  if (!existingUser) {
    throw new NotFoundError('User not found');
  }

  const { data, error } = await admin.from('users')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existingUser.id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();

  if (error || !data) {
    throw new NotFoundError('User not found');
  }

  return NextResponse.json({
    message: 'User deleted successfully (soft delete)',
    user: normalizeSupabaseUser(data),
  });
}, { requireAuth: true, roles: ['Admin'] });

