// GS-01..GS-15 copied from tools/golden_answers.py (same inputs, same expected values), plus the
// Rational unit rules of D-37 and the 106 rows of expected_grades.csv (task 1.8 / 1.9 acceptance).
import { describe, expect, it } from 'vitest';
import { addDays } from '@/graph/days';
import { categoriesText, gradeLearner, type Assignment, type Submission } from '@/grades/grade';
import { add, cmp, div, mul, rational, roundHalfUp, sub, toString } from '@/grades/rational';
import { letterFor, validateScheme, type Scheme } from '@/grades/scheme';
import { loadExpected, loadFixtures } from '../../scripts/lib/fixtures';

const fx = loadFixtures();
const SCHEME = new Map(fx.schemes.map((s) => [s.id, s]));
const STD = SCHEME.get('SCH-STD')!;
const LITE = SCHEME.get('SCH-LITE')!;
const BAD = SCHEME.get('SCH-BAD')!;
const SCH_G: Scheme = { ...STD, id: 'SCH-G', categories: STD.categories.map((c) => ({ ...c, drop_lowest: 0 })) };

// the golden assignment set A; days are 2026
const A: Assignment[] = [
  { code: 'HW1', category: 'HW', points_possible: 20, due_day: '2026-09-07', extra_credit: false },
  { code: 'HW2', category: 'HW', points_possible: 20, due_day: '2026-09-14', extra_credit: false },
  { code: 'HW3', category: 'HW', points_possible: 25, due_day: '2026-09-21', extra_credit: false },
  { code: 'QZ1', category: 'QZ', points_possible: 10, due_day: '2026-09-10', extra_credit: false },
  { code: 'QZ2', category: 'QZ', points_possible: 10, due_day: '2026-09-17', extra_credit: false },
  { code: 'PRJ1', category: 'PRJ', points_possible: 50, due_day: '2026-09-30', extra_credit: false },
  { code: 'FIN', category: 'FIN', points_possible: 100, due_day: '2026-10-05', extra_credit: false },
  { code: 'HWX', category: 'HW', points_possible: 10, due_day: '2026-09-26', extra_credit: true },
];
const DUE = new Map(A.map((a) => [a.code, a.due_day]));
const subs = (scores: Record<string, number>, late: Record<string, number> = {}): Map<string, Submission> =>
  new Map(Object.entries(scores).map(([k, v]) => [k, { score_hp: v, submitted_day: addDays(DUE.get(k)!, late[k] ?? 0) }]));
const ALL = (v: number): Record<string, number> => Object.fromEntries(['HW1', 'HW2', 'HW3', 'QZ1', 'QZ2', 'PRJ1', 'FIN'].map((k) => [k, v]));
const g = (scheme: Scheme, assignments: Assignment[], s: Map<string, Submission>) => {
  const r = gradeLearner(scheme, assignments, s);
  return [r.final_hp, r.letter, r.passed, r.exactText, r.flags] as const;
};

describe('Rational (D-37)', () => {
  it('reduces on construction, keeps den > 0, prints num/den', () => {
    expect(toString(rational(6, 4))).toBe('3/2');
    expect(toString(rational(-6, -4))).toBe('3/2');
    expect(toString(rational(6, -4))).toBe('-3/2');
    expect(toString(rational(0, 7))).toBe('0/1');
    expect(toString(rational(10000n))).toBe('10000/1');
  });
  it('never constructs from a non-integer number', () => {
    expect(() => rational(1.5)).toThrow(/must be an integer/);
    expect(() => rational(1, 0.5)).toThrow(/must be an integer/);
    expect(() => rational(Number.NaN)).toThrow(/must be an integer/);
    expect(() => rational(2 ** 53)).toThrow(/must be an integer/);
    expect(() => rational(1, 0)).toThrow(/zero denominator/);
  });
  it('arithmetic is exact', () => {
    const third = rational(1, 3);
    expect(toString(add(third, add(third, third)))).toBe('1/1');
    expect(toString(sub(rational(1, 10), rational(1, 10)))).toBe('0/1');
    expect(toString(mul(rational(2, 3), rational(3, 4)))).toBe('1/2');
    expect(toString(div(rational(1, 3), rational(2, 9)))).toBe('3/2');
    expect(cmp(rational(1, 3), rational(3333, 10000))).toBe(1);
  });
  it('roundHalfUp: 6999.5 → 7000, 6999.2 → 6999, 0.5 → 1, exact integers unchanged', () => {
    expect(roundHalfUp(rational(13999, 2))).toBe(7000n);
    expect(roundHalfUp(rational(34996, 5))).toBe(6999n);
    expect(roundHalfUp(rational(1, 2))).toBe(1n);
    expect(roundHalfUp(rational(7, 1))).toBe(7n);
    expect(() => roundHalfUp(rational(-1, 2))).toThrow(/negative/);
  });
});

