import { z } from 'zod';

export const taskStatusSchema = z.enum(['todo', 'in_progress', 'review', 'done']);
export const taskPrioritySchema = z.enum(['low', 'medium', 'high']);
export const storyPointsSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(5),
  z.literal(8),
  z.literal(13),
  z.literal(21),
]);

export const createTaskSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  assignedTo: z.coerce.number().int().positive(),
  milestoneId: z.coerce.number().int().positive().optional().nullable(),
  sprintId: z.coerce.number().int().positive().optional().nullable(),
  blockedById: z.coerce.number().int().positive().optional().nullable(),
  storyPoints: storyPointsSchema.optional().nullable(),
  estimatedHours: z.coerce.number().nonnegative().optional().nullable(),
  loggedHours: z.coerce.number().nonnegative().optional().nullable(),
  dueDate: z.string().date().optional().nullable(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
});

export const updateTaskSchema = createTaskSchema.omit({ projectId: true }).partial();

