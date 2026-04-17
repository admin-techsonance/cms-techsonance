/**
 * RBAC Role Definitions and Permissions Matrix
 * Centralized source of truth for all roles and their permissions
 */

import type {
  UserRole,
  RoleDefinition,
  RoleCategory,
  ModulePermissions,
  CRUDPermission,
  RoleHierarchy,
} from './types';

/**
 * Default permission levels
 */
const PERMISSIONS = {
  // No access
  NONE: {
    create: false,
    read: false,
    update: false,
    delete: false,
  } as CRUDPermission,

  // Read-only access
  READ_ONLY: {
    create: false,
    read: true,
    update: false,
    delete: false,
  } as CRUDPermission,

  // Read and create
  READ_CREATE: {
    create: true,
    read: true,
    update: false,
    delete: false,
  } as CRUDPermission,

  // Read, create, and update
  READ_CREATE_UPDATE: {
    create: true,
    read: true,
    update: true,
    delete: false,
  } as CRUDPermission,

  // Full CRUD
  FULL: {
    create: true,
    read: true,
    update: true,
    delete: true,
    approve: true,
    export: true,
  } as CRUDPermission,

  // Full CRUD without delete
  FULL_NO_DELETE: {
    create: true,
    read: true,
    update: true,
    delete: false,
    approve: true,
    export: true,
  } as CRUDPermission,

  // Full CRUD with approval
  FULL_WITH_APPROVAL: {
    create: true,
    read: true,
    update: true,
    delete: true,
    approve: true,
    export: true,
  } as CRUDPermission,
};

/**
 * ==================================================
 * CORE ROLES DEFINITIONS
 * ==================================================
 */

/**
 * Admin (Super Admin) - Full control over the entire system
 * - Manages users, roles, and permissions
 * - Approves/rejects content and workflows
 * - Configures system settings
 */
const adminRole: RoleDefinition = {
  id: 'admin',
  name: 'Super Admin',
  description: 'Full control over the entire system. Manages users, roles, permissions, and system configuration.',
  category: 'administration',
  level: 100,
  isActive: true,
  features: ['user_management', 'role_management', 'system_settings', 'audit_logs', 'backups', 'integrations'],
  permissions: {
    dashboard: PERMISSIONS.FULL,
    projects: PERMISSIONS.FULL,
    tasks: PERMISSIONS.FULL,
    team: PERMISSIONS.FULL,
    clients: PERMISSIONS.FULL,
    content: PERMISSIONS.FULL,
    finance: PERMISSIONS.FULL,
    reports: PERMISSIONS.FULL,
    settings: PERMISSIONS.FULL,
    users: PERMISSIONS.FULL,
    attendance: PERMISSIONS.FULL,
    leaves: PERMISSIONS.FULL,
    tickets: PERMISSIONS.FULL,
    reimbursements: PERMISSIONS.FULL,
  },
};

/**
 * Project Manager - Creates and manages projects
 * - Creates and manages projects
 * - Assigns tasks to developers/designers
 * - Tracks progress, deadlines, and deliverables
 * - Communicates with clients
 */
const projectManagerRole: RoleDefinition = {
  id: 'project_manager',
  name: 'Project Manager',
  description: 'Creates and manages projects, assigns tasks, tracks progress, and communicates with clients.',
  category: 'management',
  level: 80,
  isActive: true,
  features: ['project_creation', 'task_assignment', 'progress_tracking', 'client_communication', 'reporting'],
  permissions: {
    dashboard: PERMISSIONS.FULL_NO_DELETE,
    projects: PERMISSIONS.FULL_NO_DELETE,
    tasks: PERMISSIONS.FULL_NO_DELETE,
    team: PERMISSIONS.READ_ONLY,
    clients: PERMISSIONS.READ_CREATE_UPDATE,
    content: PERMISSIONS.NONE,
    finance: PERMISSIONS.READ_ONLY,
    reports: PERMISSIONS.FULL,
    settings: PERMISSIONS.NONE,
    users: PERMISSIONS.READ_ONLY,
    attendance: PERMISSIONS.READ_ONLY,
    leaves: PERMISSIONS.READ_ONLY,
    tickets: PERMISSIONS.READ_CREATE_UPDATE,
    reimbursements: PERMISSIONS.READ_ONLY,
  },
};

