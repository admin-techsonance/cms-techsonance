'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Fingerprint,
  Search,
  Users,
  UserCheck,
  UserX,
  Clock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { hasFullAccess, type UserRole } from '@/lib/permissions';

interface AttendanceRecord {
  id: number;
  employeeId: number;
  date: string;
  timeIn: string;
  timeOut: string | null;
  duration: number | null;
  status: string;
  checkInMethod: string;
  readerId: string | null;
  location: string | null;
  tagUid: string | null;
  createdAt: string;
  employee: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    department: string;
    photoUrl: string | null;
    status: string;
  };
}

interface TodaySummary {
  totalEmployees: number;
  present: number;
  absent: number;
  late: number;
  onTime: number;
  checkedOut: number;
  stillWorking: number;
}

interface TodayResponse {
  date: string;
  summary: TodaySummary;
  records: any[];
}

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const PAGE_SIZE = 20;

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchTodaySummary();
      fetchRecords();
    }
  }, [currentUser, currentPage, statusFilter]);

  const fetchCurrentUser = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.user);
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  };

  const fetchTodaySummary = async () => {
    setSummaryLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/attendance/today', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data: TodayResponse = await response.json();
        setTodaySummary(data.summary);
      }
    } catch (error) {
      console.error('Error fetching today summary:', error);
    } finally {
      setSummaryLoading(false);
    }
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(currentPage * PAGE_SIZE),
      });

      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const response = await fetch(`/api/attendance?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setRecords(data);
      }
    } catch (error) {
      console.error('Error fetching attendance records:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchTodaySummary(), fetchRecords()]);
    setRefreshing(false);
    toast.success('Attendance data refreshed');
  };

  const isAdmin = currentUser && hasFullAccess(currentUser.role as UserRole);

  const filteredRecords = records.filter((record) => {
    const searchLower = search.toLowerCase();
    const matchesSearch =
      record.employee?.firstName?.toLowerCase().includes(searchLower) ||
      record.employee?.lastName?.toLowerCase().includes(searchLower) ||
      record.employee?.email?.toLowerCase().includes(searchLower) ||
      record.employee?.department?.toLowerCase().includes(searchLower) ||
      record.date.includes(searchLower);

    const matchesMethod = methodFilter === 'all' || record.checkInMethod === methodFilter;

    return matchesSearch && matchesMethod;
  });

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return isoString;
    }
  };

  const formatDuration = (minutes: number | null) => {
    if (minutes === null || minutes === undefined) return '—';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs === 0) return `${mins}m`;
    return `${hrs}h ${mins}m`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'present':
        return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800">Present</Badge>;
      case 'late':
        return <Badge className="bg-amber-500/15 text-amber-700 border-amber-200 dark:text-amber-400 dark:border-amber-800">Late</Badge>;
      case 'absent':
        return <Badge variant="destructive">Absent</Badge>;
      case 'half_day':
        return <Badge className="bg-blue-500/15 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800">Half Day</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMethodBadge = (method: string) => {
    switch (method) {
      case 'nfc':
        return <Badge variant="outline" className="bg-violet-500/10 text-violet-700 border-violet-200 dark:text-violet-400 dark:border-violet-800"><Fingerprint className="h-3 w-3 mr-1" />NFC</Badge>;
      case 'manual':
        return <Badge variant="outline" className="bg-slate-500/10 text-slate-700 border-slate-200 dark:text-slate-400 dark:border-slate-800">Manual</Badge>;
      case 'legacy':
        return <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-200 dark:text-orange-400 dark:border-orange-800"><Clock className="h-3 w-3 mr-1" />Legacy CMS</Badge>;
      default:
        return <Badge variant="outline">{method}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Attendance</h2>
          <p className="text-muted-foreground">
            {isAdmin ? 'Monitor employee attendance and NFC check-ins' : 'View your attendance records'}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {isAdmin && (
        summaryLoading ? (
          <StatsSkeleton />
        ) : todaySummary ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{todaySummary.totalEmployees}</div>
                <p className="text-xs text-muted-foreground">Active workforce</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Present Today</CardTitle>
                <UserCheck className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">{todaySummary.present}</div>
                <p className="text-xs text-muted-foreground">
                  {todaySummary.onTime} on time · {todaySummary.late} late
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Absent Today</CardTitle>
                <UserX className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{todaySummary.absent}</div>
                <p className="text-xs text-muted-foreground">
                  {todaySummary.totalEmployees > 0
                    ? `${Math.round((todaySummary.absent / todaySummary.totalEmployees) * 100)}% absence rate`
                    : 'No employees'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Still Working</CardTitle>
                <Clock className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{todaySummary.stillWorking}</div>
                <p className="text-xs text-muted-foreground">
                  {todaySummary.checkedOut} checked out
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null
      )}

      {/* Attendance Records Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Attendance Records</CardTitle>
              <CardDescription>
                {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''} found
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-56">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="attendance-search"
                  placeholder="Search name, dept..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(0); }}>
                <SelectTrigger className="w-[130px]" id="status-filter">
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="half_day">Half Day</SelectItem>
                </SelectContent>
              </Select>
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger className="w-[130px]" id="method-filter">
                  <SelectValue placeholder="Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="nfc">NFC</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="legacy">Legacy CMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <InlineTableSkeleton rows={8} columns={7} />
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-12">
              <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No attendance records</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {search || statusFilter !== 'all' || methodFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Attendance records will appear here once employees check in'}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                            {record.employee?.firstName?.[0]}{record.employee?.lastName?.[0]}
                          </div>
                          <div>
                            <div className="font-medium text-sm">
                              {record.employee?.firstName} {record.employee?.lastName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {record.employee?.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{record.employee?.department || '—'}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(record.date).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell className="text-sm font-mono">{formatTime(record.timeIn)}</TableCell>
                      <TableCell className="text-sm font-mono">{formatTime(record.timeOut)}</TableCell>
                      <TableCell className="text-sm">{formatDuration(record.duration)}</TableCell>
                      <TableCell>{getStatusBadge(record.status)}</TableCell>
                      <TableCell>{getMethodBadge(record.checkInMethod)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Page {currentPage + 1}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => p + 1)}
                    disabled={records.length < PAGE_SIZE}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
