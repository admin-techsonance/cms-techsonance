import { z } from 'zod';

const publicationStatusSchema = z.enum(['draft', 'published']);
const slugSchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200);

export const createPageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: slugSchema,
  content: z.string().optional().nullable(),
  metaTitle: z.string().trim().max(200).optional().nullable(),
  metaDescription: z.string().trim().max(500).optional().nullable(),
  metaKeywords: z.string().trim().max(500).optional().nullable(),
  status: publicationStatusSchema.optional(),
});

export const updatePageSchema = createPageSchema.partial();

export const createBlogSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: slugSchema,
  content: z.string().trim().min(1),
  category: z.string().trim().min(1).max(100),
  excerpt: z.string().trim().max(500).optional().nullable(),
  featuredImage: z.string().trim().max(2000).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(50)).optional().nullable(),
  status: publicationStatusSchema.optional(),
});

export const updateBlogSchema = createBlogSchema.partial();

