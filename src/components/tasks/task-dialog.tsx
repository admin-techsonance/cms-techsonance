'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

interface FormData {
  projectId: string;
  sprintId: string;
  title: string;
  description: string;
  assignedTo: string;
  status: string;
  priority: string;
  storyPoints: string;
  dueDate: string;
}

interface FormErrors {
  projectId?: string;
  title?: string;
  assignedTo?: string;
  storyPoints?: string;
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
  const [formData, setFormData] = useState<FormData>({
    projectId: projectId?.toString() || '',
    sprintId: sprintId?.toString() || '',
    title: '',
    description: '',
    assignedTo: '',
    status: initialStatus || 'todo',
    priority: 'medium',
    storyPoints: '',
    dueDate: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (open) {
      fetchData();
      if (task) {
        setFormData({
          projectId: task.projectId?.toString() || '',
          sprintId: task.sprintId?.toString() || '',
          title: task.title || '',
          description: task.description || '',
          assignedTo: task.assignedTo?.toString() || '',
          status: task.status || 'todo',
          priority: task.priority || 'medium',
          storyPoints: task.storyPoints?.toString() || '',
          dueDate: task.dueDate || '',
        });
      } else {
        // Reset form for new task with props
        setFormData({
          projectId: projectId?.toString() || '',
          sprintId: sprintId?.toString() || '',
          title: '',
          description: '',
          assignedTo: '',
          status: initialStatus || 'todo',
          priority: 'medium',
          storyPoints: '',
          dueDate: '',
        });
      }
    }
  }, [open, task, projectId, sprintId, initialStatus]);

  useEffect(() => {
    if (formData.projectId) {
      fetchSprints(parseInt(formData.projectId));
    }
  }, [formData.projectId]);

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
        setProjects(data);
      }

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
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
        setSprints(data.filter((s: Sprint) => s.status !== 'cancelled'));
      }
    } catch (error) {
      console.error('Error fetching sprints:', error);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.projectId) {
      newErrors.projectId = 'Project is required';
    }

    if (!formData.title.trim()) {
      newErrors.title = 'Task title is required';
    } else if (formData.title.trim().length < 3) {
      newErrors.title = 'Title must be at least 3 characters';
    }

    if (!formData.assignedTo) {
      newErrors.assignedTo = 'Assignee is required';
    }

    if (formData.storyPoints) {
      const points = parseInt(formData.storyPoints);
      const validPoints = [1, 2, 3, 5, 8, 13, 21];
      if (isNaN(points) || !validPoints.includes(points)) {
        newErrors.storyPoints = 'Story points must be 1, 2, 3, 5, 8, 13, or 21';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the validation errors');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('session_token');
      const payload: any = {
        projectId: parseInt(formData.projectId),
        title: formData.title.trim(),
        assignedTo: parseInt(formData.assignedTo),
        status: formData.status,
        priority: formData.priority,
      };

      if (formData.description.trim()) {
        payload.description = formData.description.trim();
      }

      if (formData.sprintId) {
        payload.sprintId = parseInt(formData.sprintId);
      }

      if (formData.storyPoints) {
        payload.storyPoints = parseInt(formData.storyPoints);
      }

      if (formData.dueDate) {
        payload.dueDate = formData.dueDate;
      }

      const url = task ? `/api/tasks?id=${task.id}` : '/api/tasks';
      const method = task ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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
        setFormData({
          projectId: projectId?.toString() || '',
          sprintId: sprintId?.toString() || '',
          title: '',
          description: '',
          assignedTo: '',
          status: initialStatus || 'todo',
          priority: 'medium',
          storyPoints: '',
          dueDate: '',
        });
      }
      setErrors({});
    } catch (error) {
      console.error('Error saving task:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save task');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="projectId">Project *</Label>
              <Select
                value={formData.projectId}
                onValueChange={(value) => handleChange('projectId', value)}
                disabled={loading || loadingData || !!projectId || !!task}
              >
                <SelectTrigger className={errors.projectId ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.projectId && (
                <p className="text-xs text-destructive">{errors.projectId}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sprintId">Sprint</Label>
              <Select
                value={formData.sprintId || 'none'}
                onValueChange={(value) => handleChange('sprintId', value === 'none' ? '' : value)}
                disabled={loading || !formData.projectId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sprint (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Sprint</SelectItem>
                  {sprints.map((sprint) => (
                    <SelectItem key={sprint.id} value={sprint.id.toString()}>
                      {sprint.name} ({sprint.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Task Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              disabled={loading}
              placeholder="e.g., Implement user authentication"
              className={errors.title ? 'border-destructive' : ''}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              disabled={loading}
              placeholder="Describe the task in detail..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="assignedTo">Assigned To *</Label>
              <Select
                value={formData.assignedTo}
                onValueChange={(value) => handleChange('assignedTo', value)}
                disabled={loading || loadingData}
              >
                <SelectTrigger className={errors.assignedTo ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.firstName} {user.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.assignedTo && (
                <p className="text-xs text-destructive">{errors.assignedTo}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => handleChange('status', value)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) => handleChange('priority', value)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="storyPoints">Story Points</Label>
              <Select
                value={formData.storyPoints || 'none'}
                onValueChange={(value) => handleChange('storyPoints', value === 'none' ? '' : value)}
                disabled={loading}
              >
                <SelectTrigger className={errors.storyPoints ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="8">8</SelectItem>
                  <SelectItem value="13">13</SelectItem>
                  <SelectItem value="21">21</SelectItem>
                </SelectContent>
              </Select>
              {errors.storyPoints && (
                <p className="text-xs text-destructive">{errors.storyPoints}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => handleChange('dueDate', e.target.value)}
                disabled={loading}
              />
            </div>
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
      </DialogContent>
    </Dialog>
  );
}