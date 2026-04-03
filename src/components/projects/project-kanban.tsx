'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FolderKanban, Calendar, DollarSign } from 'lucide-react';
import Link from 'next/link';

interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
}

interface ProjectKanbanProps {
  projects: Project[];
  onUpdate: () => void;
}

const statusColumns = [
  { id: 'planning', label: 'Planning', color: 'bg-blue-100 dark:bg-blue-900' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-green-100 dark:bg-green-900' },
  { id: 'on_hold', label: 'On Hold', color: 'bg-yellow-100 dark:bg-yellow-900' },
  { id: 'completed', label: 'Completed', color: 'bg-gray-100 dark:bg-gray-900' },
];

export function ProjectKanban({ projects, onUpdate }: ProjectKanbanProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {statusColumns.map((column) => {
        const columnProjects = projects.filter((p) => p.status === column.id);
        
        return (
          <div key={column.id} className="space-y-3">
            <div className={`rounded-lg p-3 ${column.color}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{column.label}</h3>
                <Badge variant="secondary">{columnProjects.length}</Badge>
              </div>
            </div>

            <div className="space-y-3">
              {columnProjects.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex items-center justify-center py-8">
                    <p className="text-sm text-muted-foreground">No projects</p>
                  </CardContent>
                </Card>
              ) : (
                columnProjects.map((project) => (
                  <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-sm font-medium line-clamp-2">
                            {project.name}
                          </CardTitle>
                          <Badge variant={
                            project.priority === 'high' ? 'destructive' :
                            project.priority === 'medium' ? 'default' :
                            'secondary'
                          } className="text-xs">
                            {project.priority}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {project.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {project.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {project.endDate && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(project.endDate).toLocaleDateString()}
                            </div>
                          )}
                          {project.budget && (
                            <div className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              ${(project.budget / 1000).toFixed(0)}K
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
