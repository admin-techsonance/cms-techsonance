'use client';

import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { assignProjectFormSchema, projectMemberRoleOptions, type AssignProjectFormValues } from '@/lib/forms/schemas';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface AssignProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  userId: number;
  userName: string;
}

interface Project {
  id: number;
  name: string;
}

export function AssignProjectsDialog({ open, onOpenChange, onSuccess, userId, userName }: AssignProjectsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const form = useForm<AssignProjectFormValues>({
    resolver: zodResolver(assignProjectFormSchema),
    defaultValues: {
      projectId: '',
      role: 'developer',
    },
  });

  useEffect(() => {
    if (open) {
      fetchProjects();
      form.reset({
        projectId: '',
        role: 'developer',
      });
    }
  }, [open, form]);

  const fetchProjects = async () => {
    setLoadingData(true);
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
      setLoadingData(false);
    }
  };

  const handleSubmit = async (values: AssignProjectFormValues) => {
    setLoading(true);

    try {
      const response = await fetch('/api/project-members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: parseInt(values.projectId, 10),
          userId,
          role: values.role,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.code === 'DUPLICATE_ASSIGNMENT') {
          toast.error('User is already assigned to this project');
        } else {
          throw new Error(data.error || 'Failed to assign project');
        }
        return;
      }

      toast.success('Project assigned successfully');
      onOpenChange(false);
      onSuccess();
      form.reset({
        projectId: '',
        role: 'developer',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Project</DialogTitle>
          <DialogDescription>
            Assign {userName} to a project with a specific role.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="projectId"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="project">Project *</Label>
            <Select
              value={field.value}
              onValueChange={field.onChange}
              disabled={loading || loadingData}
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
            name="role"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="role">Project Role *</Label>
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
                {projectMemberRoleOptions.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Button type="submit" disabled={loading || loadingData}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                'Assign Project'
              )}
            </Button>
          </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
