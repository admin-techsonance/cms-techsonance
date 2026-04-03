'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2, Calendar as CalendarIcon, Clock, Eye, Edit, Trash2, Check, X, Users, Upload, Pencil } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { hasPermission, hasFullAccess, UserRole } from '@/lib/permissions';

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

export default function MyAccountPage() {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState<number | null>(null);

  // Admin-specific state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [allLeaveRequests, setAllLeaveRequests] = useState<LeaveRequest[]>([]);
  const [allAttendance, setAllAttendance] = useState<Attendance[]>([]);
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('all');
  const [adminLeaveStatusFilter, setAdminLeaveStatusFilter] = useState('all');
  const [deletingLeave, setDeletingLeave] = useState<LeaveRequest | null>(null);
  const [approvingLeave, setApprovingLeave] = useState<LeaveRequest | null>(null);
  const [rejectingLeave, setRejectingLeave] = useState<LeaveRequest | null>(null);
  const [deletingAttendance, setDeletingAttendance] = useState<Attendance | null>(null);

  // Leave filters
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('all');

  // Attendance filters
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

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
    date: new Date().toISOString().split('T')[0],
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

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      if (isFullAccessUser) {
        fetchEmployees();
        fetchAllLeaveRequests();
        fetchAllAttendance();
      } else if (employeeId) {
        fetchLeaveRequests();
        fetchAttendance();
      }
    }
  }, [currentUser, employeeId, selectedEmployeeFilter, adminLeaveStatusFilter, selectedMonth, selectedYear]);

  useEffect(() => {
    fetchHolidays();
  }, [holidayYear]);

  const fetchCurrentUser = async () => {
    try {
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');

      if (!token) {
        console.error('No authentication token found');
        return;
      }

      const meResponse = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (meResponse.ok) {
        const meData = await meResponse.json();
        setCurrentUser(meData.user);

        // Get employee record for non-admin users
        if (!hasFullAccess(meData.user.role as UserRole)) {
          const employeeResponse = await fetch(`/api/employees?userId=${meData.user.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (employeeResponse.ok) {
            const employees = await employeeResponse.json();
            if (employees && employees.length > 0) {
              setEmployeeId(employees[0].id);
            } else {
              toast.error('Employee record not found. Please contact admin.');
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
      toast.error('Failed to load user information');
    }
  };

  const fetchEmployees = async () => {
    try {
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
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
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
      let url = '/api/leave-requests?limit=100';

      if (selectedEmployeeFilter !== 'all') url += `&employeeId=${selectedEmployeeFilter}`;
      if (adminLeaveStatusFilter !== 'all') url += `&status=${adminLeaveStatusFilter}`;

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

  const fetchAllAttendance = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');

      const startDate = new Date(selectedYear, selectedMonth - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];

      let url = `/api/attendance?startDate=${startDate}&endDate=${endDate}&limit=100`;
      if (selectedEmployeeFilter !== 'all') url += `&employeeId=${selectedEmployeeFilter}`;

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

  const fetchLeaveRequests = async () => {
    try {
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');

      if (!token || !employeeId) {
        return;
      }

      let url = `/api/leave-requests?employeeId=${employeeId}&limit=100`;

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
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');

      if (!token || !employeeId) {
        return;
      }

      const startDate = new Date(selectedYear, selectedMonth - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];

      const response = await fetch(
        `/api/attendance?employeeId=${employeeId}&startDate=${startDate}&endDate=${endDate}&limit=100`,
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
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
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
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
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
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
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
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
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
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
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
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');

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
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
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
    const checkIn = record.checkIn ? new Date(record.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    const checkOut = record.checkOut ? new Date(record.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

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

      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
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
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');

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

    setLoading(true);
    try {
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');

      // Create ISO datetime strings
      const checkInISO = `${attendanceForm.date}T${attendanceForm.timeIn}:00`;
      const checkOutISO = `${attendanceForm.date}T${attendanceForm.timeOut}:00`;

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
      } else if (workHours <= 6) {
        status = 'half_day';
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
          checkIn: checkInISO,
          checkOut: checkOutISO,
          status: status,
          notes: attendanceForm.notes,
        }),
      });

      if (response.ok) {
        toast.success(`Attendance marked successfully! Status: ${status}, Work Hours: ${workHours.toFixed(2)}`);
        setShowAttendanceDialog(false);
        setAttendanceForm({
          employeeId: '',
          date: new Date().toISOString().split('T')[0],
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
        const error = await response.json();
        toast.error(error.error || 'Failed to mark attendance');
      }
    } catch (error) {
      console.error('Error marking attendance:', error);
      toast.error('An error occurred while marking attendance');
    } finally {
      setLoading(false);
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

    let workingDaysInMonth = 0;
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const date = new Date(selectedYear, selectedMonth - 1, day);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDaysInMonth++;
      }
    }

    const attendanceData = isFullAccessUser ? allAttendance : attendance;
    const presentDays = attendanceData.filter(a => a.status === 'present').length;
    const leaveDays = attendanceData.filter(a => a.status === 'leave').length;
    const absentDays = attendanceData.filter(a => a.status === 'absent').length;
    const halfDays = attendanceData.filter(a => a.status === 'half_day').length;

    const holidaysInMonth = holidays.filter(h => {
      const holidayDate = new Date(h.date);
      return holidayDate.getMonth() + 1 === selectedMonth &&
        holidayDate.getFullYear() === selectedYear;
    }).length;

    return {
      workingDays: workingDaysInMonth,
      presentDays,
      leaveDays,
      holidays: holidaysInMonth
    };
  };

  const calculateWorkHours = (checkIn: string | null, checkOut: string | null) => {
    if (!checkIn || !checkOut) return 0;

    const inTime = new Date(checkIn).getTime();
    const outTime = new Date(checkOut).getTime();
    const totalHours = (outTime - inTime) / (1000 * 60 * 60);

    const workHours = totalHours > 4 ? totalHours - 1 : totalHours;

    return Math.max(0, Math.round(workHours * 100) / 100);
  };

  const isFullAccessUser = currentUser && hasFullAccess(currentUser.role);
  const canApproveLeaves = currentUser && hasPermission(currentUser.role, 'myAccount', 'canApprove');
  const canEditAttendance = currentUser && hasPermission(currentUser.role, 'myAccount', 'canEdit');
  const canDeleteRecords = currentUser && hasPermission(currentUser.role, 'myAccount', 'canDelete');

  const stats = getAttendanceStats();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          {isFullAccessUser ? 'Employee Leave & Attendance Management' : 'My Account'}
        </h2>
        <p className="text-muted-foreground">
          {isFullAccessUser
            ? 'Manage all employee leaves, attendance, and company holidays'
            : 'Manage your leaves, attendance, and view company holidays'}
        </p>
      </div>

      <Tabs defaultValue={isFullAccessUser ? "all-leaves" : "leave"} className="space-y-6">
        <TabsList className={isFullAccessUser ? "grid w-full grid-cols-4" : "grid w-full grid-cols-3"}>
          {isFullAccessUser && <TabsTrigger value="all-leaves"><Users className="mr-2 h-4 w-4" />All Leaves</TabsTrigger>}
          {isFullAccessUser && <TabsTrigger value="all-attendance">All Attendance</TabsTrigger>}
          {!isFullAccessUser && <TabsTrigger value="leave">Leave</TabsTrigger>}
          {!isFullAccessUser && <TabsTrigger value="attendance">Attendance</TabsTrigger>}
          <TabsTrigger value="holidays">Company Holidays</TabsTrigger>
        </TabsList>

        {/* Admin/Manager: All Leaves Tab */}
        {isFullAccessUser && (
          <TabsContent value="all-leaves">
            <Card>
              <CardHeader>
                <CardTitle>All Employee Leave Requests</CardTitle>
                <CardDescription>View, approve, reject, and manage all employee leave requests</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Employee</Label>
                    <Select value={selectedEmployeeFilter} onValueChange={setSelectedEmployeeFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Employees</SelectItem>
                        {employees
                          .filter(emp => emp.status !== 'resignation')
                          .map(emp => (
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
                    <Label>Leave Status</Label>
                    <Select value={adminLeaveStatusFilter} onValueChange={setAdminLeaveStatusFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Total Requests</CardDescription>
                      <CardTitle className="text-2xl">{allLeaveRequests.length}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Pending</CardDescription>
                      <CardTitle className="text-2xl">
                        {allLeaveRequests.filter(r => r.status === 'pending').length}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Approved</CardDescription>
                      <CardTitle className="text-2xl">
                        {allLeaveRequests.filter(r => r.status === 'approved').length}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Rejected</CardDescription>
                      <CardTitle className="text-2xl">
                        {allLeaveRequests.filter(r => r.status === 'rejected').length}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </div>

                {/* Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Leave Type</TableHead>
                      <TableHead>From Date</TableHead>
                      <TableHead>To Date</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      {(canApproveLeaves || canDeleteRecords) && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-4">
                          <div className="space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <div key={i} className="flex items-center gap-4">
                                {Array.from({ length: 7 }).map((_, j) => (
                                  <Skeleton key={j} className="h-5 w-full" />
                                ))}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : allLeaveRequests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No leave requests found
                        </TableCell>
                      </TableRow>
                    ) : (
                      allLeaveRequests.map((leave) => (
                        <TableRow key={leave.id}>
                          <TableCell className="font-medium">
                            {getEmployeeName(leave.employeeId)}
                          </TableCell>
                          <TableCell className="capitalize">
                            {leave.leaveType.replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell>{new Date(leave.startDate).toLocaleDateString()}</TableCell>
                          <TableCell>{new Date(leave.endDate).toLocaleDateString()}</TableCell>
                          <TableCell className="max-w-xs truncate">{leave.reason}</TableCell>
                          <TableCell>{getLeaveStatusBadge(leave.status)}</TableCell>
                          {(canApproveLeaves || canDeleteRecords) && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {canApproveLeaves && leave.status === 'pending' && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setApprovingLeave(leave)}
                                    >
                                      <Check className="h-4 w-4 text-green-600" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setRejectingLeave(leave)}
                                    >
                                      <X className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </>
                                )}
                                {canDeleteRecords && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDeletingLeave(leave)}
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
                              max={new Date().toISOString().split('T')[0]}
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
                            <Label>Notes (Optional)</Label>
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
                    >
                      {isUploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      Import CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Employee</Label>
                    <Select value={selectedEmployeeFilter} onValueChange={setSelectedEmployeeFilter}>
                      <SelectTrigger>
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
                    <Label>Month</Label>
                    <Select
                      value={selectedMonth.toString()}
                      onValueChange={(value) => setSelectedMonth(parseInt(value))}
                    >
                      <SelectTrigger>
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
                      <SelectTrigger>
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

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Working Days</CardDescription>
                      <CardTitle className="text-2xl">{stats.workingDays}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Present Days</CardDescription>
                      <CardTitle className="text-2xl">{stats.presentDays}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Leave Days</CardDescription>
                      <CardTitle className="text-2xl">{stats.leaveDays}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Holidays</CardDescription>
                      <CardTitle className="text-2xl">{stats.holidays}</CardTitle>
                    </CardHeader>
                  </Card>
                </div>

                {/* Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>In Time</TableHead>
                      <TableHead>Out Time</TableHead>
                      <TableHead>Work Hours</TableHead>
                      <TableHead>Status</TableHead>
                      {(canDeleteRecords || canEditAttendance) && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={canDeleteRecords || canEditAttendance ? 8 : 7} className="py-4">
                          <div className="space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <div key={i} className="flex items-center gap-4">
                                {Array.from({ length: 7 }).map((_, j) => (
                                  <Skeleton key={j} className="h-5 w-full" />
                                ))}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : allAttendance.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={canDeleteRecords || canEditAttendance ? 8 : 7} className="text-center py-8 text-muted-foreground">
                          No attendance records found
                        </TableCell>
                      </TableRow>
                    ) : (
                      allAttendance.map((record, index) => {
                        const workHours = calculateWorkHours(record.checkIn, record.checkOut);

                        return (
                          <TableRow key={record.id}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell className="font-medium">
                              {getEmployeeName(record.employeeId)}
                            </TableCell>
                            <TableCell>{new Date(record.date).toLocaleDateString()}</TableCell>
                            <TableCell>
                              {record.checkIn ? new Date(record.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </TableCell>
                            <TableCell>
                              {record.checkOut ? new Date(record.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </TableCell>
                            <TableCell>
                              {workHours > 0 ? (
                                <span className="font-medium">{workHours} hrs</span>
                              ) : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  record.status === 'present' ? 'default' :
                                    record.status === 'absent' ? 'destructive' :
                                      'secondary'
                                }
                              >
                                {record.status}
                              </Badge>
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
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Employee: Leave Tab - Keep existing code */}
        {!isFullAccessUser && (
          <TabsContent value="leave">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Leave Management</CardTitle>
                    <CardDescription>View and manage your leave requests</CardDescription>
                  </div>
                  <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Apply Leave
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Apply for Leave</DialogTitle>
                        <DialogDescription>
                          Fill in the details to submit a leave application
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Leave Type *</Label>
                          <Select
                            value={leaveForm.leaveType}
                            onValueChange={(value) => setLeaveForm({ ...leaveForm, leaveType: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sick">Sick Leave</SelectItem>
                              <SelectItem value="casual">Casual Leave</SelectItem>
                              <SelectItem value="vacation">Vacation</SelectItem>
                              <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>From Date *</Label>
                          <Input
                            type="date"
                            value={leaveForm.fromDate}
                            onChange={(e) => setLeaveForm({ ...leaveForm, fromDate: e.target.value })}
                            min={new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>To Date *</Label>
                          <Input
                            type="date"
                            value={leaveForm.toDate}
                            onChange={(e) => setLeaveForm({ ...leaveForm, toDate: e.target.value })}
                            min={leaveForm.fromDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Reason * (minimum 10 characters)</Label>
                          <Textarea
                            value={leaveForm.reason}
                            onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                            placeholder="Enter reason for leave..."
                            rows={3}
                            minLength={10}
                          />
                          <p className="text-xs text-muted-foreground">
                            {leaveForm.reason.length}/10 characters minimum
                          </p>
                        </div>
                      </div>

                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setShowLeaveDialog(false)}
                          disabled={loading}
                        >
                          Cancel
                        </Button>
                        <Button onClick={handleLeaveSubmit} disabled={loading}>
                          {loading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Submitting...
                            </>
                          ) : (
                            'Submit Application'
                          )}
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
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={leaveStartDate}
                      onChange={(e) => setLeaveStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={leaveEndDate}
                      onChange={(e) => setLeaveEndDate(e.target.value)}
                      min={leaveStartDate}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Leave Status</Label>
                    <Select value={leaveStatusFilter} onValueChange={setLeaveStatusFilter}>
                      <SelectTrigger>
                        <SelectValue />
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
                    <Button onClick={fetchLeaveRequests} className="w-full">
                      Apply Filter
                    </Button>
                  </div>
                </div>

                {/* Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Leave Type</TableHead>
                      <TableHead>From Date</TableHead>
                      <TableHead>To Date</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Applied On</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaveRequests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No leave requests found
                        </TableCell>
                      </TableRow>
                    ) : (
                      leaveRequests.map((leave) => (
                        <TableRow key={leave.id}>
                          <TableCell className="font-medium capitalize">
                            {leave.leaveType.replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell>{new Date(leave.startDate).toLocaleDateString()}</TableCell>
                          <TableCell>{new Date(leave.endDate).toLocaleDateString()}</TableCell>
                          <TableCell className="max-w-xs truncate">{leave.reason}</TableCell>
                          <TableCell>{getLeaveStatusBadge(leave.status)}</TableCell>
                          <TableCell>{new Date(leave.createdAt).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Employee: Attendance Tab - Keep existing code */}
        {!isFullAccessUser && (
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
                            max={new Date().toISOString().split('T')[0]}
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
                          <Label>Notes (Optional)</Label>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Month</Label>
                    <Select
                      value={selectedMonth.toString()}
                      onValueChange={(value) => setSelectedMonth(parseInt(value))}
                    >
                      <SelectTrigger>
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
                      <SelectTrigger>
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

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Working Days</CardDescription>
                      <CardTitle className="text-2xl">{stats.workingDays}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Present Days</CardDescription>
                      <CardTitle className="text-2xl">{stats.presentDays}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Leave Days</CardDescription>
                      <CardTitle className="text-2xl">{stats.leaveDays}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardDescription>Holidays</CardDescription>
                      <CardTitle className="text-2xl">{stats.holidays}</CardTitle>
                    </CardHeader>
                  </Card>
                </div>

                {/* Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>In Time</TableHead>
                      <TableHead>Out Time</TableHead>
                      <TableHead>Work Hours</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendance.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No attendance records found
                        </TableCell>
                      </TableRow>
                    ) : (
                      attendance.map((record, index) => {
                        const workHours = calculateWorkHours(record.checkIn, record.checkOut);

                        return (
                          <TableRow key={record.id}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell>{new Date(record.date).toLocaleDateString()}</TableCell>
                            <TableCell>
                              {record.checkIn ? new Date(record.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </TableCell>
                            <TableCell>
                              {record.checkOut ? new Date(record.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </TableCell>
                            <TableCell>
                              {workHours > 0 ? (
                                <span className="font-medium">{workHours} hrs</span>
                              ) : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  record.status === 'present' ? 'default' :
                                    record.status === 'absent' ? 'destructive' :
                                      'secondary'
                                }
                              >
                                {record.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate">{record.notes || '—'}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Company Holidays Tab - Keep existing code */}
        {/* Company Holidays Tab */}
        <TabsContent value="holidays">
          <Card>
            <CardHeader>
              <CardTitle>Company Holidays</CardTitle>
              <CardDescription>View company-wide holidays and observances</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filter */}
              <div className="flex items-end justify-between gap-4">
                <div className="w-[200px] space-y-2">
                  <Label>Year</Label>
                  <Select
                    value={holidayYear.toString()}
                    onValueChange={(value) => setHolidayYear(parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => {
                        const year = new Date().getFullYear() - 1 + i;
                        return (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {isFullAccessUser && (
                  <Button onClick={() => setShowHolidayDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Holiday
                  </Button>
                )}
              </div>

              {/* Table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                        No holidays found for {holidayYear}
                      </TableCell>
                    </TableRow>
                  ) : (
                    holidays.map((holiday) => (
                      <TableRow key={holiday.id}>
                        <TableCell className="font-medium">
                          {new Date(holiday.date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </TableCell>
                        <TableCell>{holiday.reason}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
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
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="half_day">Half Day</SelectItem>
                  <SelectItem value="leave">On Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={editAttendanceForm.notes}
                onChange={(e) => setEditAttendanceForm({ ...editAttendanceForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAttendance(null)}>Cancel</Button>
            <Button onClick={handleUpdateAttendance} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}