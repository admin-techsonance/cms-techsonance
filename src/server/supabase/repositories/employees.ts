import { getSupabaseServerClient } from '@/server/supabase/client';

export function createEmployeesRepository(accessToken?: string | null) {
  const supabase = getSupabaseServerClient(accessToken);

  return {
    async list(params?: { limit?: number; page?: number; search?: string; status?: string }) {
      let query = supabase.from('employees').select('*', { count: 'exact' });

      if (params?.search) {
        query = query.or(`employee_id.ilike.%${params.search}%,department.ilike.%${params.search}%,designation.ilike.%${params.search}%`);
      }

      if (params?.status) {
        query = query.eq('status', params.status);
      }

      const page = params?.page ?? 1;
      const limit = params?.limit ?? 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      return query.range(from, to).order('created_at', { ascending: false });
    },
    async create(payload: Record<string, unknown>) {
      return supabase.from('employees').insert(payload).select().single();
    },
    async update(id: number | string, payload: Record<string, unknown>) {
      return supabase.from('employees').update(payload).eq('id', id).select().single();
    },
    async remove(id: number | string) {
      return supabase.from('employees').delete().eq('id', id);
    },
  };
}
