/**
 * The database-side eval tables (tasks 2.6, 2.7, 2.9): the same rows `scripts/lib/eval.ts` builds
 * from the fixture files, built here from the org's rows through the read paths, in the columns of the
 * `expected_*.csv` files. Nothing here reads `expected_*`; the diff step in the script and tests does.
 * Every number is recomputed from events on the call (P1): there is no stored value to read.
 */
import { db } from '@/core/db';
import { courseProgressBp } from '@/graph/drip';
import { leaves } from '@/graph/expr';
import { certificateProgress, shortestPath } from '@/graph/path';
import { cmpStr, courseMap } from '@/graph/types';
import { categoriesText, gradeLearner } from '@/grades/grade';
import { eligibilityOver } from './completions';
import { assignmentsOf, currentSubmissions, schemeOf } from './grades';
import { learnerStatesFor } from './state';
import { versionByLabel, type Tx } from './versions';

export type Row = Record<string, string | undefined>; // the shape scripts/lib/csv.ts reads; values here are always set

/** 341 rows: cohort, learner_id, items_total, items_done, progress_bp — sorted by (cohort, learner_id). */
export async function dbEnrollmentProgress(orgId: string, tx: Tx = db): Promise<Row[]> {
  const cohorts = await tx.cohort.findMany({ where: { orgId }, select: { id: true, code: true, items: { select: { code: true } }, enrollments: { select: { learner: { select: { id: true, code: true } } } } } });
  const done = await tx.itemCompletion.findMany({ where: { orgId }, select: { cohortId: true, learnerId: true, itemCode: true } });
  const doneSet = new Set(done.map((d) => `${d.cohortId}\u0000${d.learnerId}\u0000${d.itemCode}`));
  const rows: Row[] = [];
  for (const co of cohorts) {
    const total = co.items.length;
    for (const e of co.enrollments) {
      const n = co.items.filter((it) => doneSet.has(`${co.id}\u0000${e.learner.id}\u0000${it.code}`)).length;
      rows.push({ cohort: co.code, learner_id: e.learner.code, items_total: String(total), items_done: String(n), progress_bp: String(courseProgressBp(n, total)) });
    }
  }
  return rows.sort((a, b) => cmpStr(a.cohort!, b.cohort!) || cmpStr(a.learner_id!, b.learner_id!));
}

/** 300 rows against each learner's enrolled version (P2): learner_id, certificate, required, satisfied, progress_bp, path_len, path, next. */
export async function dbCertificateProgress(orgId: string, versionLabel: string, tx: Tx = db): Promise<Row[]> {
  const { catalog } = await versionByLabel(orgId, versionLabel, tx);
  const learners = await tx.learner.findMany({ where: { orgId }, select: { id: true, code: true, targetCertificate: true, enrolledVersion: { select: { label: true } } }, orderBy: { code: 'asc' } });
  const states = await learnerStatesFor(orgId, catalog, tx);
  const certs = new Map(catalog.certificates.map((c) => [c.code, c]));
  return learners.map((l) => {
    if (l.enrolledVersion.label !== versionLabel) throw new Error(`learner ${l.code} is enrolled under ${l.enrolledVersion.label}, not ${versionLabel}`);
    const cert = certs.get(l.targetCertificate);
    if (!cert) throw new Error(`learner ${l.code}: unknown certificate ${l.targetCertificate}`);
    const st = states.get(l.id)!;
    const p = certificateProgress(cert, st);
    const sp = shortestPath(catalog, cert, st);
    return { learner_id: l.code, certificate: cert.code, required: String(p.required), satisfied: String(p.satisfied), progress_bp: String(p.progress_bp), path_len: String(sp.path.length), path: sp.path.join('+'), next: sp.path[0] ?? '' };
  });
}

/** 10,800 rows: learner_id, course (published only), status, missing, non_pass_satisfactions — learners by code, courses by code. */
export async function dbEligibility(orgId: string, versionLabel: string, tx: Tx = db): Promise<Row[]> {
  const { catalog } = await versionByLabel(orgId, versionLabel, tx);
  const courses = courseMap(catalog);
  const learners = await tx.learner.findMany({ where: { orgId }, select: { id: true, code: true }, orderBy: { code: 'asc' } });
  const states = await learnerStatesFor(orgId, catalog, tx);
  const rows: Row[] = [];
  for (const l of learners) {
    const st = states.get(l.id)!;
    for (const e of eligibilityOver(catalog, st)) {
      if (courses.get(e.code)!.status !== 'PUBLISHED') continue;
      const sat: string[] = [];
      for (const leaf of leaves(courses.get(e.code)!.prereq)) {
        const r = st.satisfied(leaf);
        if (r && r !== 'PASSED') sat.push(`${leaf}=${r}`);
      }
      rows.push({ learner_id: l.code, course: e.code, status: e.status, missing: e.missing.join('+'), non_pass_satisfactions: sat.join('+') });
    }
  }
  return rows;
}

/** 106 rows for every enrollment of a cohort with a scheme: cohort, learner_id, scheme, final_hp, letter, passed, exact, categories, flags — sorted by (cohort, learner_id). */
export async function dbGrades(orgId: string, tx: Tx = db): Promise<Row[]> {
  const cohorts = await tx.cohort.findMany({ where: { orgId, schemeId: { not: null } }, select: { id: true, code: true, scheme: true, enrollments: { select: { learner: { select: { id: true, code: true } } } } }, orderBy: { code: 'asc' } });
  const rows: Row[] = [];
  for (const co of cohorts) {
    const scheme = schemeOf(co.scheme!);
    const assignments = await assignmentsOf(co.id, tx);
    for (const e of co.enrollments) {
      const g = gradeLearner(scheme, assignments, await currentSubmissions(co.id, e.learner.id, tx));
      rows.push({ cohort: co.code, learner_id: e.learner.code, scheme: scheme.id, final_hp: String(g.final_hp), letter: g.letter, passed: g.passed ? 'true' : 'false', exact: g.exactText, categories: categoriesText(g), flags: g.flags.join(';') });
    }
  }
  return rows.sort((a, b) => cmpStr(a.cohort!, b.cohort!) || cmpStr(a.learner_id!, b.learner_id!));
}
