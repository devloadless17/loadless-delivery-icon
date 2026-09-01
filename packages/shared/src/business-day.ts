/**
 * The business day, in Beirut.
 *
 * The web layer already pins every displayed time to Asia/Beirut
 * (apps/web/src/lib/format.ts) for a good reason: a vendor, the driver carrying
 * their order and the admin watching both must read the same clock. The API has
 * no such pinning — `new Date().setHours(0,0,0,0)` resolves to the *container's*
 * local time, which in production is UTC, i.e. 2 or 3am Beirut.
 *
 * That is tolerable for a dashboard tile. It is not tolerable for "settle up
 * everything this driver delivered today", where a three-hour error silently
 * moves real cash between two days. These helpers give the server a real Beirut
 * day boundary without pulling in a date library (there is none in this repo,
 * and `packages/shared` must stay dependency-pure).
 *
 * DST is handled: Lebanon shifts, so every boundary is resolved in two passes —
 * guess using the offset at the reference instant, then re-resolve using the
 * offset actually in force at the guessed boundary.
 */

const BEIRUT = 'Asia/Beirut';

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: BEIRUT,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The Beirut wall-clock reading of an instant. */
function beirutWallClock(at: Date): WallClock {
  const parts = partsFormat.formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`missing ${type} in Beirut format parts`);
    return Number(part.value);
  };
  // en-US with hour12:false renders midnight as hour 24 in some engines.
  const hour = get('hour') % 24;
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Beirut's UTC offset in milliseconds at a given instant (+2h or +3h). */
function beirutOffsetMs(at: Date): number {
  const wall = beirutWallClock(at);
  const asIfUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  // Drop sub-second noise: the formatter has second resolution.
  return asIfUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The instant at which a given Beirut calendar date begins.
 *
 * `naiveUtcMs` is that date's midnight read as if it were UTC. Resolving it to a
 * real instant is not a single subtraction, because the offset we need is the
 * one in force *at the boundary*, not at the reference instant. So: guess,
 * re-resolve, then VERIFY — and only accept a candidate that genuinely reads
 * back as midnight on the requested date.
 *
 * Two edge cases make the verification necessary rather than decorative:
 *  - Spring forward (Lebanon, late March): the clock jumps 00:00 -> 01:00, so
 *    local midnight NEVER HAPPENS. Neither candidate reads as midnight, and the
 *    day truly begins at the transition instant — the later candidate.
 *  - Fall back (late October): local midnight happens TWICE. The day begins at
 *    the first one, so candidates are tried in ascending order.
 */
function beirutMidnight(naiveUtcMs: number, near: Date): Date {
  const target = new Date(naiveUtcMs);
  const firstPass = naiveUtcMs - beirutOffsetMs(near);
  const secondPass = naiveUtcMs - beirutOffsetMs(new Date(firstPass));

  const candidates = [...new Set([firstPass, secondPass])].sort((a, b) => a - b);
  for (const candidate of candidates) {
    const wall = beirutWallClock(new Date(candidate));
    if (
      wall.year === target.getUTCFullYear() &&
      wall.month === target.getUTCMonth() + 1 &&
      wall.day === target.getUTCDate() &&
      wall.hour === 0 &&
      wall.minute === 0 &&
      wall.second === 0
    ) {
      return new Date(candidate);
    }
  }
  // Midnight was skipped by a spring-forward. The day starts when the clock jumped.
  return new Date(candidates[candidates.length - 1]!);
}

/** Start of the Beirut calendar day containing `at` (00:00:00.000 Beirut). */
export function beirutDayStart(at: Date = new Date()): Date {
  const wall = beirutWallClock(at);
  return beirutMidnight(Date.UTC(wall.year, wall.month - 1, wall.day), at);
}

/**
 * The LAST instant of the Beirut calendar day containing `at`.
 *
 * Inclusive on purpose: the settlement sweep filters `deliveredAt <= cutoff`,
 * so an exclusive bound would drop an order delivered exactly at midnight.
 */
export function beirutDayEnd(at: Date = new Date()): Date {
  const wall = beirutWallClock(at);
  // Date.UTC normalises a day overflow (32 March -> 1 April) for us.
  const nextDayStart = beirutMidnight(Date.UTC(wall.year, wall.month - 1, wall.day + 1), at);
  return new Date(nextDayStart.getTime() - 1);
}

/** "2026-09-01" — the Beirut calendar day an instant falls on. */
export function beirutDayKey(at: Date = new Date()): string {
  const wall = beirutWallClock(at);
  return `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`;
}
