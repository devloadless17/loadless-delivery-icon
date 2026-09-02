/**
 * Dev-only service-worker kill switch.
 *
 * Serwist only builds a real worker for production (`next.config.ts` disables
 * it otherwise) and the dev script deletes the built `public/sw.js`. That used
 * to leave `/sw.js` returning 404 — which sounds harmless and is not: a worker
 * installed by an earlier production build on the SAME ORIGIN (anyone who once
 * ran `next start -p 3100`) stays registered and keeps serving its precached
 * production chunks over dev's. The page then loads yesterday's shell against
 * today's chunk ids and dies in a lazy import — a crash that points nowhere
 * near the worker. A hard reload works (it bypasses the worker) and an ordinary
 * reload does not, which is the tell.
 *
 * It cannot fix itself either: `UpdatePrompt` is what asks the browser to
 * re-check the script, and the stale worker crashes the page before that code
 * ever runs.
 *
 * So dev serves this instead of a 404: a worker whose whole job is to take
 * over, drop every cache, unregister itself, and reload the tabs it was
 * holding hostage. The browser re-fetches the script on navigation, sees these
 * bytes differ from the worker it has, and installs this one — which then
 * removes itself. One ordinary refresh and the origin is clean.
 *
 * In production this route 404s and the real `public/sw.js` (a static file,
 * which takes precedence anyway) is served untouched.
 */
const KILL_SWITCH = `// dev kill switch — replaces a stale production worker
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    await self.registration.unregister();
    // Reload whatever this worker was still controlling so those tabs pick up
    // the real dev files instead of sitting on the broken render.
    for (const client of await self.clients.matchAll({ type: 'window' })) {
      client.navigate(client.url);
    }
  })());
});
// Deliberately NO fetch handler: nothing may be served from cache.
`;

export function GET(): Response {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not Found', { status: 404 });
  }
  return new Response(KILL_SWITCH, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      // The browser must always compare against the live bytes, never a cached
      // copy — a cached kill switch would never install and never clean up.
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
