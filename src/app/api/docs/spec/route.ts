import fs from 'node:fs/promises';
import path from 'node:path';
import { withApiHandler } from '@/server/http/handler';

export const GET = withApiHandler(async () => {
  const filePath = path.join(process.cwd(), 'docs', 'swagger.json');
  const content = await fs.readFile(filePath, 'utf8');
  return new Response(content, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}, {
  requireAuth: process.env.NODE_ENV === 'production',
  roles: process.env.NODE_ENV === 'production' ? ['Admin'] : undefined,
});
