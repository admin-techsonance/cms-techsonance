import { z } from 'zod';

export const inquiryTagSchema = z.enum([
  'need_estimation',
  'rough_estimation',
  'scheduling_meeting',
  'need_schedule_meeting',
  'hired_someone_else',
  'hired',
]);

export const inquiryStatusSchema = z.enum([
  'lead',
  'no_reply',
  'follow_up',
  'hired',
  'rejected_client',
  'rejected_us',
  'invite_lead',
  'invite_hire',
  'not_good_client',
  'budget_low',
  'cant_work',
  'hired_someone_else',
]);

export const inquiryAppStatusSchema = z.enum(['open', 'close']);

export const createInquirySchema = z.object({
  aliasName: z.string().trim().min(1).max(255),
  tag: inquiryTagSchema,
  status: inquiryStatusSchema,
  dueDate: z.string().date().optional().nullable(),
  appStatus: inquiryAppStatusSchema.optional().nullable(),
  isFavourite: z.boolean().optional(),
});

export const updateInquirySchema = z.object({
  aliasName: z.string().trim().min(1).max(255).optional(),
  tag: inquiryTagSchema.optional(),
  status: inquiryStatusSchema.optional(),
  dueDate: z.string().date().optional().nullable(),
  appStatus: inquiryAppStatusSchema.optional().nullable(),
  isFavourite: z.boolean().optional(),
});

export const createInquiryFeedSchema = z.object({
  inquiryId: z.coerce.number().int().positive(),
  technology: z.string().trim().max(255).optional().nullable(),
  description: z.string().trim().min(1).max(5000),
});

export const updateInquiryFeedSchema = z.object({
  technology: z.string().trim().max(255).optional().nullable(),
  description: z.string().trim().min(1).max(5000).optional(),
});

export const createClientCommunicationSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  message: z.string().trim().min(1).max(5000),
  attachments: z.array(z.string().trim().min(1).max(2000)).optional().nullable(),
  userId: z.coerce.number().int().positive().optional(),
});

export const updateClientCommunicationSchema = z.object({
  message: z.string().trim().min(1).max(5000).optional(),
  attachments: z.array(z.string().trim().min(1).max(2000)).optional().nullable(),
  isRead: z.boolean().optional(),
});
