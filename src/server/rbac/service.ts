/**
 * RBAC Database Service
 * Handles fetching roles, permissions, and access control from Supabase
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { UserRole, CRUDPermission, ModulePermissions } from '@/lib/rbac/types';

/**
 * In-memory cache for roles and permissions
 * Cache is tenant-specific to maintain data isolation
 */
const roleCache = new Map<string, Map<string, any>>();
const permissionCache = new Map<string, Map<string, any>>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function isCacheValid<T>(entry: CacheEntry<T>): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL;
}

/**
 * Get all roles for a tenant from database
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant ID
 * @returns Array of role definitions
 */
export async function fetchRoles(supabase: SupabaseClient, tenantId: string) {
  const cacheKey = `roles_${tenantId}`;

  // Check in-memory cache
  if (roleCache.has(tenantId)) {
    const cached = roleCache.get(tenantId)!.get(cacheKey);
    if (cached && isCacheValid(cached)) {
      return cached.data;
    }
  }

  try {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('level', { ascending: false });

    if (error) throw error;

    // Store in cache
    if (!roleCache.has(tenantId)) {
      roleCache.set(tenantId, new Map());
    }
    roleCache.get(tenantId)!.set(cacheKey, {
      data: data || [],
      timestamp: Date.now(),
    });

    return data || [];
  } catch (error) {
    console.error('Error fetching roles:', error);
    return [];
  }
}

/**
 * Get a specific role by role key
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant ID
 * @param roleKey - Role key (e.g., 'admin', 'developer')
 * @returns Role definition or null
 */
export async function fetchRole(
  supabase: SupabaseClient,
  tenantId: string,
  roleKey: string
) {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('role_key', roleKey)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data || null;
  } catch (error) {
    console.error(`Error fetching role ${roleKey}:`, error);
    return null;
  }
}

/**
 * Get all permissions for a specific role
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant ID
 * @param roleId - Role ID (UUID)
 * @returns Module permissions object
 */
export async function fetchRolePermissions(
  supabase: SupabaseClient,
  tenantId: string,
  roleId: string
): Promise<ModulePermissions | null> {
  const cacheKey = `role_perms_${roleId}`;

  // Check in-memory cache
  if (permissionCache.has(tenantId)) {
    const cached = permissionCache.get(tenantId)!.get(cacheKey);
    if (cached && isCacheValid(cached)) {
      return cached.data;
    }
  }

  try {
    // Fetch all permissions for this role with action details
    const { data, error } = await supabase
      .from('role_permissions')
      .select(`
        action,
        permission:permissions(module_name, permission_key)
      `)
      .eq('tenant_id', tenantId)
      .eq('role_id', roleId);

    if (error) throw error;

    // Build module permissions object
    const modulePerms: Partial<ModulePermissions> = {
      dashboard: { create: false, read: false, update: false, delete: false },
      projects: { create: false, read: false, update: false, delete: false },
      tasks: { create: false, read: false, update: false, delete: false },
      team: { create: false, read: false, update: false, delete: false },
      clients: { create: false, read: false, update: false, delete: false },
      content: { create: false, read: false, update: false, delete: false },
      finance: { create: false, read: false, update: false, delete: false },
      reports: { create: false, read: false, update: false, delete: false },
      settings: { create: false, read: false, update: false, delete: false },
      users: { create: false, read: false, update: false, delete: false },
      attendance: { create: false, read: false, update: false, delete: false },
      leaves: { create: false, read: false, update: false, delete: false },
      tickets: { create: false, read: false, update: false, delete: false },
      reimbursements: { create: false, read: false, update: false, delete: false },
    };

    // Map permissions to modules
    if (Array.isArray(data)) {
      for (const perm of data) {
        const permission = Array.isArray(perm.permission) ? perm.permission[0] : perm.permission;
        if (permission && permission.module_name) {
          const module = permission.module_name as keyof ModulePermissions;
          if (modulePerms[module]) {
            const action = perm.action as keyof CRUDPermission;
            (modulePerms[module]![action] as boolean) = true;
          }
        }
      }
    }

    const result = modulePerms as ModulePermissions;

    // Store in cache
    if (!permissionCache.has(tenantId)) {
      permissionCache.set(tenantId, new Map());
    }
    permissionCache.get(tenantId)!.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    return result;
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    return null;
  }
}

/**
 * Check if user's role can perform an action on a module
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant ID
 * @param roleKey - User's role key
 * @param moduleName - Module name
 * @param action - Action to perform (create, read, update, delete, approve, export)
 * @returns Boolean
 */
