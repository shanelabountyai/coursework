/**
 * The gradebook (S2–S9, D-23..D-29). Scores are integer hp (hundredths of a percent), weights bp,
 * every intermediate an exact Rational, and the final grade rounded half-up exactly once. Written
 * from `docs/domain-brief.md` §6 and checked against `courselib.grade_learner` on 106 fixture rows.
 */
import { diffDays, type Day } from '../graph/days';
import { add, cmp, min, mul, rational, roundHalfUp, toBig, toSafeInteger, toString, ZERO, type Rational } from './rational';
import { letterFor, type LateRule, type Scheme } from './scheme';

export interface Assignment {
  code: string;
  category: string;
  points_possible: number;
  due_day: Day;
  extra_credit: boolean;
}
export interface Submission {
  score_hp: number;
  submitted_day: Day;
}

export type Flag =
  | `MISSING_ZERO:${string}`
  | `LATE:${string}:${number}d`
  | `PENALTY_FLOORED:${string}`
  | `DROPPED:${string}:${string}`
  | `EMPTY_CATEGORY:${string}`
  | 'EC_CAPPED'
  | 'NO_GRADED_WORK';

export interface Grade {
  final_hp: number;
  letter: string;
  passed: boolean;
  /** Sorted (code-point order), the oracle's `sorted(flags)`. */
  flags: Flag[];
  /** The unrounded final, clamped to [0, 10000]. */
  exact: Rational;
  exactText: string;
  /** category code → ratio, or null when the category is empty (S6). Insertion order = scheme order. */
  categories: Map<string, Rational | null>;
}

const HP_SCALE = 10000n;

/** S3: penalty = min(days_late, max_days) × per_day_hp subtracted from the score, floored at 0. */
export function lateAdjustedHp(scoreHp: number, dueDay: Day, submittedDay: Day, late: LateRule): { adjusted: bigint; daysLate: number } {
  const score = toBig(scoreHp, 'score_hp');
  const daysLate = diffDays(submittedDay, dueDay);
  if (daysLate <= 0) return { adjusted: score, daysLate: 0 };
  const penalty = toBig(daysLate < late.max_days ? daysLate : late.max_days, 'days late') * toBig(late.per_day_hp, 'per_day_hp');
  const adjusted = score - penalty;
  return { adjusted: adjusted < 0n ? 0n : adjusted, daysLate };
}

interface Row {
  code: string;
  possible: bigint;
  adj: bigint;
  extra: boolean;
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** earned points = possible × adjusted_hp / 10000 (S2), exact. */
function earned(r: Row): Rational {
  return rational(r.possible * r.adj, HP_SCALE);
}

/**
 * S2–S9 for one learner. `submissions` maps assignment code → submission; absent = missing (S4).
 * Throws on an assignment in a category the scheme does not have: that is a data error, not a grade.
 */
export function gradeLearner(scheme: Scheme, assignments: readonly Assignment[], submissions: ReadonlyMap<string, Submission>): Grade {
  const flags: Flag[] = [];
  const byCat = new Map<string, Row[]>(scheme.categories.map((c) => [c.code, []]));
  for (const a of [...assignments].sort((x, y) => cmpStr(x.code, y.code))) {
    const rows = byCat.get(a.category);
    if (!rows) throw new Error(`assignment ${a.code} in unknown category ${a.category}`);
    const sub = submissions.get(a.code);
    let adj: bigint;
    if (sub === undefined) {
      if (a.extra_credit || scheme.missing === 'EXCLUDE') continue; // S4: excluded; missing extra credit is never a zero
      adj = 0n;
      flags.push(`MISSING_ZERO:${a.code}`);
    } else {
      const r = lateAdjustedHp(sub.score_hp, a.due_day, sub.submitted_day, scheme.late);
      adj = r.adjusted;
      if (r.daysLate > 0) {
        flags.push(`LATE:${a.code}:${r.daysLate}d`);
        if (adj === 0n && sub.score_hp > 0) flags.push(`PENALTY_FLOORED:${a.code}`);
      }
    }
    rows.push({ code: a.code, possible: toBig(a.points_possible, 'points_possible'), adj, extra: a.extra_credit });
  }

  // S5 + S6 per category: ratio over kept regular work (points-weighted), null when empty
  const categoryRatio = (rows: Row[], dropN: number, withEc: boolean): { ratio: Rational; dropped: string[] } | null => {
    const regular = rows.filter((r) => !r.extra).sort((x, y) => (x.adj < y.adj ? -1 : x.adj > y.adj ? 1 : cmpStr(y.code, x.code))); // THROWAWAY for task twelve: tie order flipped on purpose, reverted next commit
    const dropped = regular.slice(0, dropN).map((r) => r.code);
    const kept = regular.slice(dropN);
    if (!kept.length) return null;
    let possible = 0n;
    let num = ZERO;
    for (const r of kept) {
      possible += r.possible;
      num = add(num, earned(r));
    }
    if (withEc) for (const r of rows) if (r.extra) num = add(num, earned(r)); // S7: numerator only
    return { ratio: mul(num, rational(1n, possible)), dropped };
  };

  const final = (withEc: boolean): { value: Rational; detail: Map<string, { ratio: Rational; dropped: string[] } | null> } => {
    const detail = new Map<string, { ratio: Rational; dropped: string[] } | null>();
    let num = ZERO;
    let den = 0n;
    for (const c of scheme.categories) {
      const r = categoryRatio(byCat.get(c.code)!, c.drop_lowest, withEc);
      detail.set(c.code, r);
      if (r === null) continue;
      num = add(num, mul(rational(toBig(c.weight_bp, 'weight_bp')), r.ratio));
      den += toBig(c.weight_bp, 'weight_bp');
    }
    if (den === 0n) return { value: ZERO, detail };
    return { value: mul(num, rational(HP_SCALE, den)), detail }; // S6: redistribute over non-empty categories
  };

  const base = final(false);
  const withEc = final(true);
  const cap = add(base.value, rational(toBig(scheme.extra_credit_cap_hp, 'extra_credit_cap_hp')));
  let exact = min(withEc.value, cap); // S7
  if (cmp(withEc.value, cap) > 0) flags.push('EC_CAPPED');
  exact = min(exact, rational(HP_SCALE));
  const categories = new Map<string, Rational | null>();
  for (const [code, d] of base.detail) {
    categories.set(code, d === null ? null : d.ratio);
    if (d === null) flags.push(`EMPTY_CATEGORY:${code}`);
    else if (d.dropped.length) flags.push(`DROPPED:${code}:${d.dropped.join('+')}`);
  }
  if ([...base.detail.values()].every((d) => d === null)) flags.push('NO_GRADED_WORK');
  const finalBig = roundHalfUp(exact); // S8: the one rounding
  const final_hp = toSafeInteger(finalBig, 'final_hp');
  return {
    final_hp,
    letter: letterFor(final_hp, scheme.bands),
    passed: final_hp >= scheme.pass_threshold_hp,
    flags: flags.sort(cmpStr),
    exact,
    exactText: toString(exact),
    categories,
  };
}

/** The oracle's `categories` column: `code=num/den` or `code=EMPTY`, `;`-joined in scheme order. */
export function categoriesText(g: Grade): string {
  return [...g.categories].map(([k, v]) => `${k}=${v === null ? 'EMPTY' : toString(v)}`).join(';');
}
