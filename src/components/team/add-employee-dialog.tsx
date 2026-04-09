'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  employeeCreateFormSchema,
  employeeDepartmentOptions,
  employeeRoleOptions,
  type EmployeeCreateFormValues,
} from '@/lib/forms/schemas';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface AddEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddEmployeeDialog({ open, onOpenChange, onSuccess }: AddEmployeeDialogProps) {
  const [loading, setLoading] = useState(false);
  const form = useForm<EmployeeCreateFormValues>({
    resolver: zodResolver(employeeCreateFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      employeeId: '',
      department: 'Engineering',
      designation: '',
      dateOfJoining: '',
      dateOfBirth: '',
      salary: '',
      skills: '',
      role: 'developer',
    },
  });

  const resetForm = () => form.reset({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    employeeId: '',
    department: 'Engineering',
    designation: '',
    dateOfJoining: '',
    dateOfBirth: '',
    salary: '',
    skills: '',
    role: 'developer',
  });
  
  const handleSubmit = async (values: EmployeeCreateFormValues) => {
    setLoading(true);

    try {
      const userPayload = {
        email: values.email.trim(),
        password: values.password,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        role: values.role,
        phone: values.phone?.trim() || null,
      };

      const userResponse = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('session_token')}`,
        },
        body: JSON.stringify(userPayload),
      });

      if (!userResponse.ok) {
        const errorData = await userResponse.json();
        throw new Error(errorData.error || 'Failed to create user account');
      }

      const userData = await userResponse.json();

      const employeePayload = {
        userId: userData.id,
        employeeId: values.employeeId.trim(),
        department: values.department.trim(),
        designation: values.designation.trim(),
        dateOfJoining: values.dateOfJoining,
        dateOfBirth: values.dateOfBirth || null,
        salary: values.salary ? parseInt(values.salary, 10) : null,
        skills: values.skills?.trim() ? values.skills.split(',').map((skill) => skill.trim()).filter(Boolean) : [],
        status: 'active',
      };

      const employeeResponse = await fetch('/api/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('session_token')}`,
        },
        body: JSON.stringify(employeePayload),
      });

      if (!employeeResponse.ok) {
        const errorData = await employeeResponse.json();
        throw new Error(errorData.error || 'Failed to create employee record');
      }

      toast.success('Employee added successfully');
      onOpenChange(false);
      onSuccess();
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add employee');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Employee</DialogTitle>
          <DialogDescription>
            Create a new employee account and profile. All fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit, () => toast.error('Please fix the validation errors'))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <FormControl>
              <Input
                id="firstName"
                {...field}
                disabled={loading}
              />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <FormControl>
              <Input
                id="lastName"
                {...field}
                disabled={loading}
              />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <FormControl>
            <Input
              id="email"
              type="email"
              {...field}
              disabled={loading}
            />
            </FormControl>
            <FormMessage className="text-xs" />
          </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <FormControl>
              <Input
                id="phone"
                type="tel"
                {...field}
                disabled={loading}
              />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <FormControl>
              <Input
                id="password"
                type="password"
                {...field}
                disabled={loading}
                autoComplete="off"
              />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="employeeId"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="employeeId">Employee ID *</Label>
              <FormControl>
              <Input
                id="employeeId"
                {...field}
                disabled={loading}
                placeholder="e.g., EMP001"
              />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={loading}
              >
                <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {employeeRoleOptions.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role === 'project_manager' ? 'Project Manager' : role.charAt(0).toUpperCase() + role.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="department"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="department">Department *</Label>
            <Select
              value={field.value}
              onValueChange={field.onChange}
              disabled={loading}
            >
              <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              </FormControl>
              <SelectContent>
                {employeeDepartmentOptions.map((department) => (
                  <SelectItem key={department} value={department}>
                    {department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage className="text-xs" />
          </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="designation"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="designation">Designation *</Label>
            <FormControl>
            <Input
              id="designation"
              {...field}
              disabled={loading}
              placeholder="e.g., Senior Developer"
            />
            </FormControl>
            <FormMessage className="text-xs" />
          </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="dateOfJoining"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="dateOfJoining">Date of Joining *</Label>
              <FormControl>
              <Input
                id="dateOfJoining"
                type="date"
                {...field}
                disabled={loading}
              />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dateOfBirth"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <FormControl>
              <Input
                id="dateOfBirth"
                type="date"
                {...field}
                disabled={loading}
              />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="salary"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="salary">Salary (Annual)</Label>
            <FormControl>
            <Input
              id="salary"
              type="number"
              {...field}
              disabled={loading}
              placeholder="e.g., 50000"
            />
            </FormControl>
            <FormMessage className="text-xs" />
          </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="skills"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="skills">Skills (comma separated)</Label>
            <FormControl>
            <Input
              id="skills"
              {...field}
              disabled={loading}
              placeholder="e.g., JavaScript, React, Node.js"
            />
            </FormControl>
            <p className="text-xs text-muted-foreground">
              Enter skills separated by commas
            </p>
            <FormMessage className="text-xs" />
          </FormItem>
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Employee'
              )}
            </Button>
          </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
