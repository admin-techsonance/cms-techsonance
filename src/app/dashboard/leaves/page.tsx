'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Calendar, CalendarDays, Flag, Plus, Eye, ChevronLeft, ChevronRight, Check, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { LeaveRequestDialog } from '@/components/dashboard/LeaveRequestDialog';
import { hasPermission } from '@/lib/permissions';
import { PageHeaderSkeleton, MetricCardGridSkeleton, TabsSkeleton } from '@/components/ui/dashboard-skeleton';

interface LeaveRequest {
  id: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  createdAt: string;
  employeeId: number;
}

interface CompanyHoliday {
  id: number;
  date: string;
  reason: string;
  year: number;
}

interface AuthUser {
  id: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
}

interface EmployeeData {
  id: number;
  userId?: number | null;
  employeeId?: string | null;
  department?: string | null;
  designation?: string | null;
  dateOfJoining?: string | null;
  status?: string | null;
  avatarUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

const formatDisplayDate = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatDateOrdinal = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  const day = date.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  const formatted = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${formatted.replace(String(day), `${day}${suffix}`)}`;
};

const getLeaveStatusBadge = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === 'approved') return <Badge className="bg-emerald-100 text-emerald-700">Approved</Badge>;
  if (normalized === 'rejected') return <Badge className="bg-rose-100 text-rose-700">Rejected</Badge>;
  if (normalized === 'pending') return <Badge className="bg-sky-100 text-sky-700">Pending</Badge>;
  return <Badge className="bg-secondary text-secondary-foreground">{status}</Badge>;
};

const years = [new Date().getFullYear(), new Date().getFullYear() + 1, new Date().getFullYear() - 1];
const PAGE_SIZE = 20;

export default function LeavesPage() {
  const [activeTab, setActiveTab] = useState('leave');
  const [loading, setLoading] = useState(true);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [holidayYear, setHolidayYear] = useState(new Date().getFullYear());
  const [showDialog, setShowDialog] = useState(false);
  const [viewingLeave, setViewingLeave] = useState<LeaveRequest | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [employeeData, setEmployeeData] = useState<EmployeeData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Admin states
  const [allLeaveRequests, setAllLeaveRequests] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [leavePage, setLeavePage] = useState(0);
  const [personalLeavePage, setPersonalLeavePage] = useState(0);
  const [holidayPage, setHolidayPage] = useState(0);
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [adminLeaveStatusFilter, setAdminLeaveStatusFilter] = useState('all');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('all');
  const [approvingLeave, setApprovingLeave] = useState<LeaveRequest | null>(null);
  const [rejectingLeave, setRejectingLeave] = useState<LeaveRequest | null>(null);
  const [deletingLeave, setDeletingLeave] = useState<LeaveRequest | null>(null);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchEmployeeData();
      if (isFullAccessUser) {
        fetchAllLeaveRequests();
      }
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchLeaveRequests();
      fetchCompanyHolidays();
    }
  }, [user, employeeData, statusFilter, holidayYear]);

  const isFullAccessUser = user && ['admin', 'cms_administrator', 'hr_manager', 'project_manager', 'management'].includes(user.role);
  const canApproveLeaves = user && hasPermission(user.role, 'myAccount', 'canApprove');
  const canDeleteRecords = user && hasPermission(user.role, 'myAccount', 'canDelete');

  const fetchCurrentUser = async () => {
    const token = localStorage.getItem('session_token');
    if (!token) return;

    const response = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      toast.error('Unable to load user profile');
      return;
    }

    const data = await response.json();
    setUser(data?.user ?? data?.data ?? null);
  };

  const fetchEmployeeData = async () => {
    const token = localStorage.getItem('session_token');
    if (!token || !user) return;

    const response = await fetch(`/api/employees?userId=${user.id}&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      toast.error('Unable to load employee profile');
      return;
    }

    const json = await response.json();
    const emps = Array.isArray(json) ? json : json?.data ?? [];
    const currentEmployee = emps[0];

    if (currentEmployee) {
      setEmployeeData({
        id: currentEmployee.id,
        userId: currentEmployee.userId ?? null,
        employeeId: currentEmployee.employeeId ?? null,
        department: currentEmployee.department ?? null,
        designation: currentEmployee.designation ?? null,
        dateOfJoining: currentEmployee.dateOfJoining ?? null,
        status: currentEmployee.status ?? null,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        avatarUrl: user.avatarUrl ?? null,
      });
    }

    // Fetch all employees and users for admin mapping
    if (['admin', 'cms_administrator', 'hr_manager', 'project_manager'].includes(user.role)) {
      const empRes = await fetch('/api/employees?limit=1000', { headers: { Authorization: `Bearer ${token}` } });
      const usrRes = await fetch('/api/users?limit=1000', { headers: { Authorization: `Bearer ${token}` } });
      if (empRes.ok) {
        const empJson = await empRes.json();
        setEmployees(Array.isArray(empJson) ? empJson : empJson?.data ?? []);
      }
      if (usrRes.ok) {
        const usrJson = await usrRes.json();
        setUsers(Array.isArray(usrJson) ? usrJson : usrJson?.data ?? []);
      }
    }
  };

  const fetchAllLeaveRequests = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/leave-requests?limit=1000', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const json = await response.json();
        setAllLeaveRequests(Array.isArray(json) ? json : json?.data ?? []);
      }
    } catch {}
  };

  const fetchLeaveRequests = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      if (!token) return;

      let url = '/api/leave-requests?limit=100';
      if (employeeData?.id) {
        url += `&employeeId=${employeeData.id}`;
      }
      if (statusFilter !== 'all') {
        url += `&status=${encodeURIComponent(statusFilter)}`;
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        toast.error('Failed to load leave requests');
        return;
      }

      const json = await response.json();
      const leaveList = Array.isArray(json) ? json : json?.data ?? [];
      setLeaveRequests(leaveList);
    } catch (error) {
      console.error(error);
      toast.error('Unable to fetch leave requests');
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanyHolidays = async () => {
    try {
      const token = localStorage.getItem('session_token');
      if (!token) return;

      const response = await fetch(`/api/company-holidays?year=${holidayYear}&limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        toast.error('Failed to load company holidays');
        return;
      }

      const json = await response.json();
      const holidayList = Array.isArray(json) ? json : json?.data ?? [];
      setHolidays(holidayList);
    } catch (error) {
      console.error(error);
      toast.error('Unable to fetch company holidays');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchLeaveRequests(), fetchCompanyHolidays(), isFullAccessUser && fetchAllLeaveRequests()]);
      toast.success('Leave and holiday data refreshed');
    } catch {
      toast.error('Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  const updateLeaveStatus = async (id: number, status: string, isApproval: boolean) => {
    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });

      if (!res.ok) throw new Error('Update failed');
      toast.success(`Leave request ${isApproval ? 'approved' : 'rejected'}`);
      fetchAllLeaveRequests();
      setApprovingLeave(null);
      setRejectingLeave(null);
    } catch {
      toast.error('Failed to update leave request');
    }
  };

  const handleLeaveDelete = async (id: number) => {
    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Deletion failed');
      toast.success('Leave request deleted');
      fetchAllLeaveRequests();
      setDeletingLeave(null);
    } catch {
      toast.error('Failed to delete leave request');
    }
  };

  const getEmployeeName = (employeeId: number) => {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return 'Unknown';
    const usr = users.find(u => Number(u.id) === emp.userId || u.id === String(emp.userId));
    return usr ? `${usr.firstName} ${usr.lastName}` : 'Unknown';
  };

  const leaveCount = useMemo(() => leaveRequests.length, [leaveRequests]);

  const filteredAllLeaveRequests = allLeaveRequests.filter((leave) => {
    if (selectedEmployeeFilter !== 'all' && leave.employeeId !== Number(selectedEmployeeFilter)) return false;
    if (adminLeaveStatusFilter !== 'all' && leave.status !== adminLeaveStatusFilter) return false;
    if (leaveStartDate && new Date(leave.startDate) < new Date(leaveStartDate)) return false;
    if (leaveEndDate && new Date(leave.endDate) > new Date(leaveEndDate)) return false;
    return true;
  });

  if (loading || !user) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <MetricCardGridSkeleton count={4} />
        <div className="mt-8">
          <TabsSkeleton count={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Leaves & Holidays</h2>
          <p className="text-muted-foreground">Manage time-off requests and view company calendar</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowDialog(true)}>
            <Plus className="mr-2 h-4 w-4" /> Apply Leave
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="grid gap-4 lg:grid-cols-[1.75fr_1fr] p-6">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Employee</p>
            <p className="text-2xl font-semibold">{user ? `${user.firstName} ${user.lastName}` : 'Employee details'}</p>
            <p className="text-sm text-muted-foreground">
              {employeeData?.designation ? `${employeeData.designation} • ${employeeData.department ?? 'No department'}` : 'Employee record not available yet.'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Employee ID</p>
              <p className="mt-2 text-base font-semibold">{employeeData?.employeeId ?? 'N/A'}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Joined</p>
              <p className="mt-2 text-base font-semibold">{formatDisplayDate(employeeData?.dateOfJoining)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="rounded-full bg-muted/50 p-1">
          {isFullAccessUser && (
            <TabsTrigger value="all-leaves" className="rounded-full px-4 py-2">
              All Leaves
            </TabsTrigger>
          )}
          <TabsTrigger value="leave" className="rounded-full px-4 py-2">
            My Leaves
          </TabsTrigger>
          <TabsTrigger value="holidays" className="rounded-full px-4 py-2">
            Company Holidays
          </TabsTrigger>
        </TabsList>

        {isFullAccessUser && (
          <TabsContent value="all-leaves">
            <Card>
              <CardHeader>
                <CardTitle>All Employee Leave Requests</CardTitle>
                <CardDescription>View, approve, reject, and manage all employee leave requests</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Employee</Label>
                    <Select value={selectedEmployeeFilter} onValueChange={setSelectedEmployeeFilter}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Employees</SelectItem>
                        {employees.map(emp => (
                          <SelectItem key={emp.id} value={emp.id.toString()}>
                            {getEmployeeName(emp.id)} ({emp.employeeId})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Leave Status</Label>
                    <Select value={adminLeaveStatusFilter} onValueChange={setAdminLeaveStatusFilter}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>From Date</Label>
                    <Input type="date" value={leaveStartDate} onChange={(e) => setLeaveStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>To Date</Label>
                    <Input type="date" value={leaveEndDate} onChange={(e) => setLeaveEndDate(e.target.value)} />
                  </div>
                </div>

                <div className="max-h-[600px] overflow-y-auto rounded-md border text-[13px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>From Date</TableHead>
                        <TableHead>To Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></TableCell></TableRow>
                      ) : filteredAllLeaveRequests.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No leave requests found</TableCell>
                        </TableRow>
                      ) : (
                        filteredAllLeaveRequests.slice(leavePage * PAGE_SIZE, (leavePage + 1) * PAGE_SIZE).map((leave) => (
                          <TableRow key={leave.id}>
                            <TableCell className="font-medium">{getEmployeeName(leave.employeeId)}</TableCell>
                            <TableCell className="capitalize">{leave.leaveType.replace(/_/g, ' ')}</TableCell>
                            <TableCell className="whitespace-nowrap">{formatDateOrdinal(leave.startDate)}</TableCell>
                            <TableCell className="whitespace-nowrap">{formatDateOrdinal(leave.endDate)}</TableCell>
                            <TableCell>{getLeaveStatusBadge(leave.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => setViewingLeave(leave)}><Eye className="h-4 w-4 text-blue-600" /></Button>
                                {canApproveLeaves && leave.status === 'pending' && (
                                  <>
                                    <Button variant="ghost" size="sm" onClick={() => setApprovingLeave(leave)}><Check className="h-4 w-4 text-green-600" /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => setRejectingLeave(leave)}><X className="h-4 w-4 text-red-600" /></Button>
                                  </>
                                )}
                                {canDeleteRecords && (
                                  <Button variant="ghost" size="sm" onClick={() => setDeletingLeave(leave)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                
                <div className="flex items-center justify-between space-x-2 py-4 border-t">
                  <div className="text-sm text-muted-foreground">Page {leavePage + 1}</div>
                  <div className="space-x-2">
                    <Button variant="outline" size="sm" onClick={() => setLeavePage(prev => Math.max(0, prev - 1))} disabled={leavePage === 0 || loading}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setLeavePage(prev => prev + 1)} disabled={filteredAllLeaveRequests.length <= (leavePage + 1) * PAGE_SIZE || loading}>
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="leave" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>My Leave History</CardTitle>
                  <CardDescription>View and manage your leave requests.</CardDescription>
                </div>

              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" placeholder="dd/mm/yyyy" disabled />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" placeholder="dd/mm/yyyy" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Leave Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button variant="outline" className="w-full" onClick={() => setStatusFilter('all')}>
                    Clear
                  </Button>
                </div>
              </div>

              <div className="max-h-[600px] overflow-y-auto rounded-xl border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>From Date</TableHead>
                      <TableHead>To Date</TableHead>
                      <TableHead>Applied On</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                        </TableCell>
                      </TableRow>
                    ) : leaveRequests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          No leave requests found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      leaveRequests.slice(personalLeavePage * PAGE_SIZE, (personalLeavePage + 1) * PAGE_SIZE).map((leave) => (
                        <TableRow key={leave.id}>
                          <TableCell className="font-medium capitalize">{leave.leaveType.replace(/_/g, ' ')}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDateOrdinal(leave.startDate)}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDateOrdinal(leave.endDate)}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDateOrdinal(leave.createdAt)}</TableCell>
                          <TableCell>{getLeaveStatusBadge(leave.status)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => setViewingLeave(leave)}>
                              <Eye className="h-4 w-4 text-blue-600" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Page {personalLeavePage + 1}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPersonalLeavePage(p => Math.max(0, p - 1))}
                    disabled={personalLeavePage === 0 || loading}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPersonalLeavePage(p => p + 1)}
                    disabled={leaveRequests.length <= (personalLeavePage + 1) * PAGE_SIZE || loading}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holidays">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Company Holidays</CardTitle>
                  <CardDescription>View company holidays and plan your time off.</CardDescription>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 sm:w-auto w-full">
                  <Select value={String(holidayYear)} onValueChange={(value) => setHolidayYear(Number(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((yearOption) => (
                        <SelectItem key={yearOption} value={String(yearOption)}>
                          {yearOption}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {holidays.length === 0 ? (
                <p className="text-sm text-muted-foreground">No holidays found for the selected year.</p>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                    {holidays.slice(holidayPage * PAGE_SIZE, (holidayPage + 1) * PAGE_SIZE).map((holiday) => (
                      <div key={holiday.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold">{holiday.reason}</p>
                            <p className="text-xs text-muted-foreground">{formatDisplayDate(holiday.date)}</p>
                          </div>
                          <Badge className="bg-primary/10 text-primary">{holiday.year}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      Page {holidayPage + 1}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHolidayPage(p => Math.max(0, p - 1))}
                        disabled={holidayPage === 0 || loading}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHolidayPage(p => p + 1)}
                        disabled={holidays.length <= (holidayPage + 1) * PAGE_SIZE || loading}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <LeaveRequestDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        employeeData={employeeData ?? { id: 0 }}
        userRole={user?.role ?? 'Employee'}
        onSuccess={() => {
          fetchLeaveRequests();
          if (isFullAccessUser) fetchAllLeaveRequests();
          setShowDialog(false);
        }}
      />

      <Dialog open={viewingLeave !== null} onOpenChange={() => setViewingLeave(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Calendar className="h-5 w-5 text-primary" />
              Leave Application
            </DialogTitle>
            <DialogDescription>Full details of the submitted leave request</DialogDescription>
          </DialogHeader>

          {viewingLeave && (
            <div className="space-y-6 py-6">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Leave Type</span>
                  <p className="font-semibold text-sm capitalize">{viewingLeave.leaveType.replace(/_/g, ' ')}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Status</span>
                  <div>{getLeaveStatusBadge(viewingLeave.status)}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Applied On</span>
                  <p className="font-medium text-xs text-muted-foreground">{formatDateOrdinal(viewingLeave.createdAt)}</p>
                </div>
              </div>

              <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="space-y-1">
                    <span className="text-[10px] text-primary/70 uppercase font-bold tracking-wider mb-1 block">From</span>
                    <p className="font-bold text-primary">{formatDateOrdinal(viewingLeave.startDate)}</p>
                  </div>
                  <div className="h-10 w-px bg-primary/20 mx-4" />
                  <div className="space-y-1 text-right">
                    <span className="text-[10px] text-primary/70 uppercase font-bold tracking-wider mb-1 block">To</span>
                    <p className="font-bold text-primary">{formatDateOrdinal(viewingLeave.endDate)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Reason for Leave</Label>
                <div className="p-4 bg-muted/30 rounded-xl border border-border/50 text-sm leading-relaxed whitespace-pre-wrap min-h-[100px] shadow-sm">
                  {viewingLeave.reason}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-4 border-t">
            <Button className="w-full sm:w-auto px-8" onClick={() => setViewingLeave(null)}>
              Close Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Action Dialogs */}
      <Dialog open={approvingLeave !== null} onOpenChange={() => setApprovingLeave(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Leave Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this {approvingLeave?.leaveType?.replace(/_/g, ' ')} for {approvingLeave ? getEmployeeName(approvingLeave.employeeId) : ''}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovingLeave(null)}>Cancel</Button>
            <Button onClick={() => approvingLeave && updateLeaveStatus(approvingLeave.id, 'approved', true)}>Approve Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectingLeave !== null} onOpenChange={() => setRejectingLeave(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Leave Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject this leave request? Needs to be justified to the employee.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingLeave(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectingLeave && updateLeaveStatus(rejectingLeave.id, 'rejected', false)}>Reject Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletingLeave !== null} onOpenChange={() => setDeletingLeave(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Leave Record</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the leave request.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingLeave(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingLeave && handleLeaveDelete(deletingLeave.id)}>Confirm Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}