import { z } from 'zod';

const emailSchema = z.string().trim().email().max(255);

export const companySettingsSchema = z.object({
  companyName: z.string().trim().min(1).max(255),
  email: emailSchema,
  logoUrl: z.string().trim().max(2000).optional().nullable(),
  primaryColor: z.string().trim().max(50).optional().nullable(),
  secondaryColor: z.string().trim().max(50).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  website: z.string().trim().max(2000).optional().nullable(),
  smtpHost: z.string().trim().max(255).optional().nullable(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional().nullable(),
  smtpUser: z.string().trim().max(255).optional().nullable(),
  smtpPassword: z.string().max(255).optional().nullable(),
});

export const updateCompanySettingsSchema = companySettingsSchema.partial();

export const businessSettingsSchema = z.object({
  businessName: z.string().trim().min(1).max(255),
  email: emailSchema.optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  gstNo: z.string().trim().max(100).optional().nullable(),
  pan: z.string().trim().max(100).optional().nullable(),
  tan: z.string().trim().max(100).optional().nullable(),
  registrationNo: z.string().trim().max(100).optional().nullable(),
  termsAndConditions: z.string().trim().max(5000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  paymentTerms: z.string().trim().max(2000).optional().nullable(),
  logoUrl: z.string().trim().max(2000).optional().nullable(),
});

export const companyHolidaySchema = z.object({
  date: z.string().date(),
  reason: z.string().trim().min(1).max(255),
  year: z.coerce.number().int().min(1000).max(9999).optional(),
});

export const updateCompanyHolidaySchema = companyHolidaySchema.partial();

