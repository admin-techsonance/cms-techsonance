import { z } from 'zod';

export const expenseStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const createExpenseSchema = z.object({
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(1000),
  amount: z.coerce.number().int().positive(),
  date: z.string().date(),
  projectId: z.coerce.number().int().positive().optional().nullable(),
  employeeId: z.coerce.number().int().positive().optional().nullable(),
  receiptUrl: z.string().trim().max(2000).optional().nullable(),
  status: expenseStatusSchema.optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

