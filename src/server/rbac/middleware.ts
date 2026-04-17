/**
 * RBAC Route Protection Middleware
 * Utilities for protecting API routes with role and permission checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/server/auth/session';
import { getRouteSupabase } from '@/server/supabase/route-helpers';
import { requireRole, normalizeAppRole } from '@/server/auth/rbac';
import { checkRolePermissionInDB } from '@/server/rbac/service';
import type { AppRole } from '@/server/auth/constants';

/**
 * Options for route protection
 */
export interface ProtectRouteOptions {
  requireAuth?: boolean;
  allowedRoles?: AppRole[];
  module?: string;
  action?: 'create' | 'read' | 'update' | 'delete' | 'approve' | 'export';
}

/**
 * Protect a route with authentication and authorization
 *
 * @param request - Next.js request
 * @param options - Protection options
 * @returns Authentication context or error response
 *
 * @example
 * export async function GET(request: Request) {
 *   const auth = await protectRoute(request, {
 *     requireAuth: true,
 *     allowedRoles: ['Admin', 'Manager'],
 *     module: 'projects',
 *     action: 'read'
 *   });
 *
 *   if (!auth.authenticated) {
 *     return auth.errorResponse;
 *   }
 *
 *   // Proceed with handler
 * }
 */
export async function protectRoute(
  request: NextRequest,
  options: ProtectRouteOptions = {}
) {
  const {
    requireAuth = true,
    allowedRoles = [],
    module,
    action = 'read',
  } = options;

  try {
    // Authenticate request
    const auth = await authenticateRequest(request, { required: requireAuth });

    if (!auth) {
      return {
        authenticated: false,
        errorResponse: NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        ),
      };
    }

    // Check role-based access
    if (allowedRoles.length > 0) {
      const normalizedRole = normalizeAppRole(auth.user.role);
      if (!allowedRoles.includes(normalizedRole)) {
        return {
          authenticated: false,
          errorResponse: NextResponse.json(
            { error: 'Insufficient permissions' },
            { status: 403 }
          ),
        };
      }
    }

    // Check permission-based access
    if (module) {
      const tenantId = auth.user.tenantId;
      if (!tenantId) {
        return {
          authenticated: false,
          errorResponse: NextResponse.json(
            { error: 'No tenant context' },
            { status: 400 }
          ),
        };
      }

      const supabase = getRouteSupabase(auth.accessToken);
      const hasPermission = await checkRolePermissionInDB(
        supabase,
        tenantId,
        normalizeAppRole(auth.user.role),
        module,
        action
      );

      if (!hasPermission) {
        return {
          authenticated: false,
          errorResponse: NextResponse.json(
            { error: `No ${action} permission for ${module}` },
            { status: 403 }
          ),
        };
      }
    }

    return {
      authenticated: true,
      auth,
    };
  } catch (error) {
    console.error('Route protection error:', error);
    return {
      authenticated: false,
      errorResponse: NextResponse.json(
        { error: 'Authentication failed' },
        { status: 500 }
      ),
    };
  }
}

/**
 * Middleware to check if user is admin
 *
 * @param auth - Authentication context
 * @returns Boolean
 */
export function isAdmin(auth: any): boolean {
  const normalizedRole = normalizeAppRole(auth.user.role);
  return normalizedRole === 'SuperAdmin' || normalizedRole === 'Admin';
}

/**
 * Middleware to check if user is manager or higher
 *
 * @param auth - Authentication context
 * @returns Boolean
 */
export function isManager(auth: any): boolean {
  const normalizedRole = normalizeAppRole(auth.user.role);
  return (
    normalizedRole === 'SuperAdmin' ||
    normalizedRole === 'Admin' ||
    normalizedRole === 'Manager'
  );
}

/**
 * Middleware to check if user is employee or higher
 *
 * @param auth - Authentication context
 * @returns Boolean
 */
export function isEmployee(auth: any): boolean {
  const normalizedRole = normalizeAppRole(auth.user.role);
  return normalizedRole !== 'Viewer' && normalizedRole !== null;
}

/**
 * Get user's permission level (numeric)
 * Useful for comparisons
 *
 * @param auth - Authentication context
 * @returns Permission level (1-5)
 */
export function getPermissionLevel(auth: any): number {
  const ROLE_HIERARCHY: Record<AppRole, number> = {
    SuperAdmin: 5,
    Admin: 4,
    Manager: 3,
    Employee: 2,
    Viewer: 1,
  };

  const normalizedRole = normalizeAppRole(auth.user.role) as AppRole;
  return ROLE_HIERARCHY[normalizedRole] || 0;
}

/**
 * Check if one role can manage another role
 *
 * @param managerRole - Role attempting to manage
 * @param targetRole - Role being managed
 * @returns Boolean
 */
export function canManageRole(managerRole: AppRole, targetRole: AppRole): boolean {
  const ROLE_HIERARCHY: Record<AppRole, number> = {
    SuperAdmin: 5,
    Admin: 4,
    Manager: 3,
    Employee: 2,
    Viewer: 1,
  };

  return ROLE_HIERARCHY[managerRole] > ROLE_HIERARCHY[targetRole];
}
