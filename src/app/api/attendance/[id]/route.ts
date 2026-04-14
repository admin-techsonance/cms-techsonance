import { NextRequest } from 'next/server';
import { authenticateRequest } from '@/server/auth/session';
import { apiError, apiSuccess } from '@/server/http/response';
import { ApiError, BadRequestError, NotFoundError } from '@/server/http/errors';
import { updateAttendanceRecordSchema } from '@/server/validation/attendance-admin';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

function calculateDuration(dateStr: string, timeIn: string, timeOut: string | null) {
  if (!timeIn || !timeOut) return null;
  try {
    const inDate = new Date(`${dateStr}T${timeIn}`);
    const outDate = new Date(`${dateStr}T${timeOut}`);
    const diff = Math.round((outDate.getTime() - inDate.getTime()) / 60000);
    return diff > 0 ? diff : 0;
  } catch {
    return null;
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request, { required: true, roles: ['Admin'] });
    const { id } = await params;
    const recordId = Number(id);
    if (!Number.isInteger(recordId) || recordId <= 0) throw new BadRequestError('Valid attendance record id is required');

    const payload = updateAttendanceRecordSchema.parse(await request.json());
    const duration = payload.timeOut ? calculateDuration(payload.date, payload.timeIn, payload.timeOut) : null;
    const accessToken = auth?.accessToken;
    const tenantId = auth?.user.tenantId;
    if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
    const supabase = getAdminRouteSupabase();

    if (payload._source === 'legacy') {
      const { data: existing } = await supabase
        .from('attendance')
        .select('*')
        .eq('id', recordId)
        .eq('tenant_id', tenantId)
        .single();
      if (!existing) throw new NotFoundError('Legacy attendance record not found');

      const { error } = await supabase.from('attendance').update({
        check_in: payload.timeIn,
        check_out: payload.timeOut ?? null,
        status: payload.status,
      })
      .eq('id', recordId)
      .eq('tenant_id', tenantId);
      if (error) throw error;
    } else {
      const { data: existing } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('id', recordId)
        .eq('tenant_id', tenantId)
        .single();
      if (!existing) throw new NotFoundError('Attendance record not found');

      const { error } = await supabase.from('attendance_records').update({
        time_in: payload.timeIn,
        time_out: payload.timeOut ?? null,
        duration,
        status: payload.status,
      })
      .eq('id', recordId)
      .eq('tenant_id', tenantId);
      if (error) throw error;
    }

    return apiSuccess(null, 'Attendance record updated successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      return apiError(error.message, { status: error.statusCode, errors: error.details });
    }
    return apiError(error instanceof Error ? error.message : 'Internal server error');
  }
}
