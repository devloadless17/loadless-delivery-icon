import { describe, expect, it } from 'vitest';
import {
  fromMinorUnits,
  calcCommission,
  calcDriverEarnings,
  formatBps,
  formatMoney,
  toMinorUnits,
} from './money';

describe('calcCommission', () => {
  it.each([
    // [chargeMinor, bps, expectedCommission, expectedEarnings]
    [100_000n, 3000, 30_000n, 70_000n], // spec worked example: 100,000 LBP @ 30%
    [12_345n, 2750, 3_395n, 8_950n], // rounding case: 3394.875 -> half-up -> 3395
    [500n, 3000, 150n, 350n], // $5.00 @ 30% -> $1.50 / $3.50
    [1n, 5000, 1n, 0n], // 0.5 rounds up (half-up)
    [1n, 4999, 0n, 1n], // 0.4999 rounds down
    [0n, 3000, 0n, 0n],
    [100_000n, 0, 0n, 100_000n],
    [100_000n, 10_000, 100_000n, 0n], // 100% commission
    [2_000_000_000_000n, 2500, 500_000_000_000n, 1_500_000_000_000n], // huge LBP amounts
  ])('charge %s @ %s bps -> commission %s, earnings %s', (charge, bps, commission, earnings) => {
    const c = calcCommission(charge, bps);
    expect(c).toBe(commission);
    expect(calcDriverEarnings(charge, c)).toBe(earnings);
  });

  it('commission + earnings always equals the charge exactly', () => {
    for (let bps = 0; bps <= 10_000; bps += 137) {
      for (const charge of [1n, 999n, 12_345n, 77_777n, 1_000_003n]) {
        const c = calcCommission(charge, bps);
        expect(c + calcDriverEarnings(charge, c)).toBe(charge);
        expect(c >= 0n).toBe(true);
        expect(c <= charge).toBe(true);
      }
    }
  });

  it('rejects out-of-range bps', () => {
    expect(() => calcCommission(1000n, -1)).toThrow(RangeError);
    expect(() => calcCommission(1000n, 10_001)).toThrow(RangeError);
    expect(() => calcCommission(1000n, 12.5)).toThrow(RangeError);
  });

  it('rejects negative charges', () => {
    expect(() => calcCommission(-1n, 3000)).toThrow(RangeError);
  });
});

describe('toMinorUnits', () => {
  it.each([
    ['150000', 'LBP', 150_000n],
    ['150,000', 'LBP', 150_000n],
    [' 12.50 ', 'USD', 1_250n],
    ['12.5', 'USD', 1_250n],
    ['12', 'USD', 1_200n],
    ['0', 'LBP', 0n],
  ] as const)('parses %s %s', (input, currency, expected) => {
    expect(toMinorUnits(input, currency)).toBe(expected);
  });

  it.each([
    ['12.5', 'LBP'], // LBP has no subunit
    ['12.505', 'USD'], // beyond cent precision
    ['-5', 'LBP'],
    ['abc', 'LBP'],
    ['1e5', 'LBP'],
    ['', 'LBP'],
  ] as const)('rejects %s %s', (input, currency) => {
    expect(toMinorUnits(input, currency)).toBeNull();
  });
});

describe('formatMoney', () => {
  it.each([
    [150_000n, 'LBP', '150,000 LBP'],
    [1_250n, 'USD', '12.50 USD'],
    [5n, 'USD', '0.05 USD'],
    [0n, 'LBP', '0 LBP'],
    [-30_000n, 'LBP', '-30,000 LBP'],
  ] as const)('formats %s %s', (amount, currency, expected) => {
    expect(formatMoney(amount, currency)).toBe(expected);
  });

  it('accepts string-serialized BigInt (API wire format)', () => {
    expect(formatMoney('2000000', 'LBP')).toBe('2,000,000 LBP');
  });
});

describe('formatBps', () => {
  it('formats whole and fractional percentages', () => {
    expect(formatBps(3000)).toBe('30%');
    expect(formatBps(2750)).toBe('27.5%');
  });
});

describe('fromMinorUnits', () => {
  it.each([
    [150_000n, 'LBP', '150000'],
    [0n, 'LBP', '0'],
    [1_250n, 'USD', '12.50'],
    [5n, 'USD', '0.05'],
    [100n, 'USD', '1.00'],
  ] as const)('renders %s %s as %s', (minor, currency, expected) => {
    expect(fromMinorUnits(minor, currency)).toBe(expected);
  });

  it('accepts the string form that crosses the wire', () => {
    expect(fromMinorUnits('2000000', 'LBP')).toBe('2000000');
  });

  it('round-trips with toMinorUnits — the repeat-order path depends on this', () => {
    for (const [minor, currency] of [
      [150_000n, 'LBP'],
      [1n, 'LBP'],
      [1_250n, 'USD'],
      [5n, 'USD'],
      [99_999n, 'USD'],
    ] as const) {
      expect(toMinorUnits(fromMinorUnits(minor, currency), currency)).toBe(minor);
    }
  });
});
