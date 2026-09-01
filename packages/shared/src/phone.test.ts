import { describe, expect, it } from 'vitest';
import {
  displayPhoneNumber,
  isLebanesePhone,
  isNormalizedPhone,
  normalizePhone,
  phoneSearchPrefix,
} from './phone';

describe('normalizePhone — Lebanon is the default country', () => {
  it.each([
    ['03 123 456', '+9613123456'],
    ['03123456', '+9613123456'],
    ['3123456', '+9613123456'],
    ['+961 3 123 456', '+9613123456'],
    ['009613123456', '+9613123456'],
    ['9613123456', '+9613123456'],
    ['70 123 456', '+96170123456'],
    ['09 123 456', '+9619123456'], // 09 is a real landline area (Keserwan)
    ['0 71 999 888', '+96171999888'],
  ])('local %s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    ['02 123 456'], // 2 is not a Lebanese area code
    ['03 123'], // too short
    ['031234567'], // 8 digits starting 3 is not a Lebanese shape
    [''],
    ['not a phone'],
    ['+961'],
  ])('rejects %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('normalizePhone — a customer in Lebanon on a foreign number', () => {
  it.each([
    ['+971 50 123 4567', '+971501234567'],
    ['0097150 123 4567', '+971501234567'],
    ['+963 11 234 567', '+96311234567'],
    ['+44 7700 900123', '+447700900123'],
    ['+1 415 555 0123', '+14155550123'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('still refuses shapes that cannot be a number', () => {
    expect(normalizePhone('+1 555')).toBeNull(); // too short for E.164
    expect(normalizePhone('+0 123 456 789')).toBeNull(); // no country code starts with 0
    expect(normalizePhone('+9999999999999999')).toBeNull(); // longer than E.164 allows
    expect(normalizePhone('12+34567')).toBeNull(); // a plus in the middle is a typo
  });

  it('a foreign number is NOT quietly read as Lebanese', () => {
    // Without the + this is a local Lebanese number; with it, it is Emirati.
    expect(normalizePhone('+971501234567')).toBe('+971501234567');
    expect(isLebanesePhone('+971501234567')).toBe(false);
    expect(isLebanesePhone('+9613123456')).toBe(true);
  });

  it('a stored number round-trips through normalize unchanged', () => {
    for (const stored of ['+9613123456', '+96170123456', '+971501234567', '+447700900123']) {
      expect(normalizePhone(stored)).toBe(stored);
      expect(isNormalizedPhone(stored)).toBe(true);
    }
  });
});

describe('displayPhoneNumber', () => {
  it('spaces Lebanese numbers the way they are read here', () => {
    expect(displayPhoneNumber('+9613123456')).toBe('03 123 456');
    expect(displayPhoneNumber('+96170123456')).toBe('70 123 456');
  });

  it('leaves a foreign number in E.164 rather than grouping it wrongly', () => {
    expect(displayPhoneNumber('+971501234567')).toBe('+971501234567');
  });
});

describe('phoneSearchPrefix', () => {
  it.each([
    ['03 12', '+961312'],
    ['03123456', '+9613123456'],
    ['3 123', '+9613123'],
    ['70 12', '+9617012'],
    ['+961 3 123', '+9613123'],
    ['009613 12', '+961312'],
    ['9613123456', '+9613123456'],
    ['+971 50', '+97150'],
    ['0097150', '+97150'],
    ['', ''],
    ['Ahmad', ''],
  ])('%s -> %s', (input, expected) => {
    expect(phoneSearchPrefix(input)).toBe(expected);
  });

  it('is a genuine prefix of the stored number at every keystroke', () => {
    for (const [typed, stored] of [
      ['03 123 456', '+9613123456'],
      ['+971 50 123 4567', '+971501234567'],
    ] as const) {
      for (let i = 1; i <= typed.length; i += 1) {
        const prefix = phoneSearchPrefix(typed.slice(0, i));
        if (prefix) expect(stored.startsWith(prefix)).toBe(true);
      }
    }
  });
});
