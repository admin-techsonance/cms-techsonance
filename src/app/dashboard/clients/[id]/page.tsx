'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Mail, Phone, Building2, MapPin, Edit, FolderKanban, MessageSquare, IndianRupee, PieChart, TrendingUp, UploadCloud, FileText, Lock } from 'lucide-react';
import { DetailedPageSkeleton } from '@/components/ui/dashboard-skeleton';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import { ClientCommunicationPanel } from '@/components/clients/client-communication-panel';
import Link from 'next/link';
import { getDashboardType, type UserRole } from '@/lib/permissions';

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
  const [finance, setFinance] = useState<any>(null);
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

      const authRes = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } });
      if (authRes.ok) {
        const authData = await authRes.json();
        if (getDashboardType(authData.user.role as UserRole) !== 'admin') {
          router.push('/dashboard');
          return;
        }
      } else {
        router.push('/dashboard');
        return;
      }

      const [clientRes, projectsRes, financeRes] = await Promise.all([
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
        fetch(`/api/clients/${clientId}/finance`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
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

      if (financeRes.ok) {
        const financeData = await financeRes.json();
        setFinance(financeData);
      }
    } catch (error) {
      console.error('Error fetching client data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <DetailedPageSkeleton />;
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

      {/* Enterprise Financial Hub */}
      {finance && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0">
                <div>
                  <p className="text-sm font-medium text-emerald-600/80 dark:text-emerald-400/80">Lifetime Value</p>
                  <h3 className="text-3xl font-bold mt-1 text-emerald-700 dark:text-emerald-400">₹{finance.lifetimeValue?.toLocaleString() || 0}</h3>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/20">
                  <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0">
                <div>
                  <p className="text-sm font-medium text-amber-600/80 dark:text-amber-400/80">Outstanding Balance</p>
                  <h3 className="text-3xl font-bold mt-1 text-amber-700 dark:text-amber-400">₹{finance.outstandingBalance?.toLocaleString() || 0}</h3>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/20">
                  <PieChart className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent border-rose-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0">
                <div>
                  <p className="text-sm font-medium text-rose-600/80 dark:text-rose-400/80">Overdue Amount</p>
                  <h3 className="text-3xl font-bold mt-1 text-rose-700 dark:text-rose-400">₹{finance.overdueBalance?.toLocaleString() || 0}</h3>
                </div>
                <div className="p-3 rounded-xl bg-rose-500/20">
                  <IndianRupee className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
          <TabsTrigger value="vault" className="text-emerald-500 data-[state=active]:text-emerald-600">
            <Lock className="h-3 w-3 mr-1" /> Document Vault
          </TabsTrigger>
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

        <TabsContent value="vault">
          <Card className="border-emerald-500/20 bg-gradient-to-b from-card to-emerald-500/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5 text-emerald-500" />
                    Secure Document Vault
                  </CardTitle>
                  <CardDescription>Private repository for MSAs, NDAs, and Legal Contracts</CardDescription>
                </div>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <UploadCloud className="h-4 w-4 mr-2" />
                  Upload Contract
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed border-emerald-500/30 p-8 text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
                <h3 className="text-lg font-medium">No Documents Uploaded</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Click the upload button to securely attach PDF contracts to this client's profile.
                </p>
              </div>
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