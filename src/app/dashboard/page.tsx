'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FolderKanban, DollarSign, UserCog, Loader2, ClipboardList, Calendar, AlertCircle } from 'lucide-react';

interface DashboardStats {
  activeClients: number;
  totalClients: number;
  activeProjects: number;
  totalProjects: number;
  totalRevenue: number;
  totalEmployees: number;
  recentProjects: any[];
}

interface DeveloperStats {
  assignedProjects: number;
  dailyReportsCount: number;
  pendingLeaves: number;
  openTickets: number;
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
  const [stats, setStats] = useState<DashboardStats>({
    activeClients: 0,
    totalClients: 0,
    activeProjects: 0,
    totalProjects: 0,
    totalRevenue: 0,
    totalEmployees: 0,
    recentProjects: [],
  });
  const [developerStats, setDeveloperStats] = useState<DeveloperStats>({
    assignedProjects: 0,
    dailyReportsCount: 0,
    pendingLeaves: 0,
    openTickets: 0,
    recentProjects: [],
  });

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
      if (currentUser.role === 'developer') {
        fetchDeveloperData();
      } else {
        fetchDashboardData();
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

  const fetchDeveloperData = async () => {
    setLoading(true);
    const token = localStorage.getItem('session_token');

    try {
      const [projectsRes, dailyReportsRes, leavesRes, ticketsRes] = await Promise.all([
        fetch('/api/projects?limit=100', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/daily-reports?limit=100', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/leave-requests?limit=100', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/tickets?limit=100', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const projects = await projectsRes.json();
      const dailyReports = await dailyReportsRes.json();
      const leaves = await leavesRes.json();
      const tickets = await ticketsRes.json();

      // Filter projects assigned to developer
      const memberResponse = await fetch(`/api/project-members?limit=1000`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      let assignedProjectsCount = 0;
      let recentProjects: any[] = [];

      if (memberResponse.ok && currentUser) {
        const members = await memberResponse.json();
        const userProjectIds = members
          .filter((m: any) => m.userId === currentUser.id)
          .map((m: any) => m.projectId);

        const assignedProjects = Array.isArray(projects)
          ? projects.filter((p: any) => userProjectIds.includes(p.id))
          : [];

        assignedProjectsCount = assignedProjects.length;
        recentProjects = assignedProjects.slice(0, 5);
      }

      const pendingLeaves = Array.isArray(leaves)
        ? leaves.filter((l: any) => l.status === 'pending').length
        : 0;

      const openTickets = Array.isArray(tickets)
        ? tickets.filter((t: any) => t.status === 'open').length
        : 0;

      setDeveloperStats({
        assignedProjects: assignedProjectsCount,
        dailyReportsCount: Array.isArray(dailyReports) ? dailyReports.length : 0,
        pendingLeaves,
        openTickets,
        recentProjects,
      });
    } catch (error) {
      console.error('Error fetching developer stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    const token = localStorage.getItem('session_token');

    try {
      const [clientsRes, projectsRes, invoicesRes, employeesRes] = await Promise.all([
        fetch('/api/clients?limit=1000', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/projects?limit=1000', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/invoices?limit=1000', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/employees?limit=1000', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!clientsRes.ok || !projectsRes.ok || !invoicesRes.ok || !employeesRes.ok) {
        router.push('/login');
        return;
      }

      const clients = await clientsRes.json();
      const projects = await projectsRes.json();
      const invoices = await invoicesRes.json();
      const employees = await employeesRes.json();

      const activeClients = Array.isArray(clients) ? clients.filter((c: any) => c.status === 'active').length : 0;
      const activeProjects = Array.isArray(projects) ? projects.filter((p: any) => p.status === 'in_progress').length : 0;
      const totalRevenue = Array.isArray(invoices) ? invoices.reduce((sum: number, inv: any) => sum + (inv.totalAmount || 0), 0) : 0;
      const totalEmployees = Array.isArray(employees) ? employees.filter((e: any) => e.status === 'active').length : 0;

      setStats({
        activeClients,
        totalClients: Array.isArray(clients) ? clients.length : 0,
        activeProjects,
        totalProjects: Array.isArray(projects) ? projects.length : 0,
        totalRevenue,
        totalEmployees,
        recentProjects: Array.isArray(projects) ? projects.slice(0, 5) : [],
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Developer Dashboard
  if (currentUser?.role === 'developer') {
    const developerCards = [
      {
        title: 'Assigned Projects',
        value: developerStats.assignedProjects,
        subtitle: 'Active projects',
        icon: FolderKanban,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100 dark:bg-blue-900',
      },
      {
        title: 'Daily Reports',
        value: developerStats.dailyReportsCount,
        subtitle: 'Total submitted',
        icon: ClipboardList,
        color: 'text-green-600',
        bgColor: 'bg-green-100 dark:bg-green-900',
      },
      {
        title: 'Pending Leaves',
        value: developerStats.pendingLeaves,
        subtitle: 'Awaiting approval',
        icon: Calendar,
        color: 'text-orange-600',
        bgColor: 'bg-orange-100 dark:bg-orange-900',
      },
      {
        title: 'Open Tickets',
        value: developerStats.openTickets,
        subtitle: 'Support requests',
        icon: AlertCircle,
        color: 'text-purple-600',
        bgColor: 'bg-purple-100 dark:bg-purple-900',
      },
    ];

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Developer Dashboard</h2>
          <p className="text-muted-foreground">
            Welcome back, {currentUser?.firstName}! Here's your work overview.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {developerCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    {stat.subtitle}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>My Projects</CardTitle>
              <CardDescription>Projects you're currently working on</CardDescription>
            </CardHeader>
            <CardContent>
              {developerStats.recentProjects.length > 0 ? (
                <div className="space-y-4">
                  {developerStats.recentProjects.map((project: any) => (
                    <div key={project.id} className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${project.status === 'in_progress' ? 'bg-green-100 dark:bg-green-900' :
                          project.status === 'planning' ? 'bg-blue-100 dark:bg-blue-900' :
                            'bg-gray-100 dark:bg-gray-900'
                        }`}>
                        <FolderKanban className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{project.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {project.status.replace('_', ' ')} • {project.priority} priority
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No projects assigned yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks and shortcuts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <a
                  href="/dashboard/daily-update"
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
                >
                  <ClipboardList className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Submit Daily Report</p>
                    <p className="text-xs text-muted-foreground">Track your daily work</p>
                  </div>
                </a>
                <a
                  href="/dashboard/my-account"
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
                >
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Apply for Leave</p>
                    <p className="text-xs text-muted-foreground">Request time off</p>
                  </div>
                </a>
                <a
                  href="/dashboard/help-desk"
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
                >
                  <AlertCircle className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Create Support Ticket</p>
                    <p className="text-xs text-muted-foreground">Get help from support</p>
                  </div>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Admin/Manager Dashboard
  const statCards = [
    {
      title: 'Active Clients',
      value: stats.activeClients,
      subtitle: `${stats.totalClients} total`,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900',
    },
    {
      title: 'Active Projects',
      value: stats.activeProjects,
      subtitle: `${stats.totalProjects} total`,
      icon: FolderKanban,
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900',
    },
    {
      title: 'Total Revenue',
      value: `₹${(stats.totalRevenue / 1000).toFixed(0)}K`,
      subtitle: 'All time',
      icon: DollarSign,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100 dark:bg-purple-900',
    },
    {
      title: 'Team Members',
      value: stats.totalEmployees,
      subtitle: 'Active employees',
      icon: UserCog,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100 dark:bg-orange-900',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Overview of your business metrics and recent activities
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.subtitle}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Projects</CardTitle>
            <CardDescription>Latest project activities</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentProjects.length > 0 ? (
              <div className="space-y-4">
                {stats.recentProjects.map((project: any) => (
                  <div key={project.id} className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${project.status === 'in_progress' ? 'bg-green-100 dark:bg-green-900' :
                        project.status === 'planning' ? 'bg-blue-100 dark:bg-blue-900' :
                          'bg-gray-100 dark:bg-gray-900'
                      }`}>
                      <FolderKanban className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{project.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {project.status.replace('_', ' ')} • {project.priority} priority
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No projects yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <a
                href="/dashboard/projects"
                className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
              >
                <FolderKanban className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">New Project</p>
                  <p className="text-xs text-muted-foreground">Create a new project</p>
                </div>
              </a>
              <a
                href="/dashboard/clients"
                className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
              >
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Add Client</p>
                  <p className="text-xs text-muted-foreground">Register new client</p>
                </div>
              </a>
              <a
                href="/dashboard/finance"
                className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
              >
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Create Invoice</p>
                  <p className="text-xs text-muted-foreground">Generate new invoice</p>
                </div>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}