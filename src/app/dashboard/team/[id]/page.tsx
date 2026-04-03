'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Loader2, Calendar, Award, Trash2, Plus, Briefcase, X } from 'lucide-react';
import { EditEmployeeDialog } from '@/components/team/edit-employee-dialog';
import { AssignProjectsDialog } from '@/components/team/assign-projects-dialog';
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
import { toast } from 'sonner';

interface Employee {
  id: number;
  userId: number;
  employeeId: string;
  department: string;
  designation: string;
  dateOfJoining: string;
  dateOfBirth: string | null;
  skills: any;
  salary: number | null;
  status: string;
}

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: string;
}

interface ProjectMember {
  id: number;
  projectId: number;
  userId: number;
  role: string;
  assignedAt: string;
}

interface Project {
  id: number;
  name: string;
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const employeeId = params.id as string;

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [assignedProjects, setAssignedProjects] = useState<Array<ProjectMember & { projectName?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assignProjectDialogOpen, setAssignProjectDialogOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    fetchCurrentUser();
    fetchEmployeeData();
  }, [employeeId]);

  const fetchCurrentUser = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.user);
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  };

  const fetchEmployeeData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/employees?id=${employeeId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const empData = await response.json();
        setEmployee(empData);

        const userResponse = await fetch(`/api/users?id=${empData.userId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (userResponse.ok) {
          const userData = await userResponse.json();
          setUser(userData);
          
          // Fetch assigned projects
          fetchAssignedProjects(userData.id);
        }

        const attendanceRes = await fetch(`/api/attendance?employeeId=${employeeId}&limit=10`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (attendanceRes.ok) {
          const attendanceData = await attendanceRes.json();
          setAttendance(attendanceData);
        }

        const leavesRes = await fetch(`/api/leave-requests?employeeId=${employeeId}&limit=10`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (leavesRes.ok) {
          const leavesData = await leavesRes.json();
          setLeaves(leavesData);
        }
      }
    } catch (error) {
      console.error('Error fetching employee data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignedProjects = async (userId: number) => {
    try {
      const token = localStorage.getItem('session_token');
      const [membersRes, projectsRes] = await Promise.all([
        fetch(`/api/project-members?userId=${userId}&limit=100`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/projects?limit=100', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (membersRes.ok && projectsRes.ok) {
        const members = await membersRes.json();
        const projects = await projectsRes.json();
        
        // Map project names to members
        const membersWithNames = members.map((member: ProjectMember) => {
          const project = projects.find((p: Project) => p.id === member.projectId);
          return {
            ...member,
            projectName: project?.name || 'Unknown Project'
          };
        });
        
        setAssignedProjects(membersWithNames);
      }
    } catch (error) {
      console.error('Error fetching assigned projects:', error);
    }
  };

  const handleRemoveProject = async (membershipId: number) => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/project-members?id=${membershipId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        toast.success('Project assignment removed successfully');
        if (user) {
          fetchAssignedProjects(user.id);
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to remove project assignment');
      }
    } catch (error) {
      console.error('Error removing project assignment:', error);
      toast.error('An error occurred while removing project assignment');
    }
  };

  const handleDelete = async () => {
    if (!employee) return;

    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/employees?id=${employee.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        toast.success('Employee deleted successfully!');
        router.push('/dashboard/team');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete employee');
      }
    } catch (error) {
      console.error('Error deleting employee:', error);
      toast.error('An error occurred while deleting the employee');
    } finally {
      setDeleteDialogOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!employee || !user) {
    return (
      <div className="text-center py-8">
        <h3 className="text-lg font-semibold">Employee not found</h3>
        <Button onClick={() => router.push('/dashboard/team')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Team
        </Button>
      </div>
    );
  }

  const skills = employee.skills ? (typeof employee.skills === 'string' ? JSON.parse(employee.skills) : employee.skills) : [];
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'hr_manager' || currentUser?.role === 'cms_administrator';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/team')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              {user.firstName} {user.lastName}
            </h2>
            <p className="text-muted-foreground">{employee.designation}</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button onClick={() => setEditDialogOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Profile
            </Button>
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium">{user.email}</p>
            </div>
            {user.phone && (
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="text-sm font-medium">{user.phone}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Employee Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Employee ID</p>
              <p className="text-sm font-medium">{employee.employeeId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Department</p>
              <p className="text-sm font-medium">{employee.department}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Employment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Joining Date</p>
              <p className="text-sm font-medium">
                {new Date(employee.dateOfJoining).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant={employee.status === 'active' ? 'default' : 'secondary'}>
                {employee.status.replace('_', ' ')}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {skills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill: string, index: number) => (
                <Badge key={index} variant="outline">
                  {skill}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assigned Projects Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Assigned Projects
              </CardTitle>
              <CardDescription>Projects this team member is working on</CardDescription>
            </div>
            {isAdmin && (
              <Button onClick={() => setAssignProjectDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Assign Project
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {assignedProjects.length === 0 ? (
            <div className="text-center py-8">
              <Briefcase className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">No projects assigned yet</p>
              {isAdmin && (
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setAssignProjectDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Assign First Project
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {assignedProjects.map((assignment) => (
                <div key={assignment.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{assignment.projectName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs capitalize">
                        {assignment.role}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        Assigned: {new Date(assignment.assignedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveProject(assignment.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="attendance" className="w-full">
        <TabsList>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="leaves">Leave Requests</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance">
          <Card>
            <CardHeader>
              <CardTitle>Recent Attendance</CardTitle>
              <CardDescription>Last 10 attendance records</CardDescription>
            </CardHeader>
            <CardContent>
              {attendance.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-sm text-muted-foreground">No attendance records</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {attendance.map((record) => (
                    <div key={record.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="text-sm font-medium">
                          {new Date(record.date).toLocaleDateString('en-US', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {record.checkIn || '—'} to {record.checkOut || '—'}
                        </p>
                      </div>
                      <Badge variant={
                        record.status === 'present' ? 'default' :
                        record.status === 'half_day' ? 'secondary' :
                        'outline'
                      }>
                        {record.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaves">
          <Card>
            <CardHeader>
              <CardTitle>Leave Requests</CardTitle>
              <CardDescription>Recent leave applications</CardDescription>
            </CardHeader>
            <CardContent>
              {leaves.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-sm text-muted-foreground">No leave requests</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {leaves.map((leave) => (
                    <div key={leave.id} className="p-4 border rounded-lg space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge variant="outline" className="capitalize">{leave.leaveType}</Badge>
                          <p className="text-sm font-medium mt-2">{leave.reason}</p>
                        </div>
                        <Badge variant={
                          leave.status === 'approved' ? 'default' :
                          leave.status === 'rejected' ? 'destructive' :
                          'secondary'
                        }>
                          {leave.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <Card>
            <CardHeader>
              <CardTitle>Performance Reviews</CardTitle>
              <CardDescription>Employee performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Award className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-sm text-muted-foreground">No performance reviews yet</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {isAdmin && (
        <>
          <EditEmployeeDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            onSuccess={fetchEmployeeData}
            employee={employee}
            user={user}
          />

          <AssignProjectsDialog
            open={assignProjectDialogOpen}
            onOpenChange={setAssignProjectDialogOpen}
            onSuccess={() => {
              if (user) {
                fetchAssignedProjects(user.id);
              }
            }}
            userId={user.id}
            userName={`${user.firstName} ${user.lastName}`}
          />

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to delete this employee?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{user.firstName} {user.lastName}" and all associated records. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}