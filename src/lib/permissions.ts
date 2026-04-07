/**
 * Role-based Access Control (RBAC) Utility
 * Defines permissions for different user roles in the system
 */

export type UserRole =
  | 'admin'
  | 'hr_manager'
  | 'cms_administrator'
  | 'project_manager'
  | 'business_development'
  | 'developer'
  | 'qa_engineer'
  | 'devops_engineer'
  | 'ui_ux_designer'
  | 'digital_marketing'
  | 'business_analyst'
  | 'management'
  | 'intern'
  | 'architect'
  | 'client';

export interface Permission {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove?: boolean;
}

export interface RolePermissions {
  dashboard: Permission;
  clients: Permission;
  projects: Permission;
  team: Permission;
  finance: Permission;
  content: Permission;
  settings: Permission;
  dailyUpdate: Permission;
  myAccount: Permission;
  helpDesk: Permission;
  inquiry: Permission;
  tasks: Permission;
  reimbursements: Permission;
}

const defaultPermission: Permission = {
  canView: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,
};

const fullAccess: Permission = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  canApprove: true,
};

const viewOnly: Permission = {
  canView: true,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,
};

const viewAndCreate: Permission = {
  canView: true,
  canCreate: true,
  canEdit: false,
  canDelete: false,
  canApprove: false,
};

const viewEditCreate: Permission = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: false,
  canApprove: false,
};

/**
 * Role Permission Matrix
 */
export const rolePermissions: Record<UserRole, RolePermissions> = {
  // Admin - Full access to everything
  admin: {
    dashboard: fullAccess,
    clients: fullAccess,
    projects: fullAccess,
    team: fullAccess,
    finance: fullAccess,
    content: fullAccess,
    settings: fullAccess,
    dailyUpdate: fullAccess,
    myAccount: fullAccess,
    helpDesk: fullAccess,
    inquiry: fullAccess,
    tasks: fullAccess,
    reimbursements: fullAccess,
  },

  // HR Manager - Full access (same as admin)
  hr_manager: {
    dashboard: fullAccess,
    clients: fullAccess,
    projects: fullAccess,
    team: fullAccess,
    finance: fullAccess,
    content: fullAccess,
    settings: fullAccess,
    dailyUpdate: fullAccess,
    myAccount: fullAccess,
    helpDesk: fullAccess,
    inquiry: fullAccess,
    tasks: fullAccess,
    reimbursements: fullAccess,
  },

  // CMS Administrator - Full access (same as admin)
  cms_administrator: {
    dashboard: fullAccess,
    clients: fullAccess,
    projects: fullAccess,
    team: fullAccess,
    finance: fullAccess,
    content: fullAccess,
    settings: fullAccess,
    dailyUpdate: fullAccess,
    myAccount: fullAccess,
    helpDesk: fullAccess,
    inquiry: fullAccess,
    tasks: fullAccess,
    reimbursements: fullAccess,
  },

  // Project Manager - Projects and team management
  project_manager: {
    dashboard: fullAccess,
    clients: defaultPermission,
    projects: fullAccess,
    team: defaultPermission,
    finance: defaultPermission,
    content: defaultPermission,
    settings: defaultPermission,
    dailyUpdate: fullAccess,
    myAccount: fullAccess,
    helpDesk: fullAccess,
    inquiry: fullAccess,
    tasks: fullAccess,
    reimbursements: viewEditCreate,
  },

  // Business Development - Inquiry and client access
  business_development: {
    dashboard: viewOnly,
    clients: viewEditCreate,
    projects: viewOnly,
    team: viewOnly,
    finance: viewOnly,
    content: viewOnly,
    settings: viewOnly,
    dailyUpdate: { ...viewEditCreate, canApprove: false },
    myAccount: { ...viewEditCreate, canApprove: false },
    helpDesk: viewEditCreate,
    inquiry: fullAccess,
    tasks: viewOnly,
    reimbursements: viewEditCreate,
  },

  // Management Role
  management: {
    dashboard: fullAccess,
    clients: fullAccess,
    projects: fullAccess,
    team: fullAccess,
    finance: fullAccess,
    content: fullAccess,
    settings: fullAccess,
    dailyUpdate: fullAccess,
    myAccount: fullAccess,
    helpDesk: fullAccess,
    inquiry: fullAccess,
    tasks: fullAccess,
    reimbursements: fullAccess,
  },

  // Developer - Same as existing developer role
  developer: {
    dashboard: viewOnly,
    clients: viewOnly,
    projects: viewOnly,
    team: viewOnly,
    finance: defaultPermission,
    content: defaultPermission,
    settings: defaultPermission,
    dailyUpdate: viewEditCreate,
    myAccount: { ...viewEditCreate, canApprove: false },
    helpDesk: viewEditCreate,
    inquiry: viewOnly,
    tasks: fullAccess,
    reimbursements: viewEditCreate,
  },

  // QA Engineer - Same as developer
  qa_engineer: {
    dashboard: viewOnly,
    clients: viewOnly,
    projects: viewOnly,
    team: viewOnly,
    finance: defaultPermission,
    content: defaultPermission,
    settings: defaultPermission,
    dailyUpdate: viewEditCreate,
    myAccount: { ...viewEditCreate, canApprove: false },
    helpDesk: viewEditCreate,
    inquiry: viewOnly,
    tasks: fullAccess,
    reimbursements: viewEditCreate,
  },

  // DevOps Engineer - Same as developer
  devops_engineer: {
    dashboard: viewOnly,
    clients: viewOnly,
    projects: viewOnly,
    team: viewOnly,
    finance: defaultPermission,
    content: defaultPermission,
    settings: defaultPermission,
    dailyUpdate: viewEditCreate,
    myAccount: { ...viewEditCreate, canApprove: false },
    helpDesk: viewEditCreate,
    inquiry: viewOnly,
    tasks: fullAccess,
    reimbursements: viewEditCreate,
  },

  // UI/UX Designer - Same as developer
  ui_ux_designer: {
    dashboard: viewOnly,
    clients: viewOnly,
    projects: viewOnly,
    team: viewOnly,
    finance: defaultPermission,
    content: defaultPermission,
    settings: defaultPermission,
    dailyUpdate: viewEditCreate,
    myAccount: { ...viewEditCreate, canApprove: false },
    helpDesk: viewEditCreate,
    inquiry: viewOnly,
    tasks: fullAccess,
    reimbursements: viewEditCreate,
  },

  // Digital Marketing - Content and marketing access
  digital_marketing: {
    dashboard: viewOnly,
    clients: viewOnly,
    projects: viewOnly,
    team: viewOnly,
    finance: viewOnly,
    content: fullAccess,
    settings: viewOnly,
    dailyUpdate: viewEditCreate,
    myAccount: { ...viewEditCreate, canApprove: false },
    helpDesk: viewEditCreate,
    inquiry: viewOnly,
    tasks: viewEditCreate,
    reimbursements: viewEditCreate,
  },

  // Business Analyst - Analysis and reporting access
  business_analyst: {
    dashboard: viewOnly,
    clients: viewOnly,
    projects: viewOnly,
    team: viewOnly,
    finance: viewOnly,
    content: viewOnly,
    settings: viewOnly,
    dailyUpdate: viewEditCreate,
    myAccount: { ...viewEditCreate, canApprove: false },
    helpDesk: viewEditCreate,
    inquiry: viewOnly,
    tasks: viewEditCreate,
    reimbursements: viewEditCreate,
  },

  // Intern Role
  intern: {
    dashboard: viewOnly,
    clients: viewOnly,
    projects: viewOnly,
    team: viewOnly,
    finance: defaultPermission,
    content: defaultPermission,
    settings: defaultPermission,
    dailyUpdate: viewAndCreate,
    myAccount: { ...viewAndCreate, canApprove: false },
    helpDesk: viewAndCreate,
    inquiry: viewOnly,
    tasks: viewAndCreate,
    reimbursements: defaultPermission,
  },

  // Architect Role
  architect: {
    dashboard: viewOnly,
    clients: viewOnly,
    projects: fullAccess,
    team: viewOnly,
    finance: defaultPermission,
    content: defaultPermission,
    settings: defaultPermission,
    dailyUpdate: viewEditCreate,
    myAccount: { ...viewEditCreate, canApprove: false },
    helpDesk: viewEditCreate,
    inquiry: viewOnly,
    tasks: fullAccess,
    reimbursements: viewEditCreate,
  },

  // Client - Limited access
  client: {
    dashboard: viewOnly,
    clients: defaultPermission,
    projects: viewOnly,
    team: defaultPermission,
    finance: viewOnly,
    content: defaultPermission,
    settings: defaultPermission,
    dailyUpdate: defaultPermission,
    myAccount: defaultPermission,
    helpDesk: viewEditCreate,
    inquiry: defaultPermission,
    tasks: viewOnly,
    reimbursements: defaultPermission,
  },
};

