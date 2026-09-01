'use client';

import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BrandWordmark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { AdminNavLinks } from './nav';

/**
 * Navigation for the admin on a phone.
 *
 * The sidebar is `hidden lg:flex`, and below that breakpoint nothing replaced
 * it — the header carried the wordmark, the theme toggle and sign-out, so an
 * admin on a phone could reach the dashboard and then no other page at all.
 * This is the missing half: a menu button that opens the same links in a
 * drawer.
 *
 * A drawer rather than the driver's bottom tab bar because admin has six
 * destinations. Six tabs on a 393px screen leaves ~65px each, which is a
 * cramped target and an unreadable label; a drawer stays comfortable and does
 * not get worse when a seventh section is added.
 */
export function AdminMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation. Without this the drawer stays open over the page the
  // admin just asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes, and the body must not scroll behind the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r bg-card shadow-xl"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div className="flex h-16 items-center justify-between px-4">
              <BrandWordmark />
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X />
              </Button>
            </div>
            <p className="px-5 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Control room
            </p>
            <div className="flex-1 overflow-y-auto">
              <AdminNavLinks onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
