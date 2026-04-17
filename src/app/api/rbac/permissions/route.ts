/**
 * Permissions API Route - GET /api/rbac/permissions
 * Fetches all permissions for the current tenant
 */

import { NextResponse } from 'next/server';
import { getRouteSupabase } from '@/server/supabase/route-helpers';
import { authenticateRequest } from '@/server/auth/session';
import { requireRole } from '@/server/auth/rbac';
import { normalizeAppRole } from '@/server/auth/rbac';

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

    // Fetch permissions grouped by module
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('module_name');

    if (error) throw error;

    // Group by module
    const grouped: Record<string, any[]> = {};
    for (const perm of data || []) {
      if (!grouped[perm.module_name]) {
        grouped[perm.module_name] = [];
      }
      grouped[perm.module_name].push(perm);
    }

    return NextResponse.json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch permissions' },
      { status: 500 }
    );
  }
}
