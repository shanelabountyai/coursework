// GG-20 drip verdicts and the 2,051 rows of expected_drip.csv (1,885 / 154 / 12).
import { describe, expect, it } from 'vitest';
import { checkItemCompletion, courseProgressBp, releaseDay, type Cohort } from '@/graph/drip';
import { loadExpected, loadFixtures } from '../../scripts/lib/fixtures';

const cohort: Cohort = { id: 'C-X', course: 'ACC-101', start_day: '2026-08-31', scheme: null, items: [{ code: 'A01', offset_days: 3 }], enrolled: [{ learner_id: 'L-A', status: 'IN_PROGRESS' }] };
const cohorts = new Map([[cohort.id, cohort]]);
const enrolled = (l: string, c: string) => l === 'L-A' && c === 'C-X';
const ev = (learner: string, day: string, item = 'A01') => ({ learner, cohort: 'C-X', item, day });

describe('R1–R3 drip', () => {
  it('GG-20: the day before release is refused, the release day accepted, a stranger refused', () => {
    expect(checkItemCompletion(ev('L-A', '2026-09-02'), cohorts, enrolled)).toBe('REJECT:NOT_RELEASED');
    expect(checkItemCompletion(ev('L-A', '2026-09-03'), cohorts, enrolled)).toBe('ACCEPT');
    expect(checkItemCompletion(ev('L-Z', '2026-09-03'), cohorts, enrolled)).toBe('REJECT:NOT_ENROLLED');
  });
  it('R3 order: enrollment before item before release; an unknown cohort is NOT_ENROLLED', () => {
    expect(checkItemCompletion(ev('L-Z', '2026-01-01', 'NOPE'), cohorts, enrolled)).toBe('REJECT:NOT_ENROLLED');
    expect(checkItemCompletion(ev('L-A', '2026-01-01', 'NOPE'), cohorts, enrolled)).toBe('REJECT:UNKNOWN_ITEM');
    expect(checkItemCompletion({ ...ev('L-A', '2026-09-03'), cohort: 'C-GONE' }, cohorts, enrolled)).toBe('REJECT:NOT_ENROLLED');
    expect(releaseDay(cohort, 'A01')).toBe('2026-09-03');
  });
  it('P1 course progress is floor(bp)', () => {
    expect(courseProgressBp(4, 9)).toBe(4444);
    expect(courseProgressBp(9, 9)).toBe(10000);
    expect(courseProgressBp(0, 9)).toBe(0);
    expect(() => courseProgressBp(0, 0)).toThrow();
  });
});

describe('expected_drip.csv', () => {
  it('2,051 verdicts: ACCEPT 1,885, NOT_RELEASED 154, NOT_ENROLLED 12; 0 diffs', () => {
    const fx = loadFixtures();
    const byId = new Map(fx.cohorts.map((c) => [c.id, c]));
    const enrolledSet = new Set(fx.cohorts.flatMap((c) => c.enrolled.map((e) => `${e.learner_id}\u0000${c.id}`)));
    const isEnrolled = (l: string, c: string) => enrolledSet.has(`${l}\u0000${c}`);
    const counts = new Map<string, number>();
    const got = fx.itemEvents.map((e) => {
      const v = checkItemCompletion({ learner: e.learner_id, cohort: e.cohort, item: e.item, day: e.day }, byId, isEnrolled);
      counts.set(v, (counts.get(v) ?? 0) + 1);
      return `${e.event_id},${v}`;
    });
    const want = loadExpected(fx.dir, 'expected_drip.csv').map((r) => `${r.event_id},${r.verdict}`);
    expect(got).toEqual(want);
    expect(got).toHaveLength(2051);
    expect(Object.fromEntries(counts)).toEqual({ ACCEPT: 1885, 'REJECT:NOT_RELEASED': 154, 'REJECT:NOT_ENROLLED': 12 });
  });
});
