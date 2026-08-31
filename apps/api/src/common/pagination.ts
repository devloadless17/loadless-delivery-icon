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

// --------------------------------------------------------------------------
// Cursor pagination — for lists that churn (orders, feeds), where offset
// pages would duplicate or skip rows as new records arrive mid-scroll.
// --------------------------------------------------------------------------

export interface CursorPage {
  cursor?: string;
  limit: number;
}

export interface CursorMeta {
  nextCursor: string | null;
}

export function cursorArgs(page: CursorPage) {
  return {
    take: page.limit + 1,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
  };
}

export function cursorResult<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { data: items, meta: { nextCursor: hasMore ? items[items.length - 1]?.id : null } };
}
