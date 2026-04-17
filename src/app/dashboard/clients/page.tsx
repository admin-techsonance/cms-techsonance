'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Mail, Phone, Building2, Eye } from 'lucide-react';
import { InlineTableSkeleton } from '@/components/ui/dashboard-skeleton';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getDashboardType, type UserRole } from '@/lib/permissions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Client {
  id: number;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string | null;
  industry: string | null;
  status: string;
  createdAt: string;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [authorized, setAuthorized] = useState(false);
  const router = useRouter();
  const pageSize = 10;

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('session_token');
      if (!token) return router.push('/login');
      
      try {
        const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          if (getDashboardType(data.user.role as UserRole) !== 'admin') {
            router.push('/dashboard');
          } else {
            setAuthorized(true);
            fetchClients();
          }
        }
      } catch (e) {
        router.push('/dashboard');
      }
    };
    checkAuth();
  }, [router]);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/clients?limit=100', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const result = await response.json();
        // API returns { success, data: [...], meta } for list endpoint
        setClients(Array.isArray(result) ? result : (result.data || []));
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter((client) =>
    client.companyName.toLowerCase().includes(search.toLowerCase()) ||
    client.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
    client.email.toLowerCase().includes(search.toLowerCase())
  );

  // Calculate paginated clients
  const paginatedClients = filteredClients.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  );

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(0);
  }, [search]);

  if (!authorized) return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Clients</h2>
          <p className="text-muted-foreground">
            Manage your client relationships and projects
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Client
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Clients</CardTitle>
              <CardDescription>
                {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''} found
              </CardDescription>
            </div>
                <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search clients..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <InlineTableSkeleton rows={5} columns={7} />
              ) : filteredClients.length === 0 ? (
                <div className="text-center py-8">
                  <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">No clients found</h3>
                  <p className="text-sm text-muted-foreground">
                    {search ? 'Try a different search term' : 'Get started by adding your first client'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {paginatedClients.map((client) => (
                      <Card key={client.id} className="group overflow-hidden bg-card/50 hover:bg-card/80 border-white/5 hover:border-emerald-500/30 transition-all shadow-sm hover:shadow-xl hover:-translate-y-1">
                        <div className="h-2 w-full bg-gradient-to-r from-teal-500/50 to-emerald-400/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex-1 overflow-hidden">
                              <h3 className="text-xl font-bold truncate pr-4">{client.companyName}</h3>
                              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {client.industry || 'General Sector'}
                              </p>
                            </div>
                            <Badge className="shadow-xs capitalize" variant={
                              client.status === 'active' ? 'default' :
                              client.status === 'inactive' ? 'secondary' :
                              'outline'
                            }>
                              {client.status}
                            </Badge>
                          </div>

                          <div className="space-y-3 mb-6 bg-muted/20 p-3 rounded-lg border border-white/5">
                            <div className="flex items-center gap-3">
                              <div className="p-1.5 bg-emerald-500/10 rounded-md">
                                <Mail className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              </div>
                              <div className="overflow-hidden">
                                <p className="text-xs text-muted-foreground">Primary Contact</p>
                                <p className="text-sm font-medium truncate">{client.contactPerson}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{client.email}</p>
                              </div>
                            </div>

                            {client.phone && (
                              <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-indigo-500/10 rounded-md">
                                  <Phone className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Phone</p>
                                  <p className="text-sm font-medium">{client.phone}</p>
                                </div>
                              </div>
                            )}
                          </div>

                          <Link href={`/dashboard/clients/${client.id}`} className="block">
                            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" variant="default">
                              <Eye className="mr-2 h-4 w-4" />
                              Open Hub
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between border-t border-white/10 pt-6 mt-6">
                    <p className="text-sm text-muted-foreground">
                      Showing {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, filteredClients.length)} of {filteredClients.length} clients
                    </p>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => p + 1)}
                        disabled={(currentPage + 1) * pageSize >= filteredClients.length}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
      </Card>

      <ClientFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={fetchClients}
      />
    </div>
  );
}
