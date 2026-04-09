import { z } from 'zod';

export const purchaseStatusSchema = z.enum(['pending', 'paid', 'cancelled']);
export const vendorStatusSchema = z.enum(['active', 'inactive']);

export const createVendorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactPerson: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  status: vendorStatusSchema.optional(),
});

export const updateVendorSchema = createVendorSchema.partial();

export const createPurchaseSchema = z.object({
  vendorId: z.coerce.number().int().positive(),
  date: z.string().date(),
  amount: z.coerce.number().int().positive(),
  description: z.string().trim().max(1000).optional().nullable(),
  status: purchaseStatusSchema.optional(),
  billUrl: z.string().trim().max(2000).optional().nullable(),
  dueDate: z.string().date().optional().nullable(),
});

export const updatePurchaseSchema = createPurchaseSchema.partial();