/**
 * Developer - Works on assigned tasks
 * - Works on assigned tasks (frontend/backend)
 * - Updates task status
 * - Uploads code, documentation, or deliverables
 * - Reports bugs/issues
 */
const developerRole: RoleDefinition = {
  id: 'developer',
  name: 'Developer',
  description: 'Works on assigned tasks, updates status, uploads deliverables, and reports issues.',
  category: 'technical',
  level: 60,
  isActive: true,
  features: ['code_repository', 'task_management', 'time_tracking', 'issue_reporting', 'documentation'],
  permissions: {
    dashboard: PERMISSIONS.READ_ONLY,
    projects: PERMISSIONS.READ_ONLY,
    tasks: PERMISSIONS.FULL_NO_DELETE,
    team: PERMISSIONS.READ_ONLY,
    clients: PERMISSIONS.READ_ONLY,
    content: PERMISSIONS.NONE,
    finance: PERMISSIONS.NONE,
    reports: PERMISSIONS.READ_ONLY,
    settings: PERMISSIONS.NONE,
    users: PERMISSIONS.NONE,
    attendance: PERMISSIONS.NONE,
    leaves: PERMISSIONS.READ_CREATE_UPDATE,
    tickets: PERMISSIONS.READ_CREATE_UPDATE,
    reimbursements: PERMISSIONS.READ_CREATE_UPDATE,
  },
};

/**
 * Designer (UI/UX) - Uploads design files and collaborates
 * - Uploads design files (Figma, images, etc.)
 * - Works on UI/UX tasks
 * - Collaborates with developers
 */
const designerRole: RoleDefinition = {
  id: 'designer',
  name: 'UI/UX Designer',
  description: 'Uploads design files, works on UI/UX tasks, and collaborates with the development team.',
  category: 'creative',
  level: 60,
  isActive: true,
  features: ['design_tools', 'asset_management', 'collaboration', 'prototyping', 'file_upload'],
  permissions: {
    dashboard: PERMISSIONS.READ_ONLY,
    projects: PERMISSIONS.READ_ONLY,
    tasks: PERMISSIONS.FULL_NO_DELETE,
    team: PERMISSIONS.READ_ONLY,
    clients: PERMISSIONS.READ_ONLY,
    content: PERMISSIONS.READ_CREATE_UPDATE,
    finance: PERMISSIONS.NONE,
    reports: PERMISSIONS.READ_ONLY,
    settings: PERMISSIONS.NONE,
    users: PERMISSIONS.NONE,
    attendance: PERMISSIONS.NONE,
    leaves: PERMISSIONS.READ_CREATE_UPDATE,
    tickets: PERMISSIONS.READ_CREATE_UPDATE,
    reimbursements: PERMISSIONS.READ_CREATE_UPDATE,
  },
};

/**
 * Content Editor / Content Manager - Creates and edits content
 * - Creates and edits website/app content
 * - Manages blog posts, pages, media
 * - Ensures content quality and SEO
 */
const contentEditorRole: RoleDefinition = {
  id: 'content_editor',
  name: 'Content Editor',
  description: 'Creates and edits website/app content, manages blogs, pages, and media.',
  category: 'content',
  level: 55,
  isActive: true,
  features: ['content_management', 'media_library', 'seo_tools', 'publishing', 'scheduling'],
  permissions: {
    dashboard: PERMISSIONS.READ_ONLY,
    projects: PERMISSIONS.READ_ONLY,
    tasks: PERMISSIONS.READ_CREATE_UPDATE,
    team: PERMISSIONS.READ_ONLY,
    clients: PERMISSIONS.READ_ONLY,
    content: PERMISSIONS.FULL_NO_DELETE,
    finance: PERMISSIONS.NONE,
    reports: PERMISSIONS.READ_ONLY,
    settings: PERMISSIONS.NONE,
    users: PERMISSIONS.NONE,
    attendance: PERMISSIONS.NONE,
    leaves: PERMISSIONS.READ_CREATE_UPDATE,
    tickets: PERMISSIONS.READ_CREATE_UPDATE,
    reimbursements: PERMISSIONS.READ_CREATE_UPDATE,
  },
};

/**
 * QA / Tester - Tests features and reports issues
 * - Tests features and bug fixes
 * - Reports issues
 * - Verifies completed tasks before release
 */
const qaTesterRole: RoleDefinition = {
  id: 'qa_tester',
  name: 'QA Engineer',
  description: 'Tests features, reports issues, and verifies completed tasks before release.',
  category: 'quality',
  level: 55,
  isActive: true,
  features: ['test_management', 'bug_reporting', 'test_automation', 'quality_metrics', 'release_verification'],
  permissions: {
    dashboard: PERMISSIONS.READ_ONLY,
    projects: PERMISSIONS.READ_ONLY,
    tasks: PERMISSIONS.FULL_NO_DELETE,
    team: PERMISSIONS.READ_ONLY,
    clients: PERMISSIONS.READ_ONLY,
    content: PERMISSIONS.NONE,
    finance: PERMISSIONS.NONE,
    reports: PERMISSIONS.READ_ONLY,
    settings: PERMISSIONS.NONE,
    users: PERMISSIONS.NONE,
    attendance: PERMISSIONS.NONE,
    leaves: PERMISSIONS.READ_CREATE_UPDATE,
    tickets: PERMISSIONS.READ_CREATE_UPDATE,
    reimbursements: PERMISSIONS.READ_CREATE_UPDATE,
  },
};

/**
 * Client / Customer - Views project progress with limited access
 * - Views project progress
 * - Gives feedback
 * - Approves milestones or deliverables
 * - Limited access (read/comment mostly)
 */
const clientRole: RoleDefinition = {
  id: 'client',
  name: 'Client',
  description: 'Views project progress, provides feedback, and approves milestones with limited access.',
  category: 'client',
  level: 30,
  isActive: true,
  features: ['project_viewing', 'progress_tracking', 'feedback', 'milestone_approval', 'client_portal'],
  permissions: {
    dashboard: PERMISSIONS.READ_ONLY,
    projects: PERMISSIONS.READ_ONLY,
    tasks: PERMISSIONS.READ_ONLY,
    team: PERMISSIONS.NONE,
    clients: PERMISSIONS.NONE,
    content: PERMISSIONS.NONE,
    finance: PERMISSIONS.READ_ONLY,
    reports: PERMISSIONS.READ_ONLY,
    settings: PERMISSIONS.NONE,
    users: PERMISSIONS.NONE,
    attendance: PERMISSIONS.NONE,
    leaves: PERMISSIONS.NONE,
    tickets: PERMISSIONS.READ_CREATE_UPDATE,
    reimbursements: PERMISSIONS.NONE,
  },
};

/**
 * Support / Maintenance Team - Handles post-launch issues
 * - Handles post-launch issues
 * - Manages updates, backups, and fixes
 * - Monitors system health
 */
const supportTeamRole: RoleDefinition = {
  id: 'support_team',
  name: 'Support Team',
  description: 'Handles post-launch issues, manages updates, backups, and system health monitoring.',
  category: 'support',
  level: 50,
  isActive: true,
  features: ['incident_management', 'system_monitoring', 'maintenance', 'backup_management', 'hot_fixes'],
  permissions: {
    dashboard: PERMISSIONS.READ_ONLY,
    projects: PERMISSIONS.READ_ONLY,
    tasks: PERMISSIONS.READ_CREATE_UPDATE,
    team: PERMISSIONS.READ_ONLY,
    clients: PERMISSIONS.READ_ONLY,
    content: PERMISSIONS.READ_ONLY,
    finance: PERMISSIONS.NONE,
    reports: PERMISSIONS.READ_ONLY,
    settings: PERMISSIONS.READ_ONLY,
    users: PERMISSIONS.NONE,
    attendance: PERMISSIONS.NONE,
    leaves: PERMISSIONS.NONE,
    tickets: PERMISSIONS.FULL_NO_DELETE,
    reimbursements: PERMISSIONS.NONE,
  },
};

/**
 * ==================================================
 * ADVANCED OPTIONAL ROLES
 * ==================================================
 */

/**
 * DevOps Engineer - Deployment, CI/CD, servers
 */
const devopsEngineerRole: RoleDefinition = {
  id: 'devops_engineer',
  name: 'DevOps Engineer',
  description: 'Manages deployment, CI/CD pipelines, infrastructure, and server operations.',
  category: 'technical',
  level: 70,
  isActive: true,
  features: ['deployment', 'ci_cd', 'infrastructure', 'monitoring', 'system_administration'],
  permissions: {
    dashboard: PERMISSIONS.READ_ONLY,
    projects: PERMISSIONS.READ_ONLY,
    tasks: PERMISSIONS.READ_CREATE_UPDATE,
    team: PERMISSIONS.READ_ONLY,
    clients: PERMISSIONS.NONE,
    content: PERMISSIONS.NONE,
    finance: PERMISSIONS.NONE,
    reports: PERMISSIONS.READ_ONLY,
    settings: PERMISSIONS.READ_CREATE_UPDATE,
    users: PERMISSIONS.NONE,
    attendance: PERMISSIONS.NONE,
    leaves: PERMISSIONS.READ_CREATE_UPDATE,
    tickets: PERMISSIONS.READ_CREATE_UPDATE,
    reimbursements: PERMISSIONS.READ_CREATE_UPDATE,
  },
};

/**
 * Business Analyst - Requirement gathering and analysis
 */
const businessAnalystRole: RoleDefinition = {
  id: 'business_analyst',
  name: 'Business Analyst',
  description: 'Gathers requirements, conducts analysis, and provides business insights.',
  category: 'business',
  level: 65,
  isActive: true,
  features: ['requirement_gathering', 'analysis', 'reporting', 'stakeholder_management', 'documentation'],
  permissions: {
    dashboard: PERMISSIONS.READ_ONLY,
    projects: PERMISSIONS.FULL_NO_DELETE,
    tasks: PERMISSIONS.READ_CREATE_UPDATE,
    team: PERMISSIONS.READ_ONLY,
    clients: PERMISSIONS.READ_CREATE_UPDATE,
    content: PERMISSIONS.READ_ONLY,
    finance: PERMISSIONS.READ_ONLY,
    reports: PERMISSIONS.FULL,
    settings: PERMISSIONS.NONE,
    users: PERMISSIONS.NONE,
    attendance: PERMISSIONS.READ_ONLY,
    leaves: PERMISSIONS.READ_CREATE_UPDATE,
    tickets: PERMISSIONS.READ_CREATE_UPDATE,
    reimbursements: PERMISSIONS.READ_ONLY,
  },
};

/**
 * Finance Admin - Invoices, billing, payments
 */
const financeAdminRole: RoleDefinition = {
  id: 'finance_admin',
  name: 'Finance Admin',
  description: 'Manages invoices, billing, payments, and financial records.',
  category: 'business',
  level: 65,
  isActive: true,
  features: ['invoicing', 'billing', 'payments', 'financial_reports', 'expense_management'],
  permissions: {
    dashboard: PERMISSIONS.FULL_NO_DELETE,
    projects: PERMISSIONS.READ_ONLY,
    tasks: PERMISSIONS.NONE,
    team: PERMISSIONS.READ_ONLY,
    clients: PERMISSIONS.READ_ONLY,
    content: PERMISSIONS.NONE,
    finance: PERMISSIONS.FULL_NO_DELETE,
    reports: PERMISSIONS.FULL,
    settings: PERMISSIONS.READ_ONLY,
    users: PERMISSIONS.NONE,
    attendance: PERMISSIONS.NONE,
    leaves: PERMISSIONS.NONE,
    tickets: PERMISSIONS.NONE,
    reimbursements: PERMISSIONS.FULL_NO_DELETE,
  },
};

