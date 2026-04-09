import { ForbiddenError } from '@/server/http/errors';
import { ROLE_HIERARCHY, type AppRole } from '@/server/auth/constants';

export function normalizeAppRole(role: string | null | undefined): AppRole {
  switch ((role ?? '').toLowerCase()) {
    case 'superadmin':
      return 'SuperAdmin';
    case 'admin':
    case 'hr_manager':
    case 'cms_administrator':
    case 'management':
      return 'Admin';
    case 'manager':
    case 'project_manager':
      return 'Manager';
    case 'viewer':
    case 'client':
      return 'Viewer';
    default:
      return 'Employee';
  }
}

export function requireRole(actualRole: AppRole, allowedRoles: AppRole[]) {
  const actualRank = ROLE_HIERARCHY[actualRole];
  const allowed = allowedRoles.some((role) => actualRank >= ROLE_HIERARCHY[role]);

  if (!allowed) {
    throw new ForbiddenError('You do not have permission to access this resource');
  }
}

