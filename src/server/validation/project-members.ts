import { z } from 'zod';

export const projectMemberRoleSchema = z.enum(['lead', 'developer', 'designer', 'tester']);

export const createProjectMemberSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
  role: projectMemberRoleSchema,
});

export const updateProjectMemberSchema = z.object({
  role: projectMemberRoleSchema,
});

