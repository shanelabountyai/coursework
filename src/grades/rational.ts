/**
 * Exact rationals for the gradebook (D-23, D-37): `{ num: bigint; den: bigint }`, den > 0, reduced by
 * gcd on construction, frozen. Constructed only from bigint or from a number that is a safe integer;
 * anything else throws. The one rounding in the gradebook, `roundHalfUp`, is `floor((2·num + den) / (2·den))`
 * for a non-negative value, as `courselib.round_half_up`. No float enters or leaves this module except
 * `toSafeInteger`, which refuses anything that is not an integer that fits.
 */

export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function toBig(x: bigint | number, what = 'value'): bigint {
  if (typeof x === 'bigint') return x;
  if (typeof x === 'number' && Number.isSafeInteger(x)) return BigInt(x);
  throw new Error(`Rational: ${what} must be an integer, got ${String(x)} (D-23)`);
}

/** Build num/den reduced, den > 0. */
export function rational(num: bigint | number, den: bigint | number = 1n): Rational {
  let n = toBig(num, 'numerator');
  let d = toBig(den, 'denominator');
  if (d === 0n) throw new Error('Rational: zero denominator');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  if (g > 1n) {
    n /= g;
    d /= g;
  }
  return Object.freeze({ num: n, den: d });
}

export const ZERO: Rational = rational(0n);

export function add(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den + b.num * a.den, a.den * b.den);
}
export function sub(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den - b.num * a.den, a.den * b.den);
}
export function mul(a: Rational, b: Rational): Rational {
  return rational(a.num * b.num, a.den * b.den);
}
export function div(a: Rational, b: Rational): Rational {
  if (b.num === 0n) throw new Error('Rational: division by zero');
  return rational(a.num * b.den, a.den * b.num);
}
/** -1, 0, 1 */
export function cmp(a: Rational, b: Rational): number {
  const l = a.num * b.den;
  const r = b.num * a.den;
  return l < r ? -1 : l > r ? 1 : 0;
}
export function min(a: Rational, b: Rational): Rational {
  return cmp(a, b) <= 0 ? a : b;
}
export function max(a: Rational, b: Rational): Rational {
  return cmp(a, b) >= 0 ? a : b;
}
export function equals(a: Rational, b: Rational): boolean {
  return a.num === b.num && a.den === b.den;
}

/** S8: round a non-negative rational to the nearest integer, halves up. */
export function roundHalfUp(x: Rational): bigint {
  if (x.num < 0n) throw new Error('roundHalfUp: negative value');
  return (x.num * 2n + x.den) / (x.den * 2n); // bigint division truncates, which is floor for non-negative values
}

/** `num/den`, the oracle's text form (an integer prints as `n/1`). */
export function toString(x: Rational): string {
  return `${x.num}/${x.den}`;
}

/** A bigint that fits a JS integer, for the hp values the engine returns; throws otherwise rather than losing a digit. */
export function toSafeInteger(x: bigint, what = 'value'): number {
  if (x > BigInt(Number.MAX_SAFE_INTEGER) || x < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${what} ${x} does not fit a safe integer`);
  return Number(x);
}
