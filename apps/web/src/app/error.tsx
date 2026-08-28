'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/brand';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <BrandMark className="size-10" />
      <div>
        <h1 className="font-display text-xl font-bold">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The problem is on our side, not yours. Try again — your data is safe.
        </p>
      </div>
      <Button onClick={reset}>
        <RotateCcw /> Try again
      </Button>
    </main>
  );
}
