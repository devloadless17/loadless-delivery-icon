'use client';

import { Download, Share, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'loadless-install-dismissed';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Install nudge for drivers (the persona that must have the app on their home
 * screen). Android gets the real install prompt; iOS Safari gets the
 * Add-to-Home-Screen hint (no prompt API there).
 */
export function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (wasDismissed()) return;
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) {
      setShowIosHint(true);
      setHidden(false);
    }
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // per-session dismissal is fine
    }
  }

  if (hidden) return null;

  return (
    <div className="mx-4 mb-2 flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
      <Download className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        {showIosHint && !promptEvent ? (
          <span>
            Install the app: tap <Share className="inline size-3.5" aria-label="Share" /> then{' '}
            <strong>Add to Home Screen</strong>.
          </span>
        ) : (
          <span>Install Flash Delivery for one-tap access and faster loading.</span>
        )}
      </div>
      {promptEvent && (
        <Button
          size="sm"
          onClick={() => {
            void promptEvent.prompt();
            void promptEvent.userChoice.then(() => dismiss());
          }}
        >
          Install
        </Button>
      )}
      <button
        type="button"
        aria-label="Dismiss install banner"
        onClick={dismiss}
        className="cursor-pointer text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
