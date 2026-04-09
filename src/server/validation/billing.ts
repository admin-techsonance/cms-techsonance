import { z } from 'zod';

export const invoiceStatusSchema = z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']);

export const createInvoiceSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(100),
  clientId: z.coerce.number().int().positive(),
  projectId: z.coerce.number().int().positive().optional().nullable(),
  amount: z.coerce.number().int().min(0),
  tax: z.coerce.number().int().min(0),
  totalAmount: z.coerce.number().int().min(0),
  dueDate: z.string().date(),
  paidDate: z.string().date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: invoiceStatusSchema.optional(),
});

export const updateInvoiceSchema = createInvoiceSchema.partial();

export const createPaymentSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  amount: z.coerce.number().int().positive(),
  paymentMethod: z.string().trim().min(1).max(100),
  paymentDate: z.string().datetime().or(z.string().date()),
  transactionId: z.string().trim().max(255).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const updatePaymentSchema = z.object({
  paymentMethod: z.string().trim().min(1).max(100).optional(),
  transactionId: z.string().trim().max(255).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

