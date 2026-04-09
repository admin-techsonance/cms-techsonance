import { z } from 'zod';

export const ticketPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export const ticketStatusSchema = z.enum(['open', 'in_progress', 'resolved', 'closed']);

export const createTicketSchema = z.object({
  ticketNumber: z.string().trim().min(1).max(100),
  clientId: z.coerce.number().int().positive(),
  subject: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(5000),
  assignedTo: z.coerce.number().int().positive().optional().nullable(),
  priority: ticketPrioritySchema.optional(),
  status: ticketStatusSchema.optional(),
});

export const updateTicketSchema = z.object({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  assignedTo: z.coerce.number().int().positive().optional().nullable(),
});

export const createTicketResponseSchema = z.object({
  ticketId: z.coerce.number().int().positive(),
  message: z.string().trim().min(1).max(5000),
  attachments: z.array(z.string().trim().min(1).max(2000)).optional().nullable(),
});

export const updateTicketResponseSchema = z.object({
  message: z.string().trim().min(1).max(5000).optional(),
  attachments: z.array(z.string().trim().min(1).max(2000)).optional().nullable(),
});

