import { describe, expect, it } from 'vitest';
import { beirutDayEnd, beirutDayKey, beirutDayStart, beirutRange } from './business-day';

const beirut = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Beirut',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** "01/09/2026, 00:00:00" -> what the clock on a Beirut wall actually reads. */
const wall = (d: Date) => beirut.format(d);

describe('beirutDayStart / beirutDayEnd', () => {
  const samples = [
    '2026-09-01T09:00:00Z', // mid-summer, UTC+3
    '2026-01-15T09:00:00Z', // mid-winter, UTC+2
    '2026-03-29T09:00:00Z', // spring-forward day — midnight does not exist here
    '2026-10-25T09:00:00Z', // fall-back day — midnight happens twice
    '2026-06-30T21:30:00Z', // 00:30 Beirut the NEXT day — the classic off-by-one
  ];

  // Every ordinary day starts at midnight. The spring-forward day is excluded
  // because Beirut's clock jumps 00:00 -> 01:00: there IS no midnight to find,
  // and the day genuinely begins an hour late.
  it.each(samples.filter((s) => !s.startsWith('2026-03-29')))(
    'start of the Beirut day containing %s reads 00:00:00',
    (iso) => {
      expect(wall(beirutDayStart(new Date(iso)))).toMatch(/, 00:00:00$/);
    },
  );

  it('the spring-forward day begins at 01:00, because 00:00 never happens', () => {
    const start = beirutDayStart(new Date('2026-03-29T09:00:00Z'));
    expect(wall(start)).toBe('29/03/2026, 01:00:00');
    // One second earlier is still the previous day, at 23:59:59 — no gap, no overlap.
    expect(wall(new Date(start.getTime() - 1000))).toBe('28/03/2026, 23:59:59');
  });

  it.each(samples)('end of the Beirut day containing %s reads 23:59:59', (iso) => {
    expect(wall(beirutDayEnd(new Date(iso)))).toMatch(/, 23:59:59$/);
  });

  it.each(samples)('start and end of %s fall on the same Beirut date', (iso) => {
    const at = new Date(iso);
    expect(beirutDayKey(beirutDayStart(at))).toBe(beirutDayKey(at));
    expect(beirutDayKey(beirutDayEnd(at))).toBe(beirutDayKey(at));
  });

  it('brackets the instant it was asked about', () => {
    for (const iso of samples) {
      const at = new Date(iso);
      expect(beirutDayStart(at).getTime()).toBeLessThanOrEqual(at.getTime());
      expect(beirutDayEnd(at).getTime()).toBeGreaterThanOrEqual(at.getTime());
    }
  });

  it('a UTC evening belongs to the NEXT Beirut day', () => {
    // 21:30 UTC on 30 June is 00:30 on 1 July in Beirut. A server using its own
    // local midnight would settle this delivery into the wrong day.
    const at = new Date('2026-06-30T21:30:00Z');
    expect(beirutDayKey(at)).toBe('2026-07-01');
  });

  const hours = (iso: string) =>
    (beirutDayEnd(new Date(iso)).getTime() + 1 - beirutDayStart(new Date(iso)).getTime()) / 3_600_000;

  it('spans exactly 24h on an ordinary day', () => {
    expect(hours('2026-09-01T09:00:00Z')).toBe(24);
    expect(hours('2026-01-15T09:00:00Z')).toBe(24);
  });

  // Lebanon shifts twice a year. Whichever dates the rules land on, exactly one
  // day in March is short and one in October is long, and every other day is
  // 24h — assert that shape rather than hard-coding a transition date that the
  // tz database can and does move.
  it('has exactly one 23h day in March and one 25h day in October', () => {
    const march = Array.from({ length: 31 }, (_, i) =>
      hours(`2026-03-${String(i + 1).padStart(2, '0')}T09:00:00Z`),
    );
    expect(march.filter((h) => h === 23)).toHaveLength(1);
    expect(march.filter((h) => h === 24)).toHaveLength(30);

    const october = Array.from({ length: 31 }, (_, i) =>
      hours(`2026-10-${String(i + 1).padStart(2, '0')}T09:00:00Z`),
    );
    expect(october.filter((h) => h === 25)).toHaveLength(1);
    expect(october.filter((h) => h === 24)).toHaveLength(30);
  });

  // The property that actually matters for settlement: consecutive days must
  // tile the timeline with no gap and no overlap, or an order delivered in the
  // seam would be settleable twice or never.
  it('tiles consecutive days with no gap and no overlap', () => {
    for (const month of ['03', '10']) {
      for (let d = 1; d <= 30; d++) {
        const today = new Date(`2026-${month}-${String(d).padStart(2, '0')}T09:00:00Z`);
        const tomorrow = new Date(`2026-${month}-${String(d + 1).padStart(2, '0')}T09:00:00Z`);
        expect(beirutDayEnd(today).getTime() + 1).toBe(beirutDayStart(tomorrow).getTime());
      }
    }
  });
});

describe('beirutDayKey', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(beirutDayKey(new Date('2026-09-01T09:00:00Z'))).toBe('2026-09-01');
    expect(beirutDayKey(new Date('2026-01-05T09:00:00Z'))).toBe('2026-01-05');
  });
});

describe('beirutRange', () => {
  it('snaps a bare picked date onto the real Beirut day', () => {
    // This is what z.coerce.date() produces from "2026-09-02" — UTC midnight,
    // which is 03:00 on a Beirut wall clock.
    const picked = new Date('2026-09-02T00:00:00Z');
    const { from, to } = beirutRange(picked, picked);

    expect(wall(from!)).toBe('02/09/2026, 00:00:00');
    expect(wall(to!)).toBe('02/09/2026, 23:59:59');
  });

  it('covers the three hours an unsnapped range silently drops', () => {
    const picked = new Date('2026-09-02T00:00:00Z');
    const { from, to } = beirutRange(picked, picked);

    // 00:30 Beirut on the 2nd — inside the day the user picked, but BEFORE the
    // unsnapped UTC-midnight boundary, so it used to fall out of "today".
    const earlyMorning = new Date('2026-09-01T21:30:00Z');
    expect(wall(earlyMorning)).toBe('02/09/2026, 00:30:00');
    expect(earlyMorning >= from! && earlyMorning <= to!).toBe(true);

    // 01:00 Beirut on the 3rd — the previous night as far as a late shift is
    // concerned, and an unsnapped range would have counted it as the 2nd.
    const nextNight = new Date('2026-09-02T22:00:00Z');
    expect(wall(nextNight)).toBe('03/09/2026, 01:00:00');
    expect(nextNight <= to!).toBe(false);
  });

  it('leaves an absent bound absent', () => {
    expect(beirutRange(undefined, undefined)).toEqual({});
    expect(beirutRange(new Date('2026-09-02T00:00:00Z'), null).to).toBeUndefined();
  });
});
