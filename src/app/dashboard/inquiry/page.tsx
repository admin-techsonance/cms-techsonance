'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Star, StarOff, Loader2, MessageSquare, Plus, Trash2 } from 'lucide-react';
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

  // Add/Edit Inquiry
  const [showInquiryDialog, setShowInquiryDialog] = useState(false);
  const [editingInquiry, setEditingInquiry] = useState<Inquiry | null>(null);
  const [inquiryForm, setInquiryForm] = useState({
    aliasName: '',
    tag: 'need_estimation',
    status: 'lead',
    dueDate: '',
    appStatus: 'open',
  });

  // Add Inquiry Feed
  const [showFeedDialog, setShowFeedDialog] = useState(false);
  const [feedForm, setFeedForm] = useState({
    technology: '',
    description: '',
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
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
      
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
      } else {
        router.push('/login');
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const fetchInquiries = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
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
        setInquiries(data);
      }
    } catch (error) {
      console.error('Error fetching inquiries:', error);
      toast.error('Failed to load inquiries');
    } finally {
      setLoading(false);
    }
  };

  const handleInquirySubmit = async () => {
    if (!inquiryForm.aliasName.trim()) {
      toast.error('Please enter alias name');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
      
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
          ...inquiryForm,
          dueDate: inquiryForm.dueDate || null,
        }),
      });

      if (response.ok) {
        toast.success(editingInquiry ? 'Inquiry updated successfully!' : 'Inquiry created successfully!');
        setShowInquiryDialog(false);
        setEditingInquiry(null);
        setInquiryForm({
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
    } catch (error) {
      console.error('Error saving inquiry:', error);
      toast.error('An error occurred while saving inquiry');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInquiry = async () => {
    if (!deletingInquiry) return;
    
    try {
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
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
    } catch (error) {
      console.error('Error deleting inquiry:', error);
      toast.error('An error occurred while deleting inquiry');
    } finally {
      setDeletingInquiry(null);
    }
  };

  const toggleFavourite = async (inquiry: Inquiry) => {
    try {
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
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
    } catch (error) {
      console.error('Error toggling favourite:', error);
      toast.error('Failed to update favourite status');
    }
  };

  const fetchInquiryFeeds = async (inquiryId: number) => {
    setFeedsLoading(true);
    setSelectedInquiry(inquiryId);
    try {
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
      const response = await fetch(`/api/inquiry-feeds?inquiryId=${inquiryId}&limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setInquiryFeeds(data);
      }
    } catch (error) {
      console.error('Error fetching inquiry feeds:', error);
      toast.error('Failed to load inquiry feeds');
    } finally {
      setFeedsLoading(false);
    }
  };

  const handleFeedSubmit = async () => {
    if (!selectedInquiry) {
      toast.error('Please select an inquiry first');
      return;
    }

    if (!feedForm.description.trim()) {
      toast.error('Please enter description');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
      
      const response = await fetch('/api/inquiry-feeds', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inquiryId: selectedInquiry,
          technology: feedForm.technology || null,
          description: feedForm.description,
        }),
      });

      if (response.ok) {
        toast.success('Feed added successfully!');
        setShowFeedDialog(false);
        setFeedForm({ technology: '', description: '' });
        fetchInquiryFeeds(selectedInquiry);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to add feed');
      }
    } catch (error) {
      console.error('Error adding feed:', error);
      toast.error('An error occurred while adding feed');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFeed = async () => {
    if (!deletingFeed) return;
    
    try {
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
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
    } catch (error) {
      console.error('Error deleting feed:', error);
      toast.error('An error occurred while deleting feed');
    } finally {
      setDeletingFeed(null);
    }
  };

  const openEditDialog = (inquiry: Inquiry) => {
    setEditingInquiry(inquiry);
    setInquiryForm({
      aliasName: inquiry.aliasName,
      tag: inquiry.tag,
      status: inquiry.status,
      dueDate: inquiry.dueDate || '',
      appStatus: inquiry.appStatus || 'open',
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
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
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
                        setInquiryForm({
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
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Alias Name *</Label>
                          <Input
                            value={inquiryForm.aliasName}
                            onChange={(e) => setInquiryForm({ ...inquiryForm, aliasName: e.target.value })}
                            placeholder="Client alias name"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Tag *</Label>
                          <Select
                            value={inquiryForm.tag}
                            onValueChange={(value) => setInquiryForm({ ...inquiryForm, tag: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
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
                          <Label>Status *</Label>
                          <Select
                            value={inquiryForm.status}
                            onValueChange={(value) => setInquiryForm({ ...inquiryForm, status: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
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
                          <Label>Due Date</Label>
                          <Input
                            type="date"
                            value={inquiryForm.dueDate}
                            onChange={(e) => setInquiryForm({ ...inquiryForm, dueDate: e.target.value })}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>App Status *</Label>
                          <Select
                            value={inquiryForm.appStatus}
                            onValueChange={(value) => setInquiryForm({ ...inquiryForm, appStatus: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">Open</SelectItem>
                              <SelectItem value="close">Close</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
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
                        <Button onClick={handleInquirySubmit} disabled={loading}>
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
              <Table>
                <TableHeader>
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
                      <TableCell colSpan={canEdit || canDelete ? 9 : 8} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : inquiries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canEdit || canDelete ? 9 : 8} className="text-center py-8 text-muted-foreground">
                        No inquiries found
                      </TableCell>
                    </TableRow>
                  ) : (
                    inquiries.map((inquiry) => (
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
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Technology</Label>
                          <Input
                            value={feedForm.technology}
                            onChange={(e) => setFeedForm({ ...feedForm, technology: e.target.value })}
                            placeholder="Technology stack (optional)"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Description *</Label>
                          <Textarea
                            value={feedForm.description}
                            onChange={(e) => setFeedForm({ ...feedForm, description: e.target.value })}
                            placeholder="Enter communication details..."
                            rows={4}
                          />
                        </div>
                      </div>

                      <DialogFooter>
                        <Button 
                          variant="outline" 
                          onClick={() => setShowFeedDialog(false)}
                          disabled={loading}
                        >
                          Cancel
                        </Button>
                        <Button onClick={handleFeedSubmit} disabled={loading}>
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
                <Table>
                  <TableHeader>
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
                      inquiryFeeds.map((feed) => (
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