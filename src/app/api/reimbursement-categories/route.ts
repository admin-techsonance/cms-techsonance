import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { reimbursementCategories } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError } from '@/server/http/errors';
import { reimbursementCategorySchema } from '@/server/validation/reimbursements';

export const GET = withApiHandler(async () => {
  const categories = await db.select().from(reimbursementCategories).where(eq(reimbursementCategories.isActive, true)).orderBy(asc(reimbursementCategories.name));
  return NextResponse.json(categories);
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request) => {
  const payload = reimbursementCategorySchema.parse(await request.json());
  const [existing] = await db.select().from(reimbursementCategories).where(eq(reimbursementCategories.name, payload.name)).limit(1);
  if (existing) throw new ConflictError('Category with this name already exists');
  const now = new Date().toISOString();
  const [created] = await db.insert(reimbursementCategories).values({
    name: payload.name,
    description: payload.description ?? null,
    maxAmount: payload.maxAmount ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Category ID is required');
  await db.update(reimbursementCategories).set({ isActive: false, updatedAt: new Date().toISOString() }).where(eq(reimbursementCategories.id, id));
  return NextResponse.json({ message: 'Category deactivated successfully' });
}, { requireAuth: true, roles: ['Admin'] });

