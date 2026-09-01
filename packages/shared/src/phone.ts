/**
 * Phone normalization. Lebanon is the DEFAULT country, not the only one:
 * plenty of customers live in Lebanon on a foreign number, and refusing them
 * would refuse a real delivery.
 *
 * The rule is: a number written the local way is Lebanese; a number written
 * with an explicit country prefix (+ or 00) is whatever country it says.
 *
 *   "03 123 456"  "3123456"  "+961 3 123 456"  "009613123456"  "9613123456"
 *      -> +9613123456              (Lebanese, validated against real prefixes)
 *   "+971 50 123 4567"  "0097150 123 4567"
 *      -> +971501234567            (international, accepted as E.164)
 *
 * Lebanese numbers keep their strict rules — the prefixes are known, so a typo
 * is worth catching on the identity key. Other countries are accepted on shape
 * alone: we cannot tell a real Emirati number from a mistyped one without
 * per-country metadata, and wrongly rejecting the customer on the phone is the
 * worse failure.
 */

const SEVEN_DIGIT_FIRST = new Set(['1', '3', '4', '5', '6', '9']); // landline areas + 3-mobiles
const EIGHT_DIGIT_FIRST = new Set(['7', '8']); // 70/71/76/78/79/81 mobiles

/** Lebanon's country code, without the plus. */
export const LEBANON_CC = '961';

/** A fully-normalized Lebanese number. */
export const LEBANESE_PHONE_REGEX = /^\+961\d{7,8}$/;
/** Any fully-normalized number: E.164, 8–15 digits including the country code. */
export const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

/** The national part of a Lebanese number, or null if it is not one. */
function lebaneseNsn(digits: string): string | null {
  const first = digits[0];
  if (!first) return null;
  if (digits.length === 7 && SEVEN_DIGIT_FIRST.has(first)) return digits;
  if (digits.length === 8 && EIGHT_DIGIT_FIRST.has(first)) return digits;
  return null;
}

/** Splits typed input into its digits and whether a country was stated. */
function parse(input: string): { digits: string; international: boolean } | null {
  const raw = input.replace(/[^\d+]/g, '');
  if (!raw) return null;
  let digits = raw;
  let international = false;
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
    international = true;
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }
  // A '+' anywhere but the front is a typo, not a country code.
  if (!/^\d+$/.test(digits)) return null;
  return { digits, international };
}

export function normalizePhone(input: string): string | null {
  const parsed = parse(input);
  if (!parsed) return null;
  const { digits, international } = parsed;

  // Lebanon, however it was written. The bare-961 case needs a length guard so
  // a local number that merely starts with those digits is not misread.
  if (digits.startsWith(LEBANON_CC) && (international || digits.length >= 10)) {
    const nsn = lebaneseNsn(digits.slice(LEBANON_CC.length));
    return nsn ? `+${LEBANON_CC}${nsn}` : null;
  }

  if (!international) {
    // No country stated: it is a local number, so it is Lebanese.
    const nsn = lebaneseNsn(digits.startsWith('0') ? digits.slice(1) : digits);
    return nsn ? `+${LEBANON_CC}${nsn}` : null;
  }

  // Another country, accepted on shape alone.
  const e164 = `+${digits}`;
  return E164_PHONE_REGEX.test(e164) ? e164 : null;
}

export function isNormalizedPhone(value: string): boolean {
  return E164_PHONE_REGEX.test(value) && normalizePhone(value) === value;
}

export function isLebanesePhone(normalized: string): boolean {
  return LEBANESE_PHONE_REGEX.test(normalized);
}

/**
 * Display form. A Lebanese number gets the spacing people here read:
 * "+9613123456" -> "03 123 456". A foreign one stays in E.164, because
 * grouping it correctly needs that country's rules and a wrong grouping is
 * harder to read back than none.
 */
export function displayPhoneNumber(normalized: string): string {
  if (!isLebanesePhone(normalized)) return normalized;
  const nsn = normalized.slice(4);
  if (nsn.length === 7) return `0${nsn[0]} ${nsn.slice(1, 4)} ${nsn.slice(4)}`;
  return `${nsn.slice(0, 2)} ${nsn.slice(2, 5)} ${nsn.slice(5)}`;
}

/**
 * The STORED prefix to match a partial number against, from whatever has been
 * typed so far. Unlike normalizePhone this never rejects an incomplete
 * number — it is for searching, not for storing.
 *
 *   "03 12"          -> "+961312"
 *   "70 12"          -> "+9617012"
 *   "+971 50"        -> "+97150"
 *   "Ahmad"          -> ""          (no digits: search by name instead)
 *
 * Building the whole prefix here, rather than returning bare digits, is what
 * keeps "+961" out of the four call sites that search — they no longer assume
 * every customer is Lebanese.
 */
export function phoneSearchPrefix(input: string): string {
  const parsed = parse(input);
  if (!parsed) return '';
  const { digits, international } = parsed;
  if (international || digits.startsWith(LEBANON_CC)) return `+${digits}`;
  return `+${LEBANON_CC}${digits.startsWith('0') ? digits.slice(1) : digits}`;
}
