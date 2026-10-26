/**
 * Retroactive-block report (G9, D-19, V3): for an accepted edit, every IN_PROGRESS enrollment whose
 * learner is ELIGIBLE under the old version and BLOCKED under the new one is GRANDFATHERED with the
 * new missing set. Reported, never blocked; sorted by learner, course.
 */
import { eligibility, type LearnerState } from './eligibility';
import { cmpStr, courseMap, type Catalog, type Code } from './types';

export interface EnrollmentRef {
  learner: string;
  course: Code;
  cohort: string;
  status: string;
}
export interface Grandfathered {
  learner: string;
  course: Code;
  cohort: string;
  flag: 'GRANDFATHERED';
  missing: Code[];
}

export function retroactiveReport(oldCat: Catalog, newCat: Catalog, enrollments: readonly EnrollmentRef[], states: ReadonlyMap<string, LearnerState>): Grandfathered[] {
  const oldC = courseMap(oldCat);
  const newC = courseMap(newCat);
  const out: Grandfathered[] = [];
  const sorted = [...enrollments].sort((a, b) => cmpStr(a.learner, b.learner) || cmpStr(a.course, b.course));
  for (const e of sorted) {
    if (e.status !== 'IN_PROGRESS') continue;
    const o = oldC.get(e.course);
    const n = newC.get(e.course);
    if (!o || !n) continue;
    const st = states.get(e.learner);
    if (!st) throw new Error(`retroactiveReport: no state for learner ${e.learner}`);
    const sOld = eligibility(o, st);
    const sNew = eligibility(n, st);
    if (sOld.status === 'ELIGIBLE' && sNew.status === 'BLOCKED') out.push({ learner: e.learner, course: e.course, cohort: e.cohort, flag: 'GRANDFATHERED', missing: sNew.missing });
  }
  return out;
}
