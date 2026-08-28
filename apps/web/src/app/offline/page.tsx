import { BrandWordmark } from '@/components/brand';

export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <BrandWordmark />
      <div>
        <h1 className="text-xl font-semibold">You&apos;re offline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Orders need a connection. The app reconnects and refreshes on its own the moment
          you&apos;re back online.
        </p>
      </div>
    </main>
  );
}
