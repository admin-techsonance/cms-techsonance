'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

interface FormErrors {
  name?: string;
  clientId?: string;
  startDate?: string;
  endDate?: string;
  budget?: string;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  onSuccess,
  project,
}: ProjectFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState({
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

  useEffect(() => {
    if (open) {
      fetchClients();
    }
  }, [open]);

  useEffect(() => {
    if (project) {
      setFormData({
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
      setFormData({
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
    setErrors({});
  }, [project, open]);

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/clients?limit=100', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error('Failed to load clients');
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Validate name
    if (!formData.name.trim()) {
      newErrors.name = 'Project name is required';
    } else if (formData.name.trim().length < 3) {
      newErrors.name = 'Project name must be at least 3 characters';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'Project name must not exceed 100 characters';
    }

    // Validate client
    if (!formData.clientId) {
      newErrors.clientId = 'Please select a client';
    }

    // Validate dates
    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      
      if (end < start) {
        newErrors.endDate = 'End date must be after start date';
      }
    }

    // Validate budget
    if (formData.budget) {
      const budgetNum = parseInt(formData.budget);
      if (isNaN(budgetNum)) {
        newErrors.budget = 'Budget must be a valid number';
      } else if (budgetNum < 0) {
        newErrors.budget = 'Budget must be a positive number';
      } else if (budgetNum > 999999999) {
        newErrors.budget = 'Budget is too large';
      }
    }

    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      console.log('Validation errors:', newErrors);
    }
    
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('=== FORM SUBMISSION STARTED ===');
    console.log('Form data:', formData);
    console.log('Client ID:', formData.clientId);
    console.log('Client ID type:', typeof formData.clientId);
    console.log('Is client ID empty?', !formData.clientId);

    if (!validateForm()) {
      console.log('=== VALIDATION FAILED ===');
      console.log('Errors:', errors);
      toast.error('Please fix the form errors before submitting');
      return;
    }

    console.log('=== VALIDATION PASSED ===');
    setLoading(true);

    try {
      const token = localStorage.getItem('session_token');
      
      if (!token) {
        console.error('No session token found');
        toast.error('Authentication required. Please log in.');
        setLoading(false);
        return;
      }

      console.log('Session token found:', token.substring(0, 20) + '...');

      const url = project ? `/api/projects?id=${project.id}` : '/api/projects';
      const method = project ? 'PUT' : 'POST';

      const payload: any = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        clientId: parseInt(formData.clientId),
        status: formData.status,
        priority: formData.priority,
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        budget: formData.budget ? parseInt(formData.budget) : null,
        isActive: formData.isActive,
      };

      console.log('Sending request to:', url);
      console.log('Method:', method);
      console.log('Payload:', payload);

      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      console.log('Response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('Success! Created/Updated project:', result);
        toast.success(project ? 'Project updated successfully!' : 'Project created successfully!');
        onSuccess();
        onOpenChange(false);
      } else {
        const error = await response.json();
        console.error('API error response:', error);
        toast.error(error.error || 'Failed to save project');
      }
    } catch (error) {
      console.error('Error saving project:', error);
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Show validation summary if there are errors */}
          {Object.keys(errors).length > 0 && (
            <div className="bg-destructive/10 border border-destructive rounded-lg p-4">
              <p className="text-sm font-semibold text-destructive mb-2">
                Please fix the following errors:
              </p>
              <ul className="list-disc list-inside text-sm text-destructive space-y-1">
                {errors.name && <li>{errors.name}</li>}
                {errors.clientId && <li>{errors.clientId}</li>}
                {errors.startDate && <li>{errors.startDate}</li>}
                {errors.endDate && <li>{errors.endDate}</li>}
                {errors.budget && <li>{errors.budget}</li>}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">
              Project Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (errors.name) setErrors({ ...errors, name: undefined });
              }}
              placeholder="E-commerce Platform"
              className={errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {errors.name && (
              <p className="text-sm text-destructive font-medium">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Project overview and goals..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clientId">
                Client <span className="text-destructive">*</span>
              </Label>
              <Select 
                value={formData.clientId} 
                onValueChange={(value) => {
                  console.log('Client selected:', value);
                  setFormData({ ...formData, clientId: value });
                  if (errors.clientId) setErrors({ ...errors, clientId: undefined });
                }}
              >
                <SelectTrigger className={errors.clientId ? 'border-destructive focus:ring-destructive' : ''}>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
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
              {errors.clientId && (
                <p className="text-sm text-destructive font-bold">{errors.clientId}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget">Budget (₹)</Label>
              <Input
                id="budget"
                type="number"
                min="0"
                value={formData.budget}
                onChange={(e) => {
                  setFormData({ ...formData, budget: e.target.value });
                  if (errors.budget) setErrors({ ...errors, budget: undefined });
                }}
                placeholder="50000"
                className={errors.budget ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              {errors.budget && (
                <p className="text-sm text-destructive font-medium">{errors.budget}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => {
                  setFormData({ ...formData, startDate: e.target.value });
                  if (errors.startDate) setErrors({ ...errors, startDate: undefined });
                }}
                className={errors.startDate ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              {errors.startDate && (
                <p className="text-sm text-destructive font-medium">{errors.startDate}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={formData.endDate}
                onChange={(e) => {
                  setFormData({ ...formData, endDate: e.target.value });
                  if (errors.endDate) setErrors({ ...errors, endDate: undefined });
                }}
                className={errors.endDate ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              {errors.endDate && (
                <p className="text-sm text-destructive font-medium">{errors.endDate}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">
                Priority <span className="text-destructive">*</span>
              </Label>
              <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">
                Project Status <span className="text-destructive">*</span>
              </Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="isActive" className="text-base">
                Active Status
              </Label>
              <p className="text-sm text-muted-foreground">
                {formData.isActive ? 'Project is currently active' : 'Project is inactive'}
              </p>
            </div>
            <Switch
              id="isActive"
              checked={formData.isActive}
              onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
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
                project ? 'Update Project' : 'Create Project'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}