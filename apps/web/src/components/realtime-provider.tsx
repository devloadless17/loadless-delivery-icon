'use client';

import { SOCKET_EVENTS } from '@loadless/shared';
import { useQueryClient } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

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

    const invalidateOrders = () => {
      void queryClient.invalidateQueries({ queryKey: ['driver'] });
      void queryClient.invalidateQueries({ queryKey: ['vendor', 'orders'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'analytics'] });
    };

    socket.on('connect', () => {
      setDegraded(false);
      // Refetch everything visible — we may have missed events while away.
      void queryClient.invalidateQueries({ refetchType: 'active' });
    });
    socket.on('disconnect', () => setDegraded(true));
    socket.io.on('reconnect_attempt', () => setDegraded(true));

    for (const event of Object.values(SOCKET_EVENTS)) {
      if (event === SOCKET_EVENTS.SESSION_REVOKED) continue;
      socket.on(event, invalidateOrders);
    }
    socket.on(SOCKET_EVENTS.DRIVER_DUTY_CHANGED, () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'] });
    });
    socket.on(SOCKET_EVENTS.SESSION_REVOKED, () => {
      window.location.assign('/login');
    });

    return () => {
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
