import { getSupabaseServerClient } from '@/server/supabase/client';

export function createPayrollRepository(accessToken?: string | null) {
  const supabase = getSupabaseServerClient(accessToken);

  return {
    async list(params?: {
      limit?: number;
      page?: number;
      employeeId?: number;
      month?: string;
      year?: number;
      status?: string;
    }) {
      let query = supabase.from('payroll').select('*', { count: 'exact' });

      if (params?.employeeId) {
        query = query.eq('employee_id', params.employeeId);
      }
      if (params?.month) {
        query = query.eq('month', params.month);
      }
      if (params?.year) {
        query = query.eq('year', params.year);
      }
      if (params?.status) {
        query = query.eq('status', params.status);
      }

      const page = params?.page ?? 1;
      const limit = params?.limit ?? 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      return query.range(from, to).order('generated_at', { ascending: false });
    },
    async create(payload: Record<string, unknown>) {
      return supabase.from('payroll').insert(payload).select().single();
    },
    async update(id: number | string, payload: Record<string, unknown>) {
      return supabase.from('payroll').update(payload).eq('id', id).select().single();
    },
    async enqueueRun(payload: Record<string, unknown>) {
      return supabase.from('payroll_jobs').insert(payload).select().single();
    },
  };
}
