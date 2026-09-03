import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  BRAND_GOLD,
  ICON_SPECS,
  MARK_HEIGHT,
  MARK_WIDTH,
  PATH_BOLT,
  PATH_D,
  PATH_F,
  PATH_PIN,
  iconSvg,
} from '../src/components/brand-paths';
import { DRIVER1_PHONE, loginAs } from './helpers';

/**
 * The brand mark is the client's own artwork, and it has to STAY the client's
 * own artwork.
 *
 * What this guards is a real regression that already happened once: the mark
 * shipped as a hand-drawn approximation — an F and D crammed together, a stubby
 * bolt, a pin the wrong size — and it looked plausible enough that nobody
 * caught it, all the way into the installed app icon. So these tests do not ask
 * "is there a logo"; they ask "is it THIS logo", against the vector extracted
 * from `docs/Flash Delivery Logo.pdf`, on both the screens and the PNGs.
 */

/** The four fills of the mark, in the brand file's own drawing order. */
const EXPECTED_PATHS = [PATH_F, PATH_BOLT, PATH_PIN, PATH_D];

const RGB_GOLD = { r: 0xff, g: 0xc3, b: 0x00 };

interface Sample {
  /** Fraction of opaque pixels within 12/255 of the mark's computed ink colour. */
  ink: number;
  /** Fraction of opaque pixels that are the brand gold. */
  gold: number;
  /** Fraction of opaque pixels that are neither — i.e. the ground showing through. */
  ground: number;
}

/**
 * Screenshot one element and count its pixels in-page.
 *
 * The screenshot is handed BACK to the browser as a data URL and decoded on a
 * canvas: the ground behind the mark is a gradient on the login hero and a
 * theme token elsewhere, so no amount of reading computed styles tells you what
 * was actually painted. Only the pixels do.
 */
async function samplePixels(page: Page, mark: Locator): Promise<Sample> {
  const png = await mark.screenshot({ omitBackground: false });
  const ink = await mark.evaluate((el) => getComputedStyle(el).color);
  return page.evaluate(
    async ([dataUrl, inkColor, gold]) => {
      const img = new Image();
      img.src = dataUrl as string;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Resolve the computed ink colour to rgb numbers the same way the page did.
      const probe = document.createElement('span');
      probe.style.color = inkColor as string;
      document.body.appendChild(probe);
      const [ir = 0, ig = 0, ib = 0] = getComputedStyle(probe)
        .color.match(/\d+/g)!
        .slice(0, 3)
        .map(Number);
      probe.remove();

      const g = gold as { r: number; g: number; b: number };
      let inkPx = 0;
      let goldPx = 0;
      let opaque = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! < 128) continue;
        opaque += 1;
        const [r, gr, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
        if (Math.abs(r - ir) <= 12 && Math.abs(gr - ig) <= 12 && Math.abs(b - ib) <= 12) inkPx += 1;
        else if (Math.abs(r - g.r) <= 12 && Math.abs(gr - g.g) <= 12 && Math.abs(b - g.b) <= 12)
          goldPx += 1;
      }
      return {
        ink: inkPx / opaque,
        gold: goldPx / opaque,
        ground: (opaque - inkPx - goldPx) / opaque,
      };
    },
    [`data:image/png;base64,${png.toString('base64')}`, ink, RGB_GOLD] as const,
  );
}

/**
 * Assert one on-screen mark is the brand artwork, undistorted and visible.
 *
 * The visibility half matters as much as the geometry half: the letterforms are
 * `currentColor`, which is exactly what lets the mark sit on a white card and
 * on the ink login hero — and exactly what would render it invisible if a
 * surface ever set the wrong foreground. Ink-on-ink passes every DOM assertion
 * and shows the user nothing, so it is checked in pixels.
 */
async function expectBrandMark(page: Page, mark: Locator, where: string) {
  await expect(mark, where).toBeVisible();

  // The artwork itself, curve for curve.
  expect(await mark.locator('path').evaluateAll((els) => els.map((el) => el.getAttribute('d'))), where)
    .toEqual(EXPECTED_PATHS);

  // Never squeezed into a square: the lockup is 1.86:1 and a brand may not be
  // stretched. Half a pixel of slack for sub-pixel layout.
  const box = (await mark.boundingBox())!;
  expect(box.width / box.height, `${where} — aspect ratio`).toBeCloseTo(MARK_WIDTH / MARK_HEIGHT, 2);

  const px = await samplePixels(page, mark);
  // Letterforms actually painted, and actually distinct from what is behind
  // them. Both bounds are needed: all-ink means the ground vanished, no-ink
  // means the mark did.
  expect(px.ink, `${where} — ink pixels`).toBeGreaterThan(0.08);
  expect(px.ground, `${where} — ground pixels`).toBeGreaterThan(0.15);
  // The bolt and the pin, in the brand gold and no other yellow.
  expect(px.gold, `${where} — gold pixels`).toBeGreaterThan(0.01);
}

test.describe('The brand mark is the client artwork', () => {
  test('on the login screen, on both the ink hero and the light form panel', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

    // The hero is a hardcoded near-black gradient, so this is the white-on-ink
    // treatment; the panel beside it is the black-on-white one. One component,
    // two grounds — the case a fixed-colour mark could not serve.
    await expectBrandMark(page, page.locator('aside svg').first(), 'login hero (on ink)');

    await page.setViewportSize({ width: 420, height: 900 });
    await expectBrandMark(page, page.locator('section svg').first(), 'login panel (on light)');
  });

  test("in the driver's header, the surface that lives on a phone", async ({ page }) => {
    await loginAs(page, DRIVER1_PHONE, '/driver');
    await expectBrandMark(page, page.locator('header svg').first(), 'driver header');
  });

  test('on the offline screen the service worker serves', async ({ page }) => {
    await page.goto('/offline');
    await expectBrandMark(page, page.locator('main svg').first(), 'offline screen');
  });

  test('and in dark theme, where the ink inverts to white', async ({ page }) => {
    // The app pins `defaultTheme="light"` with `enableSystem={false}`, so the
    // OS preference is deliberately ignored — emulating dark media would do
    // nothing. Dark is reached only by the toggle, which next-themes persists
    // under this localStorage key.
    await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
    await page.goto('/offline');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expectBrandMark(page, page.locator('main svg').first(), 'offline screen (dark)');
  });
});

test.describe('The installed app icons are that same artwork', () => {
  test('the manifest ships the icons it declares', async ({ page, baseURL }) => {
    const manifest = await (await page.request.get('/manifest.webmanifest')).json();
    expect(manifest.name).toBe('Flash Delivery');

    for (const icon of manifest.icons) {
      const res = await page.request.get(new URL(icon.src, baseURL!).toString());
      expect(res.status(), icon.src).toBe(200);
      expect(res.headers()['content-type'], icon.src).toContain('image/png');
    }
    // Apple never reads the manifest; its icon is wired through the layout's
    // metadata instead, so it has to be checked separately or it rots unseen.
    expect((await page.request.get('/icons/apple-touch-icon.png')).status()).toBe(200);
  });

  /**
   * The one that would have caught the old logo.
   *
   * Every committed PNG is re-rendered from the vector and diffed against the
   * file on disk. It passes only while the icons ARE the artwork — hand-editing
   * one, or editing `brand-paths.ts` and forgetting `pnpm --filter
   * @loadless/web icons`, fails here instead of shipping a second, subtly
   * different logo to everyone's home screen.
   */
  for (const spec of ICON_SPECS) {
    // `src/app/icon.png` is Next's favicon source and is not served from that
    // path; it is compared through the route Next actually publishes it on.
    const url = spec.out.startsWith('public/') ? spec.out.slice('public'.length) : '/icon.png';

    test(`${spec.out} is the vector, pixel for pixel`, async ({ page, baseURL }) => {
      const res = await page.request.get(new URL(url, baseURL!).toString());
      expect(res.status()).toBe(200);
      const shipped = `data:image/png;base64,${(await res.body()).toString('base64')}`;

      await page.goto('/offline'); // any page — this only needs a canvas
      const diff = await page.evaluate(
        async ([shippedUrl, svg, size]) => {
          const draw = async (src: string) => {
            const img = new Image();
            img.src = src;
            await img.decode();
            const canvas = document.createElement('canvas');
            canvas.width = size as number;
            canvas.height = size as number;
            const ctx = canvas.getContext('2d')!;
            // Both composited over the same opaque ground, so a difference in
            // TRANSPARENCY (a lost rounded corner, say) shows up as colour.
            ctx.fillStyle = '#ff00ff';
            ctx.fillRect(0, 0, size as number, size as number);
            ctx.drawImage(img, 0, 0, size as number, size as number);
            return ctx.getImageData(0, 0, size as number, size as number).data;
          };
          const a = await draw(shippedUrl as string);
          const b = await draw(`data:image/svg+xml;base64,${btoa(svg as string)}`);

          let total = 0;
          let bad = 0;
          for (let i = 0; i < a.length; i += 4) {
            const d = Math.max(
              Math.abs(a[i]! - b[i]!),
              Math.abs(a[i + 1]! - b[i + 1]!),
              Math.abs(a[i + 2]! - b[i + 2]!),
            );
            total += d;
            if (d > 32) bad += 1;
          }
          return { mean: total / (a.length / 4), badFraction: bad / (a.length / 4) };
        },
        [shipped, iconSvg(spec), spec.size] as const,
      );

      // Tolerances cover antialiasing only — Chromium rasterises an <img> SVG
      // and a page screenshot through slightly different paths. A wrong logo
      // misses by whole shapes and blows past both of these.
      expect(diff.mean, `${spec.out} mean channel difference`).toBeLessThan(3);
      expect(diff.badFraction, `${spec.out} pixels that differ`).toBeLessThan(0.02);
    });
  }

  /**
   * Android may keep only the centre circle of the maskable icon. The lockup is
   * wide, so this is the icon most likely to lose its bolt to a launcher.
   */
  test('the maskable icon survives a circular mask', async ({ page, baseURL }) => {
    const res = await page.request.get(new URL('/icons/icon-maskable-512.png', baseURL!).toString());
    await page.goto('/offline');
    const outside = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, 512, 512);
      let clipped = 0;
      for (let y = 0; y < 512; y += 1) {
        for (let x = 0; x < 512; x += 1) {
          if (Math.hypot(x - 256, y - 256) <= 0.4 * 512) continue;
          const i = (y * 512 + x) * 4;
          // Anything outside the safe circle must be bare ink ground.
          if (data[i]! > 24 || data[i + 1]! > 24 || data[i + 2]! > 24) clipped += 1;
        }
      }
      return clipped;
    }, `data:image/png;base64,${(await res.body()).toString('base64')}`);

    expect(outside, 'artwork outside the maskable safe zone').toBe(0);
  });
});
