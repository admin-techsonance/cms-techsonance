import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { businessSettings } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { businessSettingsSchema } from '@/server/validation/settings';

export const GET = withApiHandler(async () => {
  const [settings] = await db.select().from(businessSettings).limit(1);
  return apiSuccess(settings ?? null, settings ? 'Business settings fetched successfully' : 'Business settings not configured');
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request) => {
  const payload = businessSettingsSchema.parse(await request.json());
  const now = new Date().toISOString();
  const [existing] = await db.select().from(businessSettings).limit(1);

  if (existing) {
    const [updated] = await db.update(businessSettings).set({
      ...payload,
      updatedAt: now,
    }).where(eq(businessSettings.id, existing.id)).returning();

    return apiSuccess(updated, 'Business settings updated successfully');
  }

  const [created] = await db.insert(businessSettings).values({
    ...payload,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return apiSuccess(created, 'Business settings created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const PUT = withApiHandler(async (request) => {
  const payload = businessSettingsSchema.partial().parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update business settings');
  }

  const [existing] = await db.select().from(businessSettings).limit(1);
  if (!existing) {
    throw new NotFoundError('Business settings not found');
  }

  const [updated] = await db.update(businessSettings).set({
    ...payload,
    updatedAt: new Date().toISOString(),
  }).where(eq(businessSettings.id, existing.id)).returning();

  return apiSuccess(updated, 'Business settings updated successfully');
}, { requireAuth: true, roles: ['Admin'] });
