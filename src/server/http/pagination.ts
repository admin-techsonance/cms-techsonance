import { BadRequestError } from '@/server/http/errors';

export interface PaginationInput {
  page: number;
  limit: number;
  offset: number;
}

export function getPagination(searchParams: URLSearchParams): PaginationInput {
  const page = Number(searchParams.get('page') ?? '1');
  const limit = Number(searchParams.get('limit') ?? '10');

  if (!Number.isInteger(page) || page <= 0) {
    throw new BadRequestError('`page` must be a positive integer');
  }

  if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
    throw new BadRequestError('`limit` must be a positive integer up to 100');
  }

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

