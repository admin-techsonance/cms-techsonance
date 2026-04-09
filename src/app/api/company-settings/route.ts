import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { companySettings } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { companySettingsSchema, updateCompanySettingsSchema } from '@/server/validation/settings';

export const GET = withApiHandler(async () => {
  const [settings] = await db.select().from(companySettings).limit(1);
  return apiSuccess(settings ?? null, settings ? 'Company settings fetched successfully' : 'Company settings not configured');
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request) => {
  const payload = companySettingsSchema.parse(await request.json());
  const [existing] = await db.select().from(companySettings).limit(1);
  if (existing) {
    throw new ConflictError('Company settings already exist. Use PUT to update the current record.');
  }

  const now = new Date().toISOString();
  const [created] = await db.insert(companySettings).values({
    ...payload,
    email: payload.email.toLowerCase(),
    updatedAt: now,
  }).returning();

  return apiSuccess(created, 'Company settings created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const PUT = withApiHandler(async (request) => {
  const payload = updateCompanySettingsSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update company settings');
  }

  const [existing] = await db.select().from(companySettings).limit(1);
  if (!existing) {
    throw new NotFoundError('Company settings not found');
  }

  const [updated] = await db.update(companySettings).set({
    ...payload,
    ...(payload.email !== undefined ? { email: payload.email?.toLowerCase() ?? null } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(companySettings.id, existing.id)).returning();

  return apiSuccess(updated, 'Company settings updated successfully');
}, { requireAuth: true, roles: ['Admin'] });
