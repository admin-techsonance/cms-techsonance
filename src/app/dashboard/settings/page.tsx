'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Save, Building2, Palette, Users, Plug, Plus, Key } from 'lucide-react';
import { toast } from 'sonner';

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

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const [companyRes, businessRes] = await Promise.all([
        fetch('/api/company-settings'),
        fetch('/api/business-settings')
      ]);

      if (companyRes.ok) {
        const data = await companyRes.json();
        setSettings(data);
      }

      if (businessRes.ok) {
        setBusinessSettings(await businessRes.json());
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
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
        alert('Settings saved successfully');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('An error occurred');
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
        alert('Business settings saved successfully');
        fetchSettings();
      } else {
        alert('Failed to save business settings');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    // Validate passwords
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
      const token = localStorage.getItem('bearer_token') || localStorage.getItem('session_token');

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

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Manage company profile, appearance, and integrations
        </p>
      </div>

      <Tabs defaultValue="company" className="w-full">
        <TabsList>
          <TabsTrigger value="company">
            <Building2 className="mr-2 h-4 w-4" />
            Company Profile
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="mr-2 h-4 w-4" />
            Appearance
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="mr-2 h-4 w-4" />
            Users & Roles
          </TabsTrigger>
          <TabsTrigger value="password">
            <Key className="mr-2 h-4 w-4" />
            Change Password
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Plug className="mr-2 h-4 w-4" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="business">
            <Building2 className="mr-2 h-4 w-4" />
            Invoice Settings
          </TabsTrigger>
        </TabsList>

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
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
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
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Theme
                  </>
                )}
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
                {/* Basic Info */}
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

                {/* Tax Info */}
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

                {/* Terms and Notes */}
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

        {/* Password Tab */}
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
    </div >
  );
}