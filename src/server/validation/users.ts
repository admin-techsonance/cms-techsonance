import { z } from 'zod';

const legacyRoles = [
  'admin',
  'hr_manager',
  'cms_administrator',
  'project_manager',
  'business_development',
  'developer',
  'qa_engineer',
  'devops_engineer',
  'ui_ux_designer',
  'digital_marketing',
  'business_analyst',
  'management',
  'intern',
  'architect',
  'client',
] as const;

export const userRoleSchema = z.enum(legacyRoles);

export const createUserSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(12).max(128),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: userRoleSchema,
  avatarUrl: z.string().trim().url().optional().nullable().or(z.literal('')),
  phone: z.string().trim().max(20).optional().nullable(),
  twoFactorEnabled: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateUserSchema = createUserSchema.partial().extend({
  lastLogin: z.string().datetime().optional().nullable(),
  password: z.string().min(12).max(128).optional(),
});

