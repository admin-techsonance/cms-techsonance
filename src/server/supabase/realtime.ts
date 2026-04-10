import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export function subscribeToTenantSprintBoard(input: {
  tenantId: string;
  projectId?: number;
  sprintId?: number;
  onTaskChange: (payload: unknown) => void;
}) {
  const supabase = getSupabaseBrowserClient();
  let filter = `tenant_id=eq.${input.tenantId}`;

  if (input.projectId !== undefined) {
    filter += `,project_id=eq.${input.projectId}`;
  }

  if (input.sprintId !== undefined) {
    filter += `,sprint_id=eq.${input.sprintId}`;
  }

  const channel = supabase
    .channel(`tenant:${input.tenantId}:tasks`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter,
      },
      input.onTaskChange
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
