'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2, MessageSquare, X, AlertCircle, CheckCircle2, Clock, Eye, Edit, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { hasFullAccess, type UserRole } from '@/lib/permissions';

interface Ticket {
  id: number;
  ticketNumber: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  clientId: number;
}

interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  employeeId: string;
  userId: number;
}

interface User {
  id: number;
  role: string;
}

export default function HelpDeskPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showTicketDialog, setShowTicketDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  
  // Admin-specific state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('all');
  const [adminPriorityFilter, setAdminPriorityFilter] = useState('all');
  const [adminStatusFilter, setAdminStatusFilter] = useState('all');
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [deletingTicket, setDeletingTicket] = useState<Ticket | null>(null);
  const [editTicketForm, setEditTicketForm] = useState({
    status: '',
    priority: '',
  });
  
  const [ticketForm, setTicketForm] = useState({
    supportType: 'it_support',
    subject: '',
    description: '',
    priority: 'medium',
  });

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      if (hasFullAccess(currentUser.role as UserRole)) {
        fetchEmployees();
        fetchAllTickets();
      } else {
        fetchTickets();
      }
    }
  }, [currentUser, selectedEmployeeFilter, adminPriorityFilter, adminStatusFilter]);

  const fetchCurrentUser = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUserId(data.user.id);
        setCurrentUser(data.user);
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  };

  const fetchEmployees = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/employees?limit=100', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setEmployees(data);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchAllTickets = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      let url = '/api/tickets?limit=100';
      
      if (adminStatusFilter !== 'all') url += `&status=${adminStatusFilter}`;
      if (adminPriorityFilter !== 'all') url += `&priority=${adminPriorityFilter}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAllTickets(data);
      }
    } catch (error) {
      console.error('Error fetching all tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      let url = '/api/tickets?limit=100';

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTickets(data);
        applyFilters(data);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
      toast.error('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (ticketList: Ticket[] = tickets) => {
    let filtered = [...ticketList];

    if (statusFilter !== 'all') {
      filtered = filtered.filter(ticket => ticket.status === statusFilter);
    }

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter(ticket => {
        const ticketDate = new Date(ticket.createdAt);
        return ticketDate >= start;
      });
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(ticket => {
        const ticketDate = new Date(ticket.createdAt);
        return ticketDate <= end;
      });
    }

    setFilteredTickets(filtered);
  };

  const handleApplyFilter = () => {
    applyFilters();
    toast.success('Filters applied successfully');
  };

  const handleViewTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setShowViewDialog(true);
  };

  const handleEditTicket = (ticket: Ticket) => {
    setEditingTicket(ticket);
    setEditTicketForm({
      status: ticket.status,
      priority: ticket.priority,
    });
  };

  const handleUpdateTicket = async () => {
    if (!editingTicket) return;
    
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/tickets?id=${editingTicket.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: editTicketForm.status,
          priority: editTicketForm.priority,
        }),
      });
      
      if (response.ok) {
        toast.success('Ticket updated successfully!');
        fetchAllTickets();
        setEditingTicket(null);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update ticket');
      }
    } catch (error) {
      console.error('Error updating ticket:', error);
      toast.error('An error occurred while updating ticket');
    }
  };

  const handleDeleteTicket = async () => {
    if (!deletingTicket) return;
    
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/tickets?id=${deletingTicket.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        toast.success('Ticket deleted successfully!');
        fetchAllTickets();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete ticket');
      }
    } catch (error) {
      console.error('Error deleting ticket:', error);
      toast.error('An error occurred while deleting ticket');
    } finally {
      setDeletingTicket(null);
    }
  };

  const generateTicketNumber = () => {
    const prefix = 'TKT';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${timestamp}-${random}`;
  };

  const handleTicketSubmit = async () => {
    if (!ticketForm.subject || !ticketForm.description) {
      toast.error('Please fill all required fields');
      return;
    }

    if (!userId) {
      toast.error('User not authenticated. Please log in again.');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');

      const clientsResponse = await fetch('/api/clients?limit=1', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const clients = await clientsResponse.json();
      
      if (!clients || clients.length === 0) {
        toast.error('No clients found. Please contact admin.');
        setLoading(false);
        return;
      }

      const ticketNumber = generateTicketNumber();

      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticketNumber: ticketNumber,
          clientId: clients[0].id,
          subject: `[${ticketForm.supportType.toUpperCase().replace('_', ' ')}] ${ticketForm.subject}`,
          description: ticketForm.description,
          priority: ticketForm.priority,
          status: 'open',
        }),
      });

      if (response.ok) {
        toast.success('Support ticket created successfully!');
        setShowTicketDialog(false);
        setTicketForm({
          supportType: 'it_support',
          subject: '',
          description: '',
          priority: 'medium',
        });
        if (currentUser && hasFullAccess(currentUser.role as UserRole)) {
          fetchAllTickets();
        } else {
          fetchTickets();
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create ticket');
      }
    } catch (error) {
      console.error('Error creating ticket:', error);
      toast.error('An error occurred while creating the ticket');
    } finally {
      setLoading(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    const priorityColors: Record<string, any> = {
      'low': 'secondary',
      'medium': 'default',
      'high': 'destructive',
      'urgent': 'destructive',
    };
    
    return <Badge variant={priorityColors[priority]}>{priority}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, any> = {
      'open': 'default',
      'in_progress': 'default',
      'resolved': 'secondary',
      'closed': 'outline',
    };
    
    return <Badge variant={statusColors[status]}>{status.replace('_', ' ')}</Badge>;
  };

  const ticketsData = currentUser && hasFullAccess(currentUser.role as UserRole) ? allTickets : filteredTickets;
  const openTickets = ticketsData.filter(t => t.status === 'open').length;
  const inProgressTickets = ticketsData.filter(t => t.status === 'in_progress').length;
  const resolvedTickets = ticketsData.filter(t => t.status === 'resolved').length;

  const isAdmin = currentUser && hasFullAccess(currentUser.role as UserRole);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          {isAdmin ? 'Help Desk Management' : 'Help Desk'}
        </h2>
        <p className="text-muted-foreground">
          {isAdmin 
            ? 'Manage all employee support tickets and track resolution progress'
            : 'Submit and track your support requests'}
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              Open
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openTickets}</div>
            <p className="text-xs text-muted-foreground">Awaiting response</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              In Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgressTickets}</div>
            <p className="text-xs text-muted-foreground">Being worked on</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Resolved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resolvedTickets}</div>
            <p className="text-xs text-muted-foreground">Completed tickets</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ticketsData.length}</div>
            <p className="text-xs text-muted-foreground">{isAdmin ? 'All tickets' : 'Your tickets'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Support Tickets</CardTitle>
              <CardDescription>
                {isAdmin ? 'View and manage all employee support requests' : 'View and manage your support requests'}
              </CardDescription>
            </div>
            <Dialog open={showTicketDialog} onOpenChange={setShowTicketDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Ticket
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Support Ticket</DialogTitle>
                  <DialogDescription>
                    Fill in the details to submit a new support request
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Support Type *</Label>
                    <Select
                      value={ticketForm.supportType}
                      onValueChange={(value) => setTicketForm({ ...ticketForm, supportType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="it_support">IT Support</SelectItem>
                        <SelectItem value="hr_support">HR Support</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Subject *</Label>
                    <Input
                      value={ticketForm.subject}
                      onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                      placeholder="Brief description of the issue..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Description *</Label>
                    <Textarea
                      value={ticketForm.description}
                      onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                      placeholder="Provide detailed information about your issue..."
                      rows={5}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Priority *</Label>
                    <Select
                      value={ticketForm.priority}
                      onValueChange={(value) => setTicketForm({ ...ticketForm, priority: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowTicketDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleTicketSubmit} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Submit Ticket
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          {isAdmin ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={adminPriorityFilter} onValueChange={setAdminPriorityFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ticket Status</Label>
                <Select value={adminStatusFilter} onValueChange={setAdminStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Ticket Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleApplyFilter} className="w-full">
                  Apply Filter
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket #</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : ticketsData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No support tickets found
                  </TableCell>
                </TableRow>
              ) : (
                ticketsData.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell className="font-medium">{ticket.ticketNumber}</TableCell>
                    <TableCell className="max-w-xs truncate">{ticket.subject}</TableCell>
                    <TableCell>{getPriorityBadge(ticket.priority)}</TableCell>
                    <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                    <TableCell>{new Date(ticket.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(ticket.updatedAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleViewTicket(ticket)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleEditTicket(ticket)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setDeletingTicket(ticket)}
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
        </CardContent>
      </Card>

      {/* View Ticket Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ticket Details</DialogTitle>
            <DialogDescription>
              View complete information about this support ticket
            </DialogDescription>
          </DialogHeader>
          
          {selectedTicket && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Ticket Number</Label>
                  <p className="font-medium">{selectedTicket.ticketNumber}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Status</Label>
                  <div>{getStatusBadge(selectedTicket.status)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Priority</Label>
                  <div>{getPriorityBadge(selectedTicket.priority)}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Created</Label>
                  <p>{new Date(selectedTicket.createdAt).toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Subject</Label>
                <p className="font-medium">{selectedTicket.subject}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Description</Label>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="whitespace-pre-wrap">{selectedTicket.description}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Last Updated</Label>
                <p>{new Date(selectedTicket.updatedAt).toLocaleString()}</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowViewDialog(false)}>
              <X className="mr-2 h-4 w-4" />
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin: Edit Ticket Dialog */}
      {isAdmin && (
        <Dialog open={editingTicket !== null} onOpenChange={() => setEditingTicket(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Ticket</DialogTitle>
              <DialogDescription>
                Change the status or priority of this ticket
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Status *</Label>
                <Select
                  value={editTicketForm.status}
                  onValueChange={(value) => setEditTicketForm({ ...editTicketForm, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority *</Label>
                <Select
                  value={editTicketForm.priority}
                  onValueChange={(value) => setEditTicketForm({ ...editTicketForm, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingTicket(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateTicket}>
                Update Ticket
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Admin: Delete Ticket Dialog */}
      {isAdmin && (
        <AlertDialog open={deletingTicket !== null} onOpenChange={() => setDeletingTicket(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Support Ticket?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this support ticket? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteTicket} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}