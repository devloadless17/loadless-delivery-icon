/**
 * The Flash Delivery mark — the exact vector artwork, lifted from the client's
 * brand PDF (`docs/Flash Delivery Logo.pdf`, Illustrator 29.1) by decoding the
 * page content stream and converting its path operators to SVG. These are the
 * artwork's own curves at full precision, not a redraw: the logo on screen is
 * the logo in the brand file, to the coordinate.
 *
 * Drawing order is the PDF's own — F, bolt, pin, then D over them.
 *
 * Everything that shows the logo reads from here — the React mark in
 * `brand.tsx`, the PNGs baked by `scripts/generate-icons.mjs`, and the
 * pixel-diff in `e2e/12-brand.spec.ts` that holds the two together. Regenerate
 * the icons after touching this file; never edit one side alone.
 *
 * This file deliberately imports NOTHING. The icon generator is plain Node and
 * resolves it by path, with no `@/` alias and no bundler in front of it.
 */

/** Artwork bounds in the brand file's own units — the mark's true aspect ratio. */
export const MARK_WIDTH = 356.3722;
export const MARK_HEIGHT = 191.8292;
export const MARK_VIEWBOX = `0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`;

/** The brand gold, exactly as the PDF fills it (`1 0.765 0 rg`). */
export const BRAND_GOLD = '#ffc300';

/** The two slanted bars of the F. Letterform — takes the ink colour. */
export const PATH_F =
  'M85.35 82.63L14.94 176.57L12.45 189.03L48.63 189.03L63.48 114.23L149.35 114.23L155.3 82.63ZM50.25 0L31.58 93.32L79.07 31.07L80 31.6L174.2 31.6L180.4 0Z';

/** The bolt driven through the F, forming its stem. Always gold. */
export const PATH_BOLT =
  'M88.63 73.6L81.86 82.63L80.78 84.07L17.84 168.03L16.21 170.21L0 191.83L19.44 154.06L21.4 150.24L41.16 111.83L28.03 117.12L26.72 117.64L12.03 123.56L30.34 99.55L31.96 97.43L79.16 35.58L80.78 33.44L81.09 33.03L81.3 32.77L81.19 33.03L80.54 34.62L78.17 40.46L62.72 78.54L70.82 76.99L72.07 76.75Z';

/**
 * The location pin sitting in the D's counter. Always gold — and its ring and
 * tick are a KNOCKOUT, not white fill, so the surface behind shows through
 * (white on a light card, ink on the dark hero). That is how the brand file
 * draws it; filling it white would break the mark on dark.
 */
export const PATH_PIN =
  'M228.14 100.23C213.76 89.82 219.84 64.79 237.35 62.25C244.59 61.21 252.12 62.93 257.01 68.62L240.83 85.33C235.02 84.11 233.11 74.51 228.02 83.56C230.12 84.67 239.66 94.8 240.85 94.26L261.24 74.42C271.42 95.33 246.43 113.47 228.14 100.23M236.25 49.98C222.39 51.64 209.73 63.9 207.46 77.62C205.61 88.85 208.72 96.25 214.35 105.64C221.82 118.1 232.08 128.94 241.68 139.76C252.31 128.38 263.98 116.31 271.46 102.51C286.11 75.46 266.81 46.31 236.25 49.98';

/** The D. Letterform — takes the ink colour. */
export const PATH_D =
  'M345.84 38.51C338.82 26.37 328.87 16.91 316.01 10.16C303.13 3.41 288.14 0.03 271.04 0.03L208.32 0.03L201.98 31.95L238.29 31.95L238.29 31.9L265.92 31.9C276.35 31.9 285.58 34.15 293.59 38.65C301.6 43.16 307.85 49.41 312.36 57.42C316.86 65.43 319.11 74.56 319.11 84.83C319.11 98.51 315.87 110.85 309.39 121.82C302.9 132.81 294.22 141.44 283.33 147.74C272.43 154.05 260.69 157.2 248.09 157.2L128.66 157.2L128.68 157.11L92.61 157.11L86.27 189.06L241.34 189.06C262.4 189.06 281.71 184.29 299.26 174.75C316.81 165.21 330.72 152.16 340.98 135.59C351.25 119.03 356.37 100.58 356.37 80.23C356.37 64.57 352.86 50.66 345.84 38.51';

/* ------------------------------------------------------------------ *
 * Laying the mark into a square, for the installed-app icons.
 * ------------------------------------------------------------------ */

/** The brand's ink ground — the on-dark treatment from the brand sheet. */
export const ICON_INK = '#000000';

export interface IconSpec {
  /** Path relative to `apps/web`. */
  out: string;
  size: number;
  /** Mark width as a fraction of the canvas. */
  widthFraction: number;
  /** Corner radius as a fraction of the canvas; 0 is full bleed. */
  radiusFraction: number;
}

export const ICON_SPECS: readonly IconSpec[] = [
  // purpose "any": a rounded chip, the way it reads in a browser's app list.
  { out: 'public/icons/icon-192.png', size: 192, widthFraction: 0.8, radiusFraction: 0.2 },
  { out: 'public/icons/icon-512.png', size: 512, widthFraction: 0.8, radiusFraction: 0.2 },
  { out: 'src/app/icon.png', size: 512, widthFraction: 0.8, radiusFraction: 0.2 },
  // purpose "maskable": full bleed, mark kept inside the safe circle.
  { out: 'public/icons/icon-maskable-512.png', size: 512, widthFraction: 0.66, radiusFraction: 0 },
  // iOS rounds apple-touch-icon itself, so ship it square and full bleed.
  { out: 'public/icons/apple-touch-icon.png', size: 180, widthFraction: 0.8, radiusFraction: 0 },
];

/** The mark alone, at a given ink colour — the same four paths, same order. */
export function markSvg(ink: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" fill="none">` +
    `<path fill="${ink}" d="${PATH_F}"/>` +
    `<path fill="${BRAND_GOLD}" d="${PATH_BOLT}"/>` +
    `<path fill="${BRAND_GOLD}" d="${PATH_PIN}"/>` +
    `<path fill="${ink}" d="${PATH_D}"/>` +
    `</svg>`
  );
}

/**
 * The square icon as SVG: ink ground, white mark centred at `widthFraction`.
 *
 * `widthFraction` is the load-bearing number for the maskable icon. Android may
 * keep only the centre circle of 80% diameter, and this lockup is 1.86:1 — so
 * its half-DIAGONAL, not its width, is what has to fit. At 0.66 the mark's
 * corners land at ~0.377 of the canvas, inside the 0.4 safe radius.
 */
export function iconSvg({ size, widthFraction, radiusFraction }: Omit<IconSpec, 'out'>): string {
  const w = size * widthFraction;
  const h = (w * MARK_HEIGHT) / MARK_WIDTH;
  const r = size * radiusFraction;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${ICON_INK}"/>` +
    `<g transform="translate(${(size - w) / 2} ${(size - h) / 2}) scale(${w / MARK_WIDTH})">` +
    `<path fill="#ffffff" d="${PATH_F}"/>` +
    `<path fill="${BRAND_GOLD}" d="${PATH_BOLT}"/>` +
    `<path fill="${BRAND_GOLD}" d="${PATH_PIN}"/>` +
    `<path fill="#ffffff" d="${PATH_D}"/>` +
    `</g></svg>`
  );
}
