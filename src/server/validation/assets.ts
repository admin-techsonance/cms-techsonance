import { z } from 'zod';

export const timeTrackingAggregateSchema = z.enum(['task', 'user']);

export const createTimeTrackingSchema = z.object({
  taskId: z.coerce.number().int().positive(),
  hours: z.coerce.number().int().positive().max(24),
  date: z.string().date(),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const updateTimeTrackingSchema = z.object({
  taskId: z.coerce.number().int().positive().optional(),
  hours: z.coerce.number().int().positive().max(24).optional(),
  date: z.string().date().optional(),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const createProjectDocumentSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(255),
  fileUrl: z.string().trim().min(1).max(2000),
});

export const updateProjectDocumentSchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1).max(255).optional(),
  fileUrl: z.string().trim().min(1).max(2000).optional(),
});

export const portfolioStatusSchema = z.enum(['active', 'archived']);

const stringArraySchema = z.array(z.string().trim().min(1).max(255)).max(100);

export const createPortfolioItemSchema = z.object({
  title: z.string().trim().min(1).max(255),
  clientName: z.string().trim().min(1).max(255),
  category: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional().nullable(),
  projectUrl: z.string().trim().max(2000).optional().nullable(),
  thumbnail: z.string().trim().max(2000).optional().nullable(),
  images: stringArraySchema.optional().nullable(),
  technologies: stringArraySchema.optional().nullable(),
});

export const updatePortfolioItemSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  clientName: z.string().trim().min(1).max(255).optional(),
  category: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  projectUrl: z.string().trim().max(2000).optional().nullable(),
  thumbnail: z.string().trim().max(2000).optional().nullable(),
  images: stringArraySchema.optional().nullable(),
  technologies: stringArraySchema.optional().nullable(),
  status: portfolioStatusSchema.optional(),
});

export const mediaFileTypeSchema = z.enum([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
  'text/plain',
  'application/zip',
  'application/x-rar-compressed',
]);

export const createMediaFileSchema = z.object({
  name: z.string().trim().min(1).max(255),
  fileUrl: z.string().trim().min(1).max(2000),
  fileType: mediaFileTypeSchema,
  fileSize: z.coerce.number().int().positive().max(500 * 1024 * 1024),
});

export const updateMediaFileSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  fileUrl: z.string().trim().min(1).max(2000).optional(),
  fileType: mediaFileTypeSchema.optional(),
  fileSize: z.coerce.number().int().positive().max(500 * 1024 * 1024).optional(),
});
