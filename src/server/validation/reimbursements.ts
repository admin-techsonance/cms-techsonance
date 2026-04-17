import { z } from 'zod';

export const reimbursementStatusSchema = z.enum(['draft', 'submitted', 'approved', 'rejected', 'paid']);

export const createReimbursementSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  amount: z.coerce.number().int().positive(),
  expenseDate: z.string().date(),
  description: z.string().trim().min(1).max(2000),
  receiptUrl: z.string().trim().max(2000).optional().nullable(),
  status: reimbursementStatusSchema.optional(),
  // New expense claim fields
  billingStatus: z.enum(['billable', 'non_billable']).optional().default('non_billable'),
  costCategory: z.string().trim().max(100).optional().nullable(),
  currency: z.string().trim().max(10).optional().default('INR'),
  qty: z.coerce.number().int().min(1).optional().default(1),
  unitCost: z.coerce.number().min(0).optional().default(0),
  project: z.string().trim().max(200).optional().default('TechSonance Infotech'),
  forCompany: z.string().trim().max(200).optional().default('TechSonance Infotech'),
  division: z.string().trim().max(10).optional().default('IND'),
  reasonForClaim: z.string().trim().max(2000).optional().nullable(),
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

