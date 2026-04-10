import { getSupabaseServerClient } from '@/server/supabase/client';

export function createAttendanceRepository(accessToken?: string | null) {
  const supabase = getSupabaseServerClient(accessToken);

  return {
    async list(params?: {
      limit?: number;
      page?: number;
      employeeId?: number;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
    }) {
      let query = supabase.from('attendance').select('*', { count: 'exact' });

      if (params?.employeeId) {
        query = query.eq('employee_id', params.employeeId);
      }
      if (params?.status) {
        query = query.eq('status', params.status);
      }
      if (params?.dateFrom) {
        query = query.gte('date', params.dateFrom);
      }
      if (params?.dateTo) {
        query = query.lte('date', params.dateTo);
      }

      const page = params?.page ?? 1;
      const limit = params?.limit ?? 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      return query.range(from, to).order('date', { ascending: false });
    },
    async create(payload: Record<string, unknown>) {
      return supabase.from('attendance').insert(payload).select().single();
    },
    async update(id: number | string, payload: Record<string, unknown>) {
      return supabase.from('attendance').update(payload).eq('id', id).select().single();
    },
  };
}