export async function checkRolePermissionInDB(
  supabase: SupabaseClient,
  tenantId: string,
  roleKey: string,
  moduleName: string,
  action: 'create' | 'read' | 'update' | 'delete' | 'approve' | 'export'
): Promise<boolean> {
  try {
    // First get the role
    const role = await fetchRole(supabase, tenantId, roleKey);
    if (!role) return false;

    // Get permission IDs for this module
    const { data: permData, error: permError } = await supabase
      .from('permissions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('module_name', moduleName);

    if (permError) throw permError;

    const permissionIds = (permData || []).map((p: any) => p.id);
    if (permissionIds.length === 0) return false;

    // Then check if permission exists
    const { data, error } = await supabase
      .from('role_permissions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('role_id', role.id)
      .eq('action', action)
      .in('permission_id', permissionIds);

    if (error) throw error;

    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    console.error('Error checking role permission:', error);
    return false;
  }
}

/**
 * Create a new role
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant ID
 * @param roleData - Role data
 * @returns Created role or null
 */
export async function createRole(
  supabase: SupabaseClient,
  tenantId: string,
  roleData: {
    role_key: string;
    name: string;
    description?: string;
    category: string;
    level: number;
    features?: string[];
  }
) {
  try {
    const { data, error } = await supabase
      .from('roles')
      .insert([
        {
          tenant_id: tenantId,
          ...roleData,
          features: roleData.features ? JSON.stringify(roleData.features) : null,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Invalidate cache
    if (roleCache.has(tenantId)) {
      roleCache.delete(tenantId);
    }

    return data;
  } catch (error) {
    console.error('Error creating role:', error);
    return null;
  }
}

/**
 * Update an existing role
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant ID
 * @param roleId - Role ID
 * @param roleData - Role data to update
 * @returns Updated role or null
 */
export async function updateRole(
  supabase: SupabaseClient,
  tenantId: string,
  roleId: string,
  roleData: Partial<{
    name: string;
    description: string;
    level: number;
    is_active: boolean;
    features: string[];
  }>
) {
  try {
    const { data, error } = await supabase
      .from('roles')
      .update({
        ...roleData,
        features: roleData.features ? JSON.stringify(roleData.features) : undefined,
      })
      .eq('tenant_id', tenantId)
      .eq('id', roleId)
      .select()
      .single();

    if (error) throw error;

    // Invalidate cache
    if (roleCache.has(tenantId)) {
      roleCache.delete(tenantId);
    }

    return data;
  } catch (error) {
    console.error('Error updating role:', error);
    return null;
  }
}

/**
 * Assign permission to a role
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant ID
 * @param roleId - Role ID
 * @param permissionId - Permission ID
 * @param action - Action to assign
 * @returns Created assignment or null
 */
export async function assignPermissionToRole(
  supabase: SupabaseClient,
  tenantId: string,
  roleId: string,
  permissionId: string,
  action: 'create' | 'read' | 'update' | 'delete' | 'approve' | 'export'
) {
  try {
    const { data, error } = await supabase
      .from('role_permissions')
      .insert([
        {
          tenant_id: tenantId,
          role_id: roleId,
          permission_id: permissionId,
          action,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Invalidate cache
    if (permissionCache.has(tenantId)) {
      permissionCache.delete(tenantId);
    }

    return data;
  } catch (error) {
    console.error('Error assigning permission to role:', error);
    return null;
  }
}

/**
 * Remove permission from a role
 *
 * @param supabase - Supabase client
 * @param tenantId - Tenant ID
 * @param roleId - Role ID
 * @param permissionId - Permission ID
 * @param action - Action to remove
 * @returns Success boolean
 */
export async function removePermissionFromRole(
  supabase: SupabaseClient,
  tenantId: string,
  roleId: string,
  permissionId: string,
  action: 'create' | 'read' | 'update' | 'delete' | 'approve' | 'export'
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('role_permissions')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('role_id', roleId)
      .eq('permission_id', permissionId)
      .eq('action', action);

    if (error) throw error;

    // Invalidate cache
    if (permissionCache.has(tenantId)) {
      permissionCache.delete(tenantId);
    }

    return true;
  } catch (error) {
    console.error('Error removing permission from role:', error);
    return false;
  }
}

/**
 * Clear cache for a tenant
 * Useful after bulk updates
 *
 * @param tenantId - Tenant ID
 */
export function clearRBACCache(tenantId: string): void {
  roleCache.delete(tenantId);
  permissionCache.delete(tenantId);
}

/**
 * Clear all RBAC caches
 * Use with caution - only when necessary
 */
export function clearAllRBACCaches(): void {
  roleCache.clear();
  permissionCache.clear();
}
