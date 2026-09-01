'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Tells someone a new version is live, and lets them take it.
 *
 * The worker uses skipWaiting + clientsClaim, so a deploy takes control of an
 * open app on its own — but the page in front of the user is still running the
 * OLD code until it reloads. Without this they sit on yesterday's build for as
 * long as the app stays open, which for a driver can be a whole shift.
 *
 * `controllerchange` is the honest signal: it fires when a worker has actually
 * taken over, not merely downloaded. It ALSO fires on the very first install,
 * when there was no previous controller — showing "new version available" to
 * someone who just opened the app for the first time would be nonsense, hence
 * the guard.
 */
export function UpdatePrompt() {
  const shown = useRef(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;

    // Whether a worker is ALREADY driving this page. Read at mount it is
    // usually false — the worker normally claims the page a moment later — so
    // this has to be tracked as it changes, not captured once. Captured once,
    // the very first claim looks like "no previous controller" forever and
    // every real update afterwards is silently ignored.
    let hasController = sw.controller !== null;

    function onControllerChange() {
      if (!hasController) {
        // The initial claim. Not an update; nothing to announce.
        hasController = true;
        return;
      }
      if (shown.current) return;
      shown.current = true;
      toast('A new version is ready', {
        description: 'Refresh to pick up the latest changes.',
        duration: Infinity,
        action: { label: 'Refresh', onClick: () => window.location.reload() },
      });
    }

    // Browsers check the worker script on navigation and roughly daily. An
    // installed app can stay open far longer than that, so ask again whenever
    // it comes back to the foreground — which is exactly when someone is about
    // to use it.
    async function checkForUpdate() {
      if (document.visibilityState !== 'visible') return;
      try {
        const registration = await sw.getRegistration();
        await registration?.update();
      } catch {
        // Offline, or the browser declined. There is nothing useful to say.
      }
    }

    // Named, so both come off again — an inline arrow here cannot be removed
    // and would stack a new listener on every remount.
    const onVisible = () => void checkForUpdate();

    sw.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisible);
    void checkForUpdate();

    return () => {
      sw.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
