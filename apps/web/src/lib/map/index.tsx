'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The ONLY module the app imports maps from. Leaflet needs `window`, so both
 * components load dynamically and stay out of the initial bundle; swapping the
 * provider later touches only this folder.
 */
export const MapPicker = dynamic(
  () => import('./leaflet-map').then((m) => m.LeafletPicker),
  { ssr: false, loading: () => <Skeleton className="h-60 w-full rounded-md" /> },
);

export const MapView = dynamic(
  () => import('./leaflet-map').then((m) => m.LeafletView),
  { ssr: false, loading: () => <Skeleton className="h-52 w-full rounded-md" /> },
);
