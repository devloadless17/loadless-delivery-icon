'use client';

import { SOCKET_EVENTS } from '@loadless/shared';
import { useQueryClient } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { endSession } from '@/lib/api-client';

/**
 * One socket per authenticated session. Sockets are NOTIFICATIONS — the REST
 * API stays the source of truth: every event triggers targeted query
 * invalidation, and every (re)connect refetches whatever is on screen, since
 * events during the gap were missed.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    const socket: Socket = io({ withCredentials: true });
    // Grace period: transient blips during page load must not flash the banner.
    let degradeTimer: ReturnType<typeof setTimeout> | null = null;
    const markDegraded = () => {
      degradeTimer ??= setTimeout(() => setDegraded(true), 2500);
    };
    const markHealthy = () => {
      if (degradeTimer) clearTimeout(degradeTimer);
      degradeTimer = null;
      setDegraded(false);
    };

    // COALESCED, because the admin room hears about every order on the whole
    // platform. Each invalidation of ['admin','orders'] refetches every page an
    // infinite list has loaded, so an admin who had pressed Load more a few
    // times used to refire that whole stack once per event — the console janked
    // hardest exactly when the platform was busiest. A burst of twenty events
    // now costs one refresh instead of twenty, and the trailing edge means the
    // screen still settles on the truth.
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidateOrders = () => {
      if (invalidateTimer) return;
      invalidateTimer = setTimeout(() => {
        invalidateTimer = null;
        void queryClient.invalidateQueries({ queryKey: ['driver'] });
        void queryClient.invalidateQueries({ queryKey: ['vendor', 'orders'] });
        void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
        void queryClient.invalidateQueries({ queryKey: ['admin', 'analytics'] });
      }, 400);
    };

    socket.on('connect', () => {
      markHealthy();
      // Refetch everything visible — we may have missed events while away.
      void queryClient.invalidateQueries({ refetchType: 'active' });
    });
    socket.on('disconnect', markDegraded);
    socket.io.on('reconnect_attempt', markDegraded);

    for (const event of Object.values(SOCKET_EVENTS)) {
      if (event === SOCKET_EVENTS.SESSION_REVOKED) continue;
      socket.on(event, invalidateOrders);
    }
    socket.on(SOCKET_EVENTS.DRIVER_DUTY_CHANGED, () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'] });
    });
    // A recorded handover changes both sides of the same conversation: the
    // admin's outstanding worklist and the driver's own "what's on me". The
    // loop above already refreshes every ['driver'] key; this adds the admin's.
    const invalidateSettlements = () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settlements'] });
    };
    socket.on(SOCKET_EVENTS.SETTLEMENT_RECORDED, invalidateSettlements);
    socket.on(SOCKET_EVENTS.SETTLEMENT_VOIDED, invalidateSettlements);
    // Through endSession, not a bare assign('/login'): the cookies have to go
    // first or the middleware reads a role out of them and bounces us onto the
    // console we were just thrown out of. The socket is the fast path here —
    // the same exit runs off a refused refresh if this event never arrives.
    socket.on(SOCKET_EVENTS.SESSION_REVOKED, () => {
      endSession();
    });

    return () => {
      if (degradeTimer) clearTimeout(degradeTimer);
      if (invalidateTimer) clearTimeout(invalidateTimer);
      socket.disconnect();
    };
  }, [queryClient]);

  return (
    <>
      {degraded && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-warning/90 px-3 py-1.5 text-xs font-medium text-black"
        >
          <WifiOff className="size-3.5" aria-hidden /> Reconnecting — live updates paused
        </div>
      )}
      {children}
    </>
  );
}
