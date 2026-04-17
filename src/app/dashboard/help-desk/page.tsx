'use client';

import { useState, useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2, MessageSquare, X, AlertCircle, CheckCircle2, Clock, Eye, Edit, Trash2, Users, Search } from 'lucide-react';
import { StatsSkeleton, TableSkeleton, PageHeaderSkeleton, MetricCardGridSkeleton } from '@/components/ui/dashboard-skeleton';
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
import {
  helpDeskPriorityOptions,
  helpDeskStatusOptions,
  helpDeskSupportTypeOptions,
  helpDeskTicketFormSchema,
  helpDeskTicketUpdateFormSchema,
  type HelpDeskTicketFormValues,
  type HelpDeskTicketUpdateFormValues,
} from '@/lib/forms/schemas';
import { hasFullAccess, type UserRole } from '@/lib/permissions';

interface Ticket {
  id: number;
  ticketNumber: string;
  subject: string;
  description: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  clientId: number;
  attachmentUrl?: string | null;
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
  const [showTicketDialog, setShowTicketDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  // Admin-specific state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  // Unified Filter state
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 10;

  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [deletingTicket, setDeletingTicket] = useState<Ticket | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  
  // Chat / Comments State
  const [ticketComments, setTicketComments] = useState<any[]>([]);
  const [newCommentMessage, setNewCommentMessage] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [hrSupportEmail, setHrSupportEmail] = useState('');
  const [itSupportEmail, setItSupportEmail] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch('/api/tickets/settings', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setItSupportEmail(data.it_support_email || '');
        setHrSupportEmail(data.hr_support_email || '');
      }
    } catch (e) {
      console.error('Failed to fetch helpdesk settings:', e);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch('/api/tickets/settings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ it_support_email: itSupportEmail, hr_support_email: hrSupportEmail })
      });
      if (res.ok) toast.success('Routing settings saved successfully');
      else toast.error('Failed to save settings');
    } catch {
       toast.error('An error occurred while saving routing settings');
    } finally {
      setSavingSettings(false);
    }
  };

  // Run fetchSettings if Admin
  useEffect(() => {
    if (currentUser && hasFullAccess(currentUser.role as UserRole)) {
      fetchSettings();
    }
  }, [currentUser]);

  const createTicketForm = useForm<HelpDeskTicketFormValues>({
    resolver: zodResolver(helpDeskTicketFormSchema),
    defaultValues: {
      supportType: 'it_support',
      subject: '',
      description: '',
      priority: 'medium',
    },
  });
  const editTicketForm = useForm<HelpDeskTicketUpdateFormValues>({
    resolver: zodResolver(helpDeskTicketUpdateFormSchema),
    defaultValues: {
      status: 'open',
      priority: 'medium',
    },
  });

  const formatDateOrdinal = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      const dayName = days[date.getDay()];
      const day = date.getDate();
      const monthName = months[date.getMonth()];
      const year = date.getFullYear();
      
      let suffix = 'th';
      if (day % 10 === 1 && day !== 11) suffix = 'st';
      else if (day % 10 === 2 && day !== 12) suffix = 'nd';
      else if (day % 10 === 3 && day !== 13) suffix = 'rd';
      
      return `${dayName}, ${day}${suffix} ${monthName} ${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      if (hasFullAccess(currentUser.role as UserRole)) {
        fetchEmployees();
      }
    }
  }, [currentUser]);

  // Automated filtering for both Admin and User
  useEffect(() => {
    if (!currentUser) return;

    const timer = setTimeout(() => {
      setCurrentPage(0); // Reset to first page when any filter changes
      if (hasFullAccess(currentUser.role as UserRole)) {
        fetchAllTickets();
      } else {
        fetchTickets();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [
    currentUser,
    statusFilter,
    priorityFilter,
    startDate,
    endDate,
    searchFilter,
    selectedEmployeeFilter,
  ]);

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
      
      if (statusFilter !== 'all') url += `&status=${statusFilter}`;
      if (priorityFilter !== 'all') url += `&priority=${priorityFilter}`;
      if (selectedEmployeeFilter !== 'all') url += `&assignedTo=${selectedEmployeeFilter}`;
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      if (searchFilter) url += `&search=${encodeURIComponent(searchFilter)}`;

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

      if (statusFilter !== 'all') url += `&status=${statusFilter}`;
      if (priorityFilter !== 'all') url += `&priority=${priorityFilter}`;
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      if (searchFilter) url += `&search=${encodeURIComponent(searchFilter)}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTickets(data);
        setFilteredTickets(data);
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

  const fetchComments = async (ticketId: number) => {
    setLoadingComments(true);
    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch(`/api/tickets/comments?ticketId=${ticketId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTicketComments(data.comments || []);
      }
    } catch (e) {
      console.error('Failed to fetch comments', e);
    } finally {
      setLoadingComments(false);
    }
  };

  const handlePostComment = async () => {
    if (!newCommentMessage.trim() || !selectedTicket) return;
    setSubmittingComment(true);
    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch(`/api/tickets/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ticketId: selectedTicket.id, message: newCommentMessage })
      });
      if (res.ok) {
        const data = await res.json();
        setTicketComments([...ticketComments, data.comment]);
        setNewCommentMessage('');
      } else {
        toast.error('Failed to post comment');
      }
    } catch (e) {
      toast.error('An error occurred');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleViewTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setShowViewDialog(true);
    fetchComments(ticket.id);
  };

  const handleEditTicket = (ticket: Ticket) => {
    setEditingTicket(ticket);
    editTicketForm.reset({
      status: ticket.status as HelpDeskTicketUpdateFormValues['status'],
      priority: ticket.priority as HelpDeskTicketUpdateFormValues['priority'],
    });
  };

  const handleUpdateTicket = async (values: HelpDeskTicketUpdateFormValues) => {
    if (!editingTicket) return;
    
    try {
      const response = await fetch(`/api/tickets?id=${editingTicket.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: values.status,
          priority: values.priority,
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
    } catch {
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
    } catch {
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

  const handleTicketSubmit = async (values: HelpDeskTicketFormValues) => {
    if (!userId) {
      toast.error('User not authenticated. Please log in again.');
      return;
    }

    setLoading(true);
    try {
      // Fetch first available client for the ticket
      const clientsResponse = await fetch('/api/clients?limit=1', {
        headers: { 'Content-Type': 'application/json' }
      });
      
      let clientId: number;
      
      if (clientsResponse.ok) {
        const clients = await clientsResponse.json();
        if (clients && clients.length > 0) {
          clientId = clients[0].id;
        } else {
          // If no clients found, try to use a fallback or show error
          toast.error('No client records found. A client must exist to create a ticket.');
          setLoading(false);
          return;
        }
      } else {
        toast.error('Failed to verify client records. Please try again.');
        setLoading(false);
        return;
      }

      let uploadedAttachmentUrl: string | null = null;
      if (attachmentFile) {
         try {
            const supabase = getSupabaseBrowserClient();
            const fileExt = attachmentFile.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
               .from('helpdesk_attachments')
               .upload(`tickets/${fileName}`, attachmentFile, {
                  cacheControl: '3600',
                  upsert: false
               });
               
            if (uploadError) {
               console.error('Storage Upload Error:', uploadError);
               toast.error('Failed to upload file attachment.');
               setLoading(false);
               return;
            }
            
            const { data: publicUrlData } = supabase.storage
               .from('helpdesk_attachments')
               .getPublicUrl(`tickets/${fileName}`);
               
            uploadedAttachmentUrl = publicUrlData.publicUrl;
         } catch (e) {
            console.error('Failed to process attachment', e);
         }
      }

      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticketNumber: ticketNumber,
          clientId: clientId,
          subject: `[${values.supportType.toUpperCase().replace('_', ' ')}] ${values.subject.trim()}`,
          description: values.description.trim(),
          priority: values.priority,
          status: 'open',
          attachmentUrl: uploadedAttachmentUrl,
        }),
      });

      if (response.ok) {
        toast.success('Support ticket created successfully!');
        setShowTicketDialog(false);
        createTicketForm.reset({
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
    } catch {
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

  if (loading || !user) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <MetricCardGridSkeleton count={4} />
        <div className="mt-8">
          <TableSkeleton columns={6} rows={8} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {loading ? (
          <>
            <StatsSkeleton />
            <StatsSkeleton />
            <StatsSkeleton />
            <StatsSkeleton />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      <Tabs defaultValue="tickets" className="space-y-4">
        {isAdmin && (
          <TabsList>
            <TabsTrigger value="tickets">All Tickets</TabsTrigger>
            <TabsTrigger value="settings">Support Routing Settings</TabsTrigger>
          </TabsList>
        )}
        
        <TabsContent value="tickets" className="space-y-4 mt-0">
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
              <DialogContent className="sm:max-w-[800px] md:max-w-[4xl] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Support Ticket</DialogTitle>
                  <DialogDescription>
                    Fill in the details to submit a new support request
                  </DialogDescription>
                </DialogHeader>

                <Form {...createTicketForm}>
                <div className="space-y-4">
                  <FormField
                    control={createTicketForm.control}
                    name="supportType"
                    render={({ field }) => (
                  <FormItem className="space-y-2">
                    <Label>Support Type *</Label>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {helpDeskSupportTypeOptions.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type === 'it_support' ? 'IT Support' : 'HR Support'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-xs" />
                  </FormItem>
                    )}
                  />

                  <FormField
                    control={createTicketForm.control}
                    name="subject"
                    render={({ field }) => (
                  <FormItem className="space-y-2">
                    <Label>Subject *</Label>
                    <FormControl>
                    <Input
                      {...field}
                      placeholder="Brief description of the issue..."
                    />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                    )}
                  />

                  <FormField
                    control={createTicketForm.control}
                    name="description"
                    render={({ field }) => (
                  <FormItem className="space-y-2">
                    <Label>Description *</Label>
                    <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Provide detailed information about your issue..."
                      rows={5}
                    />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                    )}
                  />

                  <FormField
                    control={createTicketForm.control}
                    name="priority"
                    render={({ field }) => (
                  <FormItem className="space-y-2">
                    <Label>Priority *</Label>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {helpDeskPriorityOptions.filter((priority) => priority !== 'urgent').map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {priority.charAt(0).toUpperCase() + priority.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-xs" />
                  </FormItem>
                    )}
                  />
                  <div className="space-y-2">
                    <Label>Screenshot / Attachment (Optional)</Label>
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 flex flex-col items-center justify-center text-center">
                       <Input 
                          type="file" 
                          accept=".jpg,.jpeg,.png"
                          className="max-w-xs cursor-pointer"
                          onChange={(e) => {
                             const file = e.target.files?.[0];
                             if (!file) {
                                setAttachmentFile(null);
                                return;
                             }
                             if (file.size > 1048576) {
                                toast.error('File must be smaller than 1MB');
                                e.target.value = '';
                                setAttachmentFile(null);
                                return;
                             }
                             setAttachmentFile(file);
                          }}
                       />
                       <p className="text-xs text-muted-foreground mt-2">JPEG or PNG only. Max 1MB.</p>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowTicketDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => void createTicketForm.handleSubmit(handleTicketSubmit, () => toast.error('Please fix the ticket details before submitting'))()} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Submit Ticket
                  </Button>
                </DialogFooter>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-4">
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ticket # or Subject"
                  className="pl-8"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
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

            {isAdmin && (
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select value={selectedEmployeeFilter} onValueChange={setSelectedEmployeeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.userId.toString()}>
                        {emp.firstName} {emp.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!isAdmin && (
              <>
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
              </>
            )}
          </div>

          <div className="max-h-[600px] overflow-y-auto mt-4">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Ticket #</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                   <TableSkeleton columns={6} rows={10} />
                ) : ticketsData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No support tickets found
                    </TableCell>
                  </TableRow>
                ) : (
                  ticketsData.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="font-medium">{ticket.ticketNumber}</TableCell>
                      <TableCell className="max-w-xs truncate">{ticket.subject}</TableCell>
                      <TableCell>{getPriorityBadge(ticket.priority)}</TableCell>
                      <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                      <TableCell>{formatDateOrdinal(ticket.createdAt)}</TableCell>
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
          </div>
          <div className="flex items-center justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
            >
              Previous
            </Button>
            <div className="text-sm font-medium">
              Page {currentPage + 1} of {Math.ceil(ticketsData.length / pageSize) || 1}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(Math.ceil(ticketsData.length / pageSize) - 1, currentPage + 1))}
              disabled={currentPage >= Math.ceil(ticketsData.length / pageSize) - 1}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="settings" className="space-y-4 mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Email Routing Configuration</CardTitle>
                <CardDescription>Configure which emails receive notifications for new IT or HR support tickets.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 max-w-xl">
                <div className="space-y-2">
                  <Label>IT Support Email</Label>
                  <Input 
                    placeholder="it@example.com" 
                    value={itSupportEmail} 
                    onChange={(e) => setItSupportEmail(e.target.value)} 
                  />
                  <p className="text-xs text-muted-foreground">Used for tickets created under 'IT Support' category.</p>
                </div>
                <div className="space-y-2">
                  <Label>HR Support Email</Label>
                  <Input 
                    placeholder="hr@example.com" 
                    value={hrSupportEmail} 
                    onChange={(e) => setHrSupportEmail(e.target.value)} 
                  />
                  <p className="text-xs text-muted-foreground">Used for tickets created under 'HR Support' category.</p>
                </div>
                <Button onClick={saveSettings} disabled={savingSettings}>
                  {savingSettings && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* View Ticket Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="sm:max-w-[90vw] md:max-w-[1100px] h-auto max-h-[95vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>Ticket Details</DialogTitle>
            <DialogDescription>
              View complete information about this support ticket
            </DialogDescription>
          </DialogHeader>
          
          {selectedTicket && (
            <div className="flex h-full flex-col md:flex-row overflow-hidden flex-1 border-t">
              {/* LEFT PANE: Ticket Details */}
              <div className="w-full md:w-1/2 p-6 border-r overflow-y-auto space-y-6 bg-muted/20">
                <div className="flex items-center justify-between">
                   <h3 className="text-xl font-bold">{selectedTicket.subject}</h3>
                   <div className="flex gap-2">
                       {getStatusBadge(selectedTicket.status)}
                       {getPriorityBadge(selectedTicket.priority)}
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <span className="text-muted-foreground block text-xs">Ticket Number</span>
                    <span className="font-medium">{selectedTicket.ticketNumber}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground block text-xs">Created At</span>
                    <span>{formatDateOrdinal(selectedTicket.createdAt)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-muted-foreground block text-xs font-medium uppercase">Description</span>
                  <div className="p-4 bg-background border rounded-lg shadow-sm text-sm whitespace-pre-wrap">
                    {selectedTicket.description}
                  </div>
                </div>

                {selectedTicket.attachmentUrl && (
                  <div className="space-y-2">
                    <span className="text-muted-foreground block text-xs font-medium uppercase">Attachment</span>
                    <div className="border rounded-lg overflow-hidden bg-background">
                       <a href={selectedTicket.attachmentUrl} target="_blank" rel="noopener noreferrer">
                         <img src={selectedTicket.attachmentUrl} alt="Ticket Attachment" className="max-w-full h-auto object-cover max-h-[300px] w-full hover:opacity-90 transition-opacity" />
                       </a>
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT PANE: Chat Interface */}
              <div className="w-full md:w-1/2 flex flex-col h-full bg-background relative">
                 <div className="p-4 border-b bg-muted/40 font-medium flex items-center">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Ticket Comments
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loadingComments ? (
                       <div className="flex justify-center items-center h-full">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                       </div>
                    ) : ticketComments.length === 0 ? (
                       <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                          <MessageSquare className="w-12 h-12 mb-2 opacity-20" />
                          <p>No comments yet.</p>
                       </div>
                    ) : (
                       ticketComments.map((comment) => {
                          const isOwn = comment.legacy_user_id === userId;
                          return (
                             <div key={comment.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                   <span className="text-xs font-medium text-foreground">
                                      {isOwn ? 'You' : `${comment.users?.first_name} ${comment.users?.last_name}`}
                                   </span>
                                   {!isOwn && comment.users?.role !== 'Employee' && (
                                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">Support</Badge>
                                   )}
                                   <span className="text-[10px] text-muted-foreground">
                                      {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                   </span>
                                </div>
                                <div className={`relative px-4 py-2 rounded-2xl max-w-[85%] text-sm ${isOwn ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'}`}>
                                   <p className="whitespace-pre-wrap">{comment.message}</p>
                                </div>
                             </div>
                          );
                       })
                    )}
                 </div>
                 
                 <div className="p-4 border-t bg-background">
                    <div className="flex space-x-2">
                       <Input
                         placeholder="Type a response..."
                         value={newCommentMessage}
                         onChange={(e) => setNewCommentMessage(e.target.value)}
                         onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                               e.preventDefault();
                               handlePostComment();
                            }
                         }}
                       />
                       <Button onClick={handlePostComment} disabled={submittingComment || !newCommentMessage.trim()}>
                          {submittingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
                       </Button>
                    </div>
                 </div>
              </div>
            </div>
          )}


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
            
            <Form {...editTicketForm}>
            <div className="space-y-4">
              <FormField
                control={editTicketForm.control}
                name="status"
                render={({ field }) => (
              <FormItem className="space-y-2">
                <Label>Status *</Label>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {helpDeskStatusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="text-xs" />
              </FormItem>
                )}
              />

              <FormField
                control={editTicketForm.control}
                name="priority"
                render={({ field }) => (
              <FormItem className="space-y-2">
                <Label>Priority *</Label>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {helpDeskPriorityOptions.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {priority.charAt(0).toUpperCase() + priority.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="text-xs" />
              </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingTicket(null)}>
                Cancel
              </Button>
              <Button onClick={() => void editTicketForm.handleSubmit(handleUpdateTicket, () => toast.error('Please fix the ticket update details'))()}>
                Update Ticket
              </Button>
            </DialogFooter>
            </Form>
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
