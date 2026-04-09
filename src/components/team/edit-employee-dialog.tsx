'use client';

import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  employeeDepartmentOptions,
  employeeEditFormSchema,
  employeeRoleOptions,
  employeeStatusOptions,
  type EmployeeEditFormValues,
} from '@/lib/forms/schemas';
import { Loader2 } from 'lucide-react';
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

interface EditEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  employee: Employee | null;
  user: User | null;
}

export function EditEmployeeDialog({ open, onOpenChange, onSuccess, employee, user }: EditEmployeeDialogProps) {
  const [loading, setLoading] = useState(false);
  const form = useForm<EmployeeEditFormValues>({
    resolver: zodResolver(employeeEditFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      role: 'developer',
      employeeId: '',
      department: 'Engineering',
      designation: '',
      dateOfJoining: '',
      dateOfBirth: '',
      salary: '',
      skills: '',
      status: 'active',
    },
  });

  useEffect(() => {
    if (employee && user && open) {
      const skills = employee.skills
        ? (typeof employee.skills === 'string' ? JSON.parse(employee.skills) : employee.skills)
        : [];

      form.reset({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: user.phone || '',
        role: (user.role as EmployeeEditFormValues['role']) || 'developer',
        employeeId: employee.employeeId || '',
        department: (employee.department as EmployeeEditFormValues['department']) || 'Engineering',
        designation: employee.designation || '',
        dateOfJoining: employee.dateOfJoining ? employee.dateOfJoining.split('T')[0] : '',
        dateOfBirth: employee.dateOfBirth ? employee.dateOfBirth.split('T')[0] : '',
        salary: employee.salary?.toString() || '',
        skills: Array.isArray(skills) ? skills.join(', ') : '',
        status: (employee.status as EmployeeEditFormValues['status']) || 'active',
      });
    }
  }, [employee, user, open, form]);

  const handleSubmit = async (values: EmployeeEditFormValues) => {
    if (!employee || !user) return;

    setLoading(true);

    try {
      const userPayload = {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        phone: values.phone?.trim() || null,
        role: values.role,
      };

      const userResponse = await fetch(`/api/users?id=${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userPayload),
      });

      if (!userResponse.ok) {
        const errorData = await userResponse.json();
        throw new Error(errorData.error || 'Failed to update user information');
      }

      const employeePayload = {
        employeeId: values.employeeId.trim(),
        department: values.department,
        designation: values.designation.trim(),
        dateOfJoining: values.dateOfJoining,
        dateOfBirth: values.dateOfBirth || null,
        salary: values.salary ? parseInt(values.salary, 10) : null,
        skills: values.skills?.trim() ? values.skills.split(',').map((skill) => skill.trim()).filter(Boolean) : [],
        status: values.status,
      };

      const employeeResponse = await fetch(`/api/employees?id=${employee.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(employeePayload),
      });

      if (!employeeResponse.ok) {
        const errorData = await employeeResponse.json();
        throw new Error(errorData.error || 'Failed to update employee information');
      }

      toast.success('Employee updated successfully');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update employee');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Employee</DialogTitle>
          <DialogDescription>
            Update employee information and profile details.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
              />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={loading}
              >
                <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {employeeStatusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status === 'on_leave' ? 'On Leave' : status.charAt(0).toUpperCase() + status.slice(1)}
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
                  Updating...
                </>
              ) : (
                'Update Employee'
              )}
            </Button>
          </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
