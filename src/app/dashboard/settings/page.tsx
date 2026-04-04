'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Save, Building2, Palette, Users, Plug, Plus, Key, User as UserIcon, Calendar, Mail, Shield, Briefcase, Phone, Banknote, Award, Globe, Fingerprint, Activity } from 'lucide-react';
import { DetailedPageSkeleton } from '@/components/ui/dashboard-skeleton';
import { toast } from 'sonner';
import { UserRole, hasFullAccess, getRoleName } from '@/lib/permissions';

interface CompanySettings {
  companyName: string;
  email: string;
  phone: string | null;
  address: string | null;
  website: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
}

interface BusinessSettings {
  id?: number;
  businessName: string;
  email: string;
  phone: string;
  address: string;
  gstNo: string;
  pan: string;
  tan: string;
  registrationNo: string;
  termsAndConditions: string;
  notes: string;
  paymentTerms: string;
  logoUrl: string;
}

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  employeeId?: string | null;
  joiningDate?: string | null;
  designation?: string | null;
  phone?: string | null;
  department?: string | null;
  dateOfBirth?: string | null;
  skills?: any;
  salary?: number | null;
  status?: string | null;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<CompanySettings>({
    companyName: '',
    email: '',
    phone: '',
    address: '',
    website: '',
    primaryColor: '#3B82F6',
    secondaryColor: '#10B981',
    logoUrl: '',
  });
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>({
    businessName: '',
    email: '',
    phone: '',
    address: '',
    gstNo: '',
    pan: '',
    tan: '',
    registrationNo: '',
    termsAndConditions: '',
    notes: '',
    paymentTerms: '',
    logoUrl: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const userRes = await fetchCurrentUser();
      if (userRes && hasFullAccess(userRes.role)) {
        await fetchSettings();
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
    } finally {
      setLoading(false);
    }
  };

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
        return data.user as User;
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
    return null;
  };

  const fetchSettings = async () => {
    try {
      const [companyRes, businessRes] = await Promise.all([
        fetch('/api/company-settings'),
        fetch('/api/business-settings')
      ]);

      if (companyRes.ok) {
        setSettings(await companyRes.json());
      }

      if (businessRes.ok) {
        setBusinessSettings(await businessRes.json());
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/company-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        toast.success('Settings saved successfully');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBusinessSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/business-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(businessSettings)
      });
      if (res.ok) {
        toast.success('Business settings saved successfully');
        fetchSettings();
      } else {
        toast.error('Failed to save business settings');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('Please fill in all password fields');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters long');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setChangingPassword(true);
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Password changed successfully!');
        setPasswordForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        });
      } else {
        toast.error(data.error || 'Failed to change password');
      }
    } catch (error) {
      console.error('Error changing password:', error);
      toast.error('An error occurred while changing password');
    } finally {
      setChangingPassword(false);
    }
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return 'N/A';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getSkills = (skills: any) => {
    if (!skills) return [];
    if (typeof skills === 'string') {
      try {
        return JSON.parse(skills);
      } catch {
        return skills.split(',').map((s: string) => s.trim());
      }
    }
    return Array.isArray(skills) ? skills : [];
  };

  if (loading) {
    return <DetailedPageSkeleton />;
  }

  const isAdmin = currentUser && hasFullAccess(currentUser.role);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          {isAdmin ? 'Manage company profile, appearance, and integrations' : 'View your profile and manage account security'}
        </p>
      </div>

      <Tabs defaultValue={isAdmin ? "company" : "profile"} className="w-full">
        <TabsList className="flex flex-wrap justify-start h-auto gap-1 bg-transparent border-b rounded-none p-0 mb-6">
          <TabsTrigger value="profile" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-4 py-2">
            <UserIcon className="mr-2 h-4 w-4" />
            My Information
          </TabsTrigger>
          
          {isAdmin && (
            <>
              <TabsTrigger value="company" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-4 py-2">
                <Building2 className="mr-2 h-4 w-4" />
                Company Profile
              </TabsTrigger>
              <TabsTrigger value="appearance" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-4 py-2">
                <Palette className="mr-2 h-4 w-4" />
                Appearance
              </TabsTrigger>
              <TabsTrigger value="users" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-4 py-2">
                <Users className="mr-2 h-4 w-4" />
                Users & Roles
              </TabsTrigger>
              <TabsTrigger value="integrations" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-4 py-2">
                <Plug className="mr-2 h-4 w-4" />
                Integrations
              </TabsTrigger>
              <TabsTrigger value="business" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-4 py-2">
                <Building2 className="mr-2 h-4 w-4" />
                Invoice Settings
              </TabsTrigger>
            </>
          )}

          <TabsTrigger value="password" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent shadow-none px-4 py-2">
            <Key className="mr-2 h-4 w-4" />
            Change Password
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="grid gap-6">
            {/* Header Card */}
            <Card className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 border-primary/10">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center border-4 border-white dark:border-slate-800 shadow-xl overflow-hidden">
                    <UserIcon className="h-12 w-12 text-primary" />
                  </div>
                  <div className="text-center md:text-left space-y-2">
                    <h3 className="text-3xl font-bold tracking-tight">{currentUser?.firstName} {currentUser?.lastName}</h3>
                    <div className="flex flex-wrap justify-center md:justify-start gap-2">
                      <Badge variant="default" className="text-xs uppercase tracking-wider px-3 py-1">
                        {currentUser ? getRoleName(currentUser.role) : 'Standard User'}
                      </Badge>
                      <Badge variant="outline" className="text-xs uppercase tracking-wider px-3 py-1 border-primary/20 text-primary">
                        {currentUser?.employeeId || 'TSI-PENDING'}
                      </Badge>
                      <Badge 
                        variant={currentUser?.status === 'active' ? 'secondary' : 'outline'} 
                        className={`text-xs uppercase tracking-wider px-3 py-1 ${currentUser?.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : ''}`}
                      >
                        <Activity className="mr-1 h-3 w-3" />
                        {currentUser?.status || 'Active'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-3">
              {/* Column 1: Employment Details */}
              <div className="space-y-6">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Briefcase className="h-5 w-5 text-primary" />
                      Employment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground uppercase tracking-widest">Department</Label>
                      <p className="font-semibold">{currentUser?.department || 'Not Assigned'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground uppercase tracking-widest">Designation</Label>
                      <p className="font-semibold text-primary">{currentUser?.designation || 'Not Assigned'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground uppercase tracking-widest">Joining Date</Label>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <p className="font-semibold">
                          {currentUser?.joiningDate 
                            ? new Date(currentUser.joiningDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) 
                            : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Column 2: Personal Details */}
              <div className="space-y-6">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Fingerprint className="h-5 w-5 text-primary" />
                      Personal Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground uppercase tracking-widest">Email Address</Label>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium truncate">{currentUser?.email}</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground uppercase tracking-widest">Phone Number</Label>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium">{currentUser?.phone || 'Not Provided'}</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground uppercase tracking-widest">Date of Birth</Label>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium">
                          {currentUser?.dateOfBirth 
                            ? new Date(currentUser.dateOfBirth).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) 
                            : 'Not Provided'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Column 3: Compensation & Skills */}
              <div className="space-y-6">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Award className="h-5 w-5 text-primary" />
                      Professional
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs text-muted-foreground uppercase tracking-widest">Annual Salary</Label>
                        <Banknote className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        {formatCurrency(currentUser?.salary)}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-xs text-muted-foreground uppercase tracking-widest">Technical Skills</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {getSkills(currentUser?.skills).length > 0 ? (
                          getSkills(currentUser?.skills).map((skill: string, index: number) => (
                            <Badge key={index} variant="secondary" className="px-2 py-0 text-[10px] bg-slate-100 dark:bg-slate-800 border-none">
                              {skill}
                            </Badge>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No skills listed</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>

        {isAdmin && (
          <>
            <TabsContent value="company">
              <Card>
                <CardHeader>
                  <CardTitle>Company Information</CardTitle>
                  <CardDescription>Update your company details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Company Name</Label>
                      <Input
                        id="companyName"
                        value={settings.companyName}
                        onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={settings.email}
                        onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={settings.phone || ''}
                        onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        value={settings.website || ''}
                        onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={settings.address || ''}
                      onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                    />
                  </div>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Changes
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appearance">
              <Card>
                <CardHeader>
                  <CardTitle>Theme Customization</CardTitle>
                  <CardDescription>Customize the look and feel of your CMS</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="primaryColor">Primary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="primaryColor"
                          type="color"
                          value={settings.primaryColor || '#3B82F6'}
                          onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                          className="w-20 h-10"
                        />
                        <Input
                          value={settings.primaryColor || '#3B82F6'}
                          onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="secondaryColor">Secondary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="secondaryColor"
                          type="color"
                          value={settings.secondaryColor || '#10B981'}
                          onChange={(e) => setSettings({ ...settings, secondaryColor: e.target.value })}
                          className="w-20 h-10"
                        />
                        <Input
                          value={settings.secondaryColor || '#10B981'}
                          onChange={(e) => setSettings({ ...settings, secondaryColor: e.target.value })}
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="logoUrl">Logo URL</Label>
                    <Input
                      id="logoUrl"
                      value={settings.logoUrl || ''}
                      onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Theme
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="users">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>User Management</CardTitle>
                      <CardDescription>Manage system users and permissions</CardDescription>
                    </div>
                    <Button size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Add User
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="mt-4 text-sm text-muted-foreground">User management interface</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="integrations">
              <Card>
                <CardHeader>
                  <CardTitle>API Integrations</CardTitle>
                  <CardDescription>Connect third-party services</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Google Analytics</p>
                        <p className="text-sm text-muted-foreground">Track website analytics</p>
                      </div>
                      <Badge variant="outline">Not Connected</Badge>
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">Stripe Payment Gateway</p>
                        <p className="text-sm text-muted-foreground">Process payments</p>
                      </div>
                      <Badge variant="outline">Not Connected</Badge>
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">SMTP Email Service</p>
                        <p className="text-sm text-muted-foreground">Send emails</p>
                      </div>
                      <Badge variant="outline">Not Connected</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="business">
              <Card>
                <CardHeader>
                  <CardTitle>Invoice & Business Settings</CardTitle>
                  <CardDescription>Manage billing details, tax info, and invoice defaults</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Business Name</Label>
                        <Input value={businessSettings.businessName} onChange={e => setBusinessSettings({ ...businessSettings, businessName: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input value={businessSettings.email || ''} onChange={e => setBusinessSettings({ ...businessSettings, email: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Contact Number</Label>
                        <Input value={businessSettings.phone || ''} onChange={e => setBusinessSettings({ ...businessSettings, phone: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Address</Label>
                        <Input value={businessSettings.address || ''} onChange={e => setBusinessSettings({ ...businessSettings, address: e.target.value })} />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>GST No</Label>
                        <Input value={businessSettings.gstNo || ''} onChange={e => setBusinessSettings({ ...businessSettings, gstNo: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>PAN</Label>
                        <Input value={businessSettings.pan || ''} onChange={e => setBusinessSettings({ ...businessSettings, pan: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>TAN</Label>
                        <Input value={businessSettings.tan || ''} onChange={e => setBusinessSettings({ ...businessSettings, tan: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Registration No</Label>
                        <Input value={businessSettings.registrationNo || ''} onChange={e => setBusinessSettings({ ...businessSettings, registrationNo: e.target.value })} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Payment Terms (Default)</Label>
                      <Input value={businessSettings.paymentTerms || ''} onChange={e => setBusinessSettings({ ...businessSettings, paymentTerms: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Terms & Conditions (Default)</Label>
                      <Input value={businessSettings.termsAndConditions || ''} onChange={e => setBusinessSettings({ ...businessSettings, termsAndConditions: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Notes for Invoices (Default)</Label>
                      <Input value={businessSettings.notes || ''} onChange={e => setBusinessSettings({ ...businessSettings, notes: e.target.value })} />
                    </div>

                    <Button onClick={handleSaveBusinessSettings} disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save Business Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </>
        )}

        <TabsContent value="password">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your account password securely</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password *</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    placeholder="Enter your current password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password *</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    placeholder="Enter new password (min 6 characters)"
                  />
                  <p className="text-sm text-muted-foreground">
                    Password must be at least 6 characters long
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password *</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    placeholder="Re-enter new password"
                  />
                </div>
                <Button onClick={handlePasswordChange} disabled={changingPassword}>
                  {changingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Key className="mr-2 h-4 w-4" />}
                  Change Password
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}