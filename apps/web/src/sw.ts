/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist';

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
 * - map tiles: CacheFirst with a small quota (big win on mobile data, safe)
 * - navigations: network with an offline fallback page
 * No offline mutation queueing — a replayed "accept order" is a business hazard.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/'),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ url }) =>
        url.hostname.endsWith('tile.openstreetmap.org') || url.pathname.includes('/tiles/'),
      handler: new CacheFirst({
        cacheName: 'map-tiles',
        plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 14 * 24 * 60 * 60 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
