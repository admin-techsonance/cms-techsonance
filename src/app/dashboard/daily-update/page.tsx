'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Loader2, Calendar, Clock, Edit, Eye, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { StatsSkeleton, TableSkeleton } from '@/components/ui/dashboard-skeleton';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
import { hasFullAccess, type UserRole } from '@/lib/permissions';

interface Project {
  id: number;
  name: string;
}

interface ProjectReport {
  id: string;
  projectId: number;
  description: string;
  trackerTime: number;
  isCoveredWork: boolean;
  isExtraWork: boolean;
}

interface DailyReport {
  id: number;
  date: string;
  availableStatus: string;
  createdAt: string;
  employeeId: number;
  firstName: string;
  lastName: string;
  email: string;
  userId: number;
}

interface DailyReportProject {
  id: number;
  projectId: number;
  description: string;
  trackerTime: number;
  isCoveredWork: boolean;
  isExtraWork: boolean;
  dailyReportId: number;
  createdAt: string;
  firstName?: string;
  lastName?: string;
}

interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  employeeId: string;
  status: string;
}

interface User {
  id: number;
  role: string;
}

export default function DailyUpdatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableStatus, setAvailableStatus] = useState('present');
  const [projectReports, setProjectReports] = useState<ProjectReport[]>([{
    id: '1',
    projectId: 0,
    description: '',
    trackerTime: 0,
    isCoveredWork: false,
    isExtraWork: false,
  }]);

  // Admin-specific state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allDailyReports, setAllDailyReports] = useState<DailyReport[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('all');
  const [adminStartDate, setAdminStartDate] = useState('');
  const [adminEndDate, setAdminEndDate] = useState('');
  const [adminStatusFilter, setAdminStatusFilter] = useState('all');
  const [deletingReport, setDeletingReport] = useState<DailyReport | null>(null);
  const [viewingReportDetails, setViewingReportDetails] = useState<DailyReport | null>(null);
  const [reportProjects, setReportProjects] = useState<DailyReportProject[]>([]);

  // Filter states for Extra/Covered Work
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState('all');
  const [extraWorkReports, setExtraWorkReports] = useState<DailyReportProject[]>([]);
  const [coveredWorkReports, setCoveredWorkReports] = useState<DailyReportProject[]>([]);
  const [projectsList, setProjectsList] = useState<Project[]>([]);

  // My History State
  const [myHistoryReports, setMyHistoryReports] = useState<DailyReport[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilterType, setHistoryFilterType] = useState<'month' | 'range'>('month');
  const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const [loadingExtraWork, setLoadingExtraWork] = useState(false);
  const [loadingCoveredWork, setLoadingCoveredWork] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Pagination states
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [extraWorkPage, setExtraWorkPage] = useState(0);
  const [extraWorkTotal, setExtraWorkTotal] = useState(0);
  const [coveredWorkPage, setCoveredWorkPage] = useState(0);
  const [coveredWorkTotal, setCoveredWorkTotal] = useState(0);
  const pageSize = 10;

  // New filters for Extra/Covered Work
  const [isExtraWorkMonthFilter, setIsExtraWorkMonthFilter] = useState(true);
  const [extraWorkMonth, setExtraWorkMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedEmployeeExtraWork, setSelectedEmployeeExtraWork] = useState('all');
  
  const [isCoveredWorkMonthFilter, setIsCoveredWorkMonthFilter] = useState(true);
  const [coveredWorkMonth, setCoveredWorkMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedEmployeeCoveredWork, setSelectedEmployeeCoveredWork] = useState('all');

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchProjects();
      fetchProjectsList();
      fetchExistingReport();
    }
  }, [currentUser, date]);

  useEffect(() => {
    if (currentUser && hasFullAccess(currentUser.role as UserRole)) {
      fetchAllDailyReports();
      fetchEmployees();
    }
  }, [currentUser, selectedEmployeeFilter, adminStartDate, adminEndDate, adminStatusFilter]);

  const fetchExistingReport = async () => {
    if (!currentUser || !date) return;

    try {
      const token = localStorage.getItem('session_token');
      // Fetch report for this date
      const response = await fetch(`/api/daily-reports?startDate=${date}&endDate=${date}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const reports = await response.json();
        // The API returns an array, but should be only one for (user + date)
        const existing = reports.find((r: DailyReport) => r.date.startsWith(date));
        
        if (existing) {
          setAvailableStatus(existing.availableStatus);
          // Fetch associated projects
          const projectsResponse = await fetch(`/api/daily-report-projects?dailyReportId=${existing.id}&limit=100`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (projectsResponse.ok) {
            const prs = await projectsResponse.json();
            if (prs.length > 0) {
              setProjectReports(prs.map((p: any) => ({
                id: p.id.toString(), // Mark as already existing by using its ID
                projectId: p.projectId,
                description: p.description,
                trackerTime: p.trackerTime,
                isCoveredWork: p.isCoveredWork,
                isExtraWork: p.isExtraWork,
                isSubmitted: true // Flag to know this was already in DB
              })));
              return;
            }
          }
        }
      }
      
      // If no report or projects found, reset to a clean entry
      setProjectReports([{
        id: Date.now().toString(),
        projectId: 0,
        description: '',
        trackerTime: 0,
        isCoveredWork: false,
        isExtraWork: false,
      }]);
      setAvailableStatus('present');
    } catch (error) {
      console.error('Error fetching existing report:', error);
    }
  };

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

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const token = localStorage.getItem('session_token');

      // Check if user has full access (admin, hr_manager, cms_administrator)
      if (currentUser && hasFullAccess(currentUser.role as UserRole)) {
        // Fetch all projects for admin roles
        const response = await fetch('/api/projects?limit=100', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setProjects(data);
        }
      } else {
        // Fetch only assigned projects for other roles
        const memberResponse = await fetch('/api/project-members?limit=1000', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (memberResponse.ok) {
          const members = await memberResponse.json();
          const userProjectIds = members
            .filter((m: any) => m.userId === currentUser?.id)
            .map((m: any) => m.projectId);

          const projectsResponse = await fetch('/api/projects?limit=100', {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (projectsResponse.ok) {
            const allProjects = await projectsResponse.json();
            const filteredProjects = allProjects.filter((p: Project) =>
              userProjectIds.includes(p.id)
            );
            setProjects(filteredProjects);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchProjectsList = async () => {
    try {
      const token = localStorage.getItem('session_token');

      // Check if user has full access (admin, hr_manager, cms_administrator)
      if (currentUser && hasFullAccess(currentUser.role as UserRole)) {
        // Fetch all projects for admin roles
        const response = await fetch('/api/projects?limit=100', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setProjectsList(data);
        }
      } else {
        // For other roles, fetch only assigned projects
        const memberResponse = await fetch('/api/project-members?limit=1000', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (memberResponse.ok) {
          const members = await memberResponse.json();
          const userProjectIds = members
            .filter((m: any) => m.userId === currentUser?.id)
            .map((m: any) => m.projectId);

          const projectsResponse = await fetch('/api/projects?limit=100', {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (projectsResponse.ok) {
            const allProjects = await projectsResponse.json();
            const filteredProjects = allProjects.filter((p: Project) =>
              userProjectIds.includes(p.id)
            );
            setProjectsList(filteredProjects);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching projects list:', error);
    }
  };

  const fetchEmployees = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/employees?limit=100', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const employeesData = await response.json();

        // Fetch user details for all employees
        const usersResponse = await fetch('/api/users?limit=100', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (usersResponse.ok) {
          const usersData = await usersResponse.json();

          // Merge employee and user data
          const enrichedEmployees = employeesData.map((emp: any) => {
            const user = usersData.find((u: any) => u.id === emp.userId);
            return {
              ...emp,
              firstName: user?.firstName || '',
              lastName: user?.lastName || ''
            };
          });

          setEmployees(enrichedEmployees);
        } else {
          setEmployees(employeesData);
        }
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchAllDailyReports = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      let url = '/api/daily-reports?limit=100';

      if (selectedEmployeeFilter !== 'all') url += `&employeeId=${selectedEmployeeFilter}`;
      if (adminStartDate) url += `&startDate=${adminStartDate}`;
      if (adminEndDate) url += `&endDate=${adminEndDate}`;
      if (adminStatusFilter !== 'all') url += `&availableStatus=${adminStatusFilter}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setAllDailyReports(data);
      }
    } catch (error) {
      console.error('Error fetching all daily reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchReportProjects = async (reportId: number) => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/daily-report-projects?dailyReportId=${reportId}&limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setReportProjects(data);
      }
    } catch (error) {
      console.error('Error fetching report projects:', error);
    }
  };

  const handleViewReportDetails = async (report: DailyReport) => {
    setViewingReportDetails(report);
    await fetchReportProjects(report.id);
  };

  const handleDeleteReport = async () => {
    if (!deletingReport) return;

    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/daily-reports?id=${deletingReport.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('Daily report deleted successfully!');
        fetchAllDailyReports();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete report');
      }
    } catch (error) {
      console.error('Error deleting report:', error);
      toast.error('An error occurred while deleting the report');
    } finally {
      setDeletingReport(null);
    }
  };

  const addProjectReport = () => {
    setProjectReports([...projectReports, {
      id: Date.now().toString(),
      projectId: 0,
      description: '',
      trackerTime: 0,
      isCoveredWork: false,
      isExtraWork: false,
    }]);
  };

  const removeProjectReport = (id: string) => {
    setProjectReports(projectReports.filter(pr => pr.id !== id));
  };

  const updateProjectReport = (id: string, field: string, value: any) => {
    setProjectReports(projectReports.map(pr =>
      pr.id === id ? { ...pr, [field]: value } : pr
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('session_token');

      // Validate
      if (!date) {
        toast.error('Please select a date');
        return;
      }

      if (projectReports.some(pr => !pr.projectId || !pr.description || pr.trackerTime <= 0)) {
        toast.error('Please fill all project report fields');
        return;
      }

      // Create daily report (API will update if one already exists for this date)
      const reportResponse = await fetch('/api/daily-reports', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date, availableStatus }),
      });

      if (!reportResponse.ok) {
        const error = await reportResponse.json();
        toast.error(error.error || 'Failed to create daily report');
        setLoading(false);
        return;
      }

      const dailyReport = await reportResponse.json();

      // Create project reports
      for (const pr of projectReports) {
        // Skip projects that are already submitted (fetched from DB)
        if ((pr as any).isSubmitted) continue;

        await fetch('/api/daily-report-projects', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dailyReportId: dailyReport.id,
            projectId: pr.projectId,
            description: pr.description,
            trackerTime: pr.trackerTime,
            isCoveredWork: pr.isCoveredWork,
            isExtraWork: pr.isExtraWork,
          }),
        });
      }

      toast.success('Daily report details saved successfully!');
      fetchExistingReport(); // Refresh the form with saved data

      toast.success('Daily report submitted successfully!');

      // Reset form
      setProjectReports([{
        id: '1',
        projectId: 0,
        description: '',
        trackerTime: 0,
        isCoveredWork: false,
        isExtraWork: false,
      }]);
      setDate(new Date().toISOString().split('T')[0]);
      setAvailableStatus('present');

      if (currentUser && hasFullAccess(currentUser.role as UserRole)) {
        fetchAllDailyReports();
      }
      fetchMyHistory(); // Refresh history for everyone
    } catch (error) {
      console.error('Error submitting daily report:', error);
      toast.error('An error occurred while submitting the report');
    } finally {
      setLoading(false);
    }
  };

  const fetchExtraWork = async () => {
    setLoadingExtraWork(true);
    try {
      const token = localStorage.getItem('session_token');
      let url = `/api/daily-report-projects?isExtraWork=true&limit=${pageSize}&offset=${extraWorkPage * pageSize}`;
      
      if (isExtraWorkMonthFilter && extraWorkMonth) {
        const [year, month] = extraWorkMonth.split('-');
        const start = `${year}-${month}-01`;
        const end = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
        url += `&startDate=${start}&endDate=${end}`;
      } else {
        if (startDate) url += `&startDate=${startDate}`;
        if (endDate) url += `&endDate=${endDate}`;
      }

      if (selectedProjectFilter !== 'all') url += `&projectId=${selectedProjectFilter}`;
      if (isAdmin && selectedEmployeeExtraWork !== 'all') url += `&employeeId=${selectedEmployeeExtraWork}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setExtraWorkReports(data);
        // Simple heuristic for total: if we got less than pageSize, we're on last page
        setExtraWorkTotal(extraWorkPage * pageSize + data.length + (data.length === pageSize ? 1 : 0));
      }
    } catch (error) {
      console.error('Error fetching extra work:', error);
    } finally {
      setLoadingExtraWork(false);
    }
  };

  const fetchCoveredWork = async () => {
    setLoadingCoveredWork(true);
    try {
      const token = localStorage.getItem('session_token');
      let url = `/api/daily-report-projects?isCoveredWork=true&limit=${pageSize}&offset=${coveredWorkPage * pageSize}`;

      if (isCoveredWorkMonthFilter && coveredWorkMonth) {
        const [year, month] = coveredWorkMonth.split('-');
        const start = `${year}-${month}-01`;
        const end = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
        url += `&startDate=${start}&endDate=${end}`;
      } else {
        if (startDate) url += `&startDate=${startDate}`;
        if (endDate) url += `&endDate=${endDate}`;
      }

      if (selectedProjectFilter !== 'all') url += `&projectId=${selectedProjectFilter}`;
      if (isAdmin && selectedEmployeeCoveredWork !== 'all') url += `&employeeId=${selectedEmployeeCoveredWork}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCoveredWorkReports(data);
        setCoveredWorkTotal(coveredWorkPage * pageSize + data.length + (data.length === pageSize ? 1 : 0));
      }
    } catch (error) {
      console.error('Error fetching covered work:', error);
    } finally {
      setLoadingCoveredWork(false);
    }
  };

  const fetchMyHistory = async () => {
    if (!currentUser) return;

    setLoadingHistory(true);
    try {
      const token = localStorage.getItem('session_token');
      // For non-admins, API auto-filters by userId. 
      // For admins, we want to see OUR OWN history here, but the API might give all if we don't filter.
      // However, the requirement is for "employees can see there all daily updates".
      // Let's assume admins also want to see their own history in this tab.
      // But wait, the API: "Admin/HR can view all reports, others only their own".
      // If admin calls it without employeeId, they get ALL.
      // So if admin is viewing "My History", we MUST explicitly pass employeeId (if mapped) or filter client-side?
      // Actually, standard employees just call it and get theirs.
      // Let's fetch and rely on role behavior, but for Admins to see THEIR OWN history is a bit tricky if API returns ALL.
      // FIX: Add `userId=me` or similar? No, API doesn't support that.
      // Workaround: We will client-side filter for admins if needed, OR relies on the fact that admins mainly use "All Reports".
      // But for robustness:

      let url = `/api/daily-reports?limit=${pageSize}&offset=${historyPage * pageSize}`;

      if (historyFilterType === 'month' && historyMonth) {
        const [year, month] = historyMonth.split('-');
        const start = `${year}-${month}-01`;
        const end = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
        url += `&startDate=${start}&endDate=${end}`;
      } else if (historyFilterType === 'range') {
        if (historyStartDate) url += `&startDate=${historyStartDate}`;
        if (historyEndDate) url += `&endDate=${historyEndDate}`;
      }

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        let data = await response.json();
        if (hasFullAccess(currentUser.role as UserRole)) {
          data = data.filter((r: DailyReport) => r.userId === currentUser.id);
        }
        setMyHistoryReports(data);
        setHistoryTotal(historyPage * pageSize + data.length + (data.length === pageSize ? 1 : 0));
      }
    } catch (error) {
      console.error('Error fetching history:', error);
      toast.error('Failed to load history');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchMyHistory();
    }
  }, [currentUser, historyMonth, historyFilterType, historyStartDate, historyEndDate, historyPage]);

  useEffect(() => {
    if (currentUser) {
      fetchExtraWork();
    }
  }, [currentUser, extraWorkMonth, isExtraWorkMonthFilter, startDate, endDate, selectedProjectFilter, selectedEmployeeExtraWork, extraWorkPage]);

  useEffect(() => {
    if (currentUser) {
      fetchCoveredWork();
    }
  }, [currentUser, coveredWorkMonth, isCoveredWorkMonthFilter, startDate, endDate, selectedProjectFilter, selectedEmployeeCoveredWork, coveredWorkPage]);

  const getProjectName = (projectId: number) => {
    const project = projectsList.find(p => p.id === projectId);
    return project?.name || 'Unknown Project';
  };

  const getEmployeeName = (report: DailyReport) => {
    // Use firstName and lastName from the report (now included in API response)
    if (report.firstName && report.lastName) {
      return `${report.firstName} ${report.lastName}`;
    }
    return 'Unknown Employee';
  };

  const isAdmin = currentUser && hasFullAccess(currentUser.role as UserRole);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          {isAdmin ? 'Daily Updates Management' : 'My Daily Update'}
        </h2>
        <p className="text-muted-foreground">
          {isAdmin
            ? 'Manage all employee daily reports and track work activities'
            : 'Track your daily work progress and project activities'}
        </p>
      </div>

      <Tabs defaultValue={isAdmin ? "all-reports" : "daily-report"} className="space-y-6">
        <TabsList className={isAdmin ? "grid w-full grid-cols-6" : "grid w-full grid-cols-5"}>
          {isAdmin && <TabsTrigger value="all-reports"><Users className="mr-2 h-4 w-4" />All Reports</TabsTrigger>}
          <TabsTrigger value="daily-report">Daily Report</TabsTrigger>
          <TabsTrigger value="my-history">My History</TabsTrigger>
          <TabsTrigger value="extra-work">Extra Work</TabsTrigger>
          <TabsTrigger value="covered-work">Covered Work</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
        </TabsList>

        {/* Admin: All Reports Tab */}
        {isAdmin && (
          <TabsContent value="all-reports">
            <Card>
              <CardHeader>
                <CardTitle>All Employee Daily Reports</CardTitle>
                <CardDescription>View, manage, and track all employee daily work reports</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Employee Name</Label>
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
                              {emp.firstName} {emp.lastName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={adminStartDate}
                      onChange={(e) => setAdminStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={adminEndDate}
                      onChange={(e) => setAdminEndDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={adminStatusFilter} onValueChange={setAdminStatusFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="half_day">Half Day</SelectItem>
                        <SelectItem value="early_leave">Early Leave</SelectItem>
                        <SelectItem value="on_leave">On Leave</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Statistics */}
                {loading ? (
                  <StatsSkeleton />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardDescription>Total Reports</CardDescription>
                        <CardTitle className="text-2xl">{allDailyReports.length}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-3">
                        <CardDescription>Present</CardDescription>
                        <CardTitle className="text-2xl">
                          {allDailyReports.filter(r => r.availableStatus === 'present').length}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-3">
                        <CardDescription>Half Day</CardDescription>
                        <CardTitle className="text-2xl">
                          {allDailyReports.filter(r => r.availableStatus === 'half_day').length}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-3">
                        <CardDescription>On Leave</CardDescription>
                        <CardTitle className="text-2xl">
                          {allDailyReports.filter(r => r.availableStatus === 'on_leave').length}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                  </div>
                )}

                {/* Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableSkeleton columns={5} rows={5} />
                    ) : allDailyReports.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No daily reports found
                        </TableCell>
                      </TableRow>
                    ) : (
                      allDailyReports.map((report) => (
                        <TableRow key={report.id}>
                          <TableCell className="font-medium">
                            {getEmployeeName(report)}
                          </TableCell>
                          <TableCell>{new Date(report.date).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Badge variant={
                              report.availableStatus === 'present' ? 'default' :
                                report.availableStatus === 'on_leave' ? 'destructive' :
                                  'secondary'
                            }>
                              {report.availableStatus.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>{new Date(report.createdAt).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewReportDetails(report)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingReport(report)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Daily Report Tab */}
        <TabsContent value="daily-report">
          <Card>
            <CardHeader>
              <CardTitle>Add Daily Report</CardTitle>
              <CardDescription>
                Submit your daily work report and project activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date *</Label>
                    <div className="relative">
                      <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="date"
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="pl-8"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">Available Status *</Label>
                    <Select value={availableStatus} onValueChange={setAvailableStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="half_day">Half Day</SelectItem>
                        <SelectItem value="early_leave">Early Leave</SelectItem>
                        <SelectItem value="on_leave">On Leave</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Project-wise Reports *</Label>
                    <Button type="button" size="sm" onClick={addProjectReport}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Project
                    </Button>
                  </div>

                  {projectReports.map((pr, index) => (
                    <Card key={pr.id} className="p-4">
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <h4 className="font-medium">Project {index + 1}</h4>
                          {projectReports.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeProjectReport(pr.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Project *</Label>
                            <Select
                              value={pr.projectId.toString()}
                              onValueChange={(value) => updateProjectReport(pr.id, 'projectId', parseInt(value))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select project" />
                              </SelectTrigger>
                              <SelectContent>
                                {projects.map(project => (
                                  <SelectItem key={project.id} value={project.id.toString()}>
                                    {project.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Tracker Time (minutes) *</Label>
                            <div className="relative">
                              <Clock className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                type="number"
                                min="0"
                                value={pr.trackerTime || ''}
                                onChange={(e) => updateProjectReport(pr.id, 'trackerTime', parseInt(e.target.value) || 0)}
                                className="pl-8"
                                placeholder="e.g., 480 (8 hours)"
                                required
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Description *</Label>
                          <Textarea
                            value={pr.description}
                            onChange={(e) => updateProjectReport(pr.id, 'description', e.target.value)}
                            placeholder="Describe what you worked on..."
                            rows={3}
                            required
                          />
                        </div>

                        <div className="flex gap-4 items-center">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`covered-${pr.id}`}
                              checked={pr.isCoveredWork}
                              onCheckedChange={(checked) => updateProjectReport(pr.id, 'isCoveredWork', checked)}
                              disabled={(pr as any).isSubmitted}
                            />
                            <Label htmlFor={`covered-${pr.id}`} className="font-normal">
                              Is Covered Work?
                            </Label>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`extra-${pr.id}`}
                              checked={pr.isExtraWork}
                              onCheckedChange={(checked) => updateProjectReport(pr.id, 'isExtraWork', checked)}
                              disabled={(pr as any).isSubmitted}
                            />
                            <Label htmlFor={`extra-${pr.id}`} className="font-normal">
                              Is Extra Work?
                            </Label>
                          </div>

                          {(pr as any).isSubmitted && (
                            <Badge variant="secondary" className="ml-auto bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                              Already Submitted
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                <Button type="submit" disabled={loading} className="w-full md:w-auto">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Daily Report'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Extra Work Tab */}
        <TabsContent value="extra-work">
          <Card>
            <CardHeader>
              <CardTitle>Extra Work Report</CardTitle>
              <CardDescription>View all extra work activities</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-2 min-w-[150px]">
                  <Label>Filter By</Label>
                  <Select value={isExtraWorkMonthFilter ? "month" : "range"} onValueChange={(v) => setIsExtraWorkMonthFilter(v === "month")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Month</SelectItem>
                      <SelectItem value="range">Date Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {isExtraWorkMonthFilter ? (
                  <div className="space-y-2">
                    <Label>Select Month</Label>
                    <Input
                      type="month"
                      value={extraWorkMonth}
                      onChange={(e) => setExtraWorkMonth(e.target.value)}
                      className="w-full md:w-[200px]"
                    />
                  </div>
                ) : (
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

                <div className="space-y-2 min-w-[200px]">
                  <Label>Project</Label>
                  <Select value={selectedProjectFilter} onValueChange={setSelectedProjectFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      {projectsList.map(project => (
                        <SelectItem key={project.id} value={project.id.toString()}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isAdmin && (
                  <div className="space-y-2 min-w-[200px]">
                    <Label>Employee</Label>
                    <Select value={selectedEmployeeExtraWork} onValueChange={setSelectedEmployeeExtraWork}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Employees</SelectItem>
                        {employees.map(emp => (
                          <SelectItem key={emp.id} value={emp.id.toString()}>
                            {emp.firstName} {emp.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-end">
                  <Button onClick={fetchExtraWork} className="w-full">
                    Apply Filter
                  </Button>
                </div>
              </div>

              <div className="rounded-md border max-h-[600px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      {isAdmin && <TableHead>Employee</TableHead>}
                      <TableHead>Project</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Time (hrs)</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingExtraWork ? (
                      <TableSkeleton columns={isAdmin ? 5 : 4} rows={5} />
                    ) : extraWorkReports.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground py-8">
                          No extra work found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      extraWorkReports.map((report) => (
                        <TableRow key={report.id}>
                          {isAdmin && (
                            <TableCell className="font-medium text-primary">
                              {report.firstName} {report.lastName}
                            </TableCell>
                          )}
                          <TableCell className="font-medium">
                            {getProjectName(report.projectId)}
                          </TableCell>
                          <TableCell>{report.description}</TableCell>
                          <TableCell>{(report.trackerTime / 60).toFixed(1)}</TableCell>
                          <TableCell>{new Date(report.createdAt).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-end space-x-2 py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExtraWorkPage(p => Math.max(0, p - 1))}
                  disabled={extraWorkPage === 0}
                >
                  Previous
                </Button>
                <div className="text-sm font-medium">Page {extraWorkPage + 1}</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExtraWorkPage(p => p + 1)}
                  disabled={extraWorkReports.length < pageSize}
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Covered Work Tab */}
        <TabsContent value="covered-work">
          <Card>
            <CardHeader>
              <CardTitle>Covered Work Report</CardTitle>
              <CardDescription>View all covered work activities</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-2 min-w-[150px]">
                  <Label>Filter By</Label>
                  <Select value={isCoveredWorkMonthFilter ? "month" : "range"} onValueChange={(v) => setIsCoveredWorkMonthFilter(v === "month")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Month</SelectItem>
                      <SelectItem value="range">Date Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {isCoveredWorkMonthFilter ? (
                  <div className="space-y-2">
                    <Label>Select Month</Label>
                    <Input
                      type="month"
                      value={coveredWorkMonth}
                      onChange={(e) => setCoveredWorkMonth(e.target.value)}
                      className="w-full md:w-[200px]"
                    />
                  </div>
                ) : (
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

                <div className="space-y-2 min-w-[200px]">
                  <Label>Project</Label>
                  <Select value={selectedProjectFilter} onValueChange={setSelectedProjectFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      {projectsList.map(project => (
                        <SelectItem key={project.id} value={project.id.toString()}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isAdmin && (
                  <div className="space-y-2 min-w-[200px]">
                    <Label>Employee</Label>
                    <Select value={selectedEmployeeCoveredWork} onValueChange={setSelectedEmployeeCoveredWork}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Employees</SelectItem>
                        {employees.map(emp => (
                          <SelectItem key={emp.id} value={emp.id.toString()}>
                            {emp.firstName} {emp.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-end">
                  <Button onClick={fetchCoveredWork} className="w-full">
                    Apply Filter
                  </Button>
                </div>
              </div>

              <div className="rounded-md border max-h-[600px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      {isAdmin && <TableHead>Employee</TableHead>}
                      <TableHead>Project</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Time (hrs)</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingCoveredWork ? (
                      <TableSkeleton columns={isAdmin ? 5 : 4} rows={5} />
                    ) : coveredWorkReports.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground py-8">
                          No covered work found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      coveredWorkReports.map((report) => (
                        <TableRow key={report.id}>
                          {isAdmin && (
                            <TableCell className="font-medium text-primary">
                              {report.firstName} {report.lastName}
                            </TableCell>
                          )}
                          <TableCell className="font-medium">
                            {getProjectName(report.projectId)}
                          </TableCell>
                          <TableCell>{report.description}</TableCell>
                          <TableCell>{(report.trackerTime / 60).toFixed(1)}</TableCell>
                          <TableCell>{new Date(report.createdAt).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-end space-x-2 py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCoveredWorkPage(p => Math.max(0, p - 1))}
                  disabled={coveredWorkPage === 0}
                >
                  Previous
                </Button>
                <div className="text-sm font-medium">Page {coveredWorkPage + 1}</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCoveredWorkPage(p => p + 1)}
                  disabled={coveredWorkReports.length < pageSize}
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Projects Tab */}
        <TabsContent value="projects">
          <Card>
            <CardHeader>
              <CardTitle>My Projects</CardTitle>
              <CardDescription>View all your assigned projects</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project Name</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingProjects ? (
                    <TableSkeleton columns={4} rows={5} />
                  ) : projectsList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No projects assigned
                      </TableCell>
                    </TableRow>
                  ) : (
                    projectsList.map((project: any) => (
                      <TableRow key={project.id}>
                        <TableCell className="font-medium">{project.name}</TableCell>
                        <TableCell>
                          {project.startDate ? new Date(project.startDate).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={project.status === 'in_progress' ? 'default' : 'secondary'}>
                            {project.status?.replace('_', ' ') || 'N/A'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={project.priority === 'high' ? 'destructive' : 'default'}>
                            {project.priority || 'N/A'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* My History Tab */}
        <TabsContent value="my-history">
          <Card>
            <CardHeader>
              <CardTitle>My Daily Updates History</CardTitle>
              <CardDescription>View your past daily reports</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-2 min-w-[150px]">
                  <Label>Filter By</Label>
                  <Select value={historyFilterType} onValueChange={(v: 'month' | 'range') => setHistoryFilterType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Month</SelectItem>
                      <SelectItem value="range">Date Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {historyFilterType === 'month' ? (
                  <div className="space-y-2">
                    <Label>Select Month</Label>
                    <Input
                      type="month"
                      value={historyMonth}
                      onChange={(e) => setHistoryMonth(e.target.value)}
                      className="w-full md:w-[200px]"
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={historyStartDate}
                        onChange={(e) => setHistoryStartDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input
                        type="date"
                        value={historyEndDate}
                        onChange={(e) => setHistoryEndDate(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div className="flex items-end">
                  <Button onClick={fetchMyHistory} disabled={loadingHistory} variant="outline">
                    {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                  </Button>
                </div>
              </div>

              {/* History Table */}
              <div className="rounded-md border max-h-[600px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Projects Worked On</TableHead>
                      <TableHead>Submitted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingHistory ? (
                      <TableSkeleton columns={5} rows={5} />
                    ) : myHistoryReports.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No reports found for the selected period
                        </TableCell>
                      </TableRow>
                    ) : (
                      myHistoryReports.map((report) => (
                        <TableRow key={report.id}>
                          <TableCell className="font-medium">
                            {new Date(report.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              report.availableStatus === 'present' ? 'default' :
                                report.availableStatus === 'on_leave' ? 'destructive' :
                                  'secondary'
                            }>
                              {report.availableStatus.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate text-muted-foreground text-sm">
                            Click 'View' to see projects
                          </TableCell>
                          <TableCell>{new Date(report.createdAt).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewReportDetails(report)}
                            >
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-end space-x-2 py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                  disabled={historyPage === 0}
                >
                  Previous
                </Button>
                <div className="text-sm font-medium">Page {historyPage + 1}</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHistoryPage(p => p + 1)}
                  disabled={myHistoryReports.length < pageSize}
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Report Details Dialog */}
      {isAdmin || viewingReportDetails ? (
        <AlertDialog open={viewingReportDetails !== null} onOpenChange={() => setViewingReportDetails(null)}>
          <AlertDialogContent className="max-w-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Daily Report Details</AlertDialogTitle>
              <AlertDialogDescription>
                View complete information about this daily report
              </AlertDialogDescription>
            </AlertDialogHeader>
            {viewingReportDetails && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Employee Name</Label>
                    <p className="font-medium">{getEmployeeName(viewingReportDetails)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Date</Label>
                    <p className="font-medium">{new Date(viewingReportDetails.date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <Badge variant={
                      viewingReportDetails.availableStatus === 'present' ? 'default' :
                        viewingReportDetails.availableStatus === 'on_leave' ? 'destructive' :
                          'secondary'
                    }>
                      {viewingReportDetails.availableStatus.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Submitted At</Label>
                    <p>{new Date(viewingReportDetails.createdAt).toLocaleString()}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground mb-2 block">Project Activities</Label>
                  <div className="space-y-2">
                    {reportProjects.map((rp) => (
                      <Card key={rp.id} className="p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-medium">{getProjectName(rp.projectId)}</div>
                          <div className="flex gap-2">
                            {rp.isExtraWork && <Badge variant="secondary">Extra Work</Badge>}
                            {rp.isCoveredWork && <Badge variant="outline">Covered Work</Badge>}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{rp.description}</p>
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-3 w-3" />
                          <span>{(rp.trackerTime / 60).toFixed(1)} hours</span>
                        </div>
                      </Card>
                    ))}
                    {reportProjects.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No project activities recorded
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setViewingReportDetails(null)}>
                Close
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      {/* Delete Confirmation Dialog */}
      {isAdmin && (
        <AlertDialog open={deletingReport !== null} onOpenChange={() => setDeletingReport(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Daily Report?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this daily report? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteReport} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}