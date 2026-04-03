'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Mail, Phone, Building2, MapPin, Edit, Loader2, FolderKanban, MessageSquare } from 'lucide-react';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import { ClientCommunicationPanel } from '@/components/clients/client-communication-panel';
import Link from 'next/link';

interface Client {
  id: number;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string | null;
  address: string | null;
  industry: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

interface Project {
  id: number;
  name: string;
  status: string;
  priority: string;
  startDate: string | null;
  endDate: string | null;
}

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);

  useEffect(() => {
    fetchClientData();
  }, [clientId]);

  const fetchClientData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      
      if (!token) {
        router.push('/login');
        return;
      }

      const [clientRes, projectsRes] = await Promise.all([
        fetch(`/api/clients?id=${clientId}`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch(`/api/projects?clientId=${clientId}&limit=100`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
      ]);

      if (clientRes.ok) {
        const clientData = await clientRes.json();
        setClient(clientData);
      } else if (clientRes.status === 401) {
        router.push('/login');
        return;
      }

      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setProjects(projectsData);
      } else if (projectsRes.status === 401) {
        router.push('/login');
        return;
      }
    } catch (error) {
      console.error('Error fetching client data:', error);
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

  if (!client) {
    return (
      <div className="text-center py-8">
        <h3 className="text-lg font-semibold">Client not found</h3>
        <Button onClick={() => router.push('/dashboard/clients')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Clients
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/clients')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{client.companyName}</h2>
            <p className="text-muted-foreground">{client.contactPerson}</p>
          </div>
        </div>
        <Button onClick={() => setShowEditDialog(true)}>
          <Edit className="mr-2 h-4 w-4" />
          Edit Client
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{client.email}</span>
            </div>
            {client.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{client.phone}</span>
              </div>
            )}
            {client.address && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span className="text-sm">{client.address}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Business Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Industry</p>
              <p className="text-sm font-medium">{client.industry || 'Not specified'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant={
                client.status === 'active' ? 'default' :
                client.status === 'inactive' ? 'secondary' :
                'outline'
              }>
                {client.status}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Total Projects</p>
              <p className="text-2xl font-bold">{projects.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Projects</p>
              <p className="text-2xl font-bold">
                {projects.filter(p => p.status === 'in_progress').length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="projects" className="w-full">
        <TabsList>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="communication">Communication</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Client Projects</CardTitle>
              <CardDescription>All projects for {client.companyName}</CardDescription>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <div className="text-center py-8">
                  <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-sm text-muted-foreground">No projects yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {projects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/dashboard/projects/${project.id}`}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                    >
                      <div>
                        <p className="font-medium">{project.name}</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {project.status.replace('_', ' ')} • {project.priority} priority
                        </p>
                      </div>
                      <Badge variant={
                        project.status === 'in_progress' ? 'default' :
                        project.status === 'completed' ? 'secondary' :
                        'outline'
                      }>
                        {project.status.replace('_', ' ')}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communication">
          <ClientCommunicationPanel clientId={parseInt(clientId)} />
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle>Client Notes</CardTitle>
              <CardDescription>Internal notes about this client</CardDescription>
            </CardHeader>
            <CardContent>
              {client.notes ? (
                <p className="text-sm whitespace-pre-wrap">{client.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No notes added yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ClientFormDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        onSuccess={fetchClientData}
        client={client}
      />
    </div>
  );
}