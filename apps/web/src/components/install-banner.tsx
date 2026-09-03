'use client';

import { useTranslations } from 'next-intl';
import { Download, Share, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'loadless-install-dismissed';

function readDismissed(): boolean {
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
 *
 * Dismissing has to STICK. Chrome re-fires `beforeinstallprompt` on navigation,
 * and the listener outlives any one page, so visibility is derived from state
 * on every render rather than being switched on by the event handler. The
 * earlier version flipped a `hidden` flag inside the handler, which meant every
 * page change turned the banner back on however many times it had been closed —
 * a driver tapping X and watching it return is being told the app ignores them.
 *
 * The event is still captured while dismissed: it fires once per page load, so
 * throwing it away would leave nothing to hand Chrome if the driver later
 * decides to install.
 */
export function InstallBanner() {
  const t = useTranslations('install');
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [standalone, setStandalone] = useState(true);
  // Starts true so nothing flashes before the first client render reads storage.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(readDismissed());
    setStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as { standalone?: boolean }).standalone === true,
    );
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    // Registered unconditionally: capturing the event costs nothing and is the
    // only chance to get one. Whether to SHOW anything is decided below.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // Chrome fires this when the app gets installed by any route; stop nudging.
    const onInstalled = () => setDismissed(true);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Private browsing: the state above still holds for this session.
    }
  }

  const canPrompt = promptEvent !== null;
  const showIosHint = isIos && !canPrompt;
  if (dismissed || standalone || (!canPrompt && !showIosHint)) return null;

  return (
    <div className="mx-4 mb-2 flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
      <Download className="size-5 shrink-0 text-primary-strong" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        {showIosHint ? (
          <span>
            {t('iosPrefix')} <Share className="inline size-3.5" aria-label={t('share')} />{' '}
            {t('iosSuffix')} <strong>{t('iosAction')}</strong>.
          </span>
        ) : (
          <span>{t('body')}</span>
        )}
      </div>
      {canPrompt && (
        <Button
          size="sm"
          onClick={() => {
            void promptEvent.prompt();
            void promptEvent.userChoice.then(() => dismiss());
          }}
        >
          {t('cta')}
        </Button>
      )}
      <button
        type="button"
        aria-label={t('dismiss')}
        onClick={dismiss}
        className="cursor-pointer text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