/**
 * ==================================================
 * ROLE DEFINITIONS EXPORT
 * ==================================================
 */

export const ROLE_DEFINITIONS: Record<UserRole, RoleDefinition> = {
  // Core roles
  admin: adminRole,
  project_manager: projectManagerRole,
  developer: developerRole,
  designer: designerRole,
  content_editor: contentEditorRole,
  qa_tester: qaTesterRole,
  client: clientRole,
  support_team: supportTeamRole,

  // Advanced roles
  devops_engineer: devopsEngineerRole,
  business_analyst: businessAnalystRole,
  finance_admin: financeAdminRole,
};

/**
 * Role hierarchy configuration
 * Defines which roles have higher/lower access levels
 */
export const ROLE_HIERARCHY: Record<UserRole, RoleHierarchy> = {
  admin: {
    role: 'admin',
    level: 100,
    inherits: [
      'project_manager',
      'devops_engineer',
      'business_analyst',
      'finance_admin',
      'developer',
      'designer',
      'content_editor',
      'qa_tester',
      'support_team',
      'client',
    ],
    canManage: [
      'project_manager',
      'devops_engineer',
      'business_analyst',
      'finance_admin',
      'developer',
      'designer',
      'content_editor',
      'qa_tester',
      'support_team',
      'client',
    ],
  },

  project_manager: {
    role: 'project_manager',
    level: 80,
    inherits: ['developer', 'designer', 'qa_tester'],
    canManage: ['developer', 'designer', 'qa_tester'],
  },

  devops_engineer: {
    role: 'devops_engineer',
    level: 70,
    inherits: [],
  },

  business_analyst: {
    role: 'business_analyst',
    level: 65,
    inherits: [],
  },

  finance_admin: {
    role: 'finance_admin',
    level: 65,
    inherits: [],
  },

  developer: {
    role: 'developer',
    level: 60,
    inherits: [],
  },

  designer: {
    role: 'designer',
    level: 60,
    inherits: [],
  },

  qa_tester: {
    role: 'qa_tester',
    level: 55,
    inherits: [],
  },

  content_editor: {
    role: 'content_editor',
    level: 55,
    inherits: [],
  },

  support_team: {
    role: 'support_team',
    level: 50,
    inherits: [],
  },

  client: {
    role: 'client',
    level: 30,
    inherits: [],
  },
};

/**
 * Role categories for organization
 */
export const ROLE_CATEGORIES: Record<RoleCategory, UserRole[]> = {
  administration: ['admin'],
  management: ['project_manager'],
  technical: ['developer', 'devops_engineer'],
  creative: ['designer'],
  content: ['content_editor'],
  quality: ['qa_tester'],
  client: ['client'],
  support: ['support_team'],
  business: ['business_analyst', 'finance_admin'],
};

/**
 * Get all active roles
 */
export function getAllRoles(): UserRole[] {
  return Object.keys(ROLE_DEFINITIONS) as UserRole[];
}

/**
 * Get all active core roles
 */
export function getCoreRoles(): UserRole[] {
  return [
    'admin',
    'project_manager',
    'developer',
    'designer',
    'content_editor',
    'qa_tester',
    'client',
    'support_team',
  ];
}

/**
 * Get all advanced optional roles
 */
export function getAdvancedRoles(): UserRole[] {
  return ['devops_engineer', 'business_analyst', 'finance_admin'];
}
