import { describe, expect, it } from 'vitest';
import {
  formatLebanesePhone,
  isNormalizedLebanesePhone,
  normalizeLebanesePhone,
} from './phone';

describe('normalizeLebanesePhone', () => {
  it.each([
    // every accepted variant of the same mobile number
    ['03 123 456', '+9613123456'],
    ['03123456', '+9613123456'],
    ['3123456', '+9613123456'],
    ['+961 3 123 456', '+9613123456'],
    ['009613123456', '+9613123456'],
    ['9613123456', '+9613123456'],
    ['+9613123456', '+9613123456'],
    ['03-123-456', '+9613123456'],
    // 8-digit mobiles (70/71/76/78/79/81)
    ['70 123 456', '+96170123456'],
    ['070123456', '+96170123456'],
    ['+961 70 123 456', '+96170123456'],
    ['0096181123456', '+96181123456'],
    // landlines
    ['01 344 970', '+9611344970'],
    ['04 987 654', '+9614987654'],
    ['09 123 456', '+9619123456'],
  ])('normalizes %s -> %s', (input, expected) => {
    expect(normalizeLebanesePhone(input)).toBe(expected);
  });

  it.each([
    '',
    'abc',
    '12345', // too short
    '123456789', // 9-digit NSN doesn't exist
    '2123456', // 2 is not a valid first digit
    '0123456', // after trunk strip: 123456 (6 digits)
    '90123456', // 8-digit cannot start with 9
    '+14155552671', // not Lebanon
    '+962791234567', // Jordan
  ])('rejects %s', (input) => {
    expect(normalizeLebanesePhone(input)).toBeNull();
  });

  it('is idempotent on its own output', () => {
    for (const raw of ['03123456', '70123456', '01344970']) {
      const once = normalizeLebanesePhone(raw);
      expect(once).not.toBeNull();
      expect(normalizeLebanesePhone(once as string)).toBe(once);
    }
  });
});

describe('isNormalizedLebanesePhone', () => {
  it('accepts only canonical stored form', () => {
    expect(isNormalizedLebanesePhone('+9613123456')).toBe(true);
    expect(isNormalizedLebanesePhone('+96170123456')).toBe(true);
    expect(isNormalizedLebanesePhone('03123456')).toBe(false);
    expect(isNormalizedLebanesePhone('+961212345678')).toBe(false);
  });
});

describe('formatLebanesePhone', () => {
  it('renders friendly local formats', () => {
    expect(formatLebanesePhone('+9613123456')).toBe('03 123 456');
    expect(formatLebanesePhone('+96170123456')).toBe('70 123 456');
    expect(formatLebanesePhone('+9611344970')).toBe('01 344 970');
  });
});
