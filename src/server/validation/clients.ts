import { z } from 'zod';

export const clientStatusSchema = z.enum(['active', 'inactive', 'prospect']);

export const createClientSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  contactPerson: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  industry: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: clientStatusSchema.optional(),
});

export const updateClientSchema = createClientSchema.partial();

