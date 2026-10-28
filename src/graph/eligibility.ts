/**
 * Learner state, leaf satisfaction (G6), the minimal missing set (G7) and eligibility status.
 * Written from `docs/domain-brief.md` §4 (D-16, D-17); the tie rules are the oracle's so the
 * 10,800 rows of `expected_eligibility.csv` agree code for code.
 */
import { cmpList, cmpStr, type Code, type Course, type Equivalency, type Expr } from './types';

export type WaiverReason = 'TRANSFER_CREDIT' | 'PLACEMENT_TEST' | 'INSTRUCTOR_WAIVER' | 'PRIOR_LEARNING';
export const WAIVER_REASONS: readonly WaiverReason[] = ['TRANSFER_CREDIT', 'PLACEMENT_TEST', 'INSTRUCTOR_WAIVER', 'PRIOR_LEARNING'];

/** G6 reason strings: `PASSED` · `EQUIVALENT:<by>` · `WAIVER:<reason>`. */
export type Satisfaction = 'PASSED' | `EQUIVALENT:${Code}` | `WAIVER:${WaiverReason}`;

/** passed: codes with a PASS completion; waivers: leaf → reason; equivalencies: catalog data. Immutable once built. */
export class LearnerState {
  readonly passed: ReadonlySet<Code>;
  readonly waivers: ReadonlyMap<Code, WaiverReason>;
  private readonly equiv: ReadonlyMap<Code, readonly Code[]>;

  constructor(passed: Iterable<Code>, waivers: ReadonlyMap<Code, WaiverReason> | Record<Code, WaiverReason>, equivalencies: readonly Equivalency[]) {
    this.passed = new Set(passed);
    this.waivers = waivers instanceof Map ? new Map(waivers) : new Map(Object.entries(waivers));
    const eq = new Map<Code, Code[]>();
    for (const e of equivalencies) {
      const list = eq.get(e.satisfies) ?? [];
      list.push(e.by);
      eq.set(e.satisfies, list);
    }
    for (const list of eq.values()) list.sort(cmpStr);
    this.equiv = eq;
  }

  /** G6: PASSED > EQUIVALENT:<by> (by-courses tried in lexical order) > WAIVER:<reason>; null when unsatisfied. A FAIL satisfies nothing. */
  satisfied(leaf: Code): Satisfaction | null {
    if (this.passed.has(leaf)) return 'PASSED';
    for (const by of this.equiv.get(leaf) ?? []) if (this.passed.has(by)) return `EQUIVALENT:${by}`;
    const w = this.waivers.get(leaf);
    if (w !== undefined) return `WAIVER:${w}`;
    return null;
  }
}

/**
 * G7: the minimal missing set, always sorted. Leaf: [] or [leaf]. ALL: union of the children's.
 * ANY: [] if any child is satisfied; else the child's set with the fewest codes, ties by lexicographic
 * comparison of the sorted lists. Leaf-count, not depth (GG-13; O-4).
 */
export function missingSet(expr: Expr, state: LearnerState): Code[] {
  if (expr === null) return [];
  if (typeof expr === 'string') return state.satisfied(expr) ? [] : [expr];
  if ('all' in expr) {
    const out = new Set<Code>();
    for (const c of expr.all) for (const m of missingSet(c, state)) out.add(m);
    return [...out].sort(cmpStr);
  }
  let best: Code[] | null = null;
  for (const c of expr.any) {
    const m = missingSet(c, state);
    if (best === null || m.length < best.length || (m.length === best.length && cmpList(m, best) < 0)) best = m;
  }
  return best ?? [];
}

export type EligibilityStatus = 'UNAVAILABLE' | 'COMPLETED' | 'ELIGIBLE' | 'BLOCKED';
export interface Eligibility {
  status: EligibilityStatus;
  /** Empty unless BLOCKED. */
  missing: Code[];
}

/** G7 status precedence: UNAVAILABLE (not PUBLISHED) → COMPLETED (passed it) → ELIGIBLE → BLOCKED. */
export function eligibility(course: Course, state: LearnerState): Eligibility {
  if (course.status !== 'PUBLISHED') return { status: 'UNAVAILABLE', missing: [] };
  if (state.passed.has(course.code)) return { status: 'COMPLETED', missing: [] };
  const missing = missingSet(course.prereq, state);
  return missing.length ? { status: 'BLOCKED', missing } : { status: 'ELIGIBLE', missing: [] };
}
