import { z } from 'zod';

export const readerTypeSchema = z.enum(['usb', 'ethernet', 'mobile']);
export const readerStatusSchema = z.enum(['online', 'offline', 'maintenance']);
export const enrollmentStatusSchema = z.enum(['active', 'inactive', 'lost', 'damaged']);

export const createReaderSchema = z.object({
  readerId: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  location: z.string().trim().min(1).max(255),
  type: readerTypeSchema,
  ipAddress: z.string().trim().max(255).optional().nullable(),
  config: z.union([z.string().trim().max(10000), z.record(z.string(), z.unknown())]).optional().nullable(),
});

export const updateReaderSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  location: z.string().trim().min(1).max(255).optional(),
  type: readerTypeSchema.optional(),
  status: readerStatusSchema.optional(),
  ipAddress: z.string().trim().max(255).optional().nullable(),
  config: z.union([z.string().trim().max(10000), z.record(z.string(), z.unknown())]).optional().nullable(),
});

export const createEnrollmentSchema = z.object({
  tagUid: z.string().trim().min(1).max(255),
  employeeId: z.coerce.number().int().positive(),
});

export const updateEnrollmentSchema = z.object({
  status: enrollmentStatusSchema,
});
