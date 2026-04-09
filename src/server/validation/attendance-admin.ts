import { z } from 'zod';

export const attendanceStatusSchema = z.enum(['present', 'absent', 'late', 'half_day']);
export const attendanceSourceSchema = z.enum(['nfc', 'legacy']).optional();

export const createAttendanceSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  date: z.string().date(),
  timeIn: z.string().datetime(),
  timeOut: z.string().datetime().optional().nullable(),
  duration: z.number().int().min(0).optional().nullable(),
  location: z.string().trim().max(255).optional().nullable(),
  readerId: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  status: attendanceStatusSchema,
});

export const createManualAttendanceSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  checkIn: z.string().datetime(),
  checkOut: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const updateAttendanceRecordSchema = z.object({
  timeIn: z.string().min(1),
  timeOut: z.string().min(1).optional().nullable(),
  status: attendanceStatusSchema,
  _source: z.enum(['legacy', 'nfc']),
  date: z.string().date(),
});

export const attendanceExportQuerySchema = z.object({
  startDate: z.string().date().optional().nullable(),
  endDate: z.string().date().optional().nullable(),
  employeeId: z.coerce.number().int().positive().optional().nullable(),
  readerId: z.string().trim().max(255).optional().nullable(),
  status: z.string().trim().max(100).optional().nullable(),
  source: z.enum(['legacy', 'nfc']).optional().nullable(),
});

export const attendanceBulkRowSchema = z.object({
  employeeIdentifier: z.string().trim().min(1),
  date: z.string().date(),
  timeIn: z.string().trim().optional().nullable(),
  timeOut: z.string().trim().optional().nullable(),
});

export const attendanceToggleSchema = z.object({
  tagUid: z.string().trim().min(1).optional().nullable(),
  employeeId: z.coerce.number().int().positive().optional().nullable(),
  readerId: z.string().trim().max(255).optional().nullable(),
  location: z.string().trim().max(255).optional().nullable(),
  idempotencyKey: z.string().trim().max(255).optional().nullable(),
  locationLatitude: z.coerce.number().optional().nullable(),
  locationLongitude: z.coerce.number().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
}).refine((value) => value.tagUid || value.employeeId, {
  message: 'Either tagUid or employeeId must be provided',
});
