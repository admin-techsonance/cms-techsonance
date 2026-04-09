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
import {
  taskFormSchema,
  taskPriorityOptions,
  taskStatusOptions,
  taskStoryPointOptions,
  type TaskFormValues,
} from '@/lib/forms/schemas';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  projectId?: number;
  sprintId?: number;
  initialStatus?: string;
  task?: any;
}

interface Project {
  id: number;
  name: string;
}

interface Sprint {
  id: number;
  name: string;
  status: string;
}

interface User {
  id: number;
  firstName: string;
  lastName: string;
}

export function TaskDialog({ open, onOpenChange, onSuccess, projectId, sprintId, initialStatus, task }: TaskDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      projectId: projectId?.toString() || '',
      sprintId: sprintId?.toString() || '',
      title: '',
      description: '',
      assignedTo: '',
      status: (initialStatus as TaskFormValues['status']) || 'todo',
      priority: 'medium',
      storyPoints: '',
      dueDate: '',
    },
  });

  useEffect(() => {
    if (open) {
      fetchData();
      if (task) {
        form.reset({
          projectId: task.projectId?.toString() || '',
          sprintId: task.sprintId?.toString() || '',
          title: task.title || '',
          description: task.description || '',
          assignedTo: task.assignedTo?.toString() || '',
          status: (task.status as TaskFormValues['status']) || 'todo',
          priority: (task.priority as TaskFormValues['priority']) || 'medium',
          storyPoints: task.storyPoints?.toString() || '',
          dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
        });
      } else {
        form.reset({
          projectId: projectId?.toString() || '',
          sprintId: sprintId?.toString() || '',
          title: '',
          description: '',
          assignedTo: '',
          status: (initialStatus as TaskFormValues['status']) || 'todo',
          priority: 'medium',
          storyPoints: '',
          dueDate: '',
        });
      }
    }
  }, [open, task, projectId, sprintId, initialStatus, form]);

  const selectedProjectId = form.watch('projectId');

  useEffect(() => {
    if (selectedProjectId) {
      fetchSprints(parseInt(selectedProjectId, 10));
    } else {
      setSprints([]);
    }
  }, [selectedProjectId]);

  const fetchData = async () => {
    setLoadingData(true);
    try {
      const token = localStorage.getItem('session_token');
      const [projectsRes, usersRes] = await Promise.all([
        fetch('/api/projects?limit=100', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch('/api/users?limit=100', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      ]);

      if (projectsRes.ok) {
        const data = await projectsRes.json();
        setProjects(Array.isArray(data) ? data : data.data ?? []);
      }

      if (usersRes.ok) {
        const data = await usersRes.json();
        const items = Array.isArray(data) ? data : data.data ?? [];
        setUsers(items);
      }
    } catch {
      toast.error('Failed to load task setup data');
    } finally {
      setLoadingData(false);
    }
  };

  const fetchSprints = async (projectId: number) => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/sprints?projectId=${projectId}&limit=100`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const items = (Array.isArray(data) ? data : data.data ?? []) as Sprint[];
        setSprints(items.filter((sprint) => sprint.status !== 'cancelled'));
      }
    } catch {
      toast.error('Failed to load sprints');
    }
  };

  const handleSubmit = async (values: TaskFormValues) => {
    setLoading(true);

    try {
      const payload: any = {
        projectId: parseInt(values.projectId, 10),
        title: values.title.trim(),
        assignedTo: parseInt(values.assignedTo, 10),
        status: values.status,
        priority: values.priority,
      };

      if (values.description?.trim()) {
        payload.description = values.description.trim();
      }

      if (values.sprintId) {
        payload.sprintId = parseInt(values.sprintId, 10);
      }

      if (values.storyPoints) {
        payload.storyPoints = parseInt(values.storyPoints, 10);
      }

      if (values.dueDate) {
        payload.dueDate = values.dueDate;
      }

      const url = task ? `/api/tasks?id=${task.id}` : '/api/tasks';
      const method = task ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${task ? 'update' : 'create'} task`);
      }

      toast.success(`Task ${task ? 'updated' : 'created'} successfully`);
      onOpenChange(false);
      onSuccess();

      if (!task) {
        form.reset({
          projectId: projectId?.toString() || '',
          sprintId: sprintId?.toString() || '',
          title: '',
          description: '',
          assignedTo: '',
          status: (initialStatus as TaskFormValues['status']) || 'todo',
          priority: 'medium',
          storyPoints: '',
          dueDate: '',
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'Create New Task'}</DialogTitle>
          <DialogDescription>
            {task ? 'Update task details' : 'Add a new task to the board'}. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit, () => toast.error('Please fix the validation errors'))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="projectId">Project *</Label>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={loading || loadingData || !!projectId || !!task}
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
              name="sprintId"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="sprintId">Sprint</Label>
              <Select
                value={field.value || 'none'}
                onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}
                disabled={loading || !selectedProjectId}
              >
                <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select sprint (optional)" />
                </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">No Sprint</SelectItem>
                  {sprints.map((sprint) => (
                    <SelectItem key={sprint.id} value={sprint.id.toString()}>
                      {sprint.name} ({sprint.status})
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
            name="title"
            render={({ field }) => (
          <FormItem className="space-y-2">
            <Label htmlFor="title">Task Title *</Label>
            <FormControl>
            <Input
              id="title"
              {...field}
              disabled={loading}
              placeholder="e.g., Implement user authentication"
            />
            </FormControl>
            <FormMessage className="text-xs" />
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
              disabled={loading}
              placeholder="Describe the task in detail..."
              rows={3}
            />
            </FormControl>
            <FormMessage className="text-xs" />
          </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="assignedTo"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="assignedTo">Assigned To *</Label>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={loading || loadingData}
              >
                <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.firstName} {user.lastName}
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
                  {taskStatusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status === 'todo' ? 'To Do' : status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage className="text-xs" />
            </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
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
                  {taskPriorityOptions.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
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
              name="storyPoints"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="storyPoints">Story Points</Label>
              <Select
                value={field.value || 'none'}
                onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}
                disabled={loading}
              >
                <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {taskStoryPointOptions.map((storyPoint) => (
                    <SelectItem key={storyPoint} value={storyPoint}>
                      {storyPoint}
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
              name="dueDate"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <FormControl>
              <Input
                id="dueDate"
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
                  {task ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                task ? 'Update Task' : 'Create Task'
              )}
            </Button>
          </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
