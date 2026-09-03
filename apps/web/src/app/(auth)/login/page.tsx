import type { Metadata } from 'next';
import { BrandMark, BrandWordmark } from '@/components/brand';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh">
      {/* Brand panel — the dispatch board at night */}
      <aside className="surface-brand relative hidden w-[46%] flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <BrandWordmark className="[&_span]:text-white" />

        <div className="relative">
          {/* the motion stroke, writ large */}
          <svg
            viewBox="0 0 480 200"
            fill="none"
            aria-hidden
            className="pointer-events-none absolute -top-64 left-4 w-[460px] opacity-90"
          >
            <path
              d="M20 170 L150 80 L240 140 L440 30"
              stroke="var(--primary)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
            <circle cx="440" cy="30" r="14" fill="var(--primary)" />
            <circle cx="440" cy="30" r="6" fill="var(--primary-foreground)" />
            <circle cx="20" cy="170" r="7" fill="var(--primary)" />
          </svg>
          <h1 className="font-display max-w-md text-4xl font-bold leading-tight tracking-tight">
            Every order, every driver,
            <br />
            one live board.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            Orders reach on-duty drivers the second they&apos;re created. Acceptance is
            first-come, race-safe, and every delivery keeps its exact financial split — forever.
          </p>
        </div>

        <div className="flex items-center gap-6 text-xs text-white/50">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[color:var(--success)]" aria-hidden /> Real-time dispatch
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden /> Live driver network
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden /> Exact settlements
          </span>
        </div>
      </aside>

      {/* Form panel */}
      <section className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
            <BrandMark className="size-11 lg:hidden" />
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">Welcome back</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Vendors &amp; admins sign in with email — drivers with their phone number.
              </p>
            </div>
          </div>
          <LoginForm />
          <p className="mt-6 text-center text-xs text-muted-foreground lg:text-left">
            Accounts are created by the platform. No account? Contact your administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
