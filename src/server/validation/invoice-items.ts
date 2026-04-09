import { z } from 'zod';

export const createInvoiceItemSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().int().positive(),
  amount: z.coerce.number().int().positive().optional(),
});

export const updateInvoiceItemSchema = createInvoiceItemSchema.partial();

