import Link from 'next/link';
import { BrandMark } from '@/components/brand';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <BrandMark className="h-10" />
      <div>
        <h1 className="font-display text-xl font-bold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This page doesn&apos;t exist or has moved.
        </p>
      </div>
      <Link href="/">
        <Button>Take me home</Button>
      </Link>
    </main>
  );
}
