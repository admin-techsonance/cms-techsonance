import { z } from 'zod';

export const reimbursementStatusSchema = z.enum(['draft', 'submitted', 'approved', 'rejected', 'paid']);

export const createReimbursementSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  amount: z.coerce.number().int().positive(),
  expenseDate: z.string().date(),
  description: z.string().trim().min(1).max(2000),
  receiptUrl: z.string().trim().max(2000).optional().nullable(),
  status: reimbursementStatusSchema.optional(),
});

export const updateReimbursementSchema = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  amount: z.coerce.number().int().positive().optional(),
  expenseDate: z.string().date().optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  receiptUrl: z.string().trim().max(2000).optional().nullable(),
  status: reimbursementStatusSchema.optional(),
  adminComments: z.string().trim().max(2000).optional().nullable(),
});

export const reimbursementCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  maxAmount: z.coerce.number().int().min(0).optional().nullable(),
});

