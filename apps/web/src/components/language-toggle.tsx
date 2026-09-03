'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { LOCALE_COOKIE, type Locale } from '@/i18n/config';

/**
 * Switches the vendor/driver UI between English and Arabic.
 *
 * The button shows the language you would switch TO, in that language — a
 * driver who cannot read English still recognises "العربية". The choice is
 * written to a cookie (the server reads it to render the right direction) and
 * mirrored to localStorage, then `router.refresh()` re-renders the server
 * components with the new locale — no full page reload, no lost form state.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next: Locale = locale === 'ar' ? 'en' : 'ar';

  function switchTo() {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    try {
      localStorage.setItem(LOCALE_COOKIE, next);
    } catch {
      // Private mode or blocked storage — the cookie is what actually matters.
    }
    startTransition(() => router.refresh());
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      disabled={pending}
      aria-label={next === 'ar' ? 'التبديل إلى العربية' : 'Switch to English'}
      onClick={switchTo}
    >
      <span className="text-sm font-semibold">{next === 'ar' ? 'العربية' : 'English'}</span>
    </Button>
  );
}
