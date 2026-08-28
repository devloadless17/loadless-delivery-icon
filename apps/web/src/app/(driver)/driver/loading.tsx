import { Skeleton } from '@/components/ui/skeleton';

export default function DriverLoading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-44" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-36 w-full rounded-xl" />
      ))}
    </div>
  );
}
