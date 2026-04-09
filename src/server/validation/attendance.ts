import { z } from 'zod';

export const checkInSchema = z.object({
  tagUid: z.string().trim().min(1).optional().nullable(),
  employeeId: z.coerce.number().int().positive().optional().nullable(),
  readerId: z.string().trim().max(100).optional().nullable(),
  location: z.string().trim().max(255).optional().nullable(),
  idempotencyKey: z.string().trim().max(255).optional().nullable(),
  locationLatitude: z.coerce.number().optional().nullable(),
  locationLongitude: z.coerce.number().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
}).refine((value) => value.tagUid || value.employeeId, {
  message: 'Either tagUid or employeeId must be provided',
});

export const checkOutSchema = z.object({
  tagUid: z.string().trim().min(1).optional().nullable(),
  employeeId: z.coerce.number().int().positive().optional().nullable(),
  readerId: z.string().trim().max(100).optional().nullable(),
  location: z.string().trim().max(255).optional().nullable(),
  idempotencyKey: z.string().trim().max(255).optional().nullable(),
}).refine((value) => value.tagUid || value.employeeId, {
  message: 'Either tagUid or employeeId must be provided',
});

