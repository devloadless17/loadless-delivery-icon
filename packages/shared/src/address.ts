/**
 * Dedupe key for a saved address. MUST stay byte-identical in behaviour to the
 * SQL expression backing the customer_address_dedupe_uniq index:
 *   lower(btrim(regexp_replace(address_text, '\s+', ' ', 'g')))
 *
 * Deliberately conservative — whitespace collapse + lowercase only. No
 * punctuation stripping, no diacritic folding: wrongly MERGING two real places
 * is far worse than keeping a duplicate row.
 */
export function normalizeAddressKey(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** True when two address strings refer to the same saved place. */
export function isSameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeAddressKey(a);
  return left !== '' && left === normalizeAddressKey(b);
}

/** What to show when a location is only a shared pin. */
export const SHARED_LOCATION_LABEL = 'Shared location';

/** The human-readable line for a location that may be text, a link, or both. */
export function displayAddress(
  addressText: string | null | undefined,
  mapsUrl?: string | null,
): string {
  const text = addressText?.trim();
  if (text) return text;
  return mapsUrl ? SHARED_LOCATION_LABEL : '';
}
