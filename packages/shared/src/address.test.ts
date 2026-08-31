import { describe, expect, it } from 'vitest';
import { isSameAddress, normalizeAddressKey } from './address';

describe('normalizeAddressKey', () => {
  it.each([
    ['Hamra Bldg 12', 'hamra bldg 12'],
    ['hamra  bldg   12', 'hamra bldg 12'],
    ['  Hamra Bldg 12  ', 'hamra bldg 12'],
    ['HAMRA\tBLDG\n12', 'hamra bldg 12'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeAddressKey(input)).toBe(expected);
  });

  it('treats case and whitespace variants as the same place', () => {
    expect(isSameAddress('Hamra Bldg 12', 'hamra  bldg 12 ')).toBe(true);
  });

  it('does NOT merge genuinely different places (conservative by design)', () => {
    expect(isSameAddress('Hamra Bldg 12', 'Hamra Bldg 13')).toBe(false);
    expect(isSameAddress('Hamra, Bldg 12', 'Hamra Bldg 12')).toBe(false); // punctuation kept
    expect(isSameAddress('Verdun', 'Hamra')).toBe(false);
  });
});
