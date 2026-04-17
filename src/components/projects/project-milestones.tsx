'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, CheckCircle2, Circle, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface Milestone {
  id: number;
  projectId: number;
  title: string;
  description: string | null;
  dueDate: string;
  status: string;
}

export function ProjectMilestones({ projectId, canEdit = false }: { projectId: number, canEdit?: boolean }) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMilestones();
  }, [projectId]);

  const fetchMilestones = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/milestones?projectId=${projectId}&limit=100`);
      if (response.ok) {
        const data = await response.json();
        setMilestones(data);
      }
    } catch (error) {
      console.error('Error fetching milestones:', error);
    } finally {
      setLoading(false);
    }
  };

  const completedCount = milestones.filter(m => m.status === 'completed').length;
  const progressPercentage = milestones.length > 0 ? (completedCount / milestones.length) * 100 : 0;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Project Milestones</CardTitle>
              <CardDescription>
                {completedCount} of {milestones.length} milestones completed
              </CardDescription>
            </div>
            {canEdit && (
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Milestone
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{progressPercentage.toFixed(0)}%</span>
            </div>
            <Progress value={progressPercentage} />
          </div>

          {milestones.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">No milestones yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {milestones.map((milestone) => (
                <div key={milestone.id} className="flex gap-4 p-4 border rounded-lg">
                  <div className="mt-1">
                    {milestone.status === 'completed' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : milestone.status === 'in_progress' ? (
                      <Clock className="h-5 w-5 text-blue-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <h4 className="font-semibold">{milestone.title}</h4>
                      <Badge variant={
                        milestone.status === 'completed' ? 'secondary' :
                        milestone.status === 'in_progress' ? 'default' :
                        'outline'
                      }>
                        {milestone.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    {milestone.description && (
                      <p className="text-sm text-muted-foreground">{milestone.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Due: {new Date(milestone.dueDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
