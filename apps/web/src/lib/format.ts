import { formatLebanesePhone, formatMoney, type Currency } from '@loadless/shared';

export function displayPhone(normalized: string): string {
  return formatLebanesePhone(normalized);
}

export function displayMoney(amountMinor: string | bigint, currency: Currency): string {
  return formatMoney(amountMinor, currency);
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const dateFormatWithYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function displayDateTime(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function displayDate(iso: string): string {
  return dateFormatWithYear.format(new Date(iso));
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
