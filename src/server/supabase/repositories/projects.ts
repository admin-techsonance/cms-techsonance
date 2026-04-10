import { getSupabaseServerClient } from '@/server/supabase/client';

export function createProjectsRepository(accessToken?: string | null) {
  const supabase = getSupabaseServerClient(accessToken);

  return {
    async list(params?: {
      limit?: number;
      page?: number;
      status?: string;
      priority?: string;
      clientId?: number;
      assignedTo?: string;
      search?: string;
    }) {
      let query = supabase.from('projects').select('*, client:clients(*)', { count: 'exact' });

      if (params?.status) {
        query = query.eq('status', params.status);
      }
      if (params?.priority) {
        query = query.eq('priority', params.priority);
      }
      if (params?.clientId) {
        query = query.eq('client_id', params.clientId);
      }
      if (params?.search) {
        query = query.or(`name.ilike.%${params.search}%,description.ilike.%${params.search}%`);
      }

      const page = params?.page ?? 1;
      const limit = params?.limit ?? 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      return query.range(from, to).order('created_at', { ascending: false });
    },
    async create(payload: Record<string, unknown>) {
      return supabase.from('projects').insert(payload).select().single();
    },
    async update(id: number | string, payload: Record<string, unknown>) {
      return supabase.from('projects').update(payload).eq('id', id).select().single();
    },
    async remove(id: number | string) {
      return supabase.from('projects').delete().eq('id', id);
    },
  };
}
