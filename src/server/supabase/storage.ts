import { env } from '@/server/config/env';
import { getSupabaseAdminClient } from '@/server/supabase/admin';

function getBucketName(kind: 'avatar' | 'payroll' | 'expense' | 'project') {
  switch (kind) {
    case 'avatar':
      return env.SUPABASE_STORAGE_BUCKET_AVATARS ?? 'avatars';
    case 'payroll':
      return env.SUPABASE_STORAGE_BUCKET_PAYROLL ?? 'payroll';
    case 'expense':
      return env.SUPABASE_STORAGE_BUCKET_EXPENSES ?? 'expenses';
    case 'project':
      return env.SUPABASE_STORAGE_BUCKET_PROJECTS ?? 'project-files';
  }
}

export async function uploadTenantFile(input: {
  tenantId: string;
  kind: 'avatar' | 'payroll' | 'expense' | 'project';
  path: string;
  contentType: string;
  data: ArrayBuffer | Uint8Array;
  upsert?: boolean;
}) {
  const supabase = getSupabaseAdminClient();
  const bucket = getBucketName(input.kind);
  const filePath = `tenants/${input.tenantId}/${input.path}`;

  const { data, error } = await supabase.storage.from(bucket).upload(filePath, input.data, {
    contentType: input.contentType,
    upsert: input.upsert ?? false,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function createSignedTenantFileUrl(input: {
  tenantId: string;
  kind: 'avatar' | 'payroll' | 'expense' | 'project';
  path: string;
  expiresIn?: number;
}) {
  const supabase = getSupabaseAdminClient();
  const bucket = getBucketName(input.kind);
  const filePath = `tenants/${input.tenantId}/${input.path}`;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, input.expiresIn ?? 60 * 10);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}