describe('GS gradebook goldens', () => {
  it('GS-01 all 100.00 on time', () => expect(g(STD, A, subs(ALL(10000)))).toEqual([10000, 'A', true, '10000/1', ['DROPPED:HW:HW1', 'DROPPED:QZ:QZ1']]));
  it('GS-02 all 80.00: drop ties → smallest code', () => expect(g(STD, A, subs(ALL(8000)))).toEqual([8000, 'B', true, '8000/1', ['DROPPED:HW:HW1', 'DROPPED:QZ:QZ1']]));
  it('GS-03 trap: tie at 70.00 on 20 vs 25 points drops HW1 (9233, not 9250)', () =>
    expect(g(STD, A, subs({ ...ALL(10000), HW1: 7000, HW2: 8000, HW3: 7000 }))).toEqual([9233, 'A', true, '27700/3', ['DROPPED:HW:HW1', 'DROPPED:QZ:QZ1']]));
  it('GS-04 late 2d and 3d at 10.00/day', () =>
    expect(g(STD, A, subs({ ...ALL(10000), HW1: 9000, HW2: 9000, HW3: 9000 }, { HW1: 2, HW2: 3 }))).toEqual([9433, 'A', true, '28300/3', ['DROPPED:HW:HW2', 'DROPPED:QZ:QZ1', 'LATE:HW1:2d', 'LATE:HW2:3d']]));
  it('GS-05 late beyond max_days: 9d capped at 5d', () => expect(g(SCH_G, A, subs({ ...ALL(10000), HW1: 9000 }, { HW1: 9 }))).toEqual([9446, 'A', true, '122800/13', ['LATE:HW1:9d']]));
  it('GS-06 trap: 35.00 − 50.00 floors at 0', () =>
    expect(g(SCH_G, A, subs({ ...ALL(10000), HW1: 3500 }, { HW1: 6 }))).toEqual([9077, 'A', true, '118000/13', ['LATE:HW1:6d', 'PENALTY_FLOORED:HW1']]));
  it('GS-07 missing = ZERO', () =>
    expect(g(STD, A, subs({ HW2: 8000, HW3: 8000, PRJ1: 8000, FIN: 8000 }))).toEqual([6400, 'D', false, '6400/1', ['DROPPED:HW:HW1', 'DROPPED:QZ:QZ1', 'MISSING_ZERO:HW1', 'MISSING_ZERO:QZ1', 'MISSING_ZERO:QZ2']]));
  it('GS-08 missing = EXCLUDE empties PART; weight redistributed over ASG+FIN', () => {
    const AL: Assignment[] = [
      { code: 'PART', category: 'PART', points_possible: 10, due_day: '2026-10-13', extra_credit: false },
      { code: 'A1', category: 'ASG', points_possible: 10, due_day: '2026-09-15', extra_credit: false },
      { code: 'A2', category: 'ASG', points_possible: 10, due_day: '2026-09-20', extra_credit: false },
      { code: 'A3', category: 'ASG', points_possible: 10, due_day: '2026-09-25', extra_credit: false },
      { code: 'A4', category: 'ASG', points_possible: 15, due_day: '2026-09-30', extra_credit: false },
      { code: 'A5', category: 'ASG', points_possible: 15, due_day: '2026-10-05', extra_credit: false },
      { code: 'FIN', category: 'FIN', points_possible: 100, due_day: '2026-10-13', extra_credit: false },
    ];
    const sl = new Map(Object.entries({ A1: 6000, A2: 7000, A3: 8000, A4: 9000, A5: 10000, FIN: 7500 }).map(([k, v]) => [k, { score_hp: v, submitted_day: AL.find((a) => a.code === k)!.due_day }]));
    expect(g(LITE, AL, sl)).toEqual([8403, 'B', true, '75625/9', ['DROPPED:ASG:A1+A2', 'EMPTY_CATEGORY:PART']]);
  });
  it('GS-09 trap: a category with no assignments is redistributed (9000, not 7200)', () =>
    expect(g(STD, A.filter((a) => a.category !== 'PRJ'), subs(Object.fromEntries(['HW1', 'HW2', 'HW3', 'QZ1', 'QZ2', 'FIN'].map((k) => [k, 9000]))))).toEqual([9000, 'A', true, '9000/1', ['DROPPED:HW:HW1', 'DROPPED:QZ:QZ1', 'EMPTY_CATEGORY:PRJ']]));
  it('GS-10 extra credit under the cap', () => expect(g(STD, A, subs({ ...ALL(9000), HWX: 2000 }))).toEqual([9133, 'A', true, '27400/3', ['DROPPED:HW:HW1', 'DROPPED:QZ:QZ1']]));
  it('GS-11 trap: extra credit capped at +3.00', () => expect(g(STD, A, subs({ ...ALL(9000), HWX: 10000 }))).toEqual([9300, 'A', true, '9300/1', ['DROPPED:HW:HW1', 'DROPPED:QZ:QZ1', 'EC_CAPPED']]));
  it('GS-12 missing extra credit is never a zero', () => expect(g(STD, A, subs(ALL(9000)))).toEqual([9000, 'A', true, '9000/1', ['DROPPED:HW:HW1', 'DROPPED:QZ:QZ1']]));
  it('GS-13 boundary: exact 6999.5 → 7000 PASS C', () => expect(g(SCH_G, A, subs({ ...ALL(7000), PRJ1: 7005, FIN: 6995 }))).toEqual([7000, 'C', true, '13999/2', []]));
  it('GS-14 boundary: exact 6999.2 → 6999 FAIL D', () => expect(g(SCH_G, A, subs({ ...ALL(7000), PRJ1: 7005, FIN: 6994 }))).toEqual([6999, 'D', false, '34996/5', []]));
  it('GS-15 scheme publish and letter bands', () => {
    const v = validateScheme(BAD);
    expect(v.result).toBe('REJECT:WEIGHTS_SUM');
    expect(v.errors).toEqual([{ code: 'WEIGHTS_SUM', detail: 'weights sum to 9900, not 10000' }]);
    expect(validateScheme(STD).result).toBe('ACCEPT');
    expect(validateScheme(LITE).result).toBe('ACCEPT');
    expect([8999, 9000, 7000, 6999, 6000, 5999, 0].map((x) => letterFor(x, STD.bands))).toEqual(['B', 'A', 'C', 'D', 'D', 'F', 'F']);
  });
  it('S1 catches every other scheme defect with the oracle codes, sorted', () => {
    const v = validateScheme({
      ...STD,
      categories: [
        { code: 'A', weight_bp: 5000, drop_lowest: -1 },
        { code: 'A', weight_bp: 0, drop_lowest: 0 },
        { code: 'B', weight_bp: 5000, drop_lowest: 0 },
      ],
      bands: [{ min_hp: 5000, letter: 'P' }, { min_hp: 6000, letter: 'Q' }, { min_hp: 10, letter: 'F' }],
      pass_threshold_hp: 10001,
      missing: 'MAYBE' as 'ZERO',
    });
    expect(v.errors.map((e) => e.code)).toEqual(['BANDS_FLOOR', 'BANDS_ORDER', 'CATEGORY_DUP', 'DROP_NEGATIVE', 'MISSING_FLAG', 'PASS_RANGE', 'WEIGHT_NONPOSITIVE']);
    expect(v.result).toBe('REJECT:BANDS_FLOOR');
  });
  it('no graded work at all → 0, F, NO_GRADED_WORK, every category empty', () => {
    const r = gradeLearner(LITE, [], new Map());
    expect([r.final_hp, r.letter, r.passed, r.exactText]).toEqual([0, 'F', false, '0/1']);
    expect(r.flags).toEqual(['EMPTY_CATEGORY:ASG', 'EMPTY_CATEGORY:FIN', 'EMPTY_CATEGORY:PART', 'NO_GRADED_WORK']);
  });
  it('an assignment in an unknown category is a data error, not a grade', () => {
    expect(() => gradeLearner(STD, [{ code: 'X', category: 'NOPE', points_possible: 1, due_day: '2026-01-01', extra_credit: false }], new Map())).toThrow(/unknown category/);
  });
});

