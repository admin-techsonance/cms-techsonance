'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Calendar as CalendarIcon, Clock, ChevronRight, AlertCircle, Timer, BarChart } from 'lucide-react';
import { isEmployeeRole, type UserRole } from '@/lib/permissions';
import { toast } from 'sonner';
import { KanbanSkeleton } from '@/components/ui/dashboard-skeleton';

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
  estimatedHours: number;
  loggedHours: number;
  blockedById: number | null;
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
  { id: 'todo', title: 'To Do', color: 'bg-slate-500/5', borderColor: 'border-slate-200' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-blue-500/5', borderColor: 'border-blue-200' },
  { id: 'review', title: 'Review', color: 'bg-purple-500/5', borderColor: 'border-purple-200' },
  { id: 'done', title: 'Done', color: 'bg-emerald-500/5', borderColor: 'border-emerald-200' },
] as const;

export function KanbanBoard({ sprintId, projectId, onTaskClick, onCreateTask }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: number; role: string } | null>(null);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.user);
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  };

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
        const apiTasks = Array.isArray(data) ? data : data.data || [];
        
        // Scope tasks for employees
        if (currentUser && isEmployeeRole(currentUser.role as UserRole)) {
          setTasks(apiTasks.filter((t: any) => t.assignedTo === currentUser.id));
        } else {
          setTasks(apiTasks);
        }
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
    const previousTasks = tasks;
    const nextTasks = tasks.map((task) =>
      task.id === draggedTask.id ? { ...task, status: status as Task['status'] } : task
    );
    setTasks(nextTasks);

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
        setTasks(nextTasks);
      } else {
        setTasks(previousTasks);
        const error = await response.json();
        toast.error(error.error || 'Failed to update task');
      }
    } catch (error) {
      setTasks(previousTasks);
      toast.error('Failed to update task');
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
    return <KanbanSkeleton />;
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
            <Card className={`${column.color} border-dashed ${column.borderColor} flex-1 min-h-[500px]`}>
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
                        className={`cursor-move hover:shadow-lg transition-all border-none bg-card/60 backdrop-blur-sm group ${getPriorityColor(task.priority)}`}
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
                            <div className="flex flex-wrap gap-2">
                              {task.dueDate && (
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <CalendarIcon className="h-3 w-3" />
                                  {new Date(task.dueDate).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </div>
                              )}
                              {(task.estimatedHours > 0 || task.loggedHours > 0) && (
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                                  <Timer className="h-3 w-3" />
                                  <span>{task.loggedHours}/{task.estimatedHours}h</span>
                                </div>
                              )}
                              {task.blockedById && (
                                <div className="flex items-center gap-1 text-[10px] text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded font-bold">
                                  <AlertCircle className="h-3 w-3" />
                                  <span>Blocked</span>
                                </div>
                              )}
                            </div>
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
