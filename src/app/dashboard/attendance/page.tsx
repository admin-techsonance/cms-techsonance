'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Loader2, Calendar as CalendarIcon, Calendar, Clock, Eye, Edit, Trash2, Check, X, Users,
  Upload, Pencil, Fingerprint, RefreshCw, UserCheck, UserX, Search, Filter,
  ChevronLeft, ChevronRight, MoreHorizontal, Download, Info
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatsSkeleton, TableSkeleton, PageHeaderSkeleton, MetricCardGridSkeleton, TabsSkeleton } from '@/components/ui/dashboard-skeleton';
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
import { hasPermission, hasFullAccess, UserRole } from '@/lib/permissions';
import ReaderManagement from '@/components/dashboard/ReaderManagement';
import { LeaveRequestDialog } from '@/components/dashboard/LeaveRequestDialog';

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

interface Attendance {
  id: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  notes: string | null;
  employeeId: number;
  timeIn?: string | null;
  timeOut?: string | null;
  duration?: number | null;
  checkInMethod?: string;
  employee?: {
    firstName: string;
    lastName: string;
    email: string;
    department: string;
  };
  _source?: string;
}

interface CompanyHoliday {
  id: number;
  date: string;
  reason: string;
  year: number;
}

interface Employee {
  id: number;
  userId: number;
  employeeId: string;
  department: string;
  designation: string;
  status: string;
}

interface UserData {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

interface User {
  id: number;
  role: UserRole;
}

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDuration = (hoursDecimal: number, includeSign = true) => {
  const isNegative = hoursDecimal < 0;
  const absHours = Math.abs(hoursDecimal);
  const hours = Math.floor(absHours);
  const mins = Math.round((absHours - hours) * 60);

  let prefix = "";
  if (includeSign) {
    prefix = isNegative ? "- " : "+ ";
  }

  if (hours === 0) {
    return `${prefix}${mins} mins`;
  }

  if (mins === 0) {
    return `${prefix}${hours} hrs`;
  }

  return `${prefix}${hours} hrs ${mins} mins`;
};

export default function AttendancePage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState('leave');
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [employeeData, setEmployeeData] = useState<any>(null);

  // Admin-specific state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [allLeaveRequests, setAllLeaveRequests] = useState<LeaveRequest[]>([]);
  const [allAttendance, setAllAttendance] = useState<Attendance[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [todaySummary, setTodaySummary] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [leavePage, setLeavePage] = useState(0);
  const [attendancePage, setAttendancePage] = useState(0);
  const PAGE_SIZE = 20;
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('all');
  const [adminLeaveStatusFilter, setAdminLeaveStatusFilter] = useState('all');
  const [deletingLeave, setDeletingLeave] = useState<LeaveRequest | null>(null);
  const [approvingLeave, setApprovingLeave] = useState<LeaveRequest | null>(null);
  const [rejectingLeave, setRejectingLeave] = useState<LeaveRequest | null>(null);
  const [viewingLeave, setViewingLeave] = useState<LeaveRequest | null>(null);
  const [deletingAttendance, setDeletingAttendance] = useState<Attendance | null>(null);

  // Pagination for Personal View
  const [personalLeavePage, setPersonalLeavePage] = useState(0);
  const [personalAttendancePage, setPersonalAttendancePage] = useState(0);

  // Leave filters
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('all');

  // Attendance filters
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [attendanceStartDate, setAttendanceStartDate] = useState('');
  const [attendanceEndDate, setAttendanceEndDate] = useState('');

  // Holiday filter
  const [holidayYear, setHolidayYear] = useState(new Date().getFullYear());

  // Leave application form
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leaveStatus: 'full_day',
    leaveType: 'sick',
    fromDate: '',
    toDate: '',
    reason: '',
  });

  // Attendance time tracking
  const [showAttendanceDialog, setShowAttendanceDialog] = useState(false);
  const [attendanceForm, setAttendanceForm] = useState({
    employeeId: '',
    date: formatLocalDate(new Date()),
    timeIn: '',
    timeOut: '',
    notes: '',
  });




  // Bulk Upload
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Attendance
  const [editingAttendance, setEditingAttendance] = useState<any>(null);
  const [editAttendanceForm, setEditAttendanceForm] = useState({
    timeIn: '',
    timeOut: '',
    status: '',
    notes: '',
  });

  // Holiday management
  const [showHolidayDialog, setShowHolidayDialog] = useState(false);
  const [holidayForm, setHolidayForm] = useState({
    date: '',
    reason: '',
  });

  // Advanced Attendance Settings
  const [attendanceSettings, setAttendanceSettings] = useState({
    office_latitude: '',
    office_longitude: '',
    geofence_radius_meters: 500,
    allowed_ips: '',
    standard_work_hours: 9.0
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    } else if (currentUser) {
      // Strictly separate Admin Hub from Manager/Employee Personal View
      const isAdminHubRole = hasFullAccess(currentUser.role as UserRole);
      setActiveTab(isAdminHubRole ? 'all-attendance' : 'attendance');
    }
  }, [initialTab, currentUser]);
  useEffect(() => {
    if (currentUser) {
      if (hasFullAccess(currentUser.role as UserRole)) {
        fetchEmployees();
        fetchAllLeaveRequests();
        fetchAllAttendance();
        fetchPendingRequests();
        fetchSettings();
      }

      if (employeeId) {
        fetchLeaveRequests();
        fetchAttendance();
      }
    }
  }, [
    currentUser,
    employeeId,
    selectedEmployeeFilter,
    adminLeaveStatusFilter,
    selectedMonth,
    selectedYear,
    attendanceStartDate,
    attendanceEndDate,
    leaveStartDate,
    leaveEndDate,
    leavePage,
    attendancePage,
    personalLeavePage,
    personalAttendancePage
  ]);

  useEffect(() => {
    if (employeeId && activeTab === 'leave') {
      const timer = setTimeout(() => {
        fetchLeaveRequests();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [leaveStartDate, leaveEndDate, leaveStatusFilter, employeeId]);

  useEffect(() => {
    fetchHolidays();
  }, [holidayYear]);

  useEffect(() => {
    setLeavePage(0);
    setAttendancePage(0);
  }, [selectedEmployeeFilter, adminLeaveStatusFilter, selectedMonth, selectedYear]);

  useEffect(() => {
    if (currentUser && hasFullAccess(currentUser.role)) {
      fetchTodaySummary();
    }
  }, [currentUser]);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch('/api/attendance/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAttendanceSettings({
          office_latitude: data.office_latitude || '',
          office_longitude: data.office_longitude || '',
          geofence_radius_meters: data.geofence_radius_meters || 500,
          allowed_ips: data.allowed_ips || '',
          standard_work_hours: data.standard_work_hours || 9.0
        });
      }
    } catch (e) { console.error('Failed to load settings', e); }
  };

  const saveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch('/api/attendance/settings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...attendanceSettings,
          office_latitude: attendanceSettings.office_latitude ? parseFloat(String(attendanceSettings.office_latitude)) : null,
          office_longitude: attendanceSettings.office_longitude ? parseFloat(String(attendanceSettings.office_longitude)) : null,
          geofence_radius_meters: parseInt(String(attendanceSettings.geofence_radius_meters)),
          standard_work_hours: parseFloat(String(attendanceSettings.standard_work_hours))
        })
      });
      if (!res.ok) throw new Error();
      toast.success('Settings updated successfully');
    } catch {
      toast.error('Failed to update Settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch('/api/attendance/requests', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch pending requests');
      const data = await res.json();
      setPendingRequests(data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleApproveRejectRequest = async (id: number, action: 'approve' | 'reject', index: number) => {
    try {
      const token = localStorage.getItem('session_token');
      const reason = action === 'reject' ? prompt('Reason for rejection:') : undefined;
      
      if (action === 'reject' && reason === null) return; // cancelled

      const res = await fetch('/api/attendance/requests', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, rejection_reason: reason })
      });
      if (!res.ok) throw new Error('Failed to process request');
      toast.success(`Request ${action}d successfully`);
      
      const updated = [...pendingRequests];
      updated.splice(index, 1);
      setPendingRequests(updated);

      if (action === 'approve') {
        fetchAllAttendance(); // Refresh table
      }
    } catch (error) {
      toast.error(`Failed to ${action} request`);
    }
  };

  const fetchCurrentUser = async () => {
    try {
      const token = localStorage.getItem('session_token');

      if (!token) {
        console.error('No authentication token found');
        setIsLoadingUser(false);
        return;
      }

      const meResponse = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (meResponse.ok) {
        const meData = await meResponse.json();
        setCurrentUser(meData.user);

        // Get employee record for all users (to support personal attendance/leave views)
        {
          const employeeResponse = await fetch(`/api/employees?userId=${meData.user.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (employeeResponse.ok) {
            const employees = await employeeResponse.json();
            if (employees && employees.length > 0) {
              setEmployeeId(employees[0].id);
              setEmployeeData({
                ...employees[0],
                firstName: meData.user.firstName,
                lastName: meData.user.lastName,
                avatarUrl: meData.user.avatarUrl
              });
            } else if (!hasFullAccess(meData.user.role as UserRole)) {
              toast.error('Employee record not found. Please contact admin.');
            }
          }
        }
      } else if (meResponse.status === 401) {
        // Token might be invalid, handle accordingly
        console.error('Unauthorized session');
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
      toast.error('Failed to load user information');
    } finally {
      setIsLoadingUser(false);
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

        // Fetch user details for all employees
        const userIds = data.map((emp: Employee) => emp.userId);
        if (userIds.length > 0) {
          const usersResponse = await fetch('/api/users?limit=100', {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (usersResponse.ok) {
            const usersData = await usersResponse.json();
            setUsers(usersData);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchAllLeaveRequests = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      let url = `/api/leave-requests?limit=${PAGE_SIZE}&offset=${leavePage * PAGE_SIZE}`;

      if (selectedEmployeeFilter !== 'all') url += `&employee_id=${selectedEmployeeFilter}`;
      if (adminLeaveStatusFilter !== 'all') url += `&status=${adminLeaveStatusFilter}`;
      if (leaveStartDate) url += `&startDate=${leaveStartDate}`;
      if (leaveEndDate) url += `&endDate=${leaveEndDate}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setAllLeaveRequests(data);
      }
    } catch (error) {
      console.error('Error fetching all leave requests:', error);
    } finally {
      setLoading(false);
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
        const data = await response.json();
        setTodaySummary(data.summary);
      }
    } catch (error) {
      console.error('Error fetching today summary:', error);
    } finally {
      setSummaryLoading(false);
    }
  };

  const fetchAllAttendance = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');

      let startDate = formatLocalDate(new Date(selectedYear, selectedMonth - 1, 1));
      let endDate = formatLocalDate(new Date(selectedYear, selectedMonth, 0));

      if (attendanceStartDate) startDate = attendanceStartDate;
      if (attendanceEndDate) endDate = attendanceEndDate;

      let url = `/api/attendance?start_date=${startDate}&end_date=${endDate}&limit=${PAGE_SIZE}&offset=${attendancePage * PAGE_SIZE}`;

      if (selectedEmployeeFilter !== 'all') url += `&employee_id=${selectedEmployeeFilter}`;
      if (methodFilter !== 'all') url += `&source=${methodFilter}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setAllAttendance(data);
      }
    } catch (error) {
      console.error('Error fetching all attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAttendanceRefresh = async () => {
    setRefreshing(true);
    try {
      const token = localStorage.getItem('session_token');
      // Trigger Firebase sync first
      await fetch('/api/firebase/poll', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      // Then refresh the UI data
      await Promise.all([fetchTodaySummary(), fetchAllAttendance()]);
      toast.success('Attendance data synced with Firebase');
    } catch (error) {
      console.error('Refresh error:', error);
      toast.error('Failed to sync with Firebase');
    } finally {
      setRefreshing(false);
    }
  };

  const fetchLeaveRequests = async () => {
    try {
      const token = localStorage.getItem('session_token');

      if (!token || !employeeId) {
        return;
      }

      let url = `/api/leave-requests?employeeId=${employeeId}&limit=${PAGE_SIZE}&offset=${personalLeavePage * PAGE_SIZE}`;

      if (leaveStartDate) url += `&startDate=${leaveStartDate}`;
      if (leaveEndDate) url += `&endDate=${leaveEndDate}`;
      if (leaveStatusFilter !== 'all') url += `&status=${leaveStatusFilter}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setLeaveRequests(data);
      }
    } catch (error) {
      console.error('Error fetching leave requests:', error);
    }
  };

  const fetchAttendance = async () => {
    try {
      const token = localStorage.getItem('session_token');

      if (!token || !employeeId) {
        return;
      }

      let startDate = formatLocalDate(new Date(selectedYear, selectedMonth - 1, 1));
      let endDate = formatLocalDate(new Date(selectedYear, selectedMonth, 0));

      if (attendanceStartDate) startDate = attendanceStartDate;
      if (attendanceEndDate) endDate = attendanceEndDate;

      const response = await fetch(
        `/api/attendance?employee_id=${employeeId}&start_date=${startDate}&end_date=${endDate}&limit=${PAGE_SIZE}&offset=${personalAttendancePage * PAGE_SIZE}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setAttendance(data);
      }
    } catch (error) {
      console.error('Error fetching attendance:', error);
    }
  };

  const fetchHolidays = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/company-holidays?year=${holidayYear}&limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setHolidays(data);
      }
    } catch (error) {
      console.error('Error fetching holidays:', error);
    }
  };

  const handleApproveLeave = async () => {
    if (!approvingLeave) return;

    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/leave-requests?id=${approvingLeave.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'approved' }),
      });

      if (response.ok) {
        toast.success('Leave request approved successfully!');
        fetchAllLeaveRequests();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to approve leave request');
      }
    } catch (error) {
      console.error('Error approving leave:', error);
      toast.error('An error occurred while approving leave request');
    } finally {
      setApprovingLeave(null);
    }
  };

  const handleRejectLeave = async () => {
    if (!rejectingLeave) return;

    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/leave-requests?id=${rejectingLeave.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'rejected' }),
      });

      if (response.ok) {
        toast.success('Leave request rejected');
        fetchAllLeaveRequests();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to reject leave request');
      }
    } catch (error) {
      console.error('Error rejecting leave:', error);
      toast.error('An error occurred while rejecting leave request');
    } finally {
      setRejectingLeave(null);
    }
  };

  const handleDeleteLeave = async () => {
    if (!deletingLeave) return;

    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/leave-requests?id=${deletingLeave.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('Leave request deleted successfully!');
        fetchAllLeaveRequests();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete leave request');
      }
    } catch (error) {
      console.error('Error deleting leave:', error);
      toast.error('An error occurred while deleting leave request');
    } finally {
      setDeletingLeave(null);
    }
  };

  const handleDeleteAttendance = async () => {
    if (!deletingAttendance) return;

    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/attendance?id=${deletingAttendance.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('Attendance record deleted successfully!');
        fetchAllAttendance();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete attendance record');
      }
    } catch (error) {
      console.error('Error deleting attendance:', error);
      toast.error('An error occurred while deleting attendance record');
    } finally {
      setDeletingAttendance(null);
    }
  };

  const handleLeaveSubmit = async () => {
    // Validate required fields
    if (!leaveForm.fromDate) {
      toast.error('Please select start date');
      return;
    }

    if (!leaveForm.toDate) {
      toast.error('Please select end date');
      return;
    }

    if (!leaveForm.reason || leaveForm.reason.trim() === '') {
      toast.error('Please provide a reason for leave');
      return;
    }

    if (leaveForm.reason.trim().length < 10) {
      toast.error('Reason must be at least 10 characters long');
      return;
    }

    if (!employeeId) {
      toast.error('Employee record not found. Please contact admin.');
      return;
    }

    // Add date validation
    const fromDate = new Date(leaveForm.fromDate);
    const toDate = new Date(leaveForm.toDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (toDate < fromDate) {
      toast.error('End date must be after or equal to start date');
      return;
    }

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (fromDate < sevenDaysAgo) {
      toast.error('Cannot apply leave for dates more than 7 days in the past');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');

      if (!token) {
        toast.error('Authentication token not found. Please log in again.');
        setLoading(false);
        return;
      }

      const payload = {
        employeeId: employeeId,
        leaveType: leaveForm.leaveType,
        startDate: leaveForm.fromDate,
        endDate: leaveForm.toDate,
        reason: leaveForm.reason.trim(),
      };

      const response = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();

      if (response.ok) {
        toast.success('Leave application submitted successfully!');
        setShowLeaveDialog(false);
        setLeaveForm({
          leaveStatus: 'full_day',
          leaveType: 'sick',
          fromDate: '',
          toDate: '',
          reason: '',
        });
        fetchLeaveRequests();
        if (isFullAccessUser) {
          fetchAllLeaveRequests();
          fetchTodaySummary();
        }
      } else {
        toast.error(responseData.error || 'Failed to submit leave application');
      }
    } catch (error) {
      console.error('Error submitting leave:', error);
      toast.error('An error occurred while submitting leave application');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a valid CSV file');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/attendance/bulk-import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`Import complete! Processed: ${data.processed}`);
        if (data.errors && data.errors.length > 0) {
          toast.warning(`Some errors occurred: ${data.errors.length} rows failed.`);
          console.warn('Import errors:', data.errors);
        }
        fetchAllAttendance();
      } else {
        toast.error(data.error || 'Failed to import attendance');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Error uploading file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleEditAttendance = (record: any) => {
    setEditingAttendance(record);

    // Support both new timeIn/timeOut and legacy checkIn/checkOut
    const rawIn = record.timeIn || record.checkIn;
    const rawOut = record.timeOut || record.checkOut;

    const checkIn = rawIn ? new Date(rawIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    const checkOut = rawOut ? new Date(rawOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

    setEditAttendanceForm({
      timeIn: checkIn,
      timeOut: checkOut,
      status: record.status,
      notes: record.notes || '',
    });
  };

  const handleUpdateAttendance = async () => {
    if (!editingAttendance) return;

    setLoading(true);
    try {
      // Calculate new checkIn/checkOut ISO strings based on the date of the record
      const dateStr = editingAttendance.date.split('T')[0];
      let checkInISO = editingAttendance.checkIn;
      let checkOutISO = editingAttendance.checkOut;

      if (editAttendanceForm.timeIn) {
        // Create Date object from YYYY-MM-DD and HH:MM
        // We need the date part from the record
        const [hours, minutes] = editAttendanceForm.timeIn.split(':');

        // Assuming dateStr is valid
        // Construct ISO date string directly? 
        // Safest is to leverage Date object setHours/Minutes
        const d = new Date(editingAttendance.date);
        d.setHours(parseInt(hours), parseInt(minutes));
        checkInISO = d.toISOString();
      } else {
        checkInISO = null;
      }

      if (editAttendanceForm.timeOut) {
        const [hours, minutes] = editAttendanceForm.timeOut.split(':');
        const d = new Date(editingAttendance.date);
        d.setHours(parseInt(hours), parseInt(minutes));
        checkOutISO = d.toISOString();
      } else {
        checkOutISO = null;
      }

      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/attendance?id=${editingAttendance.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          checkIn: checkInISO,
          checkOut: checkOutISO,
          status: editAttendanceForm.status,
          notes: editAttendanceForm.notes,
        }),
      });

      if (response.ok) {
        toast.success('Attendance updated successfully');
        setEditingAttendance(null);
        fetchAllAttendance();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update attendance');
      }
    } catch (error) {
      console.error('Update error:', error);
      toast.error('Error updating attendance');
    } finally {
      setLoading(false);
    }
  }




  const handleAddHoliday = async () => {
    if (!holidayForm.date) {
      toast.error('Please select a date');
      return;
    }

    if (!holidayForm.reason || holidayForm.reason.trim() === '') {
      toast.error('Please provide a reason');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');

      const response = await fetch('/api/company-holidays', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: holidayForm.date,
          reason: holidayForm.reason.trim(),
        }),
      });

      if (response.ok) {
        toast.success('Holiday added successfully!');
        setShowHolidayDialog(false);
        setHolidayForm({ date: '', reason: '' });
        fetchHolidays();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to add holiday');
      }
    } catch (error) {
      console.error('Error adding holiday:', error);
      toast.error('An error occurred while adding holiday');
    } finally {
      setLoading(false);
    }
  };

  const handleAttendanceSubmit = async () => {
    if (!attendanceForm.date) {
      toast.error('Please select a date');
      return;
    }

    if (!attendanceForm.timeIn || !attendanceForm.timeOut) {
      toast.error('Please provide both time in and time out');
      return;
    }

    // For non-admin users, use their own employee ID
    const targetEmployeeId = isFullAccessUser && attendanceForm.employeeId
      ? parseInt(attendanceForm.employeeId)
      : employeeId;

    if (!targetEmployeeId) {
      toast.error('Employee ID not found');
      return;
    }

    // Weekend Notes Validation
    const selectedDate = new Date(attendanceForm.date);
    const dayOfWeek = selectedDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // 0 is Sunday, 6 is Saturday
    
    if (isWeekend && (!attendanceForm.notes || attendanceForm.notes.trim() === '')) {
      toast.error('Notes are mandatory when logging attendance on a weekend');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');

      // Create local Date objects and convert to ISO strings for the API
      // This ensures the local time (e.g. IST) explicitly selected by the user is accurately offset to UTC
      const checkInISO = new Date(`${attendanceForm.date}T${attendanceForm.timeIn}:00`).toISOString();
      const checkOutISO = new Date(`${attendanceForm.date}T${attendanceForm.timeOut}:00`).toISOString();

      // Calculate work hours (deduct 1 hour for lunch)
      const inTime = new Date(checkInISO).getTime();
      const outTime = new Date(checkOutISO).getTime();
      const totalHours = (outTime - inTime) / (1000 * 60 * 60);
      const workHours = totalHours > 4 ? totalHours - 1 : totalHours; // Deduct lunch if > 4 hours

      // Determine status
      let status = 'present';
      if (workHours <= 0) {
        toast.error('Time out must be after time in');
        setLoading(false);
        return;
      } else if (workHours < 6) {
        status = 'half_day';
      }

      // Capture browser geolocation for geofence validation
      let locationLatitude: number | null = null;
      let locationLongitude: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        locationLatitude = pos.coords.latitude;
        locationLongitude = pos.coords.longitude;
      } catch {
        // Location not available — proceed without it; server will skip geofence check
      }

      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeId: targetEmployeeId,
          date: attendanceForm.date,
          timeIn: checkInISO,
          timeOut: checkOutISO,
          status: status,
          checkInMethod: 'manual',
          notes: attendanceForm.notes,
          locationLatitude,
          locationLongitude,
        }),
      });

      if (response.ok) {
        if (response.status === 202) {
          toast.success('Attendance submitted! It is currently pending HR approval for the weekend.');
        } else {
          toast.success(`Attendance marked successfully! Status: ${status}, Work Hours: ${workHours.toFixed(2)}`);
        }
        setShowAttendanceDialog(false);
        setAttendanceForm({
          employeeId: '',
          date: formatLocalDate(new Date()),
          timeIn: '',
          timeOut: '',
          notes: '',
        });
        if (isFullAccessUser) {
          fetchAllAttendance();
        } else {
          fetchAttendance();
        }
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to mark attendance');
      }
    } catch (error) {
      console.error('Error submitting attendance:', error);
      toast.error('An error occurred while submitting attendance');
    } finally {
      setLoading(false);
    }
  };

  const formatDateOrdinal = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      // Handle ISO strings by taking only the date part
      const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
      const [y, m, d] = datePart.split('-').map(Number);
      const date = new Date(y, m - 1, d);

      const day = date.getDate();
      const month = date.toLocaleString('en-US', { month: 'short' });
      const year = date.getFullYear();
      const dayOfWeek = date.toLocaleString('en-US', { weekday: 'short' });

      const suffix = (day: number) => {
        if (day > 3 && day < 21) return 'th';
        switch (day % 10) {
          case 1: return "st";
          case 2: return "nd";
          case 3: return "rd";
          default: return "th";
        }
      };

      return `${dayOfWeek}, ${day}${suffix(day)} ${month} ${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  const getLeaveStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      'approved': 'default',
      'pending': 'secondary',
      'rejected': 'destructive',
      'cancelled': 'outline',
    };

    return <Badge variant={statusColors[status] as any}>{status}</Badge>;
  };

  const getEmployeeName = (employeeId: number) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return 'Unknown';

    const user = users.find(u => u.id === employee.userId);
    return user ? `${user.firstName} ${user.lastName}` : 'Unknown';
  };

  const getAttendanceStats = () => {
    const totalDaysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

    // Calculate working days in month (excluding weekends and public holidays)
    let workingDaysInMonth = 0;
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const date = new Date(selectedYear, selectedMonth - 1, day);
      const dateStr = formatLocalDate(date);
      const dayOfWeek = date.getDay();

      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = holidays.some(h => h.date === dateStr);

      if (!isWeekend && !isHoliday) {
        workingDaysInMonth++;
      }
    }

    const attendanceData = isFullAccessUser ? allAttendance : attendance;
    const presentDays = attendanceData.filter(a => a.status === 'present').length;
    const absentDays = attendanceData.filter(a => a.status === 'absent').length;
    const halfDays = attendanceData.filter(a => a.status === 'half_day').length;

    const holidaysInMonth = holidays.filter(h => {
      const holidayDate = new Date(h.date);
      return holidayDate.getMonth() + 1 === selectedMonth &&
        holidayDate.getFullYear() === selectedYear;
    }).length;

    // Process Leave Requests for accurate counting
    const currentMonthLeaves = (isFullAccessUser ? allLeaveRequests : leaveRequests).filter(lr => {
      const start = new Date(lr.startDate);
      const end = new Date(lr.endDate);
      const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
      const monthEnd = new Date(selectedYear, selectedMonth, 0);

      // Check for overlap with the current month
      return (start <= monthEnd && end >= monthStart);
    });

    const countWorkDaysInMonth = (lr: LeaveRequest) => {
      const start = new Date(lr.startDate);
      const end = new Date(lr.endDate);
      const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
      const monthEnd = new Date(selectedYear, selectedMonth, 0);

      // Constrain within the selected month
      const actualStart = start < monthStart ? monthStart : start;
      const actualEnd = end > monthEnd ? monthEnd : end;

      let count = 0;
      const curr = new Date(actualStart);
      while (curr <= actualEnd) {
        const dayOfWeek = curr.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          count++;
        }
        curr.setDate(curr.getDate() + 1);
      }
      return count;
    };

    const approvedLeaveDays = currentMonthLeaves
      .filter(lr => lr.status === 'approved')
      .reduce((sum, lr) => sum + countWorkDaysInMonth(lr), 0);

    const pendingLeaveDays = currentMonthLeaves
      .filter(lr => lr.status === 'pending')
      .reduce((sum, lr) => sum + countWorkDaysInMonth(lr), 0);

    const isDateInCurrentWeek = (dateStr: string) => {
      const d = new Date(dateStr);
      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    };

    const monthlyTotalHours = attendanceData.reduce((total, record) => {
      const stats = calculateWorkHours(record.timeIn || record.checkIn, record.timeOut || record.checkOut);
      return total + stats.hours;
    }, 0);

    const weeklyTotalHours = attendanceData.reduce((total, record) => {
      if (isDateInCurrentWeek(record.date)) {
        const stats = calculateWorkHours(record.timeIn || record.checkIn, record.timeOut || record.checkOut);
        return total + stats.hours;
      }
      return total;
    }, 0);

    // Include Approved Leaves (8h each)
    const actualMonthlyHours = monthlyTotalHours + (approvedLeaveDays * 8);
    const actualWeeklyHours = weeklyTotalHours + (attendanceData.filter(a => a.status === 'leave' && isDateInCurrentWeek(a.date)).length * 8);

    const targetMonthlyHours = workingDaysInMonth * 8;
    const targetWeeklyHours = 40;

    return {
      workingDays: workingDaysInMonth,
      presentDays,
      leaveDays: approvedLeaveDays,
      pendingLeaveDays,
      holidays: holidaysInMonth,
      monthlyTotalHours: Math.round(actualMonthlyHours * 100) / 100,
      monthlyTarget: targetMonthlyHours,
      monthlyDifference: Math.round((actualMonthlyHours - targetMonthlyHours) * 100) / 100,
      weeklyTotalHours: Math.round(actualWeeklyHours * 100) / 100,
      weeklyTarget: targetWeeklyHours,
      weeklyDifference: Math.round((actualWeeklyHours - targetWeeklyHours) * 100) / 100
    };
  };

  const calculateWorkHours = (checkIn: string | null, checkOut: string | null) => {
    // No checkout or no checkin => Absent
    if (!checkIn || !checkOut) return { hours: 0, type: 'Absent' };

    const inTime = new Date(checkIn).getTime();
    const outTime = new Date(checkOut).getTime();
    const totalHours = (outTime - inTime) / (1000 * 60 * 60);

    // If time difference is 2 hours or less, mark as Absent
    if (totalHours <= 2) return { hours: Math.max(0, Math.round(totalHours * 100) / 100), type: 'Absent' };

    const workHours = totalHours > 4 ? totalHours - 1 : totalHours; // Deduct lunch if > 4 hours
    const roundedHours = Math.max(0, Math.round(workHours * 100) / 100);
    const type = roundedHours >= 6 ? 'Full Day' : 'Half Day';

    return {
      hours: roundedHours,
      type: roundedHours > 0 ? type : 'Invalid'
    };
  };

  const isFullAccessUser = currentUser && ['admin', 'cms_administrator', 'hr_manager', 'project_manager', 'management'].includes(currentUser.role);
  const canApproveLeaves = currentUser && hasPermission(currentUser.role, 'myAccount', 'canApprove');
  const canEditAttendance = currentUser && hasPermission(currentUser.role, 'myAccount', 'canEdit');
  const canDeleteRecords = currentUser && hasPermission(currentUser.role, 'myAccount', 'canDelete');

  const stats = getAttendanceStats();

  const filteredAttendance = allAttendance.filter(record => {
    const searchLower = searchQuery.toLowerCase();
    const employee = record.employee;

    // Apply method filter
    if (methodFilter !== 'all' && record.checkInMethod !== methodFilter) {
      return false;
    }

    return (
      (employee?.firstName || '').toLowerCase().includes(searchLower) ||
      (employee?.lastName || '').toLowerCase().includes(searchLower) ||
      (employee?.department || '').toLowerCase().includes(searchLower) ||
      (employee?.email || '').toLowerCase().includes(searchLower) ||
      record.date.includes(searchLower)
    );
  });

  if (isLoading || isLoadingUser || !currentUser) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <MetricCardGridSkeleton count={4} />
        <div className="mt-8">
          <TabsSkeleton count={isFullAccessUser ? 4 : 2} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight">
          {isFullAccessUser ? 'Attendance Management' : 'My Attendance'}
        </h2>
        <p className="text-muted-foreground">
          {isFullAccessUser 
            ? 'Monitor team availability and manage attendance records' 
            : 'Track your daily clock-in/out times and work duration'}
        </p>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {/* Only show tabs for admin roles — employees get direct view without tab header */}
        {isFullAccessUser && (
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all-attendance">All Attendance</TabsTrigger>
            <TabsTrigger value="pending-attendance">Approvals 
              {pendingRequests.filter(r => r.status === 'pending').length > 0 && 
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{pendingRequests.filter(r => r.status === 'pending').length}</span>
              }
            </TabsTrigger>
            <TabsTrigger value="attendance"><Clock className="mr-2 h-4 w-4" />My Attendance</TabsTrigger>
            <TabsTrigger value="att-settings">⚙ Settings</TabsTrigger>
          </TabsList>
        )}


        {isFullAccessUser && (
          <TabsContent value="pending-attendance">
            <Card>
              <CardHeader>
                <CardTitle>Attendance Approvals</CardTitle>
                <CardDescription>Review and approve attendance logged on weekends</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No pending attendance requests</div>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Time In / Out</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingRequests.filter(r => r.status === 'pending').map((req, i) => (
                          <TableRow key={req.id}>
                            <TableCell className="font-medium">{(req.employees as any)?.user_id}</TableCell>
                            <TableCell>{new Date(req.date).toLocaleDateString()}</TableCell>
                            <TableCell>
                              {new Date(req.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})} 
                              {' - '} 
                              {req.time_out ? new Date(req.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'}) : 'Pending Out'}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">{req.notes || <em>No notes</em>}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={req.check_in_method === 'nfc' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}>
                                {req.check_in_method.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right flex justify-end gap-2">
                              <Button size="sm" variant="outline" className="text-green-600 border-green-200 bg-green-50 hover:bg-green-100" onClick={() => handleApproveRejectRequest(req.id, 'approve', i)}>
                                <CheckCircle className="h-4 w-4 mr-1"/> Approve
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 border-red-200 bg-red-50 hover:bg-red-100" onClick={() => handleApproveRejectRequest(req.id, 'reject', i)}>
                                <XCircle className="h-4 w-4 mr-1"/> Reject
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Admin: Attendance Settings Tab */}
        {isFullAccessUser && (
          <TabsContent value="att-settings">
            <Card>
              <CardHeader>
                <CardTitle>Attendance Configuration</CardTitle>
                <CardDescription>Configure geofencing, network restrictions, and work hour policies. Changes apply to all employees.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Geofencing Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">📍 Geofencing</h3>
                  <p className="text-sm text-muted-foreground">Set your office coordinates. Employees punching in outside the radius will require admin approval.</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Office Latitude</Label>
                      <Input type="number" step="any" placeholder="e.g. 19.0760" value={attendanceSettings.office_latitude} onChange={e => setAttendanceSettings({...attendanceSettings, office_latitude: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Office Longitude</Label>
                      <Input type="number" step="any" placeholder="e.g. 72.8777" value={attendanceSettings.office_longitude} onChange={e => setAttendanceSettings({...attendanceSettings, office_longitude: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Allowed Radius (meters)</Label>
                      <Input type="number" placeholder="500" value={attendanceSettings.geofence_radius_meters} onChange={e => setAttendanceSettings({...attendanceSettings, geofence_radius_meters: parseInt(e.target.value) || 500})} />
                    </div>
                  </div>
                </div>

                <hr />

                {/* IP Restriction Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">🌐 Network / IP Restriction</h3>
                  <p className="text-sm text-muted-foreground">Comma-separated list of allowed IPs. Leave empty to disable IP restriction. Employees punching in from other IPs will need approval.</p>
                  <div className="space-y-2">
                    <Label>Allowed IP Addresses</Label>
                    <Input placeholder="e.g. 203.45.67.89,103.12.34.56" value={attendanceSettings.allowed_ips} onChange={e => setAttendanceSettings({...attendanceSettings, allowed_ips: e.target.value})} />
                  </div>
                </div>

                <hr />

                {/* Overtime Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">⏱ Work Hours & Overtime</h3>
                  <p className="text-sm text-muted-foreground">Standard work hours per day (including lunch). Anything beyond this is tracked as overtime.</p>
                  <div className="space-y-2 max-w-xs">
                    <Label>Standard Work Hours (per day)</Label>
                    <Input type="number" step="0.5" placeholder="9.0" value={attendanceSettings.standard_work_hours} onChange={e => setAttendanceSettings({...attendanceSettings, standard_work_hours: parseFloat(e.target.value) || 9.0})} />
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button onClick={saveSettings} disabled={isSavingSettings}>
                    {isSavingSettings && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Configuration
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Admin/Manager: All Attendance Tab */}
        {isFullAccessUser && (
          <TabsContent value="all-attendance">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>All Employee Attendance</CardTitle>
                    <CardDescription>View and manage all employee attendance records</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={showAttendanceDialog} onOpenChange={setShowAttendanceDialog}>
                      <DialogTrigger asChild>
                        <Button>
                          <Clock className="mr-2 h-4 w-4" />
                          Mark Attendance
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Mark Employee Attendance</DialogTitle>
                          <DialogDescription>
                            Record employee time in and time out. Lunch break (1 hour) will be automatically deducted for shifts over 4 hours.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Employee *</Label>
                            <Select
                              value={attendanceForm.employeeId}
                              onValueChange={(value) => setAttendanceForm({ ...attendanceForm, employeeId: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select employee" />
                              </SelectTrigger>
                              <SelectContent>
                                {employees
                                  .filter(emp => emp.status !== 'resignation')
                                  .map((emp) => {
                                    const user = users.find(u => u.id === emp.userId);
                                    return (
                                      <SelectItem key={emp.id} value={emp.id.toString()}>
                                        {user ? `${user.firstName} ${user.lastName} (${emp.employeeId})` : emp.employeeId}
                                      </SelectItem>
                                    );
                                  })}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Date *</Label>
                            <Input
                              type="date"
                              value={attendanceForm.date}
                              onChange={(e) => setAttendanceForm({ ...attendanceForm, date: e.target.value })}
                              max={formatLocalDate(new Date())}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Time In *</Label>
                            <Input
                              type="time"
                              value={attendanceForm.timeIn}
                              onChange={(e) => setAttendanceForm({ ...attendanceForm, timeIn: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Time Out *</Label>
                            <Input
                              type="time"
                              value={attendanceForm.timeOut}
                              onChange={(e) => setAttendanceForm({ ...attendanceForm, timeOut: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            {(new Date(attendanceForm.date).getDay() === 0 || new Date(attendanceForm.date).getDay() === 6) ? (
                              <Label>Notes *</Label>
                            ) : (
                              <Label>Notes (Optional)</Label>
                            )}
                            <Textarea
                              value={attendanceForm.notes}
                              onChange={(e) => setAttendanceForm({ ...attendanceForm, notes: e.target.value })}
                              placeholder="Any additional notes..."
                              rows={2}
                            />
                          </div>
                        </div>

                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setShowAttendanceDialog(false)}
                            disabled={loading}
                          >
                            Cancel
                          </Button>
                          <Button onClick={handleAttendanceSubmit} disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Submit Attendance
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button
                      onClick={handleAttendanceRefresh}
                      disabled={refreshing}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleBulkUpload}
                    />
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      variant="outline"
                      size="sm"
                    >
                      {isUploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      Import CSV
                    </Button>
                    <Button
                      onClick={() => {
                        const csvRows = [['Employee', 'Department', 'Date', 'Time In', 'Time Out', 'Duration (min)', 'Overtime (hrs)', 'Status', 'Method']];
                        filteredAttendance.forEach(record => {
                          const emp = record.employee;
                          csvRows.push([
                            `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim(),
                            emp?.department || '',
                            record.date,
                            record.timeIn ? new Date(record.timeIn).toLocaleTimeString() : '',
                            record.timeOut ? new Date(record.timeOut).toLocaleTimeString() : '',
                            String(record.duration || ''),
                            String((record as any).overtime_hours || '0'),
                            record.status,
                            record.checkInMethod || 'manual'
                          ]);
                        });
                        const csvContent = csvRows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = `attendance_report_${new Date().toISOString().slice(0,10)}.csv`;
                        link.click();
                        toast.success('Timesheet exported successfully');
                      }}
                      variant="outline"
                      size="sm"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Export CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Global Today Summary */}
                {summaryLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatsSkeleton />
                    <StatsSkeleton />
                    <StatsSkeleton />
                    <StatsSkeleton />
                  </div>
                ) : todaySummary && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-primary/5 border-primary/10">
                      <CardHeader className="pb-2 pt-4">
                        <CardDescription className="text-xs font-medium uppercase tracking-wider">Total Workforce</CardDescription>
                        <CardTitle className="text-2xl">{todaySummary.totalEmployees}</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Users className="mr-1 h-3 w-3" />
                          Active Employees
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-emerald-500/5 border-emerald-500/10">
                      <CardHeader className="pb-2 pt-4">
                        <CardDescription className="text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Present Today</CardDescription>
                        <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400">{todaySummary.present}</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <div className="flex items-center text-xs text-muted-foreground">
                          <UserCheck className="mr-1 h-3 w-3 text-emerald-500" />
                          {todaySummary.onTime} on time · {todaySummary.late} late
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-red-500/5 border-red-500/10">
                      <CardHeader className="pb-2 pt-4">
                        <CardDescription className="text-xs font-medium uppercase tracking-wider text-red-600 dark:text-red-400">Absent Today</CardDescription>
                        <CardTitle className="text-2xl text-red-600 dark:text-red-400">{todaySummary.absent}</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <div className="flex items-center text-xs text-muted-foreground">
                          <UserX className="mr-1 h-3 w-3 text-red-500" />
                          {todaySummary.totalEmployees > 0 ? `${Math.round((todaySummary.absent / todaySummary.totalEmployees) * 100)}% absence` : '0%'}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-blue-500/5 border-blue-500/10">
                      <CardHeader className="pb-2 pt-4">
                        <CardDescription className="text-xs font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">Still On-Site</CardDescription>
                        <CardTitle className="text-2xl text-blue-600 dark:text-blue-400">{todaySummary.stillWorking}</CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Clock className="mr-1 h-3 w-3 text-blue-500" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
                {/* Filters */}
                {/* Filters Section in Card View */}
                <div className="bg-slate-50/50 border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Filter className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Attendance Filters</h3>
                  </div>

                  {/* Row 1: Primary Filters */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 items-end">
                    <div className="xl:col-span-2 lg:col-span-2 sm:col-span-1 space-y-2">
                      <Label className="text-xs font-semibold text-slate-600">Search</Label>
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search name, dept, email..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-8 bg-white"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-600">Employee</Label>
                      <Select value={selectedEmployeeFilter} onValueChange={setSelectedEmployeeFilter}>
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Employees</SelectItem>
                          {employees.map(emp => (
                            <SelectItem key={emp.id} value={emp.id.toString()}>
                              {(() => {
                                const user = users.find(u => u.id === emp.userId);
                                return user ? `${user.firstName} ${user.lastName} (${emp.employeeId})` : emp.employeeId;
                              })()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-600">Method</Label>
                      <Select value={methodFilter} onValueChange={setMethodFilter}>
                        <SelectTrigger className="bg-white">
                          <div className="flex items-center">
                            <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                            <SelectValue placeholder="Method" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Methods</SelectItem>
                          <SelectItem value="nfc">NFC Only</SelectItem>
                          <SelectItem value="manual">Manual Entry</SelectItem>
                          <SelectItem value="legacy">Manual marking</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-600">Month</Label>
                      <Select
                        value={selectedMonth.toString()}
                        onValueChange={(value) => setSelectedMonth(parseInt(value))}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => (
                            <SelectItem key={i + 1} value={(i + 1).toString()}>
                              {new Date(2024, i).toLocaleString('default', { month: 'long' })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-600">Year</Label>
                      <Select
                        value={selectedYear.toString()}
                        onValueChange={(value) => setSelectedYear(parseInt(value))}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 5 }, (_, i) => {
                            const year = new Date().getFullYear() - 2 + i;
                            return (
                              <SelectItem key={year} value={year.toString()}>
                                {year}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Row 2: Date Range Filters */}
                  <div className="flex flex-wrap items-end gap-6 border-t border-slate-200 pt-6">
                    <div className="w-[220px] space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-primary/70">From Date</Label>
                      <Input
                        type="date"
                        value={attendanceStartDate}
                        onChange={(e) => setAttendanceStartDate(e.target.value)}
                        className="bg-white border-primary/20 focus-visible:ring-primary"
                      />
                    </div>
                    <div className="w-[220px] space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-primary/70">To Date</Label>
                      <Input
                        type="date"
                        value={attendanceEndDate}
                        onChange={(e) => setAttendanceEndDate(e.target.value)}
                        className="bg-white border-primary/20 focus-visible:ring-primary"
                      />
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 rounded-full border border-primary/10 self-center">
                      <Info className="h-3 w-3 text-primary" />
                      <span className="text-[10px] font-bold text-primary italic uppercase tracking-tighter">
                        Custom range overrides Month/Year selection
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                {loading ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <StatsSkeleton />
                    <StatsSkeleton />
                    <StatsSkeleton />
                    <StatsSkeleton />
                    <StatsSkeleton />
                    <StatsSkeleton />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <Card>
                      <CardHeader className="pb-3 text-center md:text-left">
                        <CardDescription>Working Days</CardDescription>
                        <CardTitle className="text-2xl">{stats.workingDays}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-3 text-center md:text-left">
                        <CardDescription>Present Days</CardDescription>
                        <CardTitle className="text-2xl">{stats.presentDays}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-3 text-center md:text-left">
                        <CardDescription>Leave Days</CardDescription>
                        <CardTitle className="text-2xl">{stats.leaveDays}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-3 text-center md:text-left">
                        <CardDescription>Holidays</CardDescription>
                        <CardTitle className="text-2xl">{stats.holidays}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card className="border-primary/20 bg-primary/5">
                      <CardHeader className="pb-3 text-center md:text-left">
                        <div className="flex items-center justify-between">
                          <CardDescription className="text-primary font-medium">Month Total</CardDescription>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stats.monthlyDifference >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {formatDuration(stats.monthlyDifference)}
                          </span>
                        </div>
                        <CardTitle className="text-2xl text-primary">{formatDuration(stats.monthlyTotalHours, false)}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card className={stats.weeklyTotalHours >= stats.weeklyTarget ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}>
                      <CardHeader className="pb-3 text-center md:text-left">
                        <CardDescription className="flex items-center justify-between">
                          <span className="font-medium text-[10px] md:text-xs">Weekly (40h)</span>
                          <span className="hidden xl:inline text-[10px] uppercase font-bold text-muted-foreground">{stats.weeklyDifference >= 0 ? 'Goal Met' : 'Awaiting Progress'}</span>
                        </CardDescription>
                        <div className="flex items-baseline justify-center md:justify-start gap-2">
                          <CardTitle className="text-xl md:text-2xl">
                            {formatDuration(stats.weeklyTotalHours, false)}
                            <span className="text-xs font-normal text-muted-foreground ml-1">/40</span>
                          </CardTitle>
                          <span className={`text-[10px] font-medium ${stats.weeklyDifference >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            ({formatDuration(stats.weeklyDifference)})
                          </span>
                        </div>
                      </CardHeader>
                    </Card>
                  </div>
                )}

                {/* Pending Requests for Employee */}
                {!isFullAccessUser && pendingRequests.length > 0 && (
                   <div className="mb-6 rounded-md border border-amber-200 bg-amber-50/50 p-4">
                     <h3 className="font-semibold text-amber-800 flex items-center mb-3">
                       <Clock className="w-4 h-4 mr-2" /> Pending Weekend Approvals ({pendingRequests.length})
                     </h3>
                     <div className="space-y-2">
                       {pendingRequests.map(req => (
                         <div key={req.id} className="flex justify-between items-center text-sm bg-white p-3 rounded border shadow-sm">
                           <div>
                             <span className="font-semibold">{new Date(req.date).toLocaleDateString()}</span>
                             <span className="text-muted-foreground ml-3 text-xs tracking-wide">
                               {new Date(req.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 
                               {req.time_out ? ` - ${new Date(req.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                             </span>
                           </div>
                           <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">Pending HR Approval</Badge>
                         </div>
                       ))}
                     </div>
                   </div>
                )}

                {/* Table */}
                <div className="max-h-[600px] overflow-y-auto rounded-md border text-[13px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>In Time</TableHead>
                        <TableHead>Out Time</TableHead>
                        <TableHead>Work Hours</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Method</TableHead>
                        {(canDeleteRecords || canEditAttendance) && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableSkeleton columns={canDeleteRecords || canEditAttendance ? 9 : 8} rows={10} />
                      ) : filteredAttendance.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={canDeleteRecords || canEditAttendance ? 9 : 8} className="text-center py-8 text-muted-foreground">
                            No attendance records found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredAttendance.map((record) => {
                          const employee = record.employee;
                          const firstName = employee?.firstName || '';
                          const lastName = employee?.lastName || '';
                          const department = employee?.department || '—';

                          const timeIn = record.timeIn ? new Date(record.timeIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
                          const timeOut = record.timeOut ? new Date(record.timeOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';

                          const duration = record.duration ? formatDuration(record.duration / 60, false) : (record.checkIn && record.checkOut ? formatDuration(calculateWorkHours(record.checkIn, record.checkOut).hours, false) : '—');

                          return (
                            <TableRow key={record.id}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                                    {firstName?.[0]}{lastName?.[0]}
                                  </div>
                                  <div>
                                    <div className="font-medium text-sm">
                                      {firstName} {lastName}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground uppercase">
                                      {record.employeeId}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{department}</TableCell>
                              <TableCell className="text-sm">
                                {formatDateOrdinal(record.date)}
                              </TableCell>
                              <TableCell className="text-sm font-mono">{timeIn}</TableCell>
                              <TableCell className="text-sm font-mono">{timeOut}</TableCell>
                              <TableCell className="text-sm">
                                {(() => {
                                  const stats = calculateWorkHours(record.timeIn || record.checkIn, record.timeOut || record.checkOut);
                                  return (
                                    <div className="flex flex-col">
                                      <span>{stats.hours} hrs</span>
                                      {stats.hours > 0 && (
                                        <span className={`text-[10px] font-semibold ${stats.type === 'Full Day' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                          {stats.type}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    record.status === 'present' ? 'default' :
                                      record.status === 'absent' ? 'destructive' :
                                        'secondary'
                                  }
                                  className={record.status === 'present' ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20' : ''}
                                >
                                  {record.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {record.checkInMethod === 'nfc' ? (
                                  <Badge variant="outline" className="bg-violet-500/5 text-violet-700 border-violet-200">
                                    <Fingerprint className="h-3 w-3 mr-1" />
                                    NFC
                                  </Badge>
                                ) : record.checkInMethod === 'legacy' ? (
                                  <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-200">
                                    <Clock className="h-3 w-3 mr-1" />
                                    Manual
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-slate-500/5 text-slate-700">
                                    Manual
                                  </Badge>
                                )}
                              </TableCell>
                              {/* Actions */}
                              {(canDeleteRecords || canEditAttendance) && (
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    {canEditAttendance && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEditAttendance(record)}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    )}
                                    {canDeleteRecords && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setDeletingAttendance(record)}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between space-x-2 py-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Page {attendancePage + 1}
                  </div>
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAttendancePage(prev => Math.max(0, prev - 1))}
                      disabled={attendancePage === 0 || loading}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAttendancePage(prev => prev + 1)}
                      disabled={allAttendance.length < PAGE_SIZE || loading}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        

        

        {/* Attendance Tab (Personal) */}
        {(true) && (
          <TabsContent value="attendance">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Attendance</CardTitle>
                    <CardDescription>View your attendance records and log daily work hours</CardDescription>
                  </div>
                  <Dialog open={showAttendanceDialog} onOpenChange={setShowAttendanceDialog}>
                    <DialogTrigger asChild>
                      <Button>
                        <Clock className="mr-2 h-4 w-4" />
                        Log Attendance
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Log Daily Attendance</DialogTitle>
                        <DialogDescription>
                          Record your time in and time out. Lunch break (1 hour) will be automatically deducted for shifts over 4 hours.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4">
                        {isFullAccessUser && (
                          <div className="space-y-2">
                            <Label>Employee *</Label>
                            <Select
                              value={attendanceForm.employeeId}
                              onValueChange={(value) => setAttendanceForm({ ...attendanceForm, employeeId: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select employee" />
                              </SelectTrigger>
                              <SelectContent>
                                {employees.map((emp) => {
                                  const user = users.find(u => u.id === emp.userId);
                                  return (
                                    <SelectItem key={emp.id} value={emp.id.toString()}>
                                      {user ? `${user.firstName} ${user.lastName}` : 'Unknown'} ({emp.employeeId})
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label>Date *</Label>
                          <Input
                            type="date"
                            value={attendanceForm.date}
                            onChange={(e) => setAttendanceForm({ ...attendanceForm, date: e.target.value })}
                            max={formatLocalDate(new Date(new Date().getTime() + 24 * 60 * 60 * 1000))} // Allow up to tomorrow for timezone safety
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Time In *</Label>
                          <Input
                            type="time"
                            value={attendanceForm.timeIn}
                            onChange={(e) => setAttendanceForm({ ...attendanceForm, timeIn: e.target.value })}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Time Out *</Label>
                          <Input
                            type="time"
                            value={attendanceForm.timeOut}
                            onChange={(e) => setAttendanceForm({ ...attendanceForm, timeOut: e.target.value })}
                          />
                        </div>

                        <div className="space-y-2">
                          {(new Date(attendanceForm.date).getDay() === 0 || new Date(attendanceForm.date).getDay() === 6) ? (
                            <Label>Notes *</Label>
                          ) : (
                            <Label>Notes (Optional)</Label>
                          )}
                          <Textarea
                            value={attendanceForm.notes}
                            onChange={(e) => setAttendanceForm({ ...attendanceForm, notes: e.target.value })}
                            placeholder="Any additional notes..."
                            rows={2}
                          />
                        </div>
                      </div>

                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setShowAttendanceDialog(false)}
                          disabled={loading}
                        >
                          Cancel
                        </Button>
                        <Button onClick={handleAttendanceSubmit} disabled={loading}>
                          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Submit Attendance
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Month</Label>
                    <Select
                      value={selectedMonth.toString()}
                      onValueChange={(value) => setSelectedMonth(parseInt(value))}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => (
                          <SelectItem key={i + 1} value={(i + 1).toString()}>
                            {new Date(2024, i).toLocaleString('default', { month: 'long' })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Year</Label>
                    <Select
                      value={selectedYear.toString()}
                      onValueChange={(value) => setSelectedYear(parseInt(value))}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 5 }, (_, i) => {
                          const year = new Date().getFullYear() - 2 + i;
                          return (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>From Date</Label>
                    <Input
                      type="date"
                      value={attendanceStartDate}
                      onChange={(e) => setAttendanceStartDate(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>To Date</Label>
                    <Input
                      type="date"
                      value={attendanceEndDate}
                      onChange={(e) => setAttendanceEndDate(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <Card>
                    <CardHeader className="pb-3 text-center md:text-left">
                      <CardDescription>Working Days</CardDescription>
                      <CardTitle className="text-2xl">{stats.workingDays}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3 text-center md:text-left">
                      <CardDescription>Present Days</CardDescription>
                      <CardTitle className="text-2xl">{stats.presentDays}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3 text-center md:text-left">
                      <CardDescription>Leave Days</CardDescription>
                      <div className="flex items-baseline gap-2 justify-center md:justify-start">
                        <CardTitle className="text-2xl">{stats.leaveDays}</CardTitle>
                        {stats.pendingLeaveDays > 0 && (
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                            {stats.pendingLeaveDays} pending
                          </span>
                        )}
                      </div>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3 text-center md:text-left">
                      <CardDescription>Holidays</CardDescription>
                      <CardTitle className="text-2xl">{stats.holidays}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-3 text-center md:text-left">
                      <div className="flex items-center justify-between">
                        <CardDescription className="text-primary font-medium">Month Total</CardDescription>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stats.monthlyDifference >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {formatDuration(stats.monthlyDifference)}
                        </span>
                      </div>
                      <CardTitle className="text-2xl text-primary">{formatDuration(stats.monthlyTotalHours, false)}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card className={stats.weeklyTotalHours >= stats.weeklyTarget ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}>
                    <CardHeader className="pb-3 text-center md:text-left">
                      <CardDescription className="flex items-center justify-between">
                        <span className="font-medium text-[10px] md:text-xs">Weekly (40h)</span>
                        <span className="hidden xl:inline text-[10px] uppercase font-bold text-muted-foreground">{stats.weeklyDifference >= 0 ? 'Goal Met' : 'Awaiting Progress'}</span>
                      </CardDescription>
                      <div className="flex items-baseline justify-center md:justify-start gap-2">
                        <CardTitle className="text-xl md:text-2xl">
                          {formatDuration(stats.weeklyTotalHours, false)}
                          <span className="text-xs font-normal text-muted-foreground ml-1">/40</span>
                        </CardTitle>
                        <span className={`text-[10px] font-medium ${stats.weeklyDifference >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          ({formatDuration(stats.weeklyDifference)})
                        </span>
                      </div>
                    </CardHeader>
                  </Card>
                </div>

                {/* Table */}
                <div className="max-h-[600px] overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>No</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>In Time</TableHead>
                        <TableHead>Out Time</TableHead>
                        <TableHead>Work Hours</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableSkeleton columns={7} rows={10} />
                      ) : attendance.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No attendance records found
                          </TableCell>
                        </TableRow>
                      ) : (
                        attendance.map((record, index) => {
                          // Support both old checkIn and new timeIn fields
                          const tIn = record.timeIn || record.checkIn;
                          const tOut = record.timeOut || record.checkOut;
                          const workHours = calculateWorkHours(tIn, tOut);

                          return (
                            <TableRow key={record.id}>
                              <TableCell>{personalAttendancePage * PAGE_SIZE + index + 1}</TableCell>
                              <TableCell className="font-medium">{formatDateOrdinal(record.date)}</TableCell>
                              <TableCell>
                                {tIn ? new Date(tIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                              </TableCell>
                              <TableCell>
                                {tOut ? new Date(tOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  const stats = calculateWorkHours(tIn, tOut);
                                  return (
                                    <div className="flex flex-col">
                                      <span>{formatDuration(calculateWorkHours(tIn, tOut).hours, false)}</span>
                                      {stats.hours > 0 && (
                                        <span className={`text-[10px] font-semibold ${stats.type === 'Full Day' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                          {stats.type}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`capitalize text-[10px] px-1.5 py-0 ${(record.checkInMethod === 'rfid' || record.checkInMethod === 'nfc')
                                    ? 'bg-blue-500/10 text-blue-700 border-blue-200'
                                    : ''
                                    }`}
                                >
                                  {(record.checkInMethod === 'rfid' || record.checkInMethod === 'nfc') ? 'RFID Attendance' :
                                    record.checkInMethod === 'legacy' ? 'Manual' :
                                      (record.checkInMethod || 'Manual')}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={
                                  record.status === 'present' ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-200' :
                                    record.status === 'absent' ? 'bg-red-500/15 text-red-700 hover:bg-red-500/25 border-red-200' :
                                      'bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 border-amber-200'
                                }>
                                  {record.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Page {personalAttendancePage + 1}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPersonalAttendancePage(p => Math.max(0, p - 1))}
                      disabled={personalAttendancePage === 0 || loading}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPersonalAttendancePage(p => p + 1)}
                      disabled={attendance.length < PAGE_SIZE || loading}
                    >
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Company Holidays Tab - Keep existing code */}
              </Tabs>

      {/* Admin: Approve Leave Dialog */}
      {canApproveLeaves && (
        <AlertDialog open={approvingLeave !== null} onOpenChange={() => setApprovingLeave(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve Leave Request?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to approve this leave request?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleApproveLeave} className="bg-green-600 hover:bg-green-700">
                Approve
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Admin: Reject Leave Dialog */}
      {canApproveLeaves && (
        <AlertDialog open={rejectingLeave !== null} onOpenChange={() => setRejectingLeave(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reject Leave Request?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to reject this leave request?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRejectLeave} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Reject
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Admin: Delete Leave Dialog */}
      {canDeleteRecords && (
        <AlertDialog open={deletingLeave !== null} onOpenChange={() => setDeletingLeave(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Leave Request?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this leave request? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteLeave} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Admin: Delete Attendance Dialog */}
      {canDeleteRecords && (
        <AlertDialog open={deletingAttendance !== null} onOpenChange={() => setDeletingAttendance(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Attendance Record?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this attendance record? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteAttendance} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Admin: Add Holiday Dialog */}
      <Dialog open={showHolidayDialog} onOpenChange={setShowHolidayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Company Holiday</DialogTitle>
            <DialogDescription>
              Add a new holiday to the company calendar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="holiday-date">Date</Label>
              <Input
                id="holiday-date"
                type="date"
                value={holidayForm.date}
                onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holiday-reason">Reason</Label>
              <Input
                id="holiday-reason"
                placeholder="e.g. New Year's Day"
                value={holidayForm.reason}
                onChange={(e) => setHolidayForm({ ...holidayForm, reason: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHolidayDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddHoliday} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Holiday
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin: Edit Attendance Dialog */}
      <Dialog open={editingAttendance !== null} onOpenChange={() => setEditingAttendance(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Attendance</DialogTitle>
            <DialogDescription>Modify attendance details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Time In</Label>
                <Input
                  type="time"
                  value={editAttendanceForm.timeIn}
                  onChange={(e) => setEditAttendanceForm({ ...editAttendanceForm, timeIn: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Time Out</Label>
                <Input
                  type="time"
                  value={editAttendanceForm.timeOut}
                  onChange={(e) => setEditAttendanceForm({ ...editAttendanceForm, timeOut: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={editAttendanceForm.status}
                onValueChange={(value) => setEditAttendanceForm({ ...editAttendanceForm, status: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                  <SelectItem value="half_day">Half Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Attendance notes..."
                value={editAttendanceForm.notes}
                onChange={(e) => setEditAttendanceForm({ ...editAttendanceForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAttendance(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateAttendance} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Leave Details Dialog */}
      <Dialog open={viewingLeave !== null} onOpenChange={() => setViewingLeave(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Calendar className="h-5 w-5 text-primary" />
              Leave Application
            </DialogTitle>
            <DialogDescription>
              Full details of the submitted leave request
            </DialogDescription>
          </DialogHeader>

          {viewingLeave && (
            <div className="space-y-6 py-6">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Employee</span>
                  <p className="font-semibold text-sm">{getEmployeeName(viewingLeave.employeeId)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Status</span>
                  <div>{getLeaveStatusBadge(viewingLeave.status)}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Leave Type</span>
                  <p className="capitalize font-semibold text-sm">{viewingLeave.leaveType.replace(/_/g, ' ')}</p>
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

    </div>
  );
}