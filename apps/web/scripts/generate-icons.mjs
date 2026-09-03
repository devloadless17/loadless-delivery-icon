/**
 * Bakes every Flash Delivery icon from the ONE vector source
 * (`src/components/brand-paths.ts`, extracted from the client's brand PDF), so
 * the installed app icon is the same artwork the site renders — not a redraw
 * that drifts.
 *
 * Rendering goes through Chromium (via @playwright/test, already a dev
 * dependency) rather than a raster library: the browser is the thing that
 * actually draws this SVG everywhere else, so what it paints here is what
 * users see — and `e2e/12-brand.spec.ts` re-renders the same way and
 * pixel-diffs the committed PNGs, which only holds if both use one rasterizer.
 *
 *   pnpm --filter @loadless/web icons
 *
 * Outputs, all on the brand's ink ground (the on-dark treatment from the brand
 * sheet, which is also the manifest's `background_color`): the five PNGs listed
 * in ICON_SPECS, plus the vector itself under `public/brand/` for anything
 * off-app — an email signature, a partner's deck.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { ICON_INK, ICON_SPECS, iconSvg, markSvg } from '../src/components/brand-paths.ts';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const browser = await chromium.launch();
try {
  for (const spec of ICON_SPECS) {
    const { out, size } = spec;
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(`<body style="margin:0;background:transparent">${iconSvg(spec)}</body>`, {
      waitUntil: 'load',
    });
    const path = resolve(WEB, out);
    await mkdir(dirname(path), { recursive: true });
    await page.screenshot({ path, omitBackground: true });
    await page.close();
    console.log(`  ${out}  ${size}x${size}`);
  }

  for (const [name, ink] of [
    ['flash-delivery-logo.svg', ICON_INK],
    ['flash-delivery-logo-on-dark.svg', '#ffffff'],
  ]) {
    const path = resolve(WEB, 'public/brand', name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${markSvg(ink)}\n`);
    console.log(`  public/brand/${name}`);
  }
} finally {
  await browser.close();
}
