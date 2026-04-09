'use client';

export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';

export function logClientEvent(level: ClientLogLevel, message: string, meta?: Record<string, unknown>) {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  if (level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }

  if (level === 'warn') {
    console.warn(JSON.stringify(payload));
    return;
  }

  console.info(JSON.stringify(payload));
}

export function reportClientError(error: unknown, context?: Record<string, unknown>) {
  const normalized = error instanceof Error
    ? { message: error.message, stack: error.stack }
    : { message: String(error) };

  logClientEvent('error', 'client_error', {
    ...normalized,
    ...context,
  });
}
