'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';

interface Task {
  id: number;
  projectId: number;
  sprintId: number | null;
  title: string;
  description: string | null;
  assignedTo: number;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high';
  storyPoints: number | null;
  dueDate: string | null;
}

interface User {
  id: number;
  firstName: string;
  lastName: string;
}

interface KanbanBoardProps {
  sprintId: number | null;
  projectId?: number;
  onTaskClick?: (task: Task) => void;
  onCreateTask?: (status: string) => void;
}

const STATUS_COLUMNS = [
  { id: 'todo', title: 'To Do', color: 'bg-slate-100 dark:bg-slate-800' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-blue-50 dark:bg-blue-950' },
  { id: 'review', title: 'Review', color: 'bg-purple-50 dark:bg-purple-950' },
  { id: 'done', title: 'Done', color: 'bg-green-50 dark:bg-green-950' },
] as const;

export function KanbanBoard({ sprintId, projectId, onTaskClick, onCreateTask }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  useEffect(() => {
    fetchTasks();
  }, [sprintId, projectId]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('session_token');
      let url = `/api/tasks?limit=1000`;
      
      // Add projectId filter if provided
      if (projectId) {
        url += `&projectId=${projectId}`;
      }
      
      // Add sprintId filter if provided
      if (sprintId) {
        url += `&sprintId=${sprintId}`;
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

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

  const handleDragStart = (task: Task) => {
    setDraggedTask(task);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (status: string) => {
    if (!draggedTask) return;

    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/tasks?id=${draggedTask.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...draggedTask,
          status,
        }),
      });

      if (response.ok) {
        fetchTasks();
      }
    } catch (error) {
      console.error('Error updating task:', error);
    } finally {
      setDraggedTask(null);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-l-4 border-l-red-500';
      case 'medium':
        return 'border-l-4 border-l-yellow-500';
      case 'low':
        return 'border-l-4 border-l-green-500';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {STATUS_COLUMNS.map((column) => {
        const columnTasks = tasks.filter(task => task.status === column.id);
        const totalPoints = columnTasks.reduce((sum, task) => sum + (task.storyPoints || 0), 0);

        return (
          <div
            key={column.id}
            className="flex flex-col"
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(column.id)}
          >
            <Card className={`${column.color} flex-1`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {column.title}
                  </CardTitle>
                  <Badge variant="secondary">
                    {columnTasks.length}
                  </Badge>
                </div>
                {totalPoints > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Plus className="h-3 w-3" />
                    {totalPoints} points
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-3 max-h-[600px] overflow-y-auto px-4 pb-4">
                {columnTasks.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No tasks
                  </div>
                ) : (
                  columnTasks.map((task) => {
                    return (
                      <Card
                        key={task.id}
                        draggable
                        onDragStart={() => handleDragStart(task)}
                        onClick={() => onTaskClick?.(task)}
                        className={`cursor-move hover:shadow-md transition-shadow ${getPriorityColor(task.priority)}`}
                      >
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-medium leading-tight flex-1">
                              {task.title}
                            </h4>
                            {task.storyPoints && (
                              <Badge variant="outline" className="text-xs">
                                {task.storyPoints}
                              </Badge>
                            )}
                          </div>

                          {task.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {task.description}
                            </p>
                          )}

                          <div className="flex items-center justify-between gap-2 pt-2">
                            {task.dueDate && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Plus className="h-3 w-3" />
                                {new Date(task.dueDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </div>
                            )}
                          </div>

                          <Badge
                            variant="outline"
                            className="text-xs capitalize"
                          >
                            {task.priority}
                          </Badge>
                        </CardContent>
                      </Card>
                    );
                  })
                )}

                {onCreateTask && (
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-sm text-muted-foreground"
                    onClick={() => onCreateTask(column.id)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Task
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}