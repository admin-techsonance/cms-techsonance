'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, Target, TrendingUp, Sparkles, Clock, CheckCircle2, AlertCircle, BarChart3 } from 'lucide-react';
import { StatsSkeleton, KanbanSkeleton, PageHeaderSkeleton } from '@/components/ui/dashboard-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { KanbanBoard } from '@/components/tasks/kanban-board';
import { SprintPlanningDialog } from '@/components/tasks/sprint-planning-dialog';
import { TaskDialog } from '@/components/tasks/task-dialog';
import { isEmployeeRole, hasFullAccess, type UserRole } from '@/lib/permissions';

interface Sprint {
  id: number;
  projectId: number;
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string;
  status: string;
}

interface Project {
  id: number;
  name: string;
}

interface User {
  id: number;
  role: string;
  firstName: string;
  lastName: string;
}

export default function TasksPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [selectedSprint, setSelectedSprint] = useState<number | null>(null);
  const [sprintDialogOpen, setSprintDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDialogStatus, setTaskDialogStatus] = useState<string>('todo');
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    totalPoints: 0,
    completedPoints: 0,
  });

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchProjects();
    }
  }, [currentUser]);

  useEffect(() => {
    if (selectedProject) {
      fetchSprints(selectedProject);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (selectedSprint) {
      fetchTaskStats(selectedSprint);
    }
  }, [selectedSprint]);

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
      const response = await fetch('/api/projects?limit=100', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        // Filter projects for developers
        if (currentUser && isEmployeeRole(currentUser.role as UserRole)) {
          const memberResponse = await fetch(`/api/project-members?limit=1000`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (memberResponse.ok) {
            const members = await memberResponse.json();
            const userProjectIds = members
              .filter((m: any) => m.userId === currentUser.id)
              .map((m: any) => m.projectId);
            const filteredProjects = data.filter((p: Project) => userProjectIds.includes(p.id));
            setProjects(filteredProjects);
            if (filteredProjects.length > 0) {
              setSelectedProject(filteredProjects[0].id);
            }
          }
        } else {
          setProjects(data);
          if (data.length > 0) {
            setSelectedProject(data[0].id);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSprints = async (projectId: number) => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/sprints?projectId=${projectId}&limit=100`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const filteredSprints = data.filter((s: Sprint) => s.status !== 'cancelled');
        setSprints(filteredSprints);
        
        const activeSprint = filteredSprints.find((s: Sprint) => s.status === 'active');
        if (activeSprint) {
          setSelectedSprint(activeSprint.id);
        } else if (filteredSprints.length > 0) {
          setSelectedSprint(filteredSprints[0].id);
        } else {
          setSelectedSprint(null);
        }
      }
    } catch (error) {
      console.error('Error fetching sprints:', error);
    }
  };

  const fetchTaskStats = async (sprintId: number) => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/tasks?sprintId=${sprintId}&limit=1000`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const tasks = await response.json();
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter((t: any) => t.status === 'done').length;
        const totalPoints = tasks.reduce((sum: number, t: any) => sum + (t.storyPoints || 0), 0);
        const completedPoints = tasks
          .filter((t: any) => t.status === 'done')
          .reduce((sum: number, t: any) => sum + (t.storyPoints || 0), 0);

        setStats({
          totalTasks,
          completedTasks,
          totalPoints,
          completedPoints,
        });
      }
    } catch (error) {
      console.error('Error fetching task stats:', error);
    }
  };

  const handleRefresh = () => {
    if (selectedSprint) {
      fetchTaskStats(selectedSprint);
    }
    // Force Kanban board to refresh
    setRefreshKey(prev => prev + 1);
  };

  const handleTaskClick = (task: any) => {
    setSelectedTask(task);
    setTaskDialogOpen(true);
  };

  const handleCreateTask = (status: string) => {
    setSelectedTask(null);
    setTaskDialogStatus(status);
    setTaskDialogOpen(true);
  };

  const handleTaskDialogClose = () => {
    setTaskDialogOpen(false);
    setSelectedTask(null);
  };

  const currentSprint = sprints.find(s => s.id === selectedSprint);
  const daysRemaining = currentSprint
    ? Math.ceil((new Date(currentSprint.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const isEmployee = currentUser && isEmployeeRole(currentUser.role as UserRole);

  if (!currentUser || loading) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <div className="flex gap-4">
          <Skeleton className="h-10 flex-1" animation="pulse" />
          <Skeleton className="h-10 flex-1" animation="pulse" />
        </div>
        <StatsSkeleton count={4} />
        <KanbanSkeleton columns={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Task Workspace</h2>
          <p className="text-muted-foreground">
            {isEmployee ? 'Review and manage your assigned responsibilities' : 'System-wide pipeline and sprint coordination'}
          </p>
        </div>
        <div className="flex gap-2">
          {!isEmployee && (
            <Button onClick={() => setSprintDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Sprint
            </Button>
          )}
          <Button onClick={() => handleCreateTask('todo')}>
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Button>
        </div>
      </header>

      <div className="flex gap-4">
        <div className="flex-1">
          <Select
            value={selectedProject?.toString() || ''}
            onValueChange={(value) => setSelectedProject(parseInt(value))}
          >
            <SelectTrigger className="bg-card/50 backdrop-blur-sm border-muted/60 h-10">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id.toString()}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <Select
            value={selectedSprint?.toString() || 'none'}
            onValueChange={(value) => setSelectedSprint(value === 'none' ? null : parseInt(value))}
            disabled={!selectedProject || sprints.length === 0}
          >
            <SelectTrigger className="bg-card/50 backdrop-blur-sm border-muted/60 h-10">
              <SelectValue placeholder={sprints.length === 0 ? 'No sprints available' : 'Select sprint'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Backlog (No Sprint)</SelectItem>
              {sprints.map((sprint) => (
                <SelectItem key={sprint.id} value={sprint.id.toString()}>
                  {sprint.name} ({sprint.status === 'active' ? 'Current' : sprint.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {currentSprint && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Sprint Health & Velocity
            </h3>
            <div className="flex items-center gap-4 text-[10px] font-medium text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {stats.completedTasks} Done</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> {stats.totalTasks - stats.completedTasks} Pending</span>
            </div>
          </div>
          
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent border-indigo-500/20 shadow-sm relative overflow-hidden group">
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Sprint Goal</p>
                    <h4 className="text-sm font-bold truncate max-w-[150px]">{currentSprint.goal || 'No goal set'}</h4>
                  </div>
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600">
                    <Target className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4 h-1 w-full bg-indigo-500/10 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full w-1/3 group-hover:w-1/2 transition-all duration-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent border-rose-500/20 shadow-sm relative overflow-hidden group">
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Time Linear</p>
                    <h4 className="text-2xl font-black">{daysRemaining > 0 ? `${daysRemaining}d` : 'Ended'}</h4>
                  </div>
                  <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600">
                    <Clock className="h-4 w-4" />
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground mt-1 font-medium italic">Ends {new Date(currentSprint.endDate).toLocaleDateString()}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/20 shadow-sm relative overflow-hidden group">
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Task Velocity</p>
                    <h4 className="text-2xl font-black">{stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0}%</h4>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-[10px] font-bold">
                  <span className="text-emerald-600">{stats.completedTasks} Closed</span>
                  <span className="text-muted-foreground">/ {stats.totalTasks} Total</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/20 shadow-sm relative overflow-hidden group">
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Capacity Load</p>
                    <h4 className="text-2xl font-black">{stats.completedPoints} / {stats.totalPoints}</h4>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground mt-1 font-medium">{stats.totalPoints > 0 ? Math.round((stats.completedPoints / stats.totalPoints) * 100) : 0}% Delivered</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {selectedProject ? (
        <KanbanBoard
          key={refreshKey}
          sprintId={selectedSprint}
          projectId={selectedProject}
          onTaskClick={handleTaskClick}
          onCreateTask={handleCreateTask}
        />
      ) : (
        <Card className="border-dashed bg-card/30">
          <CardHeader className="flex flex-col items-center justify-center py-12 text-center">
            <Target className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
            <CardTitle>Welcome to the Task Workspace</CardTitle>
            <CardDescription>
              {isEmployee ? 'Select an assigned project above to start tracking your tasks.' : 'Please select a project to manage sprints and development tasks.'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!isEmployee && (
        <SprintPlanningDialog
          open={sprintDialogOpen}
          onOpenChange={setSprintDialogOpen}
          onSuccess={() => {
            if (selectedProject) {
              fetchSprints(selectedProject);
            }
          }}
          projectId={selectedProject || undefined}
        />
      )}

      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={handleTaskDialogClose}
        onSuccess={handleRefresh}
        projectId={selectedProject || undefined}
        sprintId={selectedSprint || undefined}
        initialStatus={taskDialogStatus}
        task={selectedTask}
      />
    </div>
  );
}