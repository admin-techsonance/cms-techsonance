import { z } from 'zod';

export const notificationTypeSchema = z.enum(['info', 'success', 'warning', 'error']);

export const createNotificationSchema = z.object({
  userId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(255),
  message: z.string().trim().min(1).max(2000),
  type: notificationTypeSchema,
  link: z.string().trim().max(2000).optional().nullable(),
});

export const updateNotificationSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  message: z.string().trim().min(1).max(2000).optional(),
  type: notificationTypeSchema.optional(),
  link: z.string().trim().max(2000).optional().nullable(),
  isRead: z.boolean().optional(),
});

export const createChatMessageSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  receiverId: z.coerce.number().int().positive().optional().nullable(),
  roomId: z.string().trim().max(255).optional().nullable(),
  attachments: z.array(z.string().trim().min(1).max(2000)).optional().nullable(),
});

export const updateChatMessageSchema = z.object({
  message: z.string().trim().min(1).max(5000).optional(),
  isRead: z.boolean().optional(),
  attachments: z.array(z.string().trim().min(1).max(2000)).optional().nullable(),
});

