'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, User, Mail, Phone, MapPin, Calendar, Briefcase, Building2, IdCard } from 'lucide-react';
import { Label } from '@/components/ui/label';

interface Employee {
  id: number;
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  position: string;
  department: string;
  joinDate: string;
  status: string;
}

export default function ProfilePage() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEmployeeProfile();
  }, []);

  const fetchEmployeeProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');
      if (!token) {
        setError('Authentication required');
        return;
      }

      // First, get the current user to get the userId
      const userResponse = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!userResponse.ok) {
        setError('Failed to fetch user information');
        return;
      }

      const userData = await userResponse.json();
      
      // Then fetch employee details using userId
      const employeeResponse = await fetch(`/api/employees?userId=${userData.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (employeeResponse.ok) {
        const employeeData = await employeeResponse.json();
        if (employeeData && employeeData.length > 0) {
          setEmployee(employeeData[0]);
        } else {
          setError('Employee profile not found');
        }
      } else {
        setError('Failed to fetch employee profile');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setError('An error occurred while loading your profile');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">My Profile</h2>
          <p className="text-muted-foreground">View your personal information</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">My Profile</h2>
          <p className="text-muted-foreground">View your personal information</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <User className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">No profile information available</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get initials safely with fallback
  const getInitials = () => {
    const firstInitial = employee.firstName?.[0]?.toUpperCase() || '?';
    const lastInitial = employee.lastName?.[0]?.toUpperCase() || '?';
    return `${firstInitial}${lastInitial}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">My Profile</h2>
        <p className="text-muted-foreground">View your personal information and employment details</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Personal Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
            <CardDescription>Your basic personal details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground flex items-center gap-2">
                <IdCard className="h-4 w-4" />
                Full Name
              </Label>
              <p className="text-lg font-medium">{employee.firstName} {employee.lastName}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email Address
              </Label>
              <p className="text-lg">{employee.email}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Phone Number
              </Label>
              <p className="text-lg">{employee.phone || 'Not provided'}</p>
            </div>
          </CardContent>
        </Card>

        {/* Employment Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Employment Information
            </CardTitle>
            <CardDescription>Your work-related details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Position
              </Label>
              <p className="text-lg font-medium capitalize">{employee.position}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Department
              </Label>
              <p className="text-lg capitalize">{employee.department}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Join Date
              </Label>
              <p className="text-lg">{new Date(employee.joinDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Employment Status</Label>
              <div>
                <Badge variant={employee.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                  {employee.status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employee ID Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IdCard className="h-5 w-5" />
            Employee Identification
          </CardTitle>
          <CardDescription>Your unique employee identifier</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground text-2xl font-bold">
              {getInitials()}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Employee ID</p>
              <p className="text-2xl font-bold">EMP-{String(employee.id).padStart(4, '0')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}