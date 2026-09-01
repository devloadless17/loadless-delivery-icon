import { displayPhoneNumber, formatMoney, type Currency } from '@loadless/shared';

export function displayPhone(normalized: string): string {
  return displayPhoneNumber(normalized);
}

export function displayMoney(amountMinor: string | bigint, currency: Currency): string {
  return formatMoney(amountMinor, currency);
}

/**
 * Every displayed time is Beirut time, in 12-hour form.
 *
 * The timezone is PINNED rather than left to the device. This is a Lebanese
 * operation: a vendor, the driver carrying their order and the admin watching
 * both must read the same clock, and without an explicit zone each renders in
 * whatever its own device is set to. A driver whose phone is on the wrong
 * timezone — or roaming — would see a pickup time that quietly disagrees with
 * the vendor's by hours, and nothing on screen would say so. Server-rendered
 * pages would use the container's UTC on top of that.
 *
 * 12-hour because that is how the times are said out loud here; en-GB defaults
 * to 24-hour, which is why hour12 is explicit.
 */
const BEIRUT = 'Asia/Beirut';

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: BEIRUT,
});
const dateFormatWithYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: BEIRUT,
});
const timeOnlyFormat = new Intl.DateTimeFormat('en-GB', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: BEIRUT,
});
const fullFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: BEIRUT,
});

/** "1 Sep, 4:05 pm" — Beirut time. */
export function displayDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** "1 Sep 2026" — Beirut time. */
export function displayDate(iso: string): string {
  return dateFormatWithYear.format(new Date(iso));
}

/** "4:05 pm" — for timeline rows where the day is already obvious. */
export function displayTime(iso: string): string {
  return timeOnlyFormat.format(new Date(iso));
}

/** "1 Sep 2026, 4:05 pm" — where the exact moment matters. */
export function displayDateTimeFull(iso: string): string {
  return fullFormat.format(new Date(iso));
}

/**
 * A label for a plain calendar day ("2026-09-01" -> "1 Sept").
 *
 * These come off analytics aggregates as dates, not moments. Parsing one as
 * midnight and then converting the zone can move it to the previous day, so
 * this anchors at noon: no offset on earth is large enough to push midday
 * across a date boundary.
 */
const dayLabelFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: BEIRUT,
});
export function displayDayLabel(day: string): string {
  return dayLabelFormat.format(new Date(`${day}T12:00:00Z`));
}

export function fileUrl(key: string): string {
  return `/api/v1/files/${key}`;
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "3 days ago" / "just now" — how a vendor actually thinks about recency. */
export function displayRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return relative.format(-mins, 'minute');
  const hours = Math.round(mins / 60);
  if (hours < 24) return relative.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return relative.format(-days, 'day');
  const months = Math.round(days / 30);
  if (months < 12) return relative.format(-months, 'month');
  return relative.format(-Math.round(months / 12), 'year');
}

/** True when a date is old enough that the customer counts as lapsed. */
export function isStale(iso: string, days = 90): boolean {
  return Date.now() - new Date(iso).getTime() > days * 24 * 60 * 60 * 1000;
}

/** Initials for the monogram tile — there are no customer photos. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] as string;
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

/**
 * The inclusive end of a chosen day, for a `to` filter.
 *
 * A bare "2026-09-01" parses as midnight, so filtering "up to today" would
 * silently exclude everything that happened today — the orders someone is most
 * likely looking for.
 */
export function endOfDay(date: string): string {
  return `${date}T23:59:59`;
}
