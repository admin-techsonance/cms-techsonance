import { z } from 'zod';

export const sprintStatusSchema = z.enum(['planning', 'active', 'completed', 'cancelled']);

export const createSprintSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  goal: z.string().trim().max(2000).optional().nullable(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  status: sprintStatusSchema.optional(),
});

export const updateSprintSchema = createSprintSchema.omit({ projectId: true }).partial();

