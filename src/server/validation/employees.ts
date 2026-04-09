import { z } from 'zod';

export const employeeStatusSchema = z.enum(['active', 'on_leave', 'resigned']);

export const createEmployeeSchema = z.object({
  userId: z.coerce.number().int().positive(),
  employeeId: z.string().trim().min(1).max(100),
  department: z.string().trim().min(1).max(100),
  designation: z.string().trim().min(1).max(100),
  dateOfJoining: z.string().date(),
  dateOfBirth: z.string().date().optional().nullable(),
  skills: z.array(z.string().trim().min(1).max(100)).optional().nullable(),
  salary: z.coerce.number().min(0).optional().nullable(),
  status: employeeStatusSchema.optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.omit({ userId: true }).partial();

