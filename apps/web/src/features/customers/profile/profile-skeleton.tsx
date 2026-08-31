import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Shape-matched to the real panel so nothing jumps when data lands — mid-call,
 * a layout shift is the moment the vendor loses their place.
 */
export function CustomerProfileSkeleton({
  variant = 'full',
  addressRows = 2,
}: {
  variant?: 'full' | 'compact';
  addressRows?: number;
}) {
  if (variant === 'compact') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-52" />
          </div>
        </div>
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="space-y-3 bg-primary/[0.04] px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Skeleton className="size-11 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
          <Skeleton className="h-6 w-28" />
        </div>
        <Skeleton className="h-[68px] w-full rounded-lg" />
      </div>
      <div className="grid grid-cols-2 divide-x divide-y border-y bg-muted/30 sm:grid-cols-4 sm:divide-y-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 px-4 py-3">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-5 w-12" />
          </div>
        ))}
      </div>
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-8 w-28" />
        </div>
        {Array.from({ length: addressRows }).map((_, i) => (
          <Skeleton key={i} className="h-[84px] w-full rounded-lg" />
        ))}
      </div>
    </Card>
  );
}
