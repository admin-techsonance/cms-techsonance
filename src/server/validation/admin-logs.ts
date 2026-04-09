import { z } from 'zod';

export const createActivityLogSchema = z.object({
  userId: z.coerce.number().int().positive(),
  action: z.string().trim().min(1).max(255),
  module: z.string().trim().min(1).max(255),
  details: z.record(z.string(), z.unknown()).optional().nullable(),
  ipAddress: z.string().trim().max(100).optional().nullable(),
});

