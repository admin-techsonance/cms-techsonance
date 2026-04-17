'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Calendar, DollarSign, Users, Timer, AlertTriangle, CheckCircle2, TrendingUp, IndianRupee, Clock } from 'lucide-react';
import { getDashboardType, hasFullAccess, type UserRole } from '@/lib/permissions';
import { DetailedPageSkeleton } from '@/components/ui/dashboard-skeleton';
import { ProjectFormDialog } from '@/components/projects/project-form-dialog';
import { ProjectTasksBoard } from '@/components/projects/project-tasks-board';
import { ProjectMilestones } from '@/components/projects/project-milestones';
import { ProjectTeam } from '@/components/projects/project-team';

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
}

interface Client {
  companyName: string;
}

interface User {
  id: number;
  role: string;
}

function getProjectHealth(project: Project): { label: string; color: string; bgColor: string } {
  if (!project.endDate) return { label: 'No Deadline', color: 'text-gray-500', bgColor: 'bg-gray-100' };
  const now = new Date();
  const end = new Date(project.endDate);
  const start = project.startDate ? new Date(project.startDate) : now;
  
  if (project.status === 'completed') return { label: 'Completed', color: 'text-emerald-600', bgColor: 'bg-emerald-100' };
  if (now > end) return { label: 'Behind Schedule', color: 'text-rose-600', bgColor: 'bg-rose-100' };
  
  const totalDuration = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  const percentElapsed = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;
  
  if (percentElapsed > 85) return { label: 'At Risk', color: 'text-amber-600', bgColor: 'bg-amber-100' };
  return { label: 'On Track', color: 'text-emerald-600', bgColor: 'bg-emerald-100' };
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

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    fetchCurrentUser();
    fetchProjectData();
  }, [projectId]);

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

  const fetchProjectData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/projects?id=${projectId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const projectData = await response.json();
        setProject(projectData);

        // Fetch client data
        const clientResponse = await fetch(`/api/clients?id=${projectData.clientId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (clientResponse.ok) {
          const clientData = await clientResponse.json();
          setClient(clientData);
        }
      }
    } catch (error) {
      console.error('Error fetching project data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <DetailedPageSkeleton />;
  }

  if (!project) {
    return (
      <div className="text-center py-8">
        <h3 className="text-lg font-semibold">Project not found</h3>
        <Button onClick={() => router.push('/dashboard/projects')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
      </div>
    );
  }

  const isAdmin = currentUser && hasFullAccess(currentUser.role as UserRole);
  const isManager = currentUser?.role === 'project_manager' || currentUser?.role === 'hr_manager' || currentUser?.role === 'management';
  const canEdit = isAdmin || isManager;
  const showBudget = isAdmin || currentUser?.role === 'project_manager' || currentUser?.role === 'accountant' || currentUser?.role === 'ceo' || currentUser?.role === 'cto';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/projects')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-3xl font-bold tracking-tight">{project.name}</h2>
              {(() => {
                const health = getProjectHealth(project);
                return (
                  <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${health.bgColor} ${health.color} border border-current/20`}>
                    {health.label === 'On Track' && <CheckCircle2 className="h-3.5 w-3.5" />}
                    {health.label === 'At Risk' && <AlertTriangle className="h-3.5 w-3.5" />}
                    {health.label === 'Behind Schedule' && <Timer className="h-3.5 w-3.5" />}
                    {health.label}
                  </span>
                );
              })()}
            </div>
            <p className="text-muted-foreground">{client?.companyName}</p>
          </div>
        </div>
        {canEdit && (
          <Button onClick={() => setShowEditDialog(true)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit Project
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={
              project.status === 'in_progress' ? 'default' :
                project.status === 'completed' ? 'secondary' :
                  project.status === 'planning' ? 'outline' :
                    'destructive'
            }>
              {project.status.replace('_', ' ')}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={
              project.priority === 'high' ? 'destructive' :
                project.priority === 'medium' ? 'default' :
                  'secondary'
            }>
              {project.priority}
            </Badge>
          </CardContent>
        </Card>

        {showBudget && (
          <Card className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/20 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-emerald-600">
                <IndianRupee className="h-4 w-4" />
                Budget Allocation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <h3 className="text-2xl font-black">
                {project.budget ? `₹${(project.budget).toLocaleString()}` : 'N/A'}
              </h3>
              {project.budget && (
                <div className="mt-3 space-y-1.5">
                  <div className="flex justify-between text-[10px] font-semibold">
                    <span className="text-emerald-600">Utilization</span>
                    <span className="text-muted-foreground">32% Burn Rate</span>
                  </div>
                  <div className="h-1.5 w-full bg-emerald-500/10 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: '32%' }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">Estimated ₹{(project.budget * 0.32).toLocaleString()} used</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>{project.startDate ? new Date(project.startDate).toLocaleDateString() : '—'}</span>
                <span>{project.endDate ? new Date(project.endDate).toLocaleDateString() : '—'}</span>
              </div>
              {(() => {
                const tl = getTimelineProgress(project);
                return (
                  <div className="space-y-1">
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${tl.color}`} style={{ width: `${tl.percent}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground text-right">{Math.round(tl.percent)}% Elapsed</p>
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      {project.description && (
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {project.description}
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="tasks" className="w-full">
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          {canEdit && <TabsTrigger value="team">Team</TabsTrigger>}
        </TabsList>
 
        <TabsContent value="tasks">
          <ProjectTasksBoard projectId={parseInt(projectId)} />
        </TabsContent>
 
        <TabsContent value="milestones">
          <ProjectMilestones projectId={parseInt(projectId)} canEdit={canEdit} />
        </TabsContent>
 
        {canEdit && (
          <TabsContent value="team">
            <ProjectTeam projectId={parseInt(projectId)} />
          </TabsContent>
        )}
      </Tabs>

      {canEdit && (
        <ProjectFormDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          onSuccess={fetchProjectData}
          project={project}
        />
      )}
    </div>
  );
}