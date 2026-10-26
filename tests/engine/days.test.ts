// GG-20 (calendar arithmetic) and the task 1.4 round-trip property. Days are strings; the only
// arithmetic is through src/graph/days.ts (D-8). No Date anywhere in this file.
import { describe, expect, it } from 'vitest';
import { addDays, civilFromDays, daysFromCivil, isDay } from '@/graph/days';

describe('days (R1, D-8)', () => {
  it('GG-20: across month, year and leap day', () => {
    expect([addDays('2026-09-28', 3), addDays('2026-12-30', 3), addDays('2028-02-28', 1), addDays('2026-03-08', 1)]).toEqual([
      '2026-10-01',
      '2027-01-02',
      '2028-02-29',
      '2026-03-09',
    ]);
  });
  it('epoch anchors agree with courselib.days_from_civil', () => {
    expect(daysFromCivil('1970-01-01')).toBe(0);
    expect(daysFromCivil('1969-12-31')).toBe(-1);
    expect(daysFromCivil('2000-03-01')).toBe(11017);
    expect(daysFromCivil('2026-08-31')).toBe(20696);
    expect(civilFromDays(20696)).toBe('2026-08-31');
  });
  it('round-trips every day from 1970-01-01 to 2100-12-31 and never skips or repeats one', () => {
    const last = daysFromCivil('2100-12-31');
    let prev = '';
    for (let n = 0; n <= last; n++) {
      const d = civilFromDays(n);
      expect(daysFromCivil(d)).toBe(n);
      expect(d > prev).toBe(true); // ISO strings order like days
      prev = d;
    }
    expect(last).toBe(47846);
  });
  it('isDay accepts the fixture shape and refuses anything else', () => {
    expect(isDay('2026-02-28')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('2027-02-29')).toBe(false);
    expect(isDay('2028-02-29')).toBe(true);
    expect(isDay('2026-13-01')).toBe(false);
    expect(isDay('2026-1-01')).toBe(false);
    expect(isDay('20260101')).toBe(false);
    expect(isDay('2026-01-01T00:00:00Z')).toBe(false);
  });
  it('daysFromCivil refuses a malformed day instead of guessing', () => {
    expect(() => daysFromCivil('2026-02-30')).toThrow(/not a calendar day/);
    expect(() => daysFromCivil('yesterday')).toThrow(/not a calendar day/);
  });
});
