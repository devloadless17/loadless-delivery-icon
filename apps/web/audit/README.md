# Screen sweep

Screenshots every screen for all three roles against the **running dev server**
— no production build, so it never takes `pnpm dev` down (they share `.next`).

```bash
pnpm dev                      # in another terminal
cd apps/web && pnpm exec playwright test --config audit/playwright.config.ts
# shots land in apps/web/audit/shots/
```

Uses the dev accounts from CLAUDE.md.

**Read the shots with care.** Dev compiles on demand, so a screenshot taken too
early catches skeletons and un-hydrated Radix widgets that look exactly like
design defects — an empty `<Select>`, a misaligned row, a table that never
loads. Three "bugs" in the first pass here were that, and measuring the live
DOM (`boundingBox()`, `innerText()`) disproved all three. Measure before you
fix.
