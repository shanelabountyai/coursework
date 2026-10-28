/**
 * Grade schemes as data and the S1 publish check. Weights are basis points summing to exactly 10000;
 * letter bands are scheme data (S9, D-29). Written from `docs/domain-brief.md` §6.
 */

export interface Category {
  code: string;
  name?: string;
  weight_bp: number;
  drop_lowest: number;
}
export interface LateRule {
  per_day_hp: number;
  max_days: number;
}
export interface Band {
  min_hp: number;
  letter: string;
}
export type MissingRule = 'ZERO' | 'EXCLUDE';
export interface Scheme {
  id: string;
  title?: string;
  status?: string;
  categories: Category[];
  late: LateRule;
  extra_credit_cap_hp: number;
  pass_threshold_hp: number;
  missing: MissingRule;
  bands: Band[];
}

export type SchemeErrorCode = 'WEIGHTS_SUM' | 'CATEGORY_DUP' | 'WEIGHT_NONPOSITIVE' | 'DROP_NEGATIVE' | 'BANDS_FLOOR' | 'BANDS_ORDER' | 'PASS_RANGE' | 'MISSING_FLAG';
export interface SchemeError {
  code: SchemeErrorCode;
  detail: string;
}
export interface SchemeCheck {
  result: 'ACCEPT' | `REJECT:${SchemeErrorCode}`;
  errors: SchemeError[];
  weights_bp: number;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** S1. Errors sorted by (code, detail) like the oracle's `errors.sort()`; the headline is the first. */
export function validateScheme(scheme: Scheme): SchemeCheck {
  const errors: SchemeError[] = [];
  let total = 0;
  for (const c of scheme.categories) total += c.weight_bp;
  if (total !== 10000) errors.push({ code: 'WEIGHTS_SUM', detail: `weights sum to ${total}, not 10000` });
  const codes = scheme.categories.map((c) => c.code);
  if (new Set(codes).size !== codes.length) errors.push({ code: 'CATEGORY_DUP', detail: 'duplicate category code' });
  for (const c of scheme.categories) {
    if (!Number.isInteger(c.weight_bp) || c.weight_bp <= 0) errors.push({ code: 'WEIGHT_NONPOSITIVE', detail: c.code });
    if (!Number.isInteger(c.drop_lowest) || c.drop_lowest < 0) errors.push({ code: 'DROP_NEGATIVE', detail: c.code });
  }
  const bands = scheme.bands;
  if (!bands.length || bands[bands.length - 1]!.min_hp !== 0) errors.push({ code: 'BANDS_FLOOR', detail: 'last band must start at 0' });
  for (let i = 0; i + 1 < bands.length; i++) {
    if (bands[i]!.min_hp <= bands[i + 1]!.min_hp) errors.push({ code: 'BANDS_ORDER', detail: `${bands[i]!.letter} <= ${bands[i + 1]!.letter}` });
  }
  if (!(scheme.pass_threshold_hp >= 0 && scheme.pass_threshold_hp <= 10000)) errors.push({ code: 'PASS_RANGE', detail: String(scheme.pass_threshold_hp) });
  if (scheme.missing !== 'ZERO' && scheme.missing !== 'EXCLUDE') errors.push({ code: 'MISSING_FLAG', detail: String(scheme.missing) });
  errors.sort((a, b) => cmp(a.code, b.code) || cmp(a.detail, b.detail));
  return { result: errors.length ? `REJECT:${errors[0]!.code}` : 'ACCEPT', errors, weights_bp: total };
}

/** S9: the first band whose min_hp ≤ final_hp, bands descending; the last band otherwise. */
export function letterFor(finalHp: number, bands: readonly Band[]): string {
  for (const b of bands) if (finalHp >= b.min_hp) return b.letter;
  return bands[bands.length - 1]!.letter;
}
