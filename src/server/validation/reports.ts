import { z } from 'zod';

export const dailyReportStatusSchema = z.enum(['present', 'half_day', 'early_leave', 'on_leave']);

export const createDailyReportSchema = z.object({
  date: z.string().date(),
  availableStatus: dailyReportStatusSchema,
});

export const updateDailyReportSchema = createDailyReportSchema.partial();

export const createDailyReportProjectSchema = z.object({
  dailyReportId: z.coerce.number().int().positive(),
  projectId: z.coerce.number().int().positive(),
  description: z.string().trim().min(1).max(2000),
  trackerTime: z.coerce.number().int().nonnegative(),
  isCoveredWork: z.boolean().optional(),
  isExtraWork: z.boolean().optional(),
});

export const updateDailyReportProjectSchema = createDailyReportProjectSchema.partial().omit({ dailyReportId: true });


