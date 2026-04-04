'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Wifi,
  WifiOff,
  Wrench,
  Plus,
  Search,
  RefreshCw,
  MapPin,
  Clock,
  Cpu,
  Activity,
} from 'lucide-react';
import { StatsSkeleton, InlineTableSkeleton } from '@/components/ui/dashboard-skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { hasFullAccess, type UserRole } from '@/lib/permissions';

interface ReaderDevice {
  id: number;
  readerId: string;
  name: string;
  location: string;
  type: string;
  status: string;
  ipAddress: string | null;
  lastHeartbeat: string | null;
  config: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function ReaderManagement({ currentUser }: { currentUser: any }) {
  const [readers, setReaders] = useState<ReaderDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Add reader form state
  const [newReader, setNewReader] = useState({
    readerId: '',
    name: '',
    location: '',
    type: 'usb',
    ipAddress: '',
  });

  useEffect(() => {
    if (currentUser) {
      fetchReaders();
    }
  }, [currentUser, statusFilter]);

  const fetchReaders = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const response = await fetch(`/api/readers?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setReaders(data);
      }
    } catch (error) {
      console.error('Error fetching readers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchReaders();
    setRefreshing(false);
    toast.success('Reader data refreshed');
  };

  const handleAddReader = async () => {
    if (!newReader.readerId || !newReader.name || !newReader.location || !newReader.type) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/readers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          readerId: newReader.readerId.trim(),
          name: newReader.name.trim(),
          location: newReader.location.trim(),
          type: newReader.type,
          ipAddress: newReader.ipAddress.trim() || undefined,
        }),
      });

      if (response.ok) {
        toast.success('Reader device added successfully');
        setAddDialogOpen(false);
        setNewReader({ readerId: '', name: '', location: '', type: 'usb', ipAddress: '' });
        fetchReaders();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to add reader');
      }
    } catch (error) {
      console.error('Error adding reader:', error);
      toast.error('An error occurred while adding the reader');
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = currentUser && hasFullAccess(currentUser.role as UserRole);

  const filteredReaders = readers.filter((reader) => {
    const searchLower = search.toLowerCase();
    return (
      reader.readerId.toLowerCase().includes(searchLower) ||
      reader.name.toLowerCase().includes(searchLower) ||
      reader.location.toLowerCase().includes(searchLower) ||
      reader.type.toLowerCase().includes(searchLower)
    );
  });

  const onlineCount = readers.filter(r => r.status === 'online').length;
  const offlineCount = readers.filter(r => r.status === 'offline').length;
  const maintenanceCount = readers.filter(r => r.status === 'maintenance').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800"><Activity className="h-3 w-3 mr-1" />Online</Badge>;
      case 'offline':
        return <Badge variant="secondary" className="gap-1"><WifiOff className="h-3 w-3" />Offline</Badge>;
      case 'maintenance':
        return <Badge className="bg-amber-500/15 text-amber-700 border-amber-200 dark:text-amber-400 dark:border-amber-800"><Wrench className="h-3 w-3 mr-1" />Maintenance</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'usb':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800"><Cpu className="h-3 w-3 mr-1" />USB</Badge>;
      case 'ethernet':
        return <Badge variant="outline" className="bg-violet-500/10 text-violet-700 border-violet-200 dark:text-violet-400 dark:border-violet-800"><Wifi className="h-3 w-3 mr-1" />Ethernet</Badge>;
      case 'mobile':
        return <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800">Mobile</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-semibold">NFC Reader Devices</h3>
          <p className="text-sm text-muted-foreground">
            Monitor and manage hardware readers (Screens) for attendance tracking.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-2" />
              Add Reader
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      {loading ? (
        <StatsSkeleton />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Readers</CardTitle>
              <Wifi className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{readers.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Online</CardTitle>
              <Activity className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{onlineCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Offline</CardTitle>
              <WifiOff className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{offlineCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Maintenance</CardTitle>
              <Wrench className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{maintenanceCount}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Readers Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Hardware List</CardTitle>
              <CardDescription>
                {filteredReaders.length} active readers in ecosystem
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-56">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="reader-search"
                  placeholder="Search readers..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px] h-9" id="reader-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <InlineTableSkeleton rows={5} columns={6} />
          ) : filteredReaders.length === 0 ? (
            <div className="text-center py-12">
              <Wifi className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No readers found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Wait for devices to poll or add one manually
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reader ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReaders.map((reader) => (
                  <TableRow key={reader.id}>
                    <TableCell className="font-mono text-xs font-medium">{reader.readerId}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{reader.name}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {reader.location}
                      </div>
                    </TableCell>
                    <TableCell>{getTypeBadge(reader.type)}</TableCell>
                    <TableCell>{getStatusBadge(reader.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(reader.lastHeartbeat)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Reader Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Reader (Screen)</DialogTitle>
            <DialogDescription>
              Register hardware to the attendance database
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reader-id-input">Reader ID *</Label>
              <Input
                id="reader-id-input"
                placeholder="e.g., READER-001"
                value={newReader.readerId}
                onChange={(e) => setNewReader({ ...newReader, readerId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reader-name-input">Name *</Label>
              <Input
                id="reader-name-input"
                placeholder="Office Entrance"
                value={newReader.name}
                onChange={(e) => setNewReader({ ...newReader, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reader-location-input">Location *</Label>
              <Input
                id="reader-location-input"
                placeholder="Main Floor"
                value={newReader.location}
                onChange={(e) => setNewReader({ ...newReader, location: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reader-type-select">Type *</Label>
              <Select
                value={newReader.type}
                onValueChange={(v) => setNewReader({ ...newReader, type: v })}
              >
                <SelectTrigger id="reader-type-select">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usb">USB</SelectItem>
                  <SelectItem value="ethernet">Ethernet</SelectItem>
                  <SelectItem value="mobile">Mobile</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddReader} disabled={saving}>
              {saving ? 'Adding...' : 'Add Reader'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
