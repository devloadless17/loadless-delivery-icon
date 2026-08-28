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
export function toMinorUnits(input: string, currency: Currency): bigint | null {
  const exponent = CURRENCY_EXPONENT[currency];
  const trimmed = input.trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [wholeRaw, fracRaw = ''] = trimmed.split('.');
  const whole = wholeRaw ?? '0';
  if (fracRaw.length > exponent) return null; // more precision than the currency supports
  const frac = fracRaw.padEnd(exponent, '0');
  return BigInt(whole + frac);
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
