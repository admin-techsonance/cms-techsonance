import { z } from 'zod';

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).optional().nullable(),
});

export const createSessionSchema = z.object({
  userId: z.coerce.number().int().positive(),
  token: z.string().trim().min(1).max(2000),
  expiresAt: z.string().datetime(),
});

export const updateSessionSchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  token: z.string().trim().min(1).max(2000).optional(),
  expiresAt: z.string().datetime().optional(),
});
