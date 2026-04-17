import { getSupabaseServerClient } from '@/server/supabase/client';
import { getSupabaseAdminClient } from '@/server/supabase/admin';
import {
  getCurrentSupabaseProfile,
  getSupabaseProfileByLegacyUserId,
  listSupabaseProfilesByAuthIds,
} from '@/server/supabase/users';

export function getRouteSupabase(accessToken: string) {
  return getSupabaseServerClient(accessToken) as any;
}

export function getAdminRouteSupabase() {
  return getSupabaseAdminClient() as any;
}

export async function getCurrentSupabaseActor(accessToken: string) {
  return getCurrentSupabaseProfile(accessToken);
}

export async function resolveAuthUserIdFromLegacyUserId(accessToken: string, legacyUserId: number, tenantId?: string) {
  const profile = await getSupabaseProfileByLegacyUserId(legacyUserId, { 
    useAdmin: true,
    tenantId
  });
  return profile.id;
}

export async function buildLegacyUserIdMap(accessToken: string, authUserIds: string[], tenantId?: string) {
  const sanitizedAuthUserIds = authUserIds.filter(
    (id) => typeof id === 'string' && id.trim() !== '' && id !== 'null' && id !== 'undefined'
  );
  if (!sanitizedAuthUserIds.length) {
    return new Map<string, number | null>();
  }
  const profiles = await listSupabaseProfilesByAuthIds(sanitizedAuthUserIds, { 
    useAdmin: true,
    tenantId
  });
  return new Map<string, number | null>(
    Array.from(profiles.entries()).map(([authUserId, profile]) => [authUserId, profile.legacy_user_id])
  );
}

export function normalizeSupabaseEmployeeRecord(
  row: Record<string, unknown>,
  legacyUserIdMap: Map<string, number | null>
) {
  const authUserId = typeof row.user_id === 'string' ? row.user_id : null;

  return {
    id: Number(row.id),
    userId: authUserId ? (legacyUserIdMap.get(authUserId) ?? null) : null,
    employeeId: row.employee_id,
    nfcCardId: row.nfc_card_id ?? null,
    department: row.department,
    designation: row.designation,
    dateOfJoining: row.date_of_joining,
    dateOfBirth: row.date_of_birth ?? null,
    skills: row.skills ?? null,
    salary: row.salary ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

export function normalizeSupabaseProjectRecord(
  row: Record<string, unknown>,
  legacyUserIdMap: Map<string, number | null>
) {
  const authUserId = typeof row.created_by === 'string' ? row.created_by : null;

  return {
    id: Number(row.id),
    name: row.name,
    description: row.description ?? null,
    clientId: Number(row.client_id),
    status: row.status,
    priority: row.priority,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    budget: row.budget ?? null,
    isActive: Boolean(row.is_active),
    createdBy: authUserId ? (legacyUserIdMap.get(authUserId) ?? null) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

export function normalizeSupabaseTaskRecord(
  row: Record<string, unknown>,
  legacyUserIdMap: Map<string, number | null>
) {
  const authUserId = typeof row.assigned_to === 'string' ? row.assigned_to : null;

  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    milestoneId: row.milestone_id === null ? null : Number(row.milestone_id),
    sprintId: row.sprint_id === null ? null : Number(row.sprint_id),
    title: row.title,
    description: row.description ?? null,
    assignedTo: authUserId ? (legacyUserIdMap.get(authUserId) ?? null) : null,
    status: row.status,
    priority: row.priority,
    storyPoints: row.story_points ?? null,
    estimatedHours: row.estimated_hours ?? 0,
    loggedHours: row.logged_hours ?? 0,
    blockedById: row.blocked_by_id === null ? null : Number(row.blocked_by_id),
    dueDate: row.due_date ?? null,
    version: row.version ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}
