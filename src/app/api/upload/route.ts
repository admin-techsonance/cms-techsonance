import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';

const VALID_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const POST = withApiHandler(async (request) => {
  const data = await request.formData();
  const file = data.get('file');

  if (!(file instanceof File)) {
    throw new BadRequestError('A file upload is required');
  }
  if (!VALID_TYPES.has(file.type)) {
    throw new BadRequestError('Invalid file type. Only PDF, JPG, and PNG are allowed.');
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    throw new BadRequestError('File size must be between 1 byte and 10 MB');
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filename = `${uniqueSuffix}-${safeName}`;
  const uploadDir = join(process.cwd(), 'public', 'uploads');

  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, filename), buffer);

  return apiSuccess({ url: `/uploads/${filename}`, name: file.name, type: file.type, size: file.size }, 'File uploaded successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });
