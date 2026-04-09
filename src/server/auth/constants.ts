export const APP_ROLES = ['SuperAdmin', 'Admin', 'Manager', 'Employee', 'Viewer'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const REFRESH_COOKIE_NAME = 'refresh_token';
export const ACCESS_TOKEN_AUDIENCE = 'cms-techsonance-api';
export const ACCESS_TOKEN_ISSUER = 'cms-techsonance';

export const ROLE_HIERARCHY: Record<AppRole, number> = {
  SuperAdmin: 5,
  Admin: 4,
  Manager: 3,
  Employee: 2,
  Viewer: 1,
};

