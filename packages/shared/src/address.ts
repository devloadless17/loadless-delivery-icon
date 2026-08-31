/**
 * Dedupe key for a saved address. MUST stay byte-identical in behaviour to the
 * SQL expression backing the customer_address_dedupe_uniq index:
 *   lower(btrim(regexp_replace(address_text, '\s+', ' ', 'g')))
 *
 * Deliberately conservative — whitespace collapse + lowercase only. No
 * punctuation stripping, no diacritic folding: wrongly MERGING two real places
 * is far worse than keeping a duplicate row.
 */
export function normalizeAddressKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** True when two address strings refer to the same saved place. */
export function isSameAddress(a: string, b: string): boolean {
  return normalizeAddressKey(a) === normalizeAddressKey(b);
}
