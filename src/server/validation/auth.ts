import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  rememberMe: z.boolean().optional().default(false),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(12).max(128),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email().max(255),
});

export const passwordResetVerifySchema = z.object({
  email: z.string().trim().email().max(255),
  otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

export const passwordResetCompleteSchema = z.object({
  email: z.string().trim().email().max(255),
  otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be 6 digits'),
  newPassword: z.string().min(12).max(128),
  confirmPassword: z.string().min(12).max(128),
}).superRefine((value, ctx) => {
  if (value.newPassword !== value.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['confirmPassword'],
      message: 'Passwords do not match',
    });
  }
});
