'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, Calendar, User } from 'lucide-react';
import { TaskFormDialog } from '@/components/projects/task-form-dialog';

interface Task {
  id: number;
  projectId: number;
  title: string;
  description: string | null;
  assignedTo: number;
  status: string;
  priority: string;
  dueDate: string | null;
}

const statusColumns = [
  { id: 'todo', label: 'To Do', color: 'bg-gray-100 dark:bg-gray-900' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-blue-100 dark:bg-blue-900' },
  { id: 'review', label: 'Review', color: 'bg-yellow-100 dark:bg-yellow-900' },
  { id: 'done', label: 'Done', color: 'bg-green-100 dark:bg-green-900' },
];

export function ProjectTasksBoard({ projectId }: { projectId: number }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, [projectId]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks?projectId=${projectId}&limit=100`);
      if (response.ok) {
        const data = await response.json();
        setTasks(data);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Task Board</h3>
        <Button onClick={() => setShowAddDialog(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Task
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statusColumns.map((column) => {
          const columnTasks = tasks.filter((t) => t.status === column.id);
          
          return (
            <div key={column.id} className="space-y-3">
              <div className={`rounded-lg p-3 ${column.color}`}>
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">{column.label}</h4>
                  <Badge variant="secondary">{columnTasks.length}</Badge>
                </div>
              </div>

              <div className="space-y-2">
                {columnTasks.map((task) => (
                  <Card key={task.id} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h5 className="text-sm font-medium line-clamp-2">{task.title}</h5>
                        <Badge variant={
                          task.priority === 'high' ? 'destructive' :
                          task.priority === 'medium' ? 'default' :
                          'secondary'
                        } className="text-xs shrink-0">
                          {task.priority}
                        </Badge>
                      </div>
                      {task.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {task.dueDate && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(task.dueDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <TaskFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={fetchTasks}
        projectId={projectId}
      />
    </div>
  );
}
