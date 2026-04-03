'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Loader2, Calendar, DollarSign, Users } from 'lucide-react';
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
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
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

  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'project_manager';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/projects')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{project.name}</h2>
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Budget
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {project.budget ? `₹${(project.budget / 1000).toFixed(0)}K` : 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {project.startDate ? new Date(project.startDate).toLocaleDateString() : '—'}
            </p>
            <p className="text-xs text-muted-foreground">to</p>
            <p className="text-sm">
              {project.endDate ? new Date(project.endDate).toLocaleDateString() : '—'}
            </p>
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
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <ProjectTasksBoard projectId={parseInt(projectId)} />
        </TabsContent>

        <TabsContent value="milestones">
          <ProjectMilestones projectId={parseInt(projectId)} />
        </TabsContent>

        <TabsContent value="team">
          <ProjectTeam projectId={parseInt(projectId)} />
        </TabsContent>
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