import { z } from 'zod';

export const leaveTypeSchema = z.enum(['casual', 'sick', 'earned', 'unpaid', 'maternity', 'paternity']);
export const approvalStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export const leavePeriodSchema = z.enum(['full_day', 'first_half', 'second_half']);

export const createLeaveRequestSchema = z.object({
  employeeId: z.coerce.number().int().positive().optional(),
  leaveType: leaveTypeSchema,
  startDate: z.string().date(),
  endDate: z.string().date(),
  reason: z.string().trim().min(1).max(2000),
  leavePeriod: leavePeriodSchema.optional(),
  actualDays: z.coerce.number().positive().optional(),
});

export const updateLeaveRequestSchema = z.object({
  leaveType: leaveTypeSchema.optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
  leavePeriod: leavePeriodSchema.optional(),
  actualDays: z.coerce.number().positive().optional(),
  status: approvalStatusSchema.optional(),
});

export const createPerformanceReviewSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  reviewerId: z.coerce.number().int().positive().optional(),
  rating: z.coerce.number().int().min(1).max(5),
  reviewPeriod: z.string().trim().min(1).max(255),
  comments: z.string().trim().max(2000).optional().nullable(),
});

export const updatePerformanceReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  reviewPeriod: z.string().trim().min(1).max(255).optional(),
  comments: z.string().trim().max(2000).optional().nullable(),
});

