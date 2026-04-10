import { withApiHandler } from '@/server/http/handler';
import { apiSuccess } from '@/server/http/response';
import { z } from 'zod';
import { registerTenant } from '@/server/supabase/tenants';

const tenantRegistrationSchema = z.object({
  companyName: z.string().trim().min(2).max(255),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/),
  adminEmail: z.string().trim().email(),
  adminPassword: z.string().min(12).max(128),
  adminFirstName: z.string().trim().min(1).max(100),
  adminLastName: z.string().trim().min(1).max(100),
});

export const POST = withApiHandler(async (request) => {
  const payload = tenantRegistrationSchema.parse(await request.json());
  const result = await registerTenant(payload);
  return apiSuccess(result, 'Tenant registered successfully', { status: 201 });
});
