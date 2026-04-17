/**
 * Roles API Route - GET /api/rbac/roles
 * Fetches all roles for the current tenant
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getRouteSupabase } from '@/server/supabase/route-helpers';
import { fetchRoles, fetchRolePermissions } from '@/server/rbac/service';
import { requireRole } from '@/server/auth/rbac';
import { normalizeAppRole } from '@/server/auth/rbac';
import { authenticateRequest } from '@/server/auth/session';

export async function GET(request: Request) {
  try {
    // Authenticate request
    const auth = await authenticateRequest(request, { required: true });
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has admin-level access
    try {
      requireRole(normalizeAppRole(auth.user.role), ['SuperAdmin', 'Admin']);
    } catch (error) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const tenantId = auth.user.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { error: 'No tenant context' },
        { status: 400 }
      );
    }

    // Get Supabase client
    const supabase = getRouteSupabase(auth.accessToken);

    // Fetch roles
    const roles = await fetchRoles(supabase, tenantId);

    // Fetch permissions for each role
    const rolesWithPermissions = await Promise.all(
      roles.map(async (role: any) => ({
        ...role,
        permissions: await fetchRolePermissions(supabase, tenantId, role.id),
      }))
    );

    return NextResponse.json({
      success: true,
      data: rolesWithPermissions,
    });
  } catch (error) {
    console.error('Error fetching roles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch roles' },
      { status: 500 }
    );
  }
}
