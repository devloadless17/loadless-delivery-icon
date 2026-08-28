/**
 * Lebanon-only phone normalization. Every phone number in the system is stored
 * as E.164 `+961` + NSN, produced exclusively by this function (the DB enforces
 * the shape with a CHECK regex as a backstop).
 *
 * Accepted input variants for the same number:
 *   "03 123 456", "03123456", "3123456", "+961 3 123 456", "009613123456", "9613123456"
 * All normalize to "+9613123456".
 */

const SEVEN_DIGIT_FIRST = new Set(['1', '3', '4', '5', '6', '9']); // landline areas + 3-mobiles
const EIGHT_DIGIT_FIRST = new Set(['7', '8']); // 70/71/76/78/79/81 mobiles

export const LEBANESE_PHONE_REGEX = /^\+961\d{7,8}$/;

export function normalizeLebanesePhone(input: string): string | null {
  if (!input) return null;
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00961')) digits = digits.slice(5);
  else if (digits.startsWith('961') && digits.length >= 10) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);

  if (digits.length === 7) {
    const first = digits[0];
    if (!first || !SEVEN_DIGIT_FIRST.has(first)) return null;
  } else if (digits.length === 8) {
    const first = digits[0];
    if (!first || !EIGHT_DIGIT_FIRST.has(first)) return null;
  } else {
    return null;
  }
  return `+961${digits}`;
}

export function isNormalizedLebanesePhone(value: string): boolean {
  return LEBANESE_PHONE_REGEX.test(value) && normalizeLebanesePhone(value) === value;
}

/** Display form for a stored number: "+9613123456" -> "03 123 456", "+96170123456" -> "70 123 456". */
export function formatLebanesePhone(normalized: string): string {
  if (!LEBANESE_PHONE_REGEX.test(normalized)) return normalized;
  const nsn = normalized.slice(4);
  if (nsn.length === 7) {
    return `0${nsn[0]} ${nsn.slice(1, 4)} ${nsn.slice(4)}`;
  }
  return `${nsn.slice(0, 2)} ${nsn.slice(2, 5)} ${nsn.slice(5)}`;
}
