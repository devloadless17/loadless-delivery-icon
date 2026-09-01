/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import { NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope & WorkerGlobalScope;

/**
 * Caching policy (deliberately boring):
 * - precache: build assets + offline fallback only
 * - /api/* and /socket.io/*: NETWORK ONLY — authenticated JSON is never cached
 * - navigations: network only, falling back to /offline when it fails
 * No offline mutation queueing — a replayed "accept order" is a business hazard.
 */
const OFFLINE_URL = '/offline';

const serwist: Serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  // Navigation preload is OFF: it hands the worker a preloaded network
  // response, which is worth nothing when the point is to notice the network
  // is gone — and with it on, a failed navigation never reached the fallback.
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/'),
      handler: new NetworkOnly(),
    },
    {
      // Navigations are handled BY THE WORKER with an explicit fallback.
      //
      // Two things had to be true and neither was: the worker has to own the
      // request at all (without this entry a document request went straight to
      // the browser and died as ERR_FAILED — a dead tab in a stairwell), and
      // the fallback has to actually fire. Reaching for the precached page
      // here, rather than through the `fallbacks` plugin, makes the second
      // part something this file states outright instead of inheriting.
      //
      // Network-first-with-no-cache, not a cached shell: /api is never cached,
      // so a shell would paint the app around lists that cannot load.
      // "You're offline" is the honest answer.
      matcher: ({ request }) => request.mode === 'navigate',
      handler: async ({ request }) => {
        try {
          return await fetch(request);
        } catch {
          return (await serwist.matchPrecache(OFFLINE_URL)) ?? Response.error();
        }
      },
    },
    ...defaultCache,
  ],
  // Kept as the belt to the navigation handler's braces: it covers any other
  // strategy that fails on a document request.
  fallbacks: {
    entries: [{ url: OFFLINE_URL, matcher: ({ request }) => request.mode === 'navigate' }],
  },
});

serwist.addEventListeners();
