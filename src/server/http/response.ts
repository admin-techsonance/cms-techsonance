import { NextResponse } from 'next/server';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  message: string;
  errors: unknown[] | null;
  meta?: PaginationMeta;
}

export function apiSuccess<T>(
  data: T,
  message = 'Request completed successfully',
  init?: { status?: number; meta?: PaginationMeta; headers?: HeadersInit }
) {
  const body: ApiEnvelope<T> = {
    success: true,
    data,
    message,
    errors: null,
    ...(init?.meta ? { meta: init.meta } : {}),
  };

  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: init?.headers,
  });
}

export function apiError(
  message: string,
  init?: { status?: number; errors?: unknown[] | null; headers?: HeadersInit }
) {
  const body: ApiEnvelope<null> = {
    success: false,
    data: null,
    message,
    errors: init?.errors ?? null,
  };

  return NextResponse.json(body, {
    status: init?.status ?? 500,
    headers: init?.headers,
  });
}

