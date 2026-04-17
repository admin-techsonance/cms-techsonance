'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, LayoutList, LayoutGrid, Eye, Edit, Trash2, Download, Filter, X, Timer, AlertTriangle, CheckCircle2, TrendingUp, FolderKanban, IndianRupee, Clock } from 'lucide-react';
import { KanbanSkeleton, TableSkeleton, ProjectSummarySkeleton, PageHeaderSkeleton } from '@/components/ui/dashboard-skeleton';
import { ProjectFormDialog } from '@/components/projects/project-form-dialog';
import { ProjectKanban } from '@/components/projects/project-kanban';
import { isEmployeeRole, hasFullAccess, type UserRole } from '@/lib/permissions';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';

interface Project {
  id: number;
  name: string;
  description: string | null;
  clientId: number;
  status: string;
  priority: string;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  isActive: boolean;
}

interface Client {
  id: number;
  companyName: string;
}

interface User {
  id: number;
  role: string;
  firstName: string;
  lastName: string;
}

function getProjectHealth(project: Project): { label: string; color: string; bgColor: string } {
  if (!project.endDate) return { label: 'No Deadline', color: 'text-gray-500', bgColor: 'bg-gray-100 dark:bg-gray-800' };
  const now = new Date();
  const end = new Date(project.endDate);
  const start = project.startDate ? new Date(project.startDate) : now;
  
  if (project.status === 'completed') return { label: 'Completed', color: 'text-emerald-600', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' };
  if (now > end) return { label: 'Behind Schedule', color: 'text-rose-600', bgColor: 'bg-rose-100 dark:bg-rose-900/30' };
  
  const totalDuration = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  const percentElapsed = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;
  
  if (percentElapsed > 85) return { label: 'At Risk', color: 'text-amber-600', bgColor: 'bg-amber-100 dark:bg-amber-900/30' };
  return { label: 'On Track', color: 'text-emerald-600', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' };
}

function getTimelineProgress(project: Project): { percent: number; color: string } {
  if (!project.startDate || !project.endDate) return { percent: 0, color: 'bg-gray-300' };
  if (project.status === 'completed') return { percent: 100, color: 'bg-emerald-500' };
  
  const now = new Date();
  const start = new Date(project.startDate);
  const end = new Date(project.endDate);
  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  const pct = Math.max(0, Math.min(100, total > 0 ? (elapsed / total) * 100 : 0));
  
  if (pct > 85) return { percent: pct, color: 'bg-rose-500' };
  if (pct > 60) return { percent: pct, color: 'bg-amber-500' };
  return { percent: pct, color: 'bg-emerald-500' };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Sorting
  const [sortBy, setSortBy] = useState<string>('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const debouncedSearch = useDebouncedValue(search, 300);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchProjects();
      // Admin and project managers can see clients
      if (currentUser.role && hasFullAccess(currentUser.role as UserRole)) {
        fetchClients();
      }
    }
  }, [statusFilter, priorityFilter, clientFilter, activeFilter, sortBy, sortOrder, startDateFilter, endDateFilter, currentUser]);

  const fetchCurrentUser = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.user);
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  };

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      let url = '/api/projects?limit=100';
      
      if (statusFilter !== 'all') url += `&status=${statusFilter}`;
      if (priorityFilter !== 'all') url += `&priority=${priorityFilter}`;
      if (clientFilter !== 'all') url += `&clientId=${clientFilter}`;
      if (activeFilter !== 'all') url += `&isActive=${activeFilter}`;
      if (sortBy && sortBy !== 'default') url += `&sort=${sortBy}&order=${sortOrder}`;
      if (startDateFilter) url += `&startDate=${startDateFilter}`;
      if (endDateFilter) url += `&endDate=${endDateFilter}`;
      
      // Optmized: Use API-level scoping for developers
      if (currentUser && isEmployeeRole(currentUser.role as UserRole)) {
        url += `&assignedTo=${currentUser.id}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/clients?limit=100', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const handleDelete = async () => {
    if (!deletingProject) return;
    
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/projects?id=${deletingProject.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        toast.success('Project deleted successfully!');
        fetchProjects();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error('An error occurred while deleting the project');
    } finally {
      setDeletingProject(null);
    }
  };

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (project.description?.toLowerCase() || '').includes(debouncedSearch.toLowerCase())
  );

  // Approaching deadlines (within 7 days)
  const approachingDeadlines = filteredProjects.filter(p => {
    if (!p.endDate) return false;
    const end = new Date(p.endDate);
    const today = new Date();
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7 && p.status !== 'completed';
  }).length;

  // Pagination
  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
  const paginatedProjects = filteredProjects.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const exportToCSV = () => {
    const headers = ['Project Name', 'Client', 'Status', 'Priority', 'Budget', 'Start Date', 'End Date', 'Active'];
    const rows = filteredProjects.map(project => {
      const client = clients.find(c => c.id === project.clientId);
      return [
        project.name,
        client?.companyName || 'Unknown',
        project.status,
        project.priority,
        project.budget || 0,
        project.startDate || '',
        project.endDate || '',
        project.isActive ? 'Active' : 'Inactive'
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projects_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Projects exported to CSV!');
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setPriorityFilter('all');
    setClientFilter('all');
    setActiveFilter('all');
    setSortBy('default');
    setStartDateFilter('');
    setEndDateFilter('');
    setSearch('');
  };

  const hasActiveFilters = statusFilter !== 'all' || priorityFilter !== 'all' || 
                           clientFilter !== 'all' || activeFilter !== 'all' || 
                           sortBy !== 'default' || search !== '' || 
                           startDateFilter !== '' || endDateFilter !== '';

  const getClientName = (clientId: number) => {
    const client = clients.find(c => c.id === clientId);
    return client?.companyName || 'Unknown';
  };

  const isEmployee = currentUser && isEmployeeRole(currentUser.role as UserRole);
  const isAdmin = currentUser && hasFullAccess(currentUser.role as UserRole);
  const canEdit = isAdmin || currentUser?.role === 'project_manager';

  if (loading || !currentUser) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <Card className="p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 w-full bg-muted animate-pulse rounded" />
            ))}
          </div>
        </Card>
        <ProjectSummarySkeleton />
        <div className="mt-8">
          {view === 'kanban' ? <KanbanSkeleton columns={4} /> : <TableSkeleton columns={7} rows={6} />}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{isEmployee ? 'My Projects' : 'Project Management'}</h2>
          <p className="text-muted-foreground">
            {isEmployee ? 'Review and track your active project assignments' : 'Full pipeline oversight and resource management'}
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Project
          </Button>
        )}
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Filters</CardTitle>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-2 h-4 w-4" />
                Clear Filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="planning">Planning</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>

            {!isEmployee && (
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id.toString()}>
                      {client.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Active Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                <SelectItem value="true">Active Only</SelectItem>
                <SelectItem value="false">Inactive Only</SelectItem>
              </SelectContent>
            </Select>

            <div className="space-y-2">
              <Input
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                placeholder="Start date range"
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Input
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                placeholder="End date range"
                className="w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent border-indigo-500/20 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600/80 dark:text-indigo-400/80">
                  {isEmployee ? 'My Active Assignments' : 'Total Pipeline'}
                </p>
                <h3 className="text-3xl font-black mt-1">{filteredProjects.filter(p => p.isActive).length}</h3>
                {isAdmin && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {[
                      { s: 'in_progress', label: 'Active', c: 'bg-emerald-500' },
                      { s: 'planning', label: 'Planning', c: 'bg-blue-500' },
                      { s: 'on_hold', label: 'On Hold', c: 'bg-amber-500' },
                    ].map(item => {
                      const count = filteredProjects.filter(p => p.status === item.s).length;
                      return count > 0 ? (
                        <span key={item.s} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className={`h-1.5 w-1.5 rounded-full ${item.c}`} />
                          {count} {item.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
              <div className="p-3 rounded-xl bg-indigo-500/20">
                <FolderKanban className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/20 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600/80 dark:text-emerald-400/80">Portfolio Budget</p>
                  <h3 className="text-3xl font-black mt-1">
                    ₹{(filteredProjects.reduce((sum, p) => sum + (p.budget || 0), 0)).toLocaleString()}
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Across {filteredProjects.filter(p => p.budget && p.budget > 0).length} budgeted projects
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/20">
                  <IndianRupee className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent border-rose-500/20 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-600/80 dark:text-rose-400/80">Approaching Deadlines</p>
                <h3 className="text-3xl font-black mt-1 text-rose-600">{approachingDeadlines}</h3>
                <p className="text-[10px] text-muted-foreground mt-1">Due within 7 days</p>
              </div>
              <div className="p-3 rounded-xl bg-rose-500/20">
                <Clock className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/20 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-600/80 dark:text-amber-400/80">Health Distribution</p>
                  <div className="flex flex-col gap-1 mt-2">
                    {[
                      { label: 'On Track', count: filteredProjects.filter(p => getProjectHealth(p).label === 'On Track').length, c: 'bg-emerald-500' },
                      { label: 'At Risk', count: filteredProjects.filter(p => getProjectHealth(p).label === 'At Risk').length, c: 'bg-amber-500' },
                      { label: 'Behind', count: filteredProjects.filter(p => getProjectHealth(p).label === 'Behind Schedule').length, c: 'bg-rose-500' },
                    ].map(item => (
                      <span key={item.label} className="inline-flex items-center gap-1.5 text-xs">
                        <span className={`h-2 w-2 rounded-full ${item.c}`} />
                        <span className="font-semibold">{item.count}</span>
                        <span className="text-muted-foreground">{item.label}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/20">
                  <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isEmployee && (
          <Card className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/20 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-600/80 dark:text-amber-400/80">Total Involved</p>
                  <h3 className="text-3xl font-black mt-1">{filteredProjects.length}</h3>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/20">
                  <FolderKanban className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* View Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2">
          <Button
            variant={view === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('list')}
          >
            <LayoutList className="mr-2 h-4 w-4" />
            List
          </Button>
          <Button
            variant={view === 'kanban' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('kanban')}
          >
            <LayoutGrid className="mr-2 h-4 w-4" />
            Kanban
          </Button>
        </div>

        <div className="flex gap-2">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default (Created)</SelectItem>
              <SelectItem value="startDate">Start Date</SelectItem>
              <SelectItem value="endDate">End Date</SelectItem>
              {!isEmployee && <SelectItem value="budget">Budget</SelectItem>}
            </SelectContent>
          </Select>

          {sortBy && sortBy !== 'default' && (
            <Select value={sortOrder} onValueChange={(val) => setSortOrder(val as 'asc' | 'desc')}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending</SelectItem>
                <SelectItem value="desc">Descending</SelectItem>
              </SelectContent>
            </Select>
          )}

          {!isEmployee && (
            <Button variant="outline" size="sm" onClick={exportToCSV}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {view === 'kanban' ? (
        <ProjectKanban projects={filteredProjects} onUpdate={fetchProjects} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Projects</CardTitle>
            <CardDescription>
              Showing {paginatedProjects.length} of {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Project Name</TableHead>
                    {!isEmployee && <TableHead>Client</TableHead>}
                    {!isEmployee && <TableHead>Budget</TableHead>}
                    <TableHead>Timeline</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {paginatedProjects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isEmployee ? 7 : 9} className="text-center py-8 text-muted-foreground">
                      No projects found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedProjects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell className="font-medium">{project.name}</TableCell>
                      {!isEmployee && <TableCell>{getClientName(project.clientId)}</TableCell>}
                      {!isEmployee && (
                        <TableCell>
                          {project.budget ? `₹${(project.budget / 1000).toFixed(0)}K` : '—'}
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="w-28">
                          {(() => {
                            const tl = getTimelineProgress(project);
                            return (
                              <div>
                                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                                  <span>{project.startDate ? new Date(project.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</span>
                                  <span>{project.endDate ? new Date(project.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</span>
                                </div>
                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${tl.color}`} style={{ width: `${tl.percent}%` }} />
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{Math.round(tl.percent)}%</p>
                              </div>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const health = getProjectHealth(project);
                          return (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${health.bgColor} ${health.color}`}>
                              {health.label === 'On Track' && <CheckCircle2 className="h-3 w-3" />}
                              {health.label === 'At Risk' && <AlertTriangle className="h-3 w-3" />}
                              {health.label === 'Behind Schedule' && <Timer className="h-3 w-3" />}
                              {health.label}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/dashboard/projects/${project.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          {canEdit && (
                            <>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setEditingProject(project)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setDeletingProject(project)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog - For admin and project managers */}
      {canEdit && (
        <ProjectFormDialog
          open={showAddDialog || editingProject !== null}
          onOpenChange={(open) => {
            if (!open) {
              setShowAddDialog(false);
              setEditingProject(null);
            }
          }}
          onSuccess={() => {
            fetchProjects();
            setEditingProject(null);
          }}
          project={editingProject}
        />
      )}

      {/* Delete Confirmation Dialog - For admin and project managers */}
      {canEdit && (
        <AlertDialog open={deletingProject !== null} onOpenChange={() => setDeletingProject(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to delete this project?</AlertDialogTitle>
              <AlertDialogDescription>
                This will mark "{deletingProject?.name}" as cancelled. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
