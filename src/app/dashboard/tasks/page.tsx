'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, Target, TrendingUp } from 'lucide-react';
import { StatsSkeleton, KanbanSkeleton } from '@/components/ui/dashboard-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { KanbanBoard } from '@/components/tasks/kanban-board';
import { SprintPlanningDialog } from '@/components/tasks/sprint-planning-dialog';
import { TaskDialog } from '@/components/tasks/task-dialog';
import { isDeveloperRole, type UserRole } from '@/lib/permissions';

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
        if (currentUser && isDeveloperRole(currentUser.role as UserRole)) {
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

  const isDeveloper = currentUser && isDeveloperRole(currentUser.role as UserRole);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-1/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <StatsSkeleton />
        <KanbanSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Task Board</h2>
          <p className="text-muted-foreground">
            {isDeveloper ? 'View and manage your assigned tasks' : 'Manage tasks with Kanban board and sprint planning'}
          </p>
        </div>
        <div className="flex gap-2">
          {!isDeveloper && (
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
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <Select
            value={selectedProject?.toString() || ''}
            onValueChange={(value) => setSelectedProject(parseInt(value))}
          >
            <SelectTrigger>
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
            <SelectTrigger>
              <SelectValue placeholder={sprints.length === 0 ? 'No sprints available' : 'Select sprint'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">All Tasks (No Sprint)</SelectItem>
              {sprints.map((sprint) => (
                <SelectItem key={sprint.id} value={sprint.id.toString()}>
                  {sprint.name} ({sprint.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {currentSprint && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4" />
                Sprint Goal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {currentSprint.goal || 'No goal set'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Duration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <p className="text-2xl font-bold">
                  {daysRemaining > 0 ? `${daysRemaining}d` : 'Ended'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(currentSprint.startDate).toLocaleDateString()} - {new Date(currentSprint.endDate).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <p className="text-2xl font-bold">
                  {stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats.completedTasks} of {stats.totalTasks} tasks
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Story Points</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <p className="text-2xl font-bold">
                  {stats.completedPoints} / {stats.totalPoints}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats.totalPoints > 0 ? Math.round((stats.completedPoints / stats.totalPoints) * 100) : 0}% completed
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!currentSprint && selectedProject && !isDeveloper && (
        <Card>
          <CardHeader>
            <CardTitle>No Sprint Selected</CardTitle>
            <CardDescription>
              Create a new sprint or select an existing one to start managing tasks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setSprintDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create First Sprint
            </Button>
          </CardContent>
        </Card>
      )}

      {selectedProject && (
        <KanbanBoard
          key={refreshKey}
          sprintId={selectedSprint}
          projectId={selectedProject}
          onTaskClick={handleTaskClick}
          onCreateTask={handleCreateTask}
        />
      )}

      {!selectedProject && (
        <Card>
          <CardHeader>
            <CardTitle>No Project Selected</CardTitle>
            <CardDescription>
              {isDeveloper ? 'No projects assigned to you yet.' : 'Please select a project to view and manage tasks.'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!isDeveloper && (
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