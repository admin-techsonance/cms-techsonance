import { z } from 'zod';

export const projectStatusSchema = z.enum(['planning', 'in_progress', 'on_hold', 'completed', 'cancelled']);
export const projectPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  clientId: z.coerce.number().int().positive(),
  startDate: z.string().date().optional().nullable(),
  endDate: z.string().date().optional().nullable(),
  budget: z.coerce.number().int().min(0).optional().nullable(),
  status: projectStatusSchema.optional(),
  priority: projectPrioritySchema.optional(),
  isActive: z.boolean().optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

