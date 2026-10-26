// GG-16..GG-19 and the task 1.7 acceptance: 300 rows of expected_progress.csv (path_len, path, next)
// and expected_edits.csv grandfathered counts 17 / 6 / 0 / 0.
import { describe, expect, it } from 'vitest';
import { LearnerState } from '@/graph/eligibility';
import { certificateProgress, shortestPath } from '@/graph/path';
import { applyEdit, validateCatalog } from '@/graph/publish';
import { retroactiveReport, type EnrollmentRef } from '@/graph/retro';
import { learnerStates, loadExpected, loadFixtures } from '../../scripts/lib/fixtures';

const fx = loadFixtures();
const CERT = new Map(fx.catalog.certificates.map((c) => [c.code, c]));
const EDIT = new Map(fx.edits.map((e) => [e.id, e]));
const state = (passed: string[] = []) => new LearnerState(passed, {}, fx.catalog.equivalencies);
const path = (cert: string, passed: string[] = []) => shortestPath(fx.catalog, CERT.get(cert)!, state(passed)).path;

describe('G8 shortest path', () => {
  it('GG-16: CERT-BOOK from nothing', () => {
    expect(path('CERT-BOOK')).toEqual(['ACC-101', 'ACC-102', 'ACC-201', 'ACC-202']);
  });
  it('GG-17 trap: CERT-DATA-ADV from nothing is 9 courses and the ACC branch wins the 9-vs-9 tie lexically', () => {
    expect(path('CERT-DATA-ADV')).toEqual(['ACC-101', 'ACC-102', 'ACC-201', 'DAT-102', 'DAT-201', 'DAT-202', 'DAT-301', 'DAT-302', 'DAT-401']);
    expect(path('CERT-DATA-ADV', ['MGT-101', 'MGT-202'])).toEqual(['ACC-102', 'DAT-102', 'DAT-201', 'DAT-202', 'DAT-301', 'DAT-302', 'DAT-401']);
    expect(shortestPath(fx.catalog, CERT.get('CERT-DATA-ADV')!, state()).combinations).toBe(16);
  });
  it('GG-18: CERT-ANALYST with DAT-101 + DAT-102', () => {
    expect(path('CERT-ANALYST', ['DAT-101', 'DAT-102'])).toEqual(['DAT-201', 'DAT-202', 'DAT-301']);
  });
  it('a complete certificate has an empty path and one combination', () => {
    const r = shortestPath(fx.catalog, CERT.get('CERT-BOOK')!, state(['ACC-101', 'ACC-102', 'ACC-201', 'ACC-202']));
    expect(r.path).toEqual([]);
    expect(certificateProgress(CERT.get('CERT-BOOK')!, state(['ACC-101', 'ACC-102', 'ACC-201']))).toEqual({ required: 4, satisfied: 3, progress_bp: 7500 });
  });
  it('refuses more than 4,096 combinations (D-18)', () => {
    const big = structuredClone(fx.catalog);
    const codes = big.courses.map((c) => c.code);
    const prereq = { all: Array.from({ length: 13 }, (_, i) => ({ any: [codes[i]!, codes[i + 1]!] })) }; // 2^13 here plus the referenced courses' own ANY groups in the cone = 2^16
    big.courses.push({ code: 'ZZZ-999', title: 'wide', status: 'PUBLISHED', prereq });
    expect(() => shortestPath(big, { code: 'CERT-WIDE', title: 'w', courses: ['ZZZ-999'] }, state())).toThrow(/^CERT-WIDE: 65536 branch combinations; shrink the cone/);
  });
});

describe('G9 grandfather report', () => {
  it('GG-19: E-04 reports only the in-progress learner who loses eligibility', () => {
    const enr: EnrollmentRef[] = [
      { learner: 'L-A', course: 'WRT-202', cohort: 'C-WRT202-F26', status: 'IN_PROGRESS' },
      { learner: 'L-B', course: 'WRT-202', cohort: 'C-WRT202-F26', status: 'IN_PROGRESS' },
      { learner: 'L-C', course: 'WRT-202', cohort: 'C-WRT202-F26', status: 'COMPLETED' },
    ];
    const states = new Map([
      ['L-A', state(['WRT-101'])],
      ['L-B', state(['WRT-101', 'DAT-101'])],
      ['L-C', state(['WRT-101', 'WRT-202'])],
    ]);
    expect(retroactiveReport(fx.catalog, applyEdit(fx.catalog, EDIT.get('E-04')!), enr, states)).toEqual([
      { learner: 'L-A', course: 'WRT-202', cohort: 'C-WRT202-F26', flag: 'GRANDFATHERED', missing: ['DAT-101'] },
    ]);
  });
  it('expected_edits.csv: grandfathered 17 (E-04), 6 (E-11), 0 (E-07), 0 (E-15), and the learner lists', () => {
    const states = learnerStates(fx);
    const enrollments: EnrollmentRef[] = fx.cohorts.flatMap((co) => co.enrolled.map((e) => ({ learner: e.learner_id, course: co.course, cohort: co.id, status: e.status })));
    const want = new Map(loadExpected(fx.dir, 'expected_edits.csv').map((r) => [r.edit_id!, r]));
    const counts: Record<string, number> = {};
    for (const e of fx.edits) {
      const next = applyEdit(fx.catalog, e);
      const v = validateCatalog(next);
      const g = v.result === 'ACCEPT' ? retroactiveReport(fx.catalog, next, enrollments, states) : [];
      counts[e.id] = g.length;
      expect(String(g.length)).toBe(want.get(e.id)!.grandfathered);
      expect(g.map((x) => `${x.learner}@${x.course}`).join('+')).toBe(want.get(e.id)!.grandfathered_learners);
    }
    expect(counts['E-04']).toBe(17);
    expect(counts['E-11']).toBe(6);
    expect(counts['E-07']).toBe(0);
    expect(counts['E-15']).toBe(0);
  });
});

describe('expected_progress.csv: 300 learners', () => {
  it('required, satisfied, progress_bp, path_len, path, next: 0 diffs; max 16 combinations', () => {
    const states = learnerStates(fx);
    let maxCombos = 0;
    const got = fx.learners.map((l) => {
      const cert = CERT.get(l.target_certificate)!;
      const st = states.get(l.learner_id)!;
      const p = certificateProgress(cert, st);
      const sp = shortestPath(fx.catalog, cert, st);
      maxCombos = Math.max(maxCombos, sp.combinations);
      return [l.learner_id, cert.code, p.required, p.satisfied, p.progress_bp, sp.path.length, sp.path.join('+'), sp.path[0] ?? ''].join(',');
    });
    const want = loadExpected(fx.dir, 'expected_progress.csv').map((r) => [r.learner_id, r.certificate, r.required, r.satisfied, r.progress_bp, r.path_len, r.path, r.next].join(','));
    expect(got).toEqual(want);
    expect(got).toHaveLength(300);
    expect(maxCombos).toBe(16);
  });
});
