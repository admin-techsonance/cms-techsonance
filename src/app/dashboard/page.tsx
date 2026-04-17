'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Users, 
  FolderKanban, 
  DollarSign, 
  UserCog, 
  Loader2, 
  ClipboardList, 
  Calendar, 
  AlertCircle,
  Clock,
  Briefcase,
  ArrowRight,
  PlusCircle,
  FileText,
  BadgeCent,
  Settings
} from 'lucide-react';
import { getDashboardType, hasFullAccess, type UserRole } from '@/lib/permissions';
import { 
  ContentSkeleton, 
  PageHeaderSkeleton, 
  MetricCardGridSkeleton, 
  DashboardCompositeSkeleton, 
  TableSkeleton, 
  QuickActionsSkeleton 
} from '@/components/ui/dashboard-skeleton';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PerformanceCharts, FinancialRunRateChart } from '@/components/dashboard/performance-charts';
import { DashboardAnnouncements, DashboardApprovalQueue, DashboardBroadcaster } from '@/components/dashboard/dashboard-widgets';

interface DashboardStats {
  activeClients: number;
  activeProjects: number;
  totalRevenue: number;
  totalEmployees: number;
  workforce: {
    presentToday: number;
    absentToday: number;
    missingReportsCount: number;
  };
  pendingApprovals: any[];
  recentProjects: any[];
  financialRunRate?: any[];
}

