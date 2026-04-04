'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, LayoutList, LayoutGrid, Eye, Edit, Trash2, Download, Filter, X } from 'lucide-react';
import { KanbanSkeleton, TableSkeleton } from '@/components/ui/dashboard-skeleton';
import { ProjectFormDialog } from '@/components/projects/project-form-dialog';
import { ProjectKanban } from '@/components/projects/project-kanban';
import { isDeveloperRole, hasFullAccess, type UserRole } from '@/lib/permissions';
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
      if (currentUser.role && !isDeveloperRole(currentUser.role as UserRole)) {
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
      if (currentUser && isDeveloperRole(currentUser.role as UserRole)) {
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
    project.name.toLowerCase().includes(search.toLowerCase()) ||
    (project.description?.toLowerCase() || '').includes(search.toLowerCase())
  );

  // Calculate total budget
  const totalBudget = filteredProjects.reduce((sum, project) => sum + (project.budget || 0), 0);

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

  const isDeveloper = currentUser && isDeveloperRole(currentUser.role as UserRole);
  const isAdmin = currentUser && hasFullAccess(currentUser.role as UserRole);
  const canEdit = isAdmin || currentUser?.role === 'project_manager';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Projects</h2>
          <p className="text-muted-foreground">
            {isDeveloper ? 'View your assigned projects' : 'Manage projects with Kanban boards and task tracking'}
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

            {!isDeveloper && (
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

      {/* Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Projects</CardDescription>
            <CardTitle className="text-3xl">{filteredProjects.length}</CardTitle>
          </CardHeader>
        </Card>
        {!isDeveloper && (
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Budget</CardDescription>
              <CardTitle className="text-3xl">₹{(totalBudget / 1000).toFixed(0)}K</CardTitle>
            </CardHeader>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Active Projects</CardDescription>
            <CardTitle className="text-3xl">
              {filteredProjects.filter(p => p.isActive).length}
            </CardTitle>
          </CardHeader>
        </Card>
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
              {!isDeveloper && <SelectItem value="budget">Budget</SelectItem>}
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

          {!isDeveloper && (
            <Button variant="outline" size="sm" onClick={exportToCSV}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        view === 'kanban' ? <KanbanSkeleton /> : <TableSkeleton columns={7} rows={6} />
      ) : (
        <>
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
                        {!isDeveloper && <TableHead>Client</TableHead>}
                        {!isDeveloper && <TableHead>Budget</TableHead>}
                        <TableHead>Start Date</TableHead>
                        <TableHead>End Date</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                    {paginatedProjects.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isDeveloper ? 7 : 9} className="text-center py-8 text-muted-foreground">
                          No projects found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedProjects.map((project) => (
                        <TableRow key={project.id}>
                          <TableCell className="font-medium">{project.name}</TableCell>
                          {!isDeveloper && <TableCell>{getClientName(project.clientId)}</TableCell>}
                          {!isDeveloper && (
                            <TableCell>
                              {project.budget ? `₹${(project.budget / 1000).toFixed(0)}K` : '—'}
                            </TableCell>
                          )}
                          <TableCell className="text-sm">
                            {project.startDate ? new Date(project.startDate).toLocaleDateString() : '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {project.endDate ? new Date(project.endDate).toLocaleDateString() : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              project.priority === 'critical' ? 'destructive' :
                              project.priority === 'high' ? 'destructive' :
                              project.priority === 'medium' ? 'default' :
                              'secondary'
                            }>
                              {project.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              project.status === 'in_progress' ? 'default' :
                              project.status === 'completed' ? 'secondary' :
                              project.status === 'planning' ? 'outline' :
                              'destructive'
                            }>
                              {project.status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={project.isActive ? 'default' : 'secondary'}>
                              {project.isActive ? 'Active' : 'Inactive'}
                            </Badge>
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
        </>
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