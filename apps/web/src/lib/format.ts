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
