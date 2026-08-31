'use client';

import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * A two-or-three-way tab strip. Hand-rolled rather than pulling in Radix Tabs:
 * it matches the pill idiom already used for the vendor order filters, and the
 * only semantics needed are a tablist with arrow-key movement.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex gap-1 overflow-x-auto rounded-lg bg-muted/60 p-1', className)}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const step = e.key === 'ArrowRight' ? 1 : -1;
              const next = options[(index + step + options.length) % options.length];
              if (next) onChange(next.value);
            }}
            onClick={() => onChange(option.value)}
            className={cn(
              'cursor-pointer whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150',
              active
                ? 'bg-card text-foreground shadow-card'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={cn('ml-1.5 tabular-nums', active ? 'text-muted-foreground' : 'opacity-70')}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
