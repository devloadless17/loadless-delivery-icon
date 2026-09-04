import { describe, expect, it } from 'vitest';
import {
  fromMinorUnits,
  calcCommission,
  calcDriverEarnings,
  formatBps,
  formatMoney,
  describeAmountProblem,
  MAX_MONEY_MINOR,
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
    // A comma used as a DECIMAL point, which plenty of people in Lebanon write.
    // These all used to parse, by stripping the comma: "12,50" USD became
    // 125000 minor — $1,250.00 instead of $12.50, a hundred times the charge,
    // accepted silently. The same helper reads the cash typed into the
    // settlement collection box, so the wrong figure got banked too.
    ['12,50', 'USD'],
    ['1,5', 'USD'],
    ['1,25', 'USD'],
    ['12,3456', 'USD'],
    ['12.5,0', 'USD'], // a comma anywhere but a thousands slot
    ['1,2500', 'LBP'], // group of four is not a thousands group
    [',250', 'LBP'],
    // Above MAX_MONEY_MINOR. Unbounded, these reached a Postgres BIGINT column
    // and returned an opaque 500 instead of naming the field.
    ['9999999999999', 'LBP'],
    ['99999999999999999999999', 'LBP'],
    ['99999999999.99', 'USD'],
  ] as const)('rejects %s %s', (input, currency) => {
    expect(toMinorUnits(input, currency)).toBeNull();
  });

  it('accepts the largest permitted amount, and nothing above it', () => {
    expect(toMinorUnits('1000000000000', 'LBP')).toBe(MAX_MONEY_MINOR);
    expect(toMinorUnits('1000000000001', 'LBP')).toBeNull();
  });

  it.each([
    ['1,250', 'LBP', 1_250n],
    ['1,250,000', 'LBP', 1_250_000n],
    ['1,250.50', 'USD', 125_050n],
  ] as const)('still reads %s %s as a grouped number', (input, currency, expected) => {
    expect(toMinorUnits(input, currency)).toBe(expected);
  });
});

describe('describeAmountProblem', () => {
  it.each([
    // The one that matters: a decimal comma used to be read as a hundredfold
    // overcharge, is now refused, and the refusal has to say what to change.
    ['12,50', 'USD', /dot for decimals/],
    ['1,5', 'USD', /dot for decimals/],
    ['12.505', 'USD', /at most 2 decimal places/],
    ['12.5', 'LBP', /no decimals/],
    ['99999999999999', 'LBP', /too large/],
    ['0', 'LBP', /greater than zero/],
    ['', 'LBP', /Enter an amount/],
    // A comma is only the answer when the GROUPING is what is wrong. Testing
    // for the mere presence of one told someone who typed "1,500.5" LBP to use
    // a dot, when the dot was the thing that had to go — backwards advice, to
    // someone on a call.
    ['1,500.5', 'LBP', /no decimals/],
    ['1,250.505', 'USD', /at most 2 decimal places/],
    ['150,000,000,000,000', 'LBP', /too large/],
  ] as const)('explains %s %s', (input, currency, expected) => {
    expect(describeAmountProblem(input, currency)).toMatch(expected);
  });

  it.each([
    ['12.50', 'USD'],
    ['1,250', 'LBP'],
    ['150000', 'LBP'],
  ] as const)('says nothing about the valid %s %s', (input, currency) => {
    expect(describeAmountProblem(input, currency)).toBeNull();
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
