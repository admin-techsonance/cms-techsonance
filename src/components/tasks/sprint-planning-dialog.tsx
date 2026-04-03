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

interface SprintPlanningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  projectId?: number;
}

interface FormData {
  projectId: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: string;
}

interface FormErrors {
  projectId?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
}

interface Project {
  id: number;
  name: string;
}

export function SprintPlanningDialog({ open, onOpenChange, onSuccess, projectId }: SprintPlanningDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [formData, setFormData] = useState<FormData>({
    projectId: projectId?.toString() || '',
    name: '',
    goal: '',
    startDate: '',
    endDate: '',
    status: 'planning',
  });
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (open) {
      fetchProjects();
    }
  }, [open]);

  useEffect(() => {
    if (projectId) {
      setFormData(prev => ({ ...prev, projectId: projectId.toString() }));
    }
  }, [projectId]);

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
        setProjects(data);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoadingProjects(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.projectId) {
      newErrors.projectId = 'Project is required';
    }

    if (!formData.name.trim()) {
      newErrors.name = 'Sprint name is required';
    } else if (formData.name.trim().length < 3) {
      newErrors.name = 'Sprint name must be at least 3 characters';
    }

    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required';
    }

    if (!formData.endDate) {
      newErrors.endDate = 'End date is required';
    }

    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      
      if (end <= start) {
        newErrors.endDate = 'End date must be after start date';
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
      const payload = {
        projectId: parseInt(formData.projectId),
        name: formData.name.trim(),
        goal: formData.goal.trim() || null,
        startDate: formData.startDate,
        endDate: formData.endDate,
        status: formData.status,
      };

      const response = await fetch('/api/sprints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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
      
      // Reset form
      setFormData({
        projectId: projectId?.toString() || '',
        name: '',
        goal: '',
        startDate: '',
        endDate: '',
        status: 'planning',
      });
      setErrors({});
    } catch (error) {
      console.error('Error creating sprint:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create sprint');
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Sprint</DialogTitle>
          <DialogDescription>
            Plan a new sprint with duration and goals. All fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="projectId">Project *</Label>
            <Select
              value={formData.projectId}
              onValueChange={(value) => handleChange('projectId', value)}
              disabled={loading || loadingProjects || !!projectId}
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
            <Label htmlFor="name">Sprint Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              disabled={loading}
              placeholder="e.g., Sprint 1, Q1 Sprint"
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal">Sprint Goal</Label>
            <Textarea
              id="goal"
              value={formData.goal}
              onChange={(e) => handleChange('goal', e.target.value)}
              disabled={loading}
              placeholder="What do you want to achieve in this sprint?"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Optional: Describe the main objective of this sprint
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => handleChange('startDate', e.target.value)}
                disabled={loading}
                className={errors.startDate ? 'border-destructive' : ''}
              />
              {errors.startDate && (
                <p className="text-xs text-destructive">{errors.startDate}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date *</Label>
              <Input
                id="endDate"
                type="date"
                value={formData.endDate}
                onChange={(e) => handleChange('endDate', e.target.value)}
                disabled={loading}
                className={errors.endDate ? 'border-destructive' : ''}
              />
              {errors.endDate && (
                <p className="text-xs text-destructive">{errors.endDate}</p>
              )}
            </div>
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
                <SelectItem value="planning">Planning</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Set the initial status of the sprint
            </p>
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
                  Creating...
                </>
              ) : (
                'Create Sprint'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}