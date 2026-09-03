'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function Pagination({
  meta,
  onPageChange,
}: {
  meta: PageMeta;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations('pagination');
  if (meta.total === 0) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        <bdi>{t('range', { from, to, total: meta.total })}</bdi>
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('previous')}
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          <ChevronLeft className="rtl:rotate-180" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('next')}
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          <ChevronRight className="rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}
