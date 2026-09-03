import { cn } from '@/lib/utils';

/**
 * The Flash Delivery mark — the client's FD monogram: a flash bolt through the
 * F and a location pin in the D. Reproduced in-house from the brand PDF (which
 * only ships a low-res raster); swap for the vector source when it arrives.
 *
 * Rendered as a black brand chip (the client's "on-dark" treatment): white FD
 * letters, gold bolt + pin. The chip carries its own dark ground, so it reads on
 * any surface — a white admin card or the ink login hero — without a light/dark
 * variant. Exact brand colours: gold #ffc300, black #000.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden className={cn('size-8', className)}>
      <rect x="1" y="1" width="38" height="38" rx="10" fill="#000000" />
      {/* FD monogram scaled + centred into the chip */}
      <g transform="translate(20 20.5) scale(0.150) translate(-116 -62)">
        <g transform="translate(16 3) skewX(-13)">
          <path
            fillRule="evenodd"
            fill="#ffffff"
            d="M72 6 H128 C170 6 200 31 200 63 C200 95 170 120 128 120 H72 Z
               M94 27 V99 H128 C156 99 176 84 176 63 C176 42 156 27 128 27 Z"
          />
          <path fill="#ffffff" d="M38 6 H100 L94 27 H60 V50 H86 L80 71 H60 V120 H38 Z" />
        </g>
        <path fill="#ffc300" d="M33 29 L20 54 H29 L23 76 L45 46 H35 L40 29 Z" />
        <g transform="translate(95 39)">
          <path
            fill="#ffc300"
            d="M0 -8 c-7 0-12.2 4.9-12.2 12 c0 8.1 12.2 19 12.2 19 s12.2-10.9 12.2-19 c0-7.1-5.2-12-12.2-12 Z"
          />
          <circle cx="0" cy="4" r="6.4" fill="#ffffff" />
          <path
            d="M-3 4.2 l2 2.1 l4.1-4.4"
            stroke="#ffc300"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
    </svg>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark />
      <span className="font-display text-xl font-bold tracking-tight">Flash Delivery</span>
    </span>
  );
}
