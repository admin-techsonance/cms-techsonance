'use client';

const SESSION_SCOPE_KEY = 'session_scope';
const REMEMBER_SESSION_KEY = 'remember_session';

export function getStoredSessionToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  return sessionStorage.getItem('session_token') ?? localStorage.getItem('session_token');
}

export function getStoredUser() {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawUser = sessionStorage.getItem('user') ?? localStorage.getItem('user');

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser);
  } catch {
    return null;
  }
}

export function persistClientSession(input: {
  accessToken: string;
  user: unknown;
  rememberMe: boolean;
}) {
  if (typeof window === 'undefined') {
    return;
  }

  const serializedUser = JSON.stringify(input.user);

  sessionStorage.setItem(SESSION_SCOPE_KEY, 'active');
  sessionStorage.setItem('session_token', input.accessToken);
  sessionStorage.setItem('user', serializedUser);

  localStorage.setItem(REMEMBER_SESSION_KEY, input.rememberMe ? 'true' : 'false');
  localStorage.setItem('session_token', input.accessToken);
  localStorage.setItem('user', serializedUser);
}

export function clearClientSession() {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem('session_token');
  localStorage.removeItem('user');
  localStorage.removeItem(REMEMBER_SESSION_KEY);
  sessionStorage.removeItem('session_token');
  sessionStorage.removeItem('user');
  sessionStorage.removeItem(SESSION_SCOPE_KEY);
}

export function shouldRememberSession() {
  if (typeof window === 'undefined') {
    return false;
  }

  return localStorage.getItem(REMEMBER_SESSION_KEY) === 'true';
}

export function reconcileEphemeralSession() {
  if (typeof window === 'undefined') {
    return;
  }

  const remembered = shouldRememberSession();
  const hasActiveSessionScope = sessionStorage.getItem(SESSION_SCOPE_KEY) === 'active';

  if (!remembered && !hasActiveSessionScope && localStorage.getItem('session_token')) {
    clearClientSession();
    return;
  }

  if (hasActiveSessionScope) {
    const token = sessionStorage.getItem('session_token');
    const user = sessionStorage.getItem('user');

    if (token) {
      localStorage.setItem('session_token', token);
    }

    if (user) {
      localStorage.setItem('user', user);
    }
  }
}
