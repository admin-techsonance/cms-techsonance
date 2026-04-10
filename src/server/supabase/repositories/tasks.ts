import { getSupabaseServerClient } from '@/server/supabase/client';

export function createTasksRepository(accessToken?: string | null) {
  const supabase = getSupabaseServerClient(accessToken);

  return {
    async list(params?: {
      limit?: number;
      page?: number;
      projectId?: number;
      sprintId?: number;
      status?: string;
      assignedTo?: string;
      search?: string;
    }) {
      let query = supabase.from('tasks').select('*', { count: 'exact' });

      if (params?.projectId) {
        query = query.eq('project_id', params.projectId);
      }
      if (params?.sprintId) {
        query = query.eq('sprint_id', params.sprintId);
      }
      if (params?.status) {
        query = query.eq('status', params.status);
      }
      if (params?.assignedTo) {
        query = query.eq('assigned_to', params.assignedTo);
      }
      if (params?.search) {
        query = query.or(`title.ilike.%${params.search}%,description.ilike.%${params.search}%`);
      }

      const page = params?.page ?? 1;
      const limit = params?.limit ?? 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      return query.range(from, to).order('updated_at', { ascending: false });
    },
    async create(payload: Record<string, unknown>) {
      return supabase.from('tasks').insert(payload).select().single();
    },
    async update(id: number | string, payload: Record<string, unknown>) {
      return supabase.from('tasks').update(payload).eq('id', id).select().single();
    },
    async remove(id: number | string) {
      return supabase.from('tasks').delete().eq('id', id);
    },
  };
}
