'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedRole, setSelectedRole] = useState('developer');

  useEffect(() => {
    if (open) {
      fetchProjects();
      setSelectedProject('');
      setSelectedRole('developer');
    }
  }, [open]);

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
        setProjects(data);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProject) {
      toast.error('Please select a project');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/project-members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: parseInt(selectedProject),
          userId: userId,
          role: selectedRole,
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
      setSelectedProject('');
      setSelectedRole('developer');
    } catch (error) {
      console.error('Error assigning project:', error);
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project">Project *</Label>
            <Select
              value={selectedProject}
              onValueChange={setSelectedProject}
              disabled={loading || loadingData}
            >
              <SelectTrigger>
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Project Role *</Label>
            <Select
              value={selectedRole}
              onValueChange={setSelectedRole}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="developer">Developer</SelectItem>
                <SelectItem value="designer">Designer</SelectItem>
                <SelectItem value="tester">Tester</SelectItem>
              </SelectContent>
            </Select>
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
      </DialogContent>
    </Dialog>
  );
}
