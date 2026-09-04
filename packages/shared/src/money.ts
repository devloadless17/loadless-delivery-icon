export const CURRENCIES = ['LBP', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = 'LBP';

/**
 * Minor-unit exponent per currency. Adding a currency = one entry here plus the
 * enum value (shared + Prisma). LBP has no working subunit; USD stores cents.
 */
export const CURRENCY_EXPONENT: Record<Currency, number> = {
  LBP: 0,
  USD: 2,
};

export const MAX_COMMISSION_BPS = 10_000;

/**
 * Platform commission in integer minor units, round-half-up.
 * The ONLY place commission math lives. bps = basis points (30% = 3000).
 */
export function calcCommission(chargeMinor: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_COMMISSION_BPS) {
    throw new RangeError(`commission bps out of range: ${bps}`);
  }
  if (chargeMinor < 0n) {
    throw new RangeError('charge must be non-negative');
  }
  return (chargeMinor * BigInt(bps) + 5_000n) / 10_000n;
}

/**
 * Driver earnings are always derived by subtraction so that
 * commission + earnings === charge holds exactly (also a DB CHECK).
 */
export function calcDriverEarnings(chargeMinor: bigint, commissionMinor: bigint): bigint {
  const earnings = chargeMinor - commissionMinor;
  if (earnings < 0n) throw new RangeError('commission exceeds charge');
  return earnings;
}

/** Parse a user-entered major-unit amount ("150000", "12.50") into minor units. */
/**
 * The largest amount any single money field may hold, in minor units.
 *
 * Nothing enforced an upper bound at all: a 25-digit delivery charge passed
 * validation (`> 0`), reached a Postgres BIGINT column and came back as an
 * opaque 500 rather than a message naming the field. The ceiling is set well
 * below BIGINT's 9.2e18 so that SUMS stay safe too — 400k orders at this cap
 * still total two orders of magnitude short of overflow, and every settlement
 * figure is a sum of order rows.
 *
 * 1e12 is absurdly generous for both currencies (a trillion LBP, or ten
 * billion dollars, for ONE delivery), which is the point: it can only ever
 * catch a typo or an attack, never a real charge.
 */
export const MAX_MONEY_MINOR = 1_000_000_000_000n;

export function toMinorUnits(input: string, currency: Currency): bigint | null {
  const exponent = CURRENCY_EXPONENT[currency];
  const raw = input.trim();

  // A comma is a THOUSANDS separator here and nothing else.
  //
  // Stripping every comma before parsing made "1,250,000" LBP work — and also
  // silently turned "12,50" USD into 125000 minor, which is $1,250.00 rather
  // than the $12.50 the person meant. A hundred times the charge, accepted
  // without a murmur. Decimal commas are written by plenty of people in
  // Lebanon, and this same helper parses the cash an admin types into the
  // collection box, so the wrong reading gets banked.
  //
  // Requiring well-formed groups keeps the convenience and removes the
  // ambiguity: "1,250" and "1,250.50" parse, "12,50" and "1,5" are refused so
  // the person can retype what they meant.
  const grouped = raw.includes(',');
  if (grouped ? !/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw) : !/^\d+(\.\d+)?$/.test(raw)) {
    return null;
  }
  const trimmed = raw.replace(/,/g, '');
  const [wholeRaw, fracRaw = ''] = trimmed.split('.');
  const whole = wholeRaw ?? '0';
  if (fracRaw.length > exponent) return null; // more precision than the currency supports
  const frac = fracRaw.padEnd(exponent, '0');
  const minor = BigInt(whole + frac);
  // Refused here rather than at each call site, so no parse path can miss it.
  return minor > MAX_MONEY_MINOR ? null : minor;
}

/**
 * Why an amount was refused, in words the person can act on.
 *
 * The generic "enter a valid positive amount" is no help to a vendor who typed
 * "12,50" on a call: it used to be silently read as 1,250.00, and now it is
 * correctly refused — but only a message that names the comma tells them what
 * to change. Returns null when the input is fine.
 */
export function describeAmountProblem(input: string, currency: Currency): string | null {
  const raw = input.trim();
  // Deliberately not "enter the delivery charge": the same helper explains the
  // settlement cash box and the adjustment box, where the person is counting
  // notes in front of a driver rather than pricing a delivery.
  if (!raw) return 'Enter an amount';

  const minor = toMinorUnits(raw, currency);
  if (minor !== null) return minor > 0n ? null : 'Enter an amount greater than zero';

  // Malformed GROUPING, not merely the presence of a comma. Testing for a comma
  // alone meant "1,500.5" LBP — where the grouping is fine and the DOT is what
  // must go — was told to use a dot, which is precisely backwards to someone
  // mid-call. Every other check then runs against the ungrouped value so a
  // legitimate separator stops hiding the real problem.
  if (raw.includes(',') && !/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) {
    return 'Use a dot for decimals — 12.50, not 12,50. Commas only separate thousands.';
  }
  const bare = raw.replace(/,/g, '');

  const dot = bare.indexOf('.');
  if (dot !== -1 && bare.length - dot - 1 > CURRENCY_EXPONENT[currency]) {
    return CURRENCY_EXPONENT[currency] === 0
      ? `${currency} has no decimals — enter a whole amount`
      : `${currency} allows at most ${CURRENCY_EXPONENT[currency]} decimal places`;
  }
  if (/^\d+(\.\d+)?$/.test(bare)) return 'That amount is too large';
  return 'Enter a valid positive amount';
}

/** Format minor units for display, e.g. 150000n LBP -> "150,000 LBP", 1250n USD -> "12.50 USD". */
export function formatMoney(amountMinor: bigint | string, currency: Currency): string {
  const amount = typeof amountMinor === 'string' ? BigInt(amountMinor) : amountMinor;
  const exponent = CURRENCY_EXPONENT[currency];
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const digits = abs.toString().padStart(exponent + 1, '0');
  const whole = exponent > 0 ? digits.slice(0, -exponent) : digits;
  const frac = exponent > 0 ? digits.slice(-exponent) : '';
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${frac ? `.${frac}` : ''} ${currency}`;
}

/** Percentage label for a bps value, e.g. 2750 -> "27.5%". */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(pct * 10 === Math.floor(pct * 10) ? 1 : 2)}%`;
}

/**
 * Inverse of toMinorUnits — renders stored minor units back into the plain
 * major-unit string an amount input expects (no grouping separators, no
 * currency code). 150000n LBP -> "150000"; 1250n USD -> "12.50".
 */
export function fromMinorUnits(amountMinor: bigint | string, currency: Currency): string {
  const amount = typeof amountMinor === 'string' ? BigInt(amountMinor) : amountMinor;
  const exponent = CURRENCY_EXPONENT[currency];
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  if (exponent === 0) return `${negative ? '-' : ''}${abs.toString()}`;
  const digits = abs.toString().padStart(exponent + 1, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}
