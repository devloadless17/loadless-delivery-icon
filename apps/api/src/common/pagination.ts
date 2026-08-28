import type { OffsetPagination } from '@loadless/shared';

export interface OffsetMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function offsetMeta(pagination: OffsetPagination, total: number): OffsetMeta {
  return {
    page: pagination.page,
    limit: pagination.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
  };
}

export function offsetArgs(pagination: OffsetPagination): { skip: number; take: number } {
  return { skip: (pagination.page - 1) * pagination.limit, take: pagination.limit };
}
