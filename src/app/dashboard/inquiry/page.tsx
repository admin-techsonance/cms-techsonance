'use client';

import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Star, StarOff, Loader2, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { ContentSkeleton } from '@/components/ui/dashboard-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import {
  inquiryAppStatusOptions,
  inquiryFeedFormSchema,
  inquiryFormSchema,
  inquiryStatusOptions,
  inquiryTagOptions,
  type InquiryFeedFormValues,
  type InquiryFormValues,
} from '@/lib/forms/schemas';
import { hasPermission, hasFullAccess, UserRole } from '@/lib/permissions';

interface Inquiry {
  id: number;
  aliasName: string;
  tag: string;
  status: string;
  dueDate: string | null;
  appStatus: string | null;
  isFavourite: boolean;
  createdAt: string;
}

interface InquiryFeed {
  id: number;
  inquiryId: number;
  commentedBy: number;
  technology: string | null;
  description: string;
  createdAt: string;
}

interface User {
  id: number;
  role: UserRole;
  firstName: string;
  lastName: string;
}

export default function InquiryPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  
  // Inquiry Feed
  const [selectedInquiry, setSelectedInquiry] = useState<number | null>(null);
  const [inquiryFeeds, setInquiryFeeds] = useState<InquiryFeed[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [inquiryPage, setInquiryPage] = useState(0);
  const [feedPage, setFeedPage] = useState(0);
  const pageSize = 10;

  // Add/Edit Inquiry
  const [showInquiryDialog, setShowInquiryDialog] = useState(false);
  const [editingInquiry, setEditingInquiry] = useState<Inquiry | null>(null);
  const inquiryForm = useForm<InquiryFormValues>({
    resolver: zodResolver(inquiryFormSchema),
    defaultValues: {
      aliasName: '',
      tag: 'need_estimation',
      status: 'lead',
      dueDate: '',
      appStatus: 'open',
    },
  });

  // Add Inquiry Feed
  const [showFeedDialog, setShowFeedDialog] = useState(false);
  const feedForm = useForm<InquiryFeedFormValues>({
    resolver: zodResolver(inquiryFeedFormSchema),
    defaultValues: {
      technology: '',
      description: '',
    },
  });

  // Delete dialogs
  const [deletingInquiry, setDeletingInquiry] = useState<Inquiry | null>(null);
  const [deletingFeed, setDeletingFeed] = useState<InquiryFeed | null>(null);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchInquiries();
    }
  }, [currentUser]);

  const fetchCurrentUser = async () => {
    try {
      const token = localStorage.getItem('session_token');
      
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.user);
      }
    } catch {
      toast.error('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchInquiries = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      let url = '/api/inquiries?limit=100';
      
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
      if (selectedTag !== 'all') url += `&tag=${selectedTag}`;
      if (selectedStatus !== 'all') url += `&status=${selectedStatus}`;
      if (filterType !== 'all') url += `&appStatus=${filterType}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setInquiries(Array.isArray(data) ? data : data.data ?? []);
        setInquiryPage(0); // Reset to first page
      }
    } catch {
      toast.error('Failed to load inquiries');
    } finally {
      setLoading(false);
    }
  };

  const handleInquirySubmit = async (values: InquiryFormValues) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      
      const url = editingInquiry 
        ? `/api/inquiries?id=${editingInquiry.id}`
        : '/api/inquiries';
      
      const method = editingInquiry ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...values,
          dueDate: values.dueDate || null,
        }),
      });

      if (response.ok) {
        toast.success(editingInquiry ? 'Inquiry updated successfully!' : 'Inquiry created successfully!');
        setShowInquiryDialog(false);
        setEditingInquiry(null);
        inquiryForm.reset({
          aliasName: '',
          tag: 'need_estimation',
          status: 'lead',
          dueDate: '',
          appStatus: 'open',
        });
        fetchInquiries();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save inquiry');
      }
    } catch {
      toast.error('An error occurred while saving inquiry');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInquiry = async () => {
    if (!deletingInquiry) return;
    
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/inquiries?id=${deletingInquiry.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        toast.success('Inquiry deleted successfully!');
        fetchInquiries();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete inquiry');
      }
    } catch {
      toast.error('An error occurred while deleting inquiry');
    } finally {
      setDeletingInquiry(null);
    }
  };

  const toggleFavourite = async (inquiry: Inquiry) => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/inquiries?id=${inquiry.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isFavourite: !inquiry.isFavourite }),
      });

      if (response.ok) {
        toast.success(inquiry.isFavourite ? 'Removed from favourites' : 'Added to favourites');
        fetchInquiries();
      }
    } catch {
      toast.error('Failed to update favourite status');
    }
  };

  const fetchInquiryFeeds = async (inquiryId: number) => {
    setFeedsLoading(true);
    setSelectedInquiry(inquiryId);
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/inquiry-feeds?inquiryId=${inquiryId}&limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setInquiryFeeds(Array.isArray(data) ? data : data.data ?? []);
        setFeedPage(0); // Reset to first page
      }
    } catch {
      toast.error('Failed to load inquiry feeds');
    } finally {
      setFeedsLoading(false);
    }
  };

  const handleFeedSubmit = async (values: InquiryFeedFormValues) => {
    if (!selectedInquiry) {
      toast.error('Please select an inquiry first');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      
      const response = await fetch('/api/inquiry-feeds', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inquiryId: selectedInquiry,
          technology: values.technology || null,
          description: values.description.trim(),
        }),
      });

      if (response.ok) {
        toast.success('Feed added successfully!');
        setShowFeedDialog(false);
        feedForm.reset({ technology: '', description: '' });
        fetchInquiryFeeds(selectedInquiry);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to add feed');
      }
    } catch {
      toast.error('An error occurred while adding feed');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFeed = async () => {
    if (!deletingFeed) return;
    
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/inquiry-feeds?id=${deletingFeed.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        toast.success('Feed deleted successfully!');
        if (selectedInquiry) {
          fetchInquiryFeeds(selectedInquiry);
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete feed');
      }
    } catch {
      toast.error('An error occurred while deleting feed');
    } finally {
      setDeletingFeed(null);
    }
  };

  const openEditDialog = (inquiry: Inquiry) => {
    setEditingInquiry(inquiry);
    inquiryForm.reset({
      aliasName: inquiry.aliasName,
      tag: inquiry.tag as InquiryFormValues['tag'],
      status: inquiry.status as InquiryFormValues['status'],
      dueDate: inquiry.dueDate || '',
      appStatus: (inquiry.appStatus as InquiryFormValues['appStatus']) || 'open',
    });
    setShowInquiryDialog(true);
  };

  const getTagBadge = (tag: string) => {
    const tagColors: Record<string, string> = {
      'need_estimation': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      'rough_estimation': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
      'scheduling_meeting': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      'need_schedule_meeting': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
      'hired_someone_else': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
      'hired': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
    };
    
    return (
      <Badge className={tagColors[tag] || ''}>
        {tag.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      'lead': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      'no_reply': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
      'follow_up': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
      'hired': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      'rejected_client': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
      'rejected_us': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    };
    
    return (
      <Badge className={statusColors[status] || ''}>
        {status.replace(/_/g, ' ')}
      </Badge>
    );
  };

  if (loading && !currentUser) {
    return <ContentSkeleton />;
  }

  const canCreate = currentUser && hasPermission(currentUser.role, 'inquiry', 'canCreate');
  const canEdit = currentUser && hasPermission(currentUser.role, 'inquiry', 'canEdit');
  const canDelete = currentUser && hasPermission(currentUser.role, 'inquiry', 'canDelete');
  const isFullAccess = currentUser && hasFullAccess(currentUser.role);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Inquiry Management</h2>
        <p className="text-muted-foreground">
          Track and manage client inquiries and communications
        </p>
      </div>

      <Tabs defaultValue="inquiry" className="space-y-6">
        <TabsList>
          <TabsTrigger value="inquiry">Inquiry</TabsTrigger>
          <TabsTrigger value="inquiry-feed">Inquiry Feed</TabsTrigger>
        </TabsList>

        {/* Inquiry Tab */}
        <TabsContent value="inquiry">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Inquiries</CardTitle>
                  <CardDescription>View and manage all client inquiries</CardDescription>
                </div>
                {canCreate && (
                  <Dialog open={showInquiryDialog} onOpenChange={setShowInquiryDialog}>
                    <DialogTrigger asChild>
                      <Button onClick={() => {
                        setEditingInquiry(null);
                        inquiryForm.reset({
                          aliasName: '',
                          tag: 'need_estimation',
                          status: 'lead',
                          dueDate: '',
                          appStatus: 'open',
                        });
                      }}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Inquiry
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{editingInquiry ? 'Edit Inquiry' : 'Add New Inquiry'}</DialogTitle>
                        <DialogDescription>
                          {editingInquiry ? 'Update inquiry details' : 'Create a new client inquiry'}
                        </DialogDescription>
                      </DialogHeader>
                      
                      <Form {...inquiryForm}>
                      <div className="space-y-4">
                        <FormField
                          control={inquiryForm.control}
                          name="aliasName"
                          render={({ field }) => (
                        <FormItem className="space-y-2">
                          <Label>Alias Name *</Label>
                          <FormControl>
                          <Input
                            {...field}
                            placeholder="Client alias name"
                          />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                          )}
                        />

                        <FormField
                          control={inquiryForm.control}
                          name="tag"
                          render={({ field }) => (
                        <FormItem className="space-y-2">
                          <Label>Tag *</Label>
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
                              {inquiryTagOptions.map((tag) => (
                                <SelectItem key={tag} value={tag}>
                                  {tag.replace(/_/g, ' ')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage className="text-xs" />
                        </FormItem>
                          )}
                        />

                        <FormField
                          control={inquiryForm.control}
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
                              {inquiryStatusOptions.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status.replace(/_/g, ' ')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage className="text-xs" />
                        </FormItem>
                          )}
                        />

                        <FormField
                          control={inquiryForm.control}
                          name="dueDate"
                          render={({ field }) => (
                        <FormItem className="space-y-2">
                          <Label>Due Date</Label>
                          <FormControl>
                          <Input
                            type="date"
                            {...field}
                          />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                          )}
                        />

                        <FormField
                          control={inquiryForm.control}
                          name="appStatus"
                          render={({ field }) => (
                        <FormItem className="space-y-2">
                          <Label>App Status *</Label>
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
                              {inquiryAppStatusOptions.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status.charAt(0).toUpperCase() + status.slice(1)}
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
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setShowInquiryDialog(false);
                            setEditingInquiry(null);
                          }}
                          disabled={loading}
                        >
                          Cancel
                        </Button>
                        <Button onClick={() => void inquiryForm.handleSubmit(handleInquirySubmit, () => toast.error('Please fix the inquiry form before saving'))()} disabled={loading}>
                          {loading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            editingInquiry ? 'Update Inquiry' : 'Create Inquiry'
                          )}
                        </Button>
                      </DialogFooter>
                      </Form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
                  <Label>Search Inquiry</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Select Tag</Label>
                  <Select value={selectedTag} onValueChange={setSelectedTag}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tags</SelectItem>
                      <SelectItem value="need_estimation">Need Estimation</SelectItem>
                      <SelectItem value="rough_estimation">Rough Estimation</SelectItem>
                      <SelectItem value="scheduling_meeting">Scheduling Meeting</SelectItem>
                      <SelectItem value="need_schedule_meeting">Need Schedule Meeting</SelectItem>
                      <SelectItem value="hired_someone_else">Hired Someone Else</SelectItem>
                      <SelectItem value="hired">Hired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Select Status</Label>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="no_reply">No Reply</SelectItem>
                      <SelectItem value="follow_up">Follow Up Taken</SelectItem>
                      <SelectItem value="hired">Hired</SelectItem>
                      <SelectItem value="rejected_client">Rejected by Client</SelectItem>
                      <SelectItem value="rejected_us">Rejected by Us</SelectItem>
                      <SelectItem value="invite_lead">Invite Lead</SelectItem>
                      <SelectItem value="invite_hire">Invite Hire</SelectItem>
                      <SelectItem value="not_good_client">Not Good Client</SelectItem>
                      <SelectItem value="budget_low">Budget Too Low</SelectItem>
                      <SelectItem value="cant_work">Can't Work</SelectItem>
                      <SelectItem value="hired_someone_else">Hired Someone Else</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>All</Label>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="close">Close</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={fetchInquiries} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Apply Filter
              </Button>

              {/* Table */}
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox />
                      </TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Alias Name</TableHead>
                      <TableHead>Tag</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>App. Status</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Favourite</TableHead>
                      {(canEdit || canDelete) && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={canEdit || canDelete ? 9 : 8} className="py-4">
                          <div className="space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <div key={i} className="flex items-center gap-4">
                                {Array.from({ length: 6 }).map((_, j) => (
                                  <Skeleton key={j} className="h-5 w-full" />
                                ))}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : inquiries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={canEdit || canDelete ? 9 : 8} className="text-center py-8 text-muted-foreground">
                          No inquiries found
                        </TableCell>
                      </TableRow>
                    ) : (
                      inquiries.slice(inquiryPage * pageSize, (inquiryPage + 1) * pageSize).map((inquiry) => (
                        <TableRow key={inquiry.id}>
                          <TableCell>
                            <Checkbox />
                          </TableCell>
                          <TableCell className="font-medium">{inquiry.id}</TableCell>
                          <TableCell>{inquiry.aliasName}</TableCell>
                          <TableCell>{getTagBadge(inquiry.tag)}</TableCell>
                          <TableCell>
                            {inquiry.dueDate ? new Date(inquiry.dueDate).toLocaleDateString() : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={inquiry.appStatus === 'open' ? 'default' : 'secondary'}>
                              {inquiry.appStatus || 'N/A'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => fetchInquiryFeeds(inquiry.id)}
                            >
                              <MessageSquare className="mr-2 h-4 w-4" />
                              View Feeds
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleFavourite(inquiry)}
                            >
                              {inquiry.isFavourite ? (
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              ) : (
                                <StarOff className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          {(canEdit || canDelete) && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {canEdit && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDialog(inquiry)}
                                  >
                                    Edit
                                  </Button>
                                )}
                                {canDelete && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDeletingInquiry(inquiry)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
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
                  onClick={() => setInquiryPage(Math.max(0, inquiryPage - 1))}
                  disabled={inquiryPage === 0}
                >
                  Previous
                </Button>
                <div className="text-sm font-medium">
                  Page {inquiryPage + 1} of {Math.ceil(inquiries.length / pageSize) || 1}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInquiryPage(Math.min(Math.ceil(inquiries.length / pageSize) - 1, inquiryPage + 1))}
                  disabled={inquiryPage >= Math.ceil(inquiries.length / pageSize) - 1}
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inquiry Feed Tab */}
        <TabsContent value="inquiry-feed">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Inquiry Feed</CardTitle>
                  <CardDescription>
                    {selectedInquiry 
                      ? `Viewing communication history for Inquiry #${selectedInquiry}`
                      : 'Select an inquiry from the Inquiry tab to view its communication history'
                    }
                  </CardDescription>
                </div>
                {canCreate && selectedInquiry && (
                  <Dialog open={showFeedDialog} onOpenChange={setShowFeedDialog}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Feed
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Inquiry Feed</DialogTitle>
                        <DialogDescription>
                          Add a new communication entry for this inquiry
                        </DialogDescription>
                      </DialogHeader>
                      
                      <Form {...feedForm}>
                      <div className="space-y-4">
                        <FormField
                          control={feedForm.control}
                          name="technology"
                          render={({ field }) => (
                        <FormItem className="space-y-2">
                          <Label>Technology</Label>
                          <FormControl>
                          <Input
                            {...field}
                            placeholder="Technology stack (optional)"
                          />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                          )}
                        />

                        <FormField
                          control={feedForm.control}
                          name="description"
                          render={({ field }) => (
                        <FormItem className="space-y-2">
                          <Label>Description *</Label>
                          <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Enter communication details..."
                            rows={4}
                          />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                          )}
                        />
                      </div>

                      <DialogFooter>
                        <Button 
                          variant="outline" 
                          onClick={() => setShowFeedDialog(false)}
                          disabled={loading}
                        >
                          Cancel
                        </Button>
                        <Button onClick={() => void feedForm.handleSubmit(handleFeedSubmit, () => toast.error('Please fix the inquiry feed form before saving'))()} disabled={loading}>
                          {loading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            'Add Feed'
                          )}
                        </Button>
                      </DialogFooter>
                      </Form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {feedsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : selectedInquiry === null ? (
                <div className="text-center py-8 text-muted-foreground">
                  Please select an inquiry to view its feeds
                </div>
              ) : (
                <>
                  <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>Inquiry ID</TableHead>
                        <TableHead>Commented By</TableHead>
                        <TableHead>Commented At</TableHead>
                        <TableHead>Technology</TableHead>
                        <TableHead>Description</TableHead>
                        {canDelete && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inquiryFeeds.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={canDelete ? 6 : 5} className="text-center py-8 text-muted-foreground">
                            No communication feeds found for this inquiry
                          </TableCell>
                        </TableRow>
                      ) : (
                        inquiryFeeds.slice(feedPage * pageSize, (feedPage + 1) * pageSize).map((feed) => (
                          <TableRow key={feed.id}>
                            <TableCell className="font-medium">{feed.inquiryId}</TableCell>
                            <TableCell>User #{feed.commentedBy}</TableCell>
                            <TableCell>
                              {new Date(feed.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {feed.technology ? (
                                <Badge variant="outline">{feed.technology}</Badge>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell className="max-w-md">
                              <p className="line-clamp-2">{feed.description}</p>
                            </TableCell>
                            {canDelete && (
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeletingFeed(feed)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            )}
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
                    onClick={() => setFeedPage(Math.max(0, feedPage - 1))}
                    disabled={feedPage === 0}
                  >
                    Previous
                  </Button>
                  <div className="text-sm font-medium">
                    Page {feedPage + 1} of {Math.ceil(inquiryFeeds.length / pageSize) || 1}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFeedPage(Math.min(Math.ceil(inquiryFeeds.length / pageSize) - 1, feedPage + 1))}
                    disabled={feedPage >= Math.ceil(inquiryFeeds.length / pageSize) - 1}
                  >
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Inquiry Dialog */}
      <AlertDialog open={deletingInquiry !== null} onOpenChange={() => setDeletingInquiry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Inquiry?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this inquiry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInquiry} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Feed Dialog */}
      <AlertDialog open={deletingFeed !== null} onOpenChange={() => setDeletingFeed(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Feed?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this feed entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFeed} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
