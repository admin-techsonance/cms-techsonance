'use client';

import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  projectFormSchema,
  projectPriorityOptions,
  projectStatusOptions,
  type ProjectFormValues,
} from '@/lib/forms/schemas';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  project?: any;
}

interface Client {
  id: number;
  companyName: string;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  onSuccess,
  project,
}: ProjectFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: '',
      description: '',
      clientId: '',
      status: 'planning',
      priority: 'medium',
      startDate: '',
      endDate: '',
      budget: '',
      isActive: true,
    },
  });

  useEffect(() => {
    if (open) {
      fetchClients();
    }
  }, [open]);

  useEffect(() => {
    if (project) {
      form.reset({
        name: project.name || '',
        description: project.description || '',
        clientId: project.clientId?.toString() || '',
        status: project.status || 'planning',
        priority: project.priority || 'medium',
        startDate: project.startDate ? project.startDate.split('T')[0] : '',
        endDate: project.endDate ? project.endDate.split('T')[0] : '',
        budget: project.budget?.toString() || '',
        isActive: project.isActive !== undefined ? project.isActive : true,
      });
    } else {
      form.reset({
        name: '',
        description: '',
        clientId: '',
        status: 'planning',
        priority: 'medium',
        startDate: '',
        endDate: '',
        budget: '',
        isActive: true,
      });
    }
  }, [project, open, form]);

  const fetchClients = async () => {
    try {
      const response = await fetch('/api/clients?limit=100', {
        headers: {
          'Content-Type': 'application/json',
        }
      });
      if (response.ok) {
        const data = await response.json();
        setClients(Array.isArray(data) ? data : data.data ?? []);
      }
    } catch {
      toast.error('Failed to load clients');
    }
  };

  const handleSubmit = async (values: ProjectFormValues) => {
    setLoading(true);

    try {
      const url = project ? `/api/projects?id=${project.id}` : '/api/projects';
      const method = project ? 'PUT' : 'POST';

      const payload: any = {
        name: values.name.trim(),
        description: values.description?.trim() || null,
        clientId: parseInt(values.clientId, 10),
        status: values.status,
        priority: values.priority,
        startDate: values.startDate || null,
        endDate: values.endDate || null,
        budget: values.budget ? parseInt(values.budget, 10) : null,
        isActive: values.isActive,
      };

      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await response.json();
        toast.success(project ? 'Project updated successfully!' : 'Project created successfully!');
        onSuccess();
        onOpenChange(false);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save project');
      }
    } catch {
      toast.error('An error occurred while saving the project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? 'Edit Project' : 'Create New Project'}</DialogTitle>
          <DialogDescription>
            {project ? 'Update project information' : 'Fill in all required fields (*) to create a project'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit, () => toast.error('Please fix the form errors before submitting'))} className="space-y-4">
          {Object.keys(form.formState.errors).length > 0 && (
            <div className="bg-destructive/10 border border-destructive rounded-lg p-4">
              <p className="text-sm font-semibold text-destructive mb-2">
                Please fix the following errors:
              </p>
              <ul className="list-disc list-inside text-sm text-destructive space-y-1">
                {form.formState.errors.name && <li>{form.formState.errors.name.message}</li>}
                {form.formState.errors.clientId && <li>{form.formState.errors.clientId.message}</li>}
                {form.formState.errors.startDate && <li>{form.formState.errors.startDate.message}</li>}
                {form.formState.errors.endDate && <li>{form.formState.errors.endDate.message}</li>}
                {form.formState.errors.budget && <li>{form.formState.errors.budget.message}</li>}
              </ul>
            </div>
          )}

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="name">
              Project Title <span className="text-destructive">*</span>
            </Label>
            <FormControl>
            <Input
              id="name"
              {...field}
              placeholder="E-commerce Platform"
            />
            </FormControl>
            <FormMessage className="text-sm font-medium" />
          </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <FormControl>
            <Textarea
              id="description"
              {...field}
              placeholder="Project overview and goals..."
              rows={3}
            />
            </FormControl>
            <FormMessage className="text-sm font-medium" />
          </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="clientId">
                Client <span className="text-destructive">*</span>
              </Label>
              <Select 
                value={field.value} 
                onValueChange={field.onChange}
              >
                <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {clients.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No clients available
                    </div>
                  ) : (
                    clients.map((client) => (
                      <SelectItem key={client.id} value={client.id.toString()}>
                        {client.companyName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormMessage className="text-sm font-bold" />
            </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="budget"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="budget">Budget (₹)</Label>
              <FormControl>
              <Input
                id="budget"
                type="number"
                min="0"
                {...field}
                placeholder="50000"
              />
              </FormControl>
              <FormMessage className="text-sm font-medium" />
            </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <FormControl>
              <Input
                id="startDate"
                type="date"
                {...field}
              />
              </FormControl>
              <FormMessage className="text-sm font-medium" />
            </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <FormControl>
              <Input
                id="endDate"
                type="date"
                {...field}
              />
              </FormControl>
              <FormMessage className="text-sm font-medium" />
            </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="priority">
                Priority <span className="text-destructive">*</span>
              </Label>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {projectPriorityOptions.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage className="text-sm font-medium" />
            </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="status">
                Project Status <span className="text-destructive">*</span>
              </Label>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {projectStatusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status === 'in_progress' ? 'In Progress' : status === 'on_hold' ? 'On Hold' : status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage className="text-sm font-medium" />
            </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
          <FormItem className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="isActive" className="text-base">
                Active Status
              </Label>
              <p className="text-sm text-muted-foreground">
                {field.value ? 'Project is currently active' : 'Project is inactive'}
              </p>
            </div>
            <Switch
              id="isActive"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                project ? 'Update Project' : 'Create Project'
              )}
            </Button>
          </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