describe('expected_grades.csv: 4 graded cohorts, 106 learners', () => {
  it('final_hp, letter, passed, exact, categories, flags: 0 diffs; pass 67 / fail 39', () => {
    const byCohortAsg = new Map<string, Assignment[]>();
    for (const a of fx.assignments) {
      const l = byCohortAsg.get(a.cohort) ?? [];
      l.push({ code: a.assignment, category: a.category, points_possible: a.points_possible, due_day: a.due_day, extra_credit: a.extra_credit });
      byCohortAsg.set(a.cohort, l);
    }
    const subsBy = new Map<string, Map<string, Submission>>();
    for (const s of fx.submissions) {
      const k = `${s.cohort}\u0000${s.learner_id}`;
      const m = subsBy.get(k) ?? new Map<string, Submission>();
      m.set(s.assignment, { score_hp: s.score_hp, submitted_day: s.submitted_day });
      subsBy.set(k, m);
    }
    const got: string[] = [];
    let pass = 0;
    for (const co of fx.cohorts) {
      if (!co.scheme) continue;
      const scheme = SCHEME.get(co.scheme)!;
      for (const e of co.enrolled) {
        const r = gradeLearner(scheme, byCohortAsg.get(co.id) ?? [], subsBy.get(`${co.id}\u0000${e.learner_id}`) ?? new Map());
        if (r.passed) pass++;
        got.push([co.id, e.learner_id, scheme.id, r.final_hp, r.letter, r.passed ? 'true' : 'false', r.exactText, categoriesText(r), r.flags.join(';')].join('|'));
      }
    }
    const want = loadExpected(fx.dir, 'expected_grades.csv').map((r) => [r.cohort, r.learner_id, r.scheme, r.final_hp, r.letter, r.passed, r.exact, r.categories, r.flags].join('|'));
    expect(got).toEqual(want);
    expect(got).toHaveLength(106);
    expect(pass).toBe(67);
  });
});
