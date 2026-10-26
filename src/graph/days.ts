/**
 * Calendar days as `YYYY-MM-DD` strings (D-8). The only arithmetic on a day in this repo is here,
 * and it is integer arithmetic: Howard Hinnant's days_from_civil / civil_from_days, ported from
 * `tools/courselib.py` lines 41–67 so the TypeScript and the oracle agree digit for digit.
 * No Date, no timezone, no clock. R1: release day = start day + offset days, inclusive.
 */

export type Day = string; // 'YYYY-MM-DD'

const SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Mathematical floor division (Python's `//`), which differs from `Math.trunc` for negatives. */
function fdiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** True for a well-formed, existing calendar day in the fixture shape. */
export function isDay(s: string): boolean {
  const m = SHAPE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return civilFromDays(daysFromParts(y, mo, d)) === s; // a day that normalises to itself exists
}

function daysFromParts(y0: number, m: number, d: number): number {
  const y = y0 - (m <= 2 ? 1 : 0);
  const era = fdiv(y >= 0 ? y : y - 399, 400);
  const yoe = y - era * 400;
  const doy = fdiv(153 * (m + (m > 2 ? -3 : 9)) + 2, 5) + d - 1;
  const doe = yoe * 365 + fdiv(yoe, 4) - fdiv(yoe, 100) + doy;
  return era * 146097 + doe - 719468;
}

/** 'YYYY-MM-DD' -> days since 1970-01-01. Throws on anything that is not a real calendar day. */
export function daysFromCivil(day: Day): number {
  const m = SHAPE.exec(day);
  if (!m) throw new Error(`not a calendar day: ${JSON.stringify(day)}`);
  const n = daysFromParts(Number(m[1]), Number(m[2]), Number(m[3]));
  if (civilFromDays(n) !== day) throw new Error(`not a calendar day: ${JSON.stringify(day)}`);
  return n;
}

/** days since 1970-01-01 -> 'YYYY-MM-DD'. */
export function civilFromDays(z0: number): Day {
  const z = z0 + 719468;
  const era = fdiv(z >= 0 ? z : z - 146096, 146097);
  const doe = z - era * 146097;
  const yoe = fdiv(doe - fdiv(doe, 1460) + fdiv(doe, 36524) - fdiv(doe, 146096), 365);
  const doy = doe - (365 * yoe + fdiv(yoe, 4) - fdiv(yoe, 100));
  const mp = fdiv(5 * doy + 2, 153);
  const d = doy - fdiv(153 * mp + 2, 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** R1: `day + n` calendar days (n may be negative). */
export function addDays(day: Day, n: number): Day {
  return civilFromDays(daysFromCivil(day) + n);
}

/** Signed difference `a - b` in calendar days (S3 `days_late`). */
export function diffDays(a: Day, b: Day): number {
  return daysFromCivil(a) - daysFromCivil(b);
}
