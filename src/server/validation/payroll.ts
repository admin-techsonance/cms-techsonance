import { z } from 'zod';

export const payrollStatusSchema = z.enum(['draft', 'approved', 'paid']);
export const payrollMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Month must use YYYY-MM format');

export const updatePayrollSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: payrollStatusSchema.optional(),
  deductions: z.coerce.number().min(0).optional(),
  bonuses: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const generatePayrollSchema = z.object({
  employeeIds: z.union([z.literal('all'), z.array(z.coerce.number().int().positive()).min(1)]).optional(),
  month: payrollMonthSchema,
  year: z.coerce.number().int().min(2000).max(9999),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
}).refine((value) => {
  if ((value.startDate && !value.endDate) || (!value.startDate && value.endDate)) {
    return false;
  }
  return true;
}, {
  message: 'startDate and endDate must be provided together',
});
