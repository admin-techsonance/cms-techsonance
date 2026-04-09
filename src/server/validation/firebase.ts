import { z } from 'zod';

export const firebaseAttendanceEntrySchema = z.object({
  check_in: z.string().trim().min(1),
  check_out: z.string().trim().min(1).optional(),
  employee_id: z.union([z.string(), z.number()]).optional(),
  employeeId: z.union([z.string(), z.number()]).optional(),
  emp_id: z.union([z.string(), z.number()]).optional(),
});

export const firebaseSyncBodySchema = z.object({
  tagUid: z.string().trim().min(1),
  date: z.string().date().optional(),
  check_in: z.string().trim().min(1).optional(),
  check_out: z.string().trim().min(1).optional(),
  data: z.record(z.string().date(), firebaseAttendanceEntrySchema).optional(),
}).refine((value) => {
  const singleRecord = Boolean(value.date && value.check_in);
  const batchRecord = Boolean(value.data && Object.keys(value.data).length > 0);
  return singleRecord || batchRecord;
}, {
  message: 'Either a single attendance record or a batch data object is required',
});