/**
 * Check if a role has permission for a specific module and action
 */
export function hasPermission(
  role: UserRole,
  module: keyof RolePermissions,
  action: keyof Permission
): boolean {
  const permissions = rolePermissions[role];
  if (!permissions) return false;

  const modulePermission = permissions[module];
  if (!modulePermission) return false;

  return modulePermission[action] === true;
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: UserRole): RolePermissions | null {
  return rolePermissions[role] || null;
}

/**
 * Check if user has full access (admin-like roles)
 */
export function hasFullAccess(role: UserRole): boolean {
  return role === 'admin' || role === 'hr_manager' || role === 'cms_administrator' || role === 'project_manager' || role === 'management';
}

/**
 * Check if user is a developer-like role (can submit daily updates, etc.)
 */
export function isDeveloperRole(role: UserRole): boolean {
  return [
    'developer',
    'qa_engineer',
    'devops_engineer',
    'ui_ux_designer',
  ].includes(role);
}

/**
 * Get user-friendly role name
 */
export function getRoleName(role: UserRole): string {
  const roleNames: Record<UserRole, string> = {
    admin: 'Administrator',
    hr_manager: 'HR Manager',
    cms_administrator: 'CMS Administrator',
    project_manager: 'Project Manager',
    business_development: 'Business Development',
    developer: 'Developer',
    qa_engineer: 'QA Engineer',
    devops_engineer: 'DevOps Engineer',
    ui_ux_designer: 'UI/UX Designer',
    digital_marketing: 'Digital Marketing',
    business_analyst: 'Business Analyst',
    management: 'Management',
    intern: 'Intern',
    architect: 'Architect',
    client: 'Client',
  };

  return roleNames[role] || role;
}
