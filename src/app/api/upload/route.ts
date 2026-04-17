import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createSignedTenantFileUrl, uploadTenantFile } from '@/server/supabase/storage';
import { getCurrentSupabaseActor } from '@/server/supabase/route-helpers';

const VALID_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const VALID_KINDS = new Set(['avatar', 'payroll', 'expense', 'project', 'leave_document']);

function getUploadKind(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return 'expense' as const;
  }

  if (!VALID_KINDS.has(value)) {
    throw new BadRequestError('Invalid upload kind');
  }

  return value as 'avatar' | 'payroll' | 'expense' | 'project' | 'leave_document';
}

function assertSafeStoragePath(path: string) {
  if (!path || path.startsWith('/') || path.includes('..')) {
    throw new BadRequestError('Invalid file path');
  }
}

export const GET = withApiHandler(async (request, context) => {
  const accessToken = context.auth?.accessToken;
  if (!accessToken) throw new BadRequestError('Authorization token is required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const searchParams = new URL(request.url).searchParams;
  const kindParam = searchParams.get('kind');
  const path = searchParams.get('path');

  if (!kindParam || !VALID_KINDS.has(kindParam)) {
    throw new BadRequestError('Valid upload kind is required');
  }
  if (!path) {
    throw new BadRequestError('File path is required');
  }

  assertSafeStoragePath(path);
  const signedUrl = await createSignedTenantFileUrl({
    tenantId: actor.tenantId,
    kind: kindParam as 'avatar' | 'payroll' | 'expense' | 'project',
    path,
    expiresIn: 60 * 10,
  });

  if (request.headers.get('accept')?.includes('application/json')) {
    return apiSuccess({ url: signedUrl }, 'Signed URL generated');
  }

  return NextResponse.redirect(signedUrl, { status: 302 });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
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

  const accessToken = context.auth?.accessToken;
  if (!accessToken) throw new BadRequestError('Authorization token is required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const bytes = await file.arrayBuffer();
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const kind = getUploadKind(data.get('kind'));
  const storagePath = `${kind}/${uniqueSuffix}-${safeName}`;

  await uploadTenantFile({
    tenantId: actor.tenantId,
    kind,
    path: storagePath,
    contentType: file.type,
    data: new Uint8Array(bytes),
    upsert: false,
  });

  return apiSuccess({
    url: `/api/upload?kind=${encodeURIComponent(kind)}&path=${encodeURIComponent(storagePath)}`,
    name: file.name,
    type: file.type,
    size: file.size,
    kind,
    storagePath,
  }, 'File uploaded successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });
