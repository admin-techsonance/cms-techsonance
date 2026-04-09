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
import { taskPriorityOptions, taskStatusOptions, type TaskFormValues } from '@/lib/forms/schemas';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  projectId: number;
  task?: any;
}

interface User {
  id: number;
  firstName: string;
  lastName: string;
}

const projectTaskFormSchema = z.object({
  title: z.string().trim().min(3, 'Task title must be at least 3 characters'),
  description: z.string().optional().or(z.literal('')),
  assignedTo: z.string().min(1, 'Please select a team member'),
  status: z.enum(taskStatusOptions),
  priority: z.enum(taskPriorityOptions),
  dueDate: z.string().optional().or(z.literal('')),
});

type ProjectTaskFormValues = z.infer<typeof projectTaskFormSchema>;

export function TaskFormDialog({
  open,
  onOpenChange,
  onSuccess,
  projectId,
  task,
}: TaskFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const form = useForm<ProjectTaskFormValues>({
    resolver: zodResolver(projectTaskFormSchema),
    defaultValues: {
      title: '',
      description: '',
      assignedTo: '',
      status: 'todo',
      priority: 'medium',
      dueDate: '',
    },
  });

  useEffect(() => {
    if (open) {
      fetchUsers();
    }
  }, [open]);

  useEffect(() => {
    if (task) {
      form.reset({
        title: task.title || '',
        description: task.description || '',
        assignedTo: task.assignedTo?.toString() || '',
        status: (task.status as TaskFormValues['status']) || 'todo',
        priority: (task.priority as TaskFormValues['priority']) || 'medium',
        dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
      });
    } else {
      form.reset({
        title: '',
        description: '',
        assignedTo: '',
        status: 'todo',
        priority: 'medium',
        dueDate: '',
      });
    }
  }, [task, open, form]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users?limit=100');
      if (response.ok) {
        const data = await response.json();
        const usersData = Array.isArray(data) ? data : data.data ?? [];
        setUsers(usersData.filter((u: any) => u.role !== 'client'));
      }
    } catch {
      toast.error('Failed to load team members');
    }
  };

  const handleSubmit = async (values: ProjectTaskFormValues) => {
    setLoading(true);

    try {
      const url = task ? `/api/tasks?id=${task.id}` : '/api/tasks';
      const method = task ? 'PUT' : 'POST';

      const payload: any = {
        projectId,
        title: values.title.trim(),
        description: values.description?.trim() || null,
        assignedTo: parseInt(values.assignedTo, 10),
        status: values.status,
        priority: values.priority,
        dueDate: values.dueDate || null,
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        onSuccess();
        onOpenChange(false);
        toast.success(task ? 'Task updated successfully' : 'Task created successfully');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save task');
      }
    } catch {
      toast.error('An error occurred while saving the task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'Create New Task'}</DialogTitle>
          <DialogDescription>
            {task ? 'Update task details' : 'Add a new task to this project'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
              placeholder="Implement user authentication"
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
              placeholder="Task details..."
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
              <Label htmlFor="assignedTo">Assign To *</Label>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select team member" />
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
              name="dueDate"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <FormControl>
              <Input
                id="dueDate"
                type="date"
                {...field}
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
              name="status"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select value={field.value} onValueChange={field.onChange}>
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

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
            <FormItem className="space-y-2">
              <Label htmlFor="priority">Priority *</Label>
              <Select value={field.value} onValueChange={field.onChange}>
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
          </div>

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