interface EmployeeDashboardStats {
  stats: {
    totalHoursMonth: number;
    totalHoursYear: number;
    totalAssignedProjects: number;
    activeProjects: number;
    assignedTasksTotal: number;
    assignedTasksDueToday: number;
  };
  performance: {
    attendanceHistory: { date: string, hours: number }[];
    reportHistory: { date: string, submitted: number }[];
    taskDistribution: { todo: number, in_progress: number, review: number, done: number };
  };
  announcements: any[];
  alerts: any[];
  pendingApprovals: any[];
  recentProjects: any[];
}

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [adminStats, setAdminStats] = useState<DashboardStats | null>(null);
  const [employeeStats, setEmployeeStats] = useState<EmployeeDashboardStats | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('session_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchCurrentUser();
  }, [router]);

  useEffect(() => {
    if (currentUser) {
      const type = getDashboardType(currentUser.role as UserRole);
      setLoading(true);
      if (type === 'admin') {
        Promise.all([fetchAdminDashboardData(), fetchEmployeeDashboardData()]).finally(() => setLoading(false));
      } else {
        fetchEmployeeDashboardData().finally(() => setLoading(false));
      }
    }
  }, [currentUser]);

  const fetchCurrentUser = async () => {
    const token = localStorage.getItem('session_token');
    try {
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        router.push('/login');
        return;
      }
      const data = await response.json();
      setCurrentUser(data.user);
    } catch (error) {
      console.error('Auth check failed:', error);
      router.push('/login');
    }
  };

  const fetchEmployeeDashboardData = async () => {
    const token = localStorage.getItem('session_token');
    try {
      const response = await fetch('/api/dashboard/stats/employee', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        setEmployeeStats(await response.json());
      }
    } catch (error) {
      console.error('Error fetching employee stats:', error);
    }
  };

  const fetchAdminDashboardData = async () => {
    const token = localStorage.getItem('session_token');
    try {
      const response = await fetch('/api/dashboard/stats/admin', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        setAdminStats(await response.json());
      }
    } catch (error) {
      console.error('Error fetching admin dashboard stats:', error);
    }
  };

  if (!currentUser) return null;

  const dashboardType = getDashboardType(currentUser.role as UserRole);

  if (loading || !currentUser) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <MetricCardGridSkeleton count={dashboardType === 'employee' ? 5 : 4} />
        <div className="mt-8">
          <DashboardCompositeSkeleton />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7 mt-8">
          <div className="lg:col-span-4 italic">
            <TableSkeleton rows={5} columns={2} />
          </div>
          <div className="lg:col-span-3">
            <QuickActionsSkeleton count={4} />
          </div>
        </div>
      </div>
    );
  }

  if (dashboardType === 'employee') {
    return (
      <div className="space-y-6">
        <header className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight">Welcome back, {currentUser.firstName}!</h2>
          <p className="text-muted-foreground">Here is an overview of your work and productivity metrics.</p>
        </header>

        {employeeStats && (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <Card className="overflow-hidden border-none shadow-sm bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium opacity-90">Hours Month</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{employeeStats.stats.totalHoursMonth ?? 0}h</div>
                <p className="text-[10px] opacity-75 mt-0.5">Productive logged</p>
                <Clock className="absolute right-3 top-3 h-4 w-4 opacity-20" />
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-none shadow-sm bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium opacity-90">Hours Year</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{employeeStats.stats.totalHoursYear ?? 0}h</div>
                <p className="text-[10px] opacity-75 mt-0.5">Annual total</p>
                <Calendar className="absolute right-3 top-3 h-4 w-4 opacity-20" />
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-none shadow-sm bg-gradient-to-br from-amber-500 to-orange-600 text-white">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium opacity-90">Active Projects</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{employeeStats.stats.activeProjects ?? 0}</div>
                <p className="text-[10px] opacity-75 mt-0.5">In progress</p>
                <Loader2 className="absolute right-3 top-3 h-4 w-4 opacity-20" />
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-none shadow-sm bg-gradient-to-br from-purple-500 to-pink-600 text-white">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium opacity-90">Total Assigned</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{employeeStats.stats.totalAssignedProjects ?? 0}</div>
                <p className="text-[10px] opacity-75 mt-0.5">Lifecycle participation</p>
                <Briefcase className="absolute right-3 top-3 h-4 w-4 opacity-20" />
              </CardContent>
            </Card>
            
            <Card className="overflow-hidden border-none shadow-sm bg-gradient-to-br from-rose-500 to-red-600 text-white relative">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium opacity-90">Assigned To Me</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-1">
                  <div className="text-2xl font-bold">{employeeStats.stats.assignedTasksTotal ?? 0}</div>
                  <div className="text-[10px] opacity-75">total</div>
                </div>
                <p className="text-[10px] font-semibold mt-0.5 bg-white/20 px-1.5 py-0.5 rounded-full inline-block">
                  {employeeStats.stats.assignedTasksDueToday ?? 0} due today
                </p>
                <ClipboardList className="absolute right-3 top-3 h-4 w-4 opacity-20" />
              </CardContent>
            </Card>
          </div>
        )}

        {employeeStats && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PerformanceCharts data={employeeStats.performance} />
            </div>
            <div className="space-y-6">
              <DashboardAnnouncements 
                announcements={employeeStats.announcements} 
                alerts={employeeStats.alerts} 
              />
              {employeeStats.pendingApprovals && employeeStats.pendingApprovals.length > 0 && (
                <DashboardApprovalQueue items={employeeStats.pendingApprovals} />
              )}
            </div>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
          <Card className="lg:col-span-4 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Projects</CardTitle>
                <CardDescription>Your latest project assignments</CardDescription>
              </div>
              <Link href="/dashboard/projects">
                <Button variant="ghost" size="sm" className="text-blue-500">
                  View All <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {employeeStats?.recentProjects && employeeStats.recentProjects.length > 0 ? (
                  employeeStats.recentProjects.map((project: any) => (
                    <div key={project.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-accent/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${
                          project.status === 'completed' ? 'bg-green-100 text-green-700' :
                          project.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          <FolderKanban className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold">{project.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {project.status.replace('_', ' ')} • {project.priority} priority
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Assigned on</p>
                        <p className="text-sm font-medium">{new Date(project.assignedAt || project.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    <FolderKanban className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p>No projects assigned yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Shortcuts to internal modules</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3">
              <Link href="/dashboard/daily-update" className="group">
                <div className="flex items-center gap-4 p-4 rounded-xl border border-dashed hover:border-solid hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-500 transition-all">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 group-hover:scale-110 transition-transform">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Daily Updates</p>
                    <p className="text-xs text-muted-foreground">Report your progress</p>
                  </div>
                </div>
              </Link>
              <Link href="/dashboard/attendance" className="group">
                <div className="flex items-center gap-4 p-4 rounded-xl border border-dashed hover:border-solid hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-500 transition-all">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 group-hover:scale-110 transition-transform">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Attendance</p>
                    <p className="text-xs text-muted-foreground">Log your shift hours</p>
                  </div>
                </div>
              </Link>
              <Link href="/dashboard/reimbursements" className="group">
                <div className="flex items-center gap-4 p-4 rounded-xl border border-dashed hover:border-solid hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:border-orange-500 transition-all">
                  <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/40 text-orange-600 group-hover:scale-110 transition-transform">
                    <BadgeCent className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Reimbursement</p>
                    <p className="text-xs text-muted-foreground">Claim your expenses</p>
                  </div>
                </div>
              </Link>
              <Link href="/dashboard/help-desk" className="group">
                <div className="flex items-center gap-4 p-4 rounded-xl border border-dashed hover:border-solid hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-500 transition-all">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 group-hover:scale-110 transition-transform">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Support</p>
                    <p className="text-xs text-muted-foreground">Open a help ticket</p>
                  </div>
                </div>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const statCards = [
    { title: 'Active Clients', value: adminStats?.activeClients ?? 0, icon: Users, color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900' },
    { title: 'Active Projects', value: adminStats?.activeProjects ?? 0, icon: FolderKanban, color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900' },
    { title: 'Total Revenue', value: `₹${((adminStats?.totalRevenue ?? 0) / 1000).toFixed(0)}K`, icon: DollarSign, color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900' },
    { title: 'Team Members', value: adminStats?.totalEmployees ?? 0, icon: UserCog, color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900' },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">System Overview</h2>
          <p className="text-muted-foreground">Aggregated business metrics and organizational health.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/settings">
            <Button variant="outline" size="sm">
              <UserCog className="mr-2 h-4 w-4" /> Config
            </Button>
          </Link>
        </div>
      </header>

      {adminStats && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.title} className="shadow-none border-muted/60">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between space-y-0">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                        <h3 className="text-3xl font-bold mt-1">{stat.value}</h3>
                      </div>
                      <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                        <Icon className={`h-5 w-5 ${stat.color}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-6 md:grid-cols-12">
            {/* Workforce & Attendance Hub */}
            <div className="md:col-span-12 lg:col-span-5 flex flex-col space-y-6">
              <Card className="bg-card/50 overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-400" />
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-emerald-500" />
                  Workforce Hub
                </CardTitle>
                <CardDescription>Today's attendance and compliance overview</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-muted/40 rounded-xl">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">Present Today</p>
                    <p className="text-xs text-muted-foreground">Checked into the system</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-emerald-600">{adminStats.workforce?.presentToday || 0}</span>
                    <span className="text-sm text-muted-foreground">/ {adminStats.totalEmployees || 0}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-muted/40 rounded-xl">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">Absent / On Leave</p>
                    <p className="text-xs text-muted-foreground">Not logged in today</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-rose-500">{adminStats.workforce?.absentToday || 0}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-muted/40 rounded-xl border border-amber-200/30">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none flex items-center gap-1">
                      Missing Daily Updates 
                      {adminStats.workforce?.missingReportsCount > 0 && <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse ml-1" />}
                    </p>
                    <p className="text-xs text-muted-foreground">From the previous business day</p>
                  </div>
                  <div className="text-xl font-bold text-amber-600">{adminStats.workforce?.missingReportsCount || 0}</div>
                </div>
              </CardContent>
            </Card>
            <DashboardBroadcaster />
          </div>

          {/* Pending Approvals Pipeline */}
          <div className="md:col-span-12 lg:col-span-7 space-y-6">
              {adminStats.pendingApprovals && adminStats.pendingApprovals.length > 0 ? (
                <DashboardApprovalQueue items={adminStats.pendingApprovals} />
              ) : (
                <Card className="bg-card/50 h-full min-h-[300px] flex flex-col items-center justify-center border-dashed">
                  <div className="p-4 rounded-full bg-green-100 text-green-600 mb-4">
                    <ClipboardList className="h-8 w-8" />
                  </div>
                  <h3 className="text-lg font-semibold">All clear!</h3>
                  <p className="text-sm text-muted-foreground mt-1">No pending leave requests or claims to approve.</p>
                </Card>
              )}
            </div>
          </div>

          {adminStats.financialRunRate && (
            <FinancialRunRateChart data={adminStats.financialRunRate} />
          )}

          {/* Global Activity & Management Shortcuts */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle>Global Activity</CardTitle>
                <CardDescription>Latest across all departments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {adminStats.recentProjects && adminStats.recentProjects.length > 0 ? (
                    adminStats.recentProjects.map((project: any) => (
                      <div key={project.id} className="flex items-center gap-4 p-2 rounded hover:bg-accent/50">
                        <div className={`p-2 rounded-lg ${project.status === 'in_progress' ? 'bg-green-100 text-green-700' : 'bg-muted'}`}>
                          <FolderKanban className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{project.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{project.status.replace('_', ' ')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Assigned</p>
                          <p className="text-sm font-medium">{new Date(project.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No recent data</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle>Management Actions</CardTitle>
                <CardDescription>Direct shortcuts to resources</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Link href="/dashboard/projects">
                  <Button variant="outline" className="w-full justify-start py-6 h-auto">
                    <FolderKanban className="mr-4 h-5 w-5 opacity-40" />
                    <div className="text-left">
                      <p className="font-semibold">Projects</p>
                      <p className="text-[10px] text-muted-foreground">Kanban & Tasks</p>
                    </div>
                  </Button>
                </Link>
                <Link href="/dashboard/clients">
                  <Button variant="outline" className="w-full justify-start py-6 h-auto">
                    <Users className="mr-4 h-5 w-5 opacity-40" />
                    <div className="text-left">
                      <p className="font-semibold">Clients</p>
                      <p className="text-[10px] text-muted-foreground">Directory</p>
                    </div>
                  </Button>
                </Link>
                <Link href="/dashboard/team">
                  <Button variant="outline" className="w-full justify-start py-6 h-auto">
                    <UserCog className="mr-4 h-5 w-5 opacity-40" />
                    <div className="text-left">
                      <p className="font-semibold">Team</p>
                      <p className="text-[10px] text-muted-foreground">Roster</p>
                    </div>
                  </Button>
                </Link>
                <Link href="/dashboard/reimbursements">
                  <Button variant="outline" className="w-full justify-start py-6 h-auto">
                    <BadgeCent className="mr-4 h-5 w-5 opacity-40" />
                    <div className="text-left">
                      <p className="font-semibold">Claims</p>
                      <p className="text-[10px] text-muted-foreground">Approvals</p>
                    </div>
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {employeeStats && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-12 pt-12 border-t border-white/5">
          <div className="lg:col-span-2 space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold tracking-tight">Personal Workspace</h3>
                <p className="text-muted-foreground">Your assigned tasks and individual performance metrics.</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Due Today</span>
                  <span className="text-2xl font-black text-rose-500">{employeeStats.stats.assignedTasksDueToday}</span>
                </div>
                <div className="h-10 w-px bg-white/10" />
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Tasks</span>
                  <span className="text-2xl font-black">{employeeStats.stats.assignedTasksTotal}</span>
                </div>
              </div>
            </div>
            <PerformanceCharts data={employeeStats.performance} />
          </div>
          <div className="space-y-6">
            <DashboardAnnouncements 
              announcements={employeeStats.announcements} 
              alerts={employeeStats.alerts} 
            />
            {employeeStats.pendingApprovals && employeeStats.pendingApprovals.length > 0 && (
              <DashboardApprovalQueue items={employeeStats.pendingApprovals} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-components as local items for centralization
// Using @/components/ui/button now