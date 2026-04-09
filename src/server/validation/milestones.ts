import { z } from 'zod';

export const milestoneStatusSchema = z.enum(['pending', 'in_progress', 'completed']);

export const createMilestoneSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  dueDate: z.string().datetime().or(z.string().date()),
  description: z.string().trim().max(2000).optional().nullable(),
  status: milestoneStatusSchema.optional(),
});

export const updateMilestoneSchema = createMilestoneSchema.omit({ projectId: true }).partial();

