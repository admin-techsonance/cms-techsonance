/**
 * Role-Based Access Control (RBAC) Type Definitions
 * Centralized system for managing roles, permissions, and access control in the CMS portal
 */

/**
 * Core roles in the CMS system
 * Organized by primary function and responsibility level
 */
export type CoreRole =
  | 'admin' // Super Admin - Full control over entire system
  | 'project_manager' // Creates and manages projects
  | 'developer' // Works on assigned tasks
  | 'designer' // UI/UX designer and design asset management
  | 'content_editor' // Creates and edits website/app content
  | 'qa_tester' // Tests features and reports issues
  | 'client' // Client/Customer with limited access
  | 'support_team'; // Post-launch maintenance and support

/**
 * Optional advanced roles
 */
export type AdvancedRole =
  | 'devops_engineer' // Deployment, CI/CD, servers
  | 'business_analyst' // Requirement gathering and analysis
  | 'finance_admin'; // Invoices, billing, payments

/**
 * All possible roles in the system
 */
export type UserRole = CoreRole | AdvancedRole;

/**
 * Role category for organization and filtering
 */
export type RoleCategory =
  | 'administration' // Admin users
  | 'management' // Project and team management
  | 'technical' // Development and technical roles
  | 'creative' // Design and creative roles
  | 'content' // Content management roles
  | 'quality' // QA and testing roles
  | 'client' // External users
  | 'support' // Support and maintenance roles
  | 'business'; // Business and finance roles

/**
 * CRUD permissions
 */
export interface CRUDPermission {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
  approve?: boolean;
  export?: boolean;
}

/**
 * Module-specific permissions
 */
export interface ModulePermissions {
  dashboard: CRUDPermission;
  projects: CRUDPermission;
  tasks: CRUDPermission;
  team: CRUDPermission;
  clients: CRUDPermission;
  content: CRUDPermission; // Pages, blogs, media
  finance: CRUDPermission; // Invoices, payments, expenses
  reports: CRUDPermission;
  settings: CRUDPermission;
  users: CRUDPermission;
  attendance: CRUDPermission;
  leaves: CRUDPermission;
  tickets: CRUDPermission;
  reimbursements: CRUDPermission;
}

/**
 * Role metadata and configuration
 */
export interface RoleMetadata {
  id: string; // Unique identifier
  name: string; // Display name
  description: string; // Role description
  category: RoleCategory;
  level: number; // Hierarchical level (higher = more access)
  isActive: boolean;
  departmentAccess?: string[]; // Specific departments this role can access
  maxProjects?: number; // Limit for number of projects (null = unlimited)
  features?: string[]; // Specific features enabled for this role
}

/**
 * Role with permissions
 */
export interface RoleDefinition extends RoleMetadata {
  permissions: ModulePermissions;
}

/**
 * Role hierarchy configuration
 */
export interface RoleHierarchy {
  role: UserRole;
  level: number;
  inherits?: UserRole[]; // Roles that have lower permission levels
  canManage?: UserRole[]; // Roles that this role can create/manage
}

/**
 * Permission request context
 */
export interface PermissionContext {
  userId: string;
  userRole: UserRole;
  resourceOwnerId?: string;
  resourceId?: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'approve' | 'export';
  module: keyof ModulePermissions;
  tenantId?: string;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  denialReason?: string;
}
