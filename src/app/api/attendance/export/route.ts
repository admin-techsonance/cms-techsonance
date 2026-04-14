import { withApiHandler } from '@/server/http/handler';
import { apiSuccess } from '@/server/http/response';
import { attendanceExportQuerySchema } from '@/server/validation/attendance-admin';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';
import { listSupabaseProfilesByAuthIds } from '@/server/supabase/users';

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const query = attendanceExportQuerySchema.parse({
    startDate: searchParams.get('start_date'),
    endDate: searchParams.get('end_date'),
    employeeId: searchParams.get('employee_id'),
    readerId: searchParams.get('reader_id'),
    status: searchParams.get('status'),
    source: searchParams.get('source'),
  });

  const LIMIT = 5000;
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new Error('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: employeeRows } = await supabase
    .from('employees')
    .select('id,department,user_id')
    .eq('tenant_id', tenantId);
  const employeeList = (employeeRows as { id: number; department: string; user_id: string }[] | null) ?? [];
  const employeesById = new Map<number, { department: string; user_id: string }>(
    employeeList.map((row) => [Number(row.id), { department: row.department, user_id: row.user_id }])
  );
  const profiles = await listSupabaseProfilesByAuthIds(employeeList.map((row) => row.user_id), { 
    useAdmin: true, 
    tenantId 
  });

  let nfcResults: any[] = [];
  if (query.source !== 'legacy') {
    let statement = supabase.from('attendance_records').select('*').eq('tenant_id', tenantId);
    if (query.startDate) statement = statement.gte('date', query.startDate);
    if (query.endDate) statement = statement.lte('date', query.endDate);
    if (query.employeeId) statement = statement.eq('employee_id', query.employeeId);
    if (query.readerId) statement = statement.eq('reader_id', query.readerId);
    if (query.status) statement = statement.eq('status', query.status);
    const { data: rows } = await statement.order('date', { ascending: false }).order('time_in', { ascending: false }).limit(LIMIT);
    nfcResults = (((rows as Record<string, any>[] | null) ?? [])).map((row) => {
      const employee = employeesById.get(Number(row.employee_id));
      const profile = employee ? profiles.get(employee.user_id) : null;
      return {
        id: Number(row.id),
        employeeId: Number(row.employee_id),
        date: row.date,
        timeIn: row.time_in,
        timeOut: row.time_out,
        duration: row.duration ?? null,
        status: row.status,
        checkInMethod: row.check_in_method,
        employee: {
          firstName: profile?.first_name ?? '',
          lastName: profile?.last_name ?? '',
          email: profile?.email ?? null,
          department: employee?.department ?? null,
        },
        _source: 'nfc',
      };
    });
  }

  let legacyResults: any[] = [];
  if (query.source !== 'nfc' && !query.readerId) {
    let statement = supabase.from('attendance').select('*').eq('tenant_id', tenantId);
    if (query.startDate) statement = statement.gte('date', query.startDate);
    if (query.endDate) statement = statement.lte('date', query.endDate);
    if (query.employeeId) statement = statement.eq('employee_id', query.employeeId);
    if (query.status) statement = statement.eq('status', query.status);
    const { data: rows } = await statement.order('date', { ascending: false }).limit(LIMIT);
    legacyResults = (((rows as Record<string, any>[] | null) ?? [])).map((row) => {
      const employee = employeesById.get(Number(row.employee_id));
      const profile = employee ? profiles.get(employee.user_id) : null;
      return {
        id: Number(row.id),
        employeeId: Number(row.employee_id),
        date: row.date,
        timeIn: row.check_in,
        timeOut: row.check_out,
        duration: row.check_in && row.check_out ? Math.floor((new Date(row.check_out).getTime() - new Date(row.check_in).getTime()) / 60000) : null,
        status: row.status,
        checkInMethod: 'legacy',
        employee: {
          firstName: profile?.first_name ?? '',
          lastName: profile?.last_name ?? '',
          email: profile?.email ?? null,
          department: employee?.department ?? null,
        },
        _source: 'legacy',
      };
    });
  }

  const merged = [...nfcResults, ...legacyResults].sort((a, b) => {
    const dateCompare = (b.date || '').localeCompare(a.date || '');
    if (dateCompare !== 0) return dateCompare;
    return (b.timeIn || '').localeCompare(a.timeIn || '');
  });

  const escapeCsv = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const headers = ['Employee Name', 'Email', 'Department', 'Date', 'Time In', 'Time Out', 'Duration (mins)', 'Status', 'Check-in Method'];
  let csvContent = `${headers.map(escapeCsv).join(',')}\n`;
  for (const record of merged) {
    const row = [
      `${record.employee?.firstName || ''} ${record.employee?.lastName || ''}`.trim(),
      record.employee?.email,
      record.employee?.department,
      record.date,
      record.timeIn || '',
      record.timeOut || '',
      record.duration ?? 0,
      record.status,
      record.checkInMethod,
    ];
    csvContent += `${row.map(escapeCsv).join(',')}\n`;
  }

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="attendance_export_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}, { requireAuth: true, roles: ['Admin'] });
