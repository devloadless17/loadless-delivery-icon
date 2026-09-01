import { describe, expect, it } from 'vitest';
import { beirutDayEnd, beirutDayKey, beirutDayStart } from './business-day';

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
    '2026-03-29T09:00:00Z', // spring-forward day
    '2026-10-25T09:00:00Z', // fall-back day
    '2026-06-30T21:30:00Z', // 00:30 Beirut the NEXT day — the classic off-by-one
  ];

  it.each(samples)('start of the Beirut day containing %s reads 00:00:00', (iso) => {
    expect(wall(beirutDayStart(new Date(iso)))).toMatch(/, 00:00:00$/);
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

  it('spans 24h on an ordinary day and 23h across the spring-forward', () => {
    const hours = (iso: string) =>
      (beirutDayEnd(new Date(iso)).getTime() + 1 - beirutDayStart(new Date(iso)).getTime()) / 3_600_000;
    expect(hours('2026-09-01T09:00:00Z')).toBe(24);
    // Lebanon springs forward in late March; whichever day it lands on, exactly
    // one day that month is short. Assert the shape rather than the date.
    const marchDays = Array.from({ length: 31 }, (_, i) =>
      hours(`2026-03-${String(i + 1).padStart(2, '0')}T09:00:00Z`),
    );
    expect(marchDays.filter((h) => h === 23)).toHaveLength(1);
    expect(marchDays.filter((h) => h === 24)).toHaveLength(30);
  });
});

describe('beirutDayKey', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(beirutDayKey(new Date('2026-09-01T09:00:00Z'))).toBe('2026-09-01');
    expect(beirutDayKey(new Date('2026-01-05T09:00:00Z'))).toBe('2026-01-05');
  });
});
