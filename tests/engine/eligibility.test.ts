// GG-10..GG-15 and the task 1.6 acceptance: 10,800 rows of expected_eligibility.csv, 0 diffs.
import { describe, expect, it } from 'vitest';
import { eligibility, LearnerState, missingSet } from '@/graph/eligibility';
import { leaves } from '@/graph/expr';
import { courseMap } from '@/graph/types';
import { learnerStates, loadExpected, loadFixtures } from '../../scripts/lib/fixtures';

const fx = loadFixtures();
const COURSE = courseMap(fx.catalog);
const EQ = fx.catalog.equivalencies;
const state = (passed: string[] = [], waivers: Record<string, 'PLACEMENT_TEST' | 'TRANSFER_CREDIT' | 'INSTRUCTOR_WAIVER' | 'PRIOR_LEARNING'> = {}) => new LearnerState(passed, waivers, EQ);
const elig = (code: string, s: LearnerState) => {
  const e = eligibility(COURSE.get(code)!, s);
  return [e.status, e.missing] as const;
};

describe('G6 satisfaction and G7 missing set', () => {
  it('GG-10 trap: a waiver satisfies one ANY branch; the other branch is not reported', () => {
    const s = state(['DAT-102'], { 'DAT-101': 'PLACEMENT_TEST' });
    expect(elig('DAT-202', s)).toEqual(['ELIGIBLE', []]);
    expect(s.satisfied('DAT-101')).toBe('WAIVER:PLACEMENT_TEST');
  });
  it('GG-11: nothing passed → DAT-202 minimal missing, ANY tie 1 vs 1 → lexical', () => {
    expect(elig('DAT-202', state())).toEqual(['BLOCKED', ['DAT-101', 'DAT-102']]);
  });
  it('GG-12: ACC-302', () => {
    expect(elig('ACC-302', state(['ACC-201', 'MGT-201']))).toEqual(['ELIGIBLE', []]);
    expect(elig('ACC-302', state(['ACC-201']))).toEqual(['BLOCKED', ['ACC-202']]);
  });
  it('GG-13: leaf count, not depth; ALL unions', () => {
    expect(elig('DAT-302', state(['DAT-301', 'MGT-101']))).toEqual(['BLOCKED', ['ACC-201']]);
    expect(elig('DAT-401', state())).toEqual(['BLOCKED', ['DAT-202', 'DAT-302']]);
  });
  it('GG-14 trap: retired ACC-100 satisfies ACC-101 by equivalency, but not ACC-102', () => {
    const s = state(['ACC-100']);
    expect(elig('ACC-202', s)).toEqual(['ELIGIBLE', []]);
    expect(s.satisfied('ACC-101')).toBe('EQUIVALENT:ACC-100');
    expect(elig('ACC-201', s)).toEqual(['BLOCKED', ['ACC-102']]);
  });
  it('GG-15: COMPLETED outranks ELIGIBLE; a DRAFT course is UNAVAILABLE even with its prerequisite met', () => {
    expect(elig('ACC-101', state(['ACC-101']))).toEqual(['COMPLETED', []]);
    expect(elig('DAT-303', state(['DAT-301']))).toEqual(['UNAVAILABLE', []]);
  });
  it('precedence PASSED > EQUIVALENT > WAIVER; a FAIL satisfies nothing', () => {
    const s = new LearnerState(['ACC-101', 'ACC-100'], { 'ACC-101': 'TRANSFER_CREDIT' }, EQ);
    expect(s.satisfied('ACC-101')).toBe('PASSED');
    const t = new LearnerState(['ACC-100'], { 'ACC-101': 'TRANSFER_CREDIT' }, EQ);
    expect(t.satisfied('ACC-101')).toBe('EQUIVALENT:ACC-100');
    expect(t.satisfied('ZZZ')).toBeNull();
  });
  it('ANY tie at equal size and equal lists: the ALL branch with fewer missing wins over a bigger one', () => {
    expect(missingSet({ any: [{ all: ['A', 'B', 'C'] }, { all: ['B', 'D'] }] }, state())).toEqual(['B', 'D']);
    expect(missingSet({ any: [{ all: ['A', 'Z'] }, { all: ['A', 'B'] }] }, state())).toEqual(['A', 'B']);
    expect(missingSet(null, state())).toEqual([]);
  });
});

describe('expected_eligibility.csv: 300 learners x 36 published courses', () => {
  it('10,800 rows, 0 diffs, including non_pass_satisfactions', () => {
    const states = learnerStates(fx);
    const published = [...COURSE.keys()].sort().filter((c) => COURSE.get(c)!.status === 'PUBLISHED');
    const got: string[] = [];
    for (const l of fx.learners) {
      const st = states.get(l.learner_id)!;
      for (const code of published) {
        const e = eligibility(COURSE.get(code)!, st);
        const sat: string[] = [];
        for (const leaf of leaves(COURSE.get(code)!.prereq)) {
          const r = st.satisfied(leaf);
          if (r && r !== 'PASSED') sat.push(`${leaf}=${r}`);
        }
        got.push([l.learner_id, code, e.status, e.missing.join('+'), sat.join('+')].join(','));
      }
    }
    const want = loadExpected(fx.dir, 'expected_eligibility.csv').map((r) => [r.learner_id, r.course, r.status, r.missing, r.non_pass_satisfactions].join(','));
    expect(got.length).toBe(10800);
    expect(want.length).toBe(10800);
    let diffs = 0;
    for (let i = 0; i < want.length; i++) if (got[i] !== want[i]) diffs++;
    if (diffs) expect(got).toEqual(want);
    expect(diffs).toBe(0);
  });
});
