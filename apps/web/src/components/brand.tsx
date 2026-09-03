import {
  BRAND_GOLD,
  MARK_VIEWBOX,
  PATH_BOLT,
  PATH_D,
  PATH_F,
  PATH_PIN,
} from '@/components/brand-paths';
import { cn } from '@/lib/utils';

/**
 * The Flash Delivery mark — the client's FD monogram, drawn from the exact
 * vector artwork in the brand PDF (see `brand-paths.ts`). A bolt through the F,
 * a location pin in the D.
 *
 * The letterforms are `currentColor`, so the mark takes the ink of whatever it
 * sits on: near-black on a light card, white on the dark login hero, white
 * again in dark theme. The gold is fixed — it is a brand colour, not a token.
 * The pin's ring and tick are a knockout in the artwork, so the surface behind
 * shows through them; that is what keeps the mark correct on both grounds.
 *
 * SIZE IT BY HEIGHT (`h-7`, `h-10`) — the lockup is 1.86:1 and must never be
 * squeezed into a square. `size-*` would distort a brand mark.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      fill="none"
      aria-hidden
      className={cn('h-8 w-auto shrink-0', className)}
    >
      <path fill="currentColor" d={PATH_F} />
      <path fill={BRAND_GOLD} d={PATH_BOLT} />
      <path fill={BRAND_GOLD} d={PATH_PIN} />
      <path fill="currentColor" d={PATH_D} />
    </svg>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark className="h-7 w-auto" />
      <span className="font-display text-xl font-bold tracking-tight">Flash Delivery</span>
    </span>
  );
}
