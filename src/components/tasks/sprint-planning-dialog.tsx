'use client';

import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sprintFormSchema, sprintStatusOptions, type SprintFormValues } from '@/lib/forms/schemas';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface SprintPlanningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  projectId?: number;
}

interface Project {
  id: number;
  name: string;
}

export function SprintPlanningDialog({ open, onOpenChange, onSuccess, projectId }: SprintPlanningDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const form = useForm<SprintFormValues>({
    resolver: zodResolver(sprintFormSchema),
    defaultValues: {
      projectId: projectId?.toString() || '',
      name: '',
      goal: '',
      startDate: '',
      endDate: '',
      status: 'planning',
    },
  });

  useEffect(() => {
    if (open) {
      fetchProjects();
    }
  }, [open]);

  useEffect(() => {
    if (projectId) {
      form.setValue('projectId', projectId.toString());
    }
  }, [projectId, form]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/projects?limit=100', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProjects(Array.isArray(data) ? data : data.data ?? []);
      }
    } catch {
      toast.error('Failed to load projects');
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleSubmit = async (values: SprintFormValues) => {
    setLoading(true);

    try {
      const payload = {
        projectId: parseInt(values.projectId, 10),
        name: values.name.trim(),
        goal: values.goal?.trim() || null,
        startDate: values.startDate,
        endDate: values.endDate,
        status: values.status,
      };

      const response = await fetch('/api/sprints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create sprint');
      }

      toast.success('Sprint created successfully');
      onOpenChange(false);
      onSuccess();
      form.reset({
        projectId: projectId?.toString() || '',
        name: '',
        goal: '',
        startDate: '',
        endDate: '',
        status: 'planning',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create sprint');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Sprint</DialogTitle>
          <DialogDescription>
            Plan a new sprint with duration and goals. All fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit, () => toast.error('Please fix the validation errors'))} className="space-y-4">
          <FormField
            control={form.control}
            name="projectId"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="projectId">Project *</Label>
            <Select
              value={field.value}
              onValueChange={field.onChange}
              disabled={loading || loadingProjects || !!projectId}
            >
              <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              </FormControl>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id.toString()}>
                    {project.name}
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
            name="name"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="name">Sprint Name *</Label>
            <FormControl>
            <Input
              id="name"
              {...field}
              disabled={loading}
              placeholder="e.g., Sprint 1, Q1 Sprint"
            />
            </FormControl>
            <FormMessage className="text-xs" />
          </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="goal"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="goal">Sprint Goal</Label>
            <FormControl>
            <Textarea
              id="goal"
              {...field}
              disabled={loading}
              placeholder="What do you want to achieve in this sprint?"
              rows={3}
            />
            </FormControl>
            <p className="text-xs text-muted-foreground">
              Optional: Describe the main objective of this sprint
            </p>
            <FormMessage className="text-xs" />
          </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="startDate">Start Date *</Label>
              <FormControl>
              <Input
                id="startDate"
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
              name="endDate"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="endDate">End Date *</Label>
              <FormControl>
              <Input
                id="endDate"
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
            name="status"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={field.value}
              onValueChange={field.onChange}
              disabled={loading}
            >
              <FormControl>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              </FormControl>
              <SelectContent>
                {sprintStatusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Set the initial status of the sprint
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
                  Creating...
                </>
              ) : (
                'Create Sprint'
              )}
            </Button>
          </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
