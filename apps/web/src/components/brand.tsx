import { cn } from '@/lib/utils';

/**
 * The Loadless mark: a parcel square with an orange motion stroke cutting
 * through — the same orange the UI reserves for "in motion" states.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn('size-8', className)}
    >
      <rect x="2" y="2" width="28" height="28" rx="7" className="fill-primary" />
      <path
        d="M8 20.5 L15 13.5 L19 17.5 L24.5 12"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24.5" cy="12" r="2.2" fill="var(--accent)" />
    </svg>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark />
      <span className="font-display text-xl font-bold tracking-tight">Loadless</span>
    </span>
  );
}
