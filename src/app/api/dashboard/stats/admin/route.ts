import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError } from '@/server/http/errors';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';
import { getDashboardType, type UserRole } from '@/lib/permissions';

export const GET = withApiHandler(async (request, context) => {
  const user = context.auth!.user;
  const authUserId = user.id;
  const tenantId = user.tenantId;

  if (!authUserId || !tenantId) throw new BadRequestError('User context or tenant is missing');

  // Dynamic role validation - ONLY allow access if the user's role maps to 'admin' dashboard type
  if (getDashboardType(user.role as UserRole) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = getAdminRouteSupabase();
  const todayStr = new Date().toISOString().split('T')[0];
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Run all counts in parallel for maximum performance
  const [
    clientsRes,
    projectsRes,
    invoicesRes,
    employeesRes,
    attendanceTodayRes,
    reportsYesterdayRes,
    leavesRes,
    claimsRes,
    recentProjectsRes
  ] = await Promise.all([
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'in_progress'),
    supabase.from('invoices').select('total_amount').eq('tenant_id', tenantId).eq('status', 'paid'),
    supabase.from('employees').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('attendance_records').select('employee_id').eq('tenant_id', tenantId).eq('date', todayStr),
    supabase.from('daily_reports').select('user_id').eq('tenant_id', tenantId).eq('date', yesterdayStr),
    supabase.from('leave_requests').select('*, employees!inner(id, user_id, employees:users!inner(first_name, last_name))').eq('tenant_id', tenantId).eq('status', 'pending').limit(10),
    supabase.from('reimbursements').select('*, employees!inner(id, user_id, employees:users!inner(first_name, last_name))').eq('tenant_id', tenantId).eq('status', 'pending').limit(10),
    supabase.from('projects').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(5)
  ]);

  // Aggregate specialized stats
  const totalRevenue = (invoicesRes.data || []).reduce((acc: number, inv: any) => acc + (Number(inv.total_amount) || 0), 0);
  const totalEmployees = employeesRes.count || 0;
  
  // Unique employees present today
  const presentEmployeeIds = new Set((attendanceTodayRes.data || []).map(r => r.employee_id));
  const presentToday = presentEmployeeIds.size;
  const absentToday = Math.max(0, totalEmployees - presentToday);

  // Missing reports calculation
  const usersWithReports = new Set((reportsYesterdayRes.data || []).map(r => r.user_id));
  // We approximate missing reports by subtracting the count from total employees. 
  // For absolute accuracy, we would match user_ids, but a general count metric is suitable for the high-level dashboard.
  const missingReportsCount = Math.max(0, totalEmployees - usersWithReports.size);

  const pendingApprovals = [
    ...(leavesRes.data || []).map(l => ({ 
      id: l.id, 
      type: 'leave', 
      title: 'Leave Request', 
      employee: `${l.employees?.employees?.first_name} ${l.employees?.employees?.last_name}`,
      details: `${l.leave_type?.replace('_', ' ')}: ${l.start_date} to ${l.end_date}`,
      date: l.created_at 
    })),
    ...(claimsRes.data || []).map(r => ({ 
      id: r.id, 
      type: 'reimbursement', 
      title: 'Reimbursement', 
      employee: `${r.employees?.employees?.first_name} ${r.employees?.employees?.last_name}`,
      details: `Amount: ₹${r.amount} - ${r.purpose}`,
      date: r.created_at 
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // 6-Month Financial Run Rate Calculation
  const sixMonthsAgoDate = new Date();
  sixMonthsAgoDate.setMonth(sixMonthsAgoDate.getMonth() - 5);
  sixMonthsAgoDate.setDate(1); // First day of that month
  const sixMonthsAgoStr = sixMonthsAgoDate.toISOString().split('T')[0];

  const [historicalInvoicesRes, historicalClaimsRes] = await Promise.all([
    supabase.from('invoices').select('total_amount, created_at').eq('tenant_id', tenantId).eq('status', 'paid').gte('created_at', sixMonthsAgoStr),
    supabase.from('reimbursements').select('amount, created_at').eq('tenant_id', tenantId).eq('status', 'approved').gte('created_at', sixMonthsAgoStr)
  ]);

  const financialRunRate = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return {
      month: d.toLocaleDateString('en-US', { month: 'short' }),
      revenue: 0,
      expenses: 0,
      _yearMonth: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    };
  });

  (historicalInvoicesRes.data || []).forEach(inv => {
    const d = new Date(inv.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const target = financialRunRate.find(f => f._yearMonth === key);
    if (target) target.revenue += Number(inv.total_amount) || 0;
  });

  (historicalClaimsRes.data || []).forEach(claim => {
    const d = new Date(claim.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const target = financialRunRate.find(f => f._yearMonth === key);
    if (target) target.expenses += Number(claim.amount) || 0;
  });

  financialRunRate.forEach(f => {
    // @ts-ignore
    delete f._yearMonth; // Cleanup
  });

  return NextResponse.json({
    activeClients: clientsRes.count || 0,
    activeProjects: projectsRes.count || 0,
    totalRevenue,
    totalEmployees,
    workforce: {
      presentToday,
      absentToday,
      missingReportsCount
    },
    pendingApprovals,
    recentProjects: recentProjectsRes.data || [],
    financialRunRate
  });
}, { requireAuth: true });
