import { NextResponse } from 'next/server';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { createUserSchema, updateUserSchema, userRoleSchema } from '@/server/validation/users';
import { hashPassword } from '@/server/auth/password';

function sanitizeUser<T extends { password?: string }>(user: T): Omit<T, 'password'> {
  const { password, ...rest } = user;
  return rest;
}

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  if (id) {
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestError('Valid user id is required');
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return NextResponse.json(sanitizeUser(user));
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const role = searchParams.get('role');
  const isActive = searchParams.get('isActive');

  const conditions = [];

  if (search) {
    conditions.push(
      or(
        like(users.email, `%${search}%`),
        like(users.firstName, `%${search}%`),
        like(users.lastName, `%${search}%`)
      )
    );
  }

  if (role) {
    conditions.push(eq(users.role, userRoleSchema.parse(role)));
  }

  if (isActive === 'true' || isActive === 'false') {
    conditions.push(eq(users.isActive, isActive === 'true'));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(users);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(users);

  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [results, countRows] = await Promise.all([
    query.orderBy(desc(users.createdAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  return NextResponse.json({
    success: true,
    data: results.map(sanitizeUser),
    message: 'Users fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(countRows[0]?.count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Admin'] });

export const POST = withApiHandler(async (request) => {
  const payload = createUserSchema.parse(await request.json());
  const normalizedEmail = payload.email.toLowerCase().trim();

  const [existingUser] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existingUser) {
    throw new ConflictError('Email already exists');
  }

  const now = new Date().toISOString();
  const [created] = await db.insert(users).values({
    email: normalizedEmail,
    password: await hashPassword(payload.password),
    firstName: payload.firstName.trim(),
    lastName: payload.lastName.trim(),
    role: payload.role,
    avatarUrl: payload.avatarUrl?.trim() || null,
    phone: payload.phone?.trim() || null,
    twoFactorEnabled: payload.twoFactorEnabled ?? false,
    isActive: payload.isActive ?? true,
    createdAt: now,
    updatedAt: now,
    lastLogin: null,
  }).returning();

  return NextResponse.json(sanitizeUser(created), { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const PUT = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = Number(searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Valid user id is required');
  }

  const payload = updateUserSchema.parse(await request.json());
  const [existingUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existingUser) {
    throw new NotFoundError('User not found');
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (payload.email !== undefined) {
    const normalizedEmail = payload.email.toLowerCase().trim();
    const [emailOwner] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (emailOwner && emailOwner.id !== id) {
      throw new ConflictError('Email already exists');
    }
    updates.email = normalizedEmail;
  }

  if (payload.password) {
    updates.password = await hashPassword(payload.password);
  }

  if (payload.firstName !== undefined) updates.firstName = payload.firstName.trim();
  if (payload.lastName !== undefined) updates.lastName = payload.lastName.trim();
  if (payload.role !== undefined) updates.role = payload.role;
  if (payload.avatarUrl !== undefined) updates.avatarUrl = payload.avatarUrl?.trim() || null;
  if (payload.phone !== undefined) updates.phone = payload.phone?.trim() || null;
  if (payload.twoFactorEnabled !== undefined) updates.twoFactorEnabled = payload.twoFactorEnabled;
  if (payload.isActive !== undefined) updates.isActive = payload.isActive;
  if (payload.lastLogin !== undefined) updates.lastLogin = payload.lastLogin;

  const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
  if (!updated) {
    throw new NotFoundError('User not found');
  }

  return NextResponse.json(sanitizeUser(updated));
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

  const [updated] = await db.update(users)
    .set({
      isActive: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, id))
    .returning();

  if (!updated) {
    throw new NotFoundError('User not found');
  }

  return NextResponse.json({
    message: 'User deleted successfully (soft delete)',
    user: sanitizeUser(updated),
  });
}, { requireAuth: true, roles: ['Admin'] });

