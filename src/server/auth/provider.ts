import { env } from '@/server/config/env';

export function isSupabaseAuthEnabled() {
  return env.AUTH_PROVIDER === 'supabase';
}

export function isSupabaseDatabaseEnabled() {
  return env.DATABASE_PROVIDER === 'supabase';
}

export function isSupabaseConfigured() {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
}
