'use client';

import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A row action in a table: the icon carries the meaning, the label carries the
 * accessibility.
 *
 * Text buttons in an actions column ("Edit  Delete") push the column wide and
 * put two competing words at the end of every row; at a glance the eye reads
 * the words instead of the data. An icon reads as an affordance and gets out of
 * the way — but only if it is still announced and still hoverable, hence the
 * label doing duty as both `aria-label` and `title`.
 */
export function IconAction({
  label,
  icon: Icon,
  onClick,
  tone = 'default',
  className,
}: {
  /** What it does, in words: the accessible name AND the hover tooltip. */
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  /** 'destructive' only for actions that remove something. */
  tone?: 'default' | 'destructive';
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'text-muted-foreground transition-colors hover:text-foreground',
        tone === 'destructive' && 'hover:bg-destructive/10 hover:text-destructive',
        className,
      )}
    >
      <Icon />
    </Button>
  );
}
