/**
 * The eval computations behind `course:eval` and `progress:verify`: run both engines over the loaded
 * fixtures, build the per-row tables the oracle writes as `expected_*.csv`, and the §8 report lines in
 * the oracle's layout (`tools/reference_graph.py`, `tools/reference_grades.py`). Nothing here reads
 * `expected_*`; the diff step in the scripts does.
 */
import { catalogHash } from '../../src/graph/canonical';
import { edgeCount, prereqEdges, topoOrder } from '../../src/graph/dag';
import { checkItemCompletion, courseProgressBp, type DripVerdict } from '../../src/graph/drip';
import { eligibility, type LearnerState } from '../../src/graph/eligibility';
import { leaves } from '../../src/graph/expr';
import { certificateProgress, shortestPath } from '../../src/graph/path';
import { applyEdit, validateCatalog } from '../../src/graph/publish';
import { retroactiveReport, type EnrollmentRef } from '../../src/graph/retro';
import { cmpStr, courseMap } from '../../src/graph/types';
import { categoriesText, gradeLearner, type Assignment, type Submission } from '../../src/grades/grade';
import { validateScheme } from '../../src/grades/scheme';
import type { Row } from './csv';
import { learnerStates, type Fixtures } from './fixtures';

export interface EvalTables {
  edits: Row[];
  eligibility: Row[];
  progress: Row[];
  drip: Row[];
  enrollmentProgress: Row[];
  schemes: Row[];
  grades: Row[];
}
export interface EvalResult {
  lines: string[];
  tables: EvalTables;
  maxCombinations: number;
}

const COLS = {
  edits: ['edit_id', 'result', 'cycles', 'errors', 'grandfathered', 'grandfathered_learners'],
  eligibility: ['learner_id', 'course', 'status', 'missing', 'non_pass_satisfactions'],
  progress: ['learner_id', 'certificate', 'required', 'satisfied', 'progress_bp', 'path_len', 'path', 'next'],
  drip: ['event_id', 'verdict'],
  enrollmentProgress: ['cohort', 'learner_id', 'items_total', 'items_done', 'progress_bp'],
  schemes: ['scheme', 'weights_bp', 'result', 'errors'],
  grades: ['cohort', 'learner_id', 'scheme', 'final_hp', 'letter', 'passed', 'exact', 'categories', 'flags'],
} as const;
export const EXPECTED_FILES: Record<keyof EvalTables, string> = {
  edits: 'expected_edits.csv',
  eligibility: 'expected_eligibility.csv',
  progress: 'expected_progress.csv',
  drip: 'expected_drip.csv',
  enrollmentProgress: 'expected_enrollment_progress.csv',
  schemes: 'expected_schemes.csv',
  grades: 'expected_grades.csv',
};
export const COLUMNS: Record<keyof EvalTables, readonly string[]> = COLS;

class Counter<K> extends Map<K, number> {
  inc(k: K, by = 1): void {
    this.set(k, (this.get(k) ?? 0) + by);
  }
  at(k: K): number {
    return this.get(k) ?? 0;
  }
}
const sortedKeys = <K extends string | number>(c: Counter<K>): K[] => [...c.keys()].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : cmpStr(String(a), String(b))));
const floorDiv = (a: number, b: number) => Math.floor(a / b);

/** Enrollments as the graph engine sees them (learner, course, cohort, status). */
export function enrollmentRefs(fx: Fixtures): EnrollmentRef[] {
  return fx.cohorts.flatMap((co) => co.enrolled.map((e) => ({ learner: e.learner_id, course: co.course, cohort: co.id, status: e.status })));
}

/** Drip verdict per event plus the set of accepted (cohort, learner, item) triples. */
export function dripVerdicts(fx: Fixtures): { rows: Row[]; counts: Counter<DripVerdict>; done: Set<string> } {
  const byId = new Map(fx.cohorts.map((c) => [c.id, c]));
  const enrolled = new Set(fx.cohorts.flatMap((c) => c.enrolled.map((e) => `${e.learner_id}\u0000${c.id}`)));
  const isEnrolled = (l: string, c: string) => enrolled.has(`${l}\u0000${c}`);
  const counts = new Counter<DripVerdict>();
  const done = new Set<string>();
  const rows = fx.itemEvents.map((ev) => {
    const v = checkItemCompletion({ learner: ev.learner_id, cohort: ev.cohort, item: ev.item, day: ev.day }, byId, isEnrolled);
    counts.inc(v);
    if (v === 'ACCEPT') done.add(`${ev.cohort}\u0000${ev.learner_id}\u0000${ev.item}`);
    return { event_id: ev.event_id, verdict: v };
  });
  return { rows, counts, done };
}

/** P1: course progress per enrollment from accepted item events only. */
export function enrollmentProgressRows(fx: Fixtures, done: ReadonlySet<string>): { rows: Row[]; hist: Counter<number> } {
  const hist = new Counter<number>();
  const rows: Row[] = [];
  for (const co of fx.cohorts) {
    const total = co.items.length;
    for (const e of co.enrolled) {
      const n = co.items.filter((it) => done.has(`${co.id}\u0000${e.learner_id}\u0000${it.code}`)).length;
      const bp = courseProgressBp(n, total);
      hist.inc(bp < 10000 ? floorDiv(bp, 2500) : 4);
      rows.push({ cohort: co.id, learner_id: e.learner_id, items_total: String(total), items_done: String(n), progress_bp: String(bp) });
    }
  }
  return { rows, hist };
}

/** P1: certificate progress and the G8 path per learner, against the enrolled version (one version in Phase 1). */
export function certificateRows(fx: Fixtures, states: ReadonlyMap<string, LearnerState>): { rows: Row[]; maxCombinations: number } {
  const certs = new Map(fx.catalog.certificates.map((c) => [c.code, c]));
  let maxCombinations = 0;
  const rows = fx.learners.map((l) => {
    const cert = certs.get(l.target_certificate);
    if (!cert) throw new Error(`learner ${l.learner_id}: unknown certificate ${l.target_certificate}`);
    const st = states.get(l.learner_id)!;
    const p = certificateProgress(cert, st);
    const sp = shortestPath(fx.catalog, cert, st);
    maxCombinations = Math.max(maxCombinations, sp.combinations);
    return {
      learner_id: l.learner_id,
      certificate: cert.code,
      required: String(p.required),
      satisfied: String(p.satisfied),
      progress_bp: String(p.progress_bp),
      path_len: String(sp.path.length),
      path: sp.path.join('+'),
      next: sp.path[0] ?? '',
    };
  });
  return { rows, maxCombinations };
}

const BUCKETS = ['0-24%', '25-49%', '50-74%', '75-99%', '100%'];

export function runGraphEval(fx: Fixtures): { lines: string[]; tables: Pick<EvalTables, 'edits' | 'eligibility' | 'progress' | 'drip' | 'enrollmentProgress'>; maxCombinations: number } {
  const lines: string[] = [];
  const out = (s = '') => lines.push(s);
  const catalog = fx.catalog;
  const courses = courseMap(catalog);
  const codes = [...courses.keys()].sort(cmpStr);
  const published = codes.filter((c) => courses.get(c)!.status === 'PUBLISHED');
  const states = learnerStates(fx);
  const enrollments = enrollmentRefs(fx);

  // 1. catalog
  const hash = catalogHash(catalog);
  out(`== Catalog ${catalog.version}  hash ${hash}`);
  if (catalog.hash !== undefined && catalog.hash !== hash) throw new Error('catalog hash field does not match content');
  const chk = validateCatalog(catalog);
  const count = (s: string) => codes.filter((c) => courses.get(c)!.status === s).length;
  out(`courses ${codes.length} (published ${published.length}, draft ${count('DRAFT')}, retired ${count('RETIRED')}); edges ${edgeCount(courses)}; publish check ${chk.result}; cycles ${chk.cycles.length}`);
  out('topological order (G4): ' + topoOrder(prereqEdges(courses)).join(' '));

  // 3. draft edits
  out();
  out('== Draft edits against cat-v1');
  out(`${'edit'.padEnd(6)} ${'result'.padEnd(26)} detail`);
  const edits: Row[] = [];
  for (const e of fx.edits) {
    const next = applyEdit(catalog, e);
    const v = validateCatalog(next);
    let detail = v.errors.map((x) => `${x.code}: ${x.detail}`).join('; ');
    let grand: ReturnType<typeof retroactiveReport> = [];
    if (v.result === 'ACCEPT') {
      grand = retroactiveReport(catalog, next, enrollments, states);
      detail = `grandfathered ${grand.length}` + (grand.length ? ` (${[...new Set(grand.map((g) => g.course))].sort(cmpStr).join('+')})` : '');
      if (next.courses.length !== catalog.courses.length) detail += `; courses ${catalog.courses.length} -> ${next.courses.length}`;
    }
    out(`${e.id.padEnd(6)} ${v.result.padEnd(26)} ${detail}`);
    edits.push({
      edit_id: e.id,
      result: v.result,
      cycles: v.cycles.map((c) => c.join(' -> ')).join(';'),
      errors: v.errors.map((x) => `${x.code}:${x.detail}`).join(';'),
      grandfathered: String(grand.length),
      grandfathered_learners: grand.map((g) => `${g.learner}@${g.course}`).join('+'),
    });
  }
  out(`accepted ${edits.filter((r) => r.result === 'ACCEPT').length}, rejected ${edits.filter((r) => r.result !== 'ACCEPT').length}, cycle rejections ${edits.filter((r) => r.result === 'REJECT:CYCLE').length}`);

  // 4. eligibility
  out();
  out('== Eligibility of 300 learners over the published courses');
  const elig: Row[] = [];
  const statusTot = new Counter<string>();
  const reasons = new Counter<string>();
  const missingSizes = new Counter<number>();
  const perLearnerElig = new Counter<string>();
  for (const l of fx.learners) {
    const st = states.get(l.learner_id)!;
    for (const code of published) {
      const e = eligibility(courses.get(code)!, st);
      statusTot.inc(e.status);
      if (e.status === 'BLOCKED') missingSizes.inc(e.missing.length);
      if (e.status === 'ELIGIBLE') perLearnerElig.inc(l.learner_id);
      const sat: string[] = [];
      for (const leaf of leaves(courses.get(code)!.prereq)) {
        const r = st.satisfied(leaf);
        if (r && r !== 'PASSED') {
          sat.push(`${leaf}=${r}`);
          reasons.inc(r.split(':')[0]!);
        }
      }
      elig.push({ learner_id: l.learner_id, course: code, status: e.status, missing: e.missing.join('+'), non_pass_satisfactions: sat.join('+') });
    }
  }
  out(
    'status counts: ' +
      ['COMPLETED', 'ELIGIBLE', 'BLOCKED', 'UNAVAILABLE'].map((k) => `${k} ${statusTot.at(k)}`).join(', ') +
      ` (total ${[...statusTot.values()].reduce((a, b) => a + b, 0)} = ${fx.learners.length} x ${published.length})`,
  );
  out('blocked by missing-set size: ' + sortedKeys(missingSizes).map((k) => `${k}: ${missingSizes.at(k)}`).join(', '));
  out(`leaf satisfactions not by PASS (G6): EQUIVALENT ${reasons.at('EQUIVALENT')}, WAIVER ${reasons.at('WAIVER')}`);
  const dist = new Counter<number>();
  for (const l of fx.learners) dist.inc(perLearnerElig.at(l.learner_id));
  out('eligible-course count per learner: ' + sortedKeys(dist).map((k) => `${k}: ${dist.at(k)}`).join(', '));

  // 5. certificate progress + shortest path
  out();
  out('== Certificate progress (derived) and shortest path to the target certificate (G8)');
  const { rows: progress, maxCombinations } = certificateRows(fx, states);
  const buckets = new Counter<number>();
  const pathLens = new Counter<number>();
  const byCert = new Map<string, number[]>();
  for (const r of progress) {
    const bp = Number(r.progress_bp);
    buckets.inc(bp < 10000 ? Math.min(floorDiv(bp, 2500), 3) : 4);
    pathLens.inc(Number(r.path_len));
    const v = byCert.get(r.certificate!) ?? [];
    v.push(bp);
    byCert.set(r.certificate!, v);
  }
  out('progress buckets: ' + BUCKETS.map((lab, i) => `${lab} ${buckets.at(i)}`).join(', '));
  out('shortest-path length: ' + sortedKeys(pathLens).map((k) => `${k}: ${pathLens.at(k)}`).join(', ') + `; max branch combinations examined ${maxCombinations}`);
  for (const code of [...byCert.keys()].sort(cmpStr)) {
    const v = byCert.get(code)!;
    const sum = v.reduce((a, b) => a + b, 0);
    out(`  ${code.padEnd(14)} learners ${String(v.length).padStart(3)}  complete ${String(v.filter((x) => x === 10000).length).padStart(3)}  mean progress_bp ${floorDiv(sum, v.length)}`);
  }

  // 6. drip + enrollment progress
  out();
  out('== Drip release (R1-R3) and derived course progress');
  const d = dripVerdicts(fx);
  out(`item completion events ${fx.itemEvents.length}: ` + sortedKeys(d.counts).map((k) => `${k} ${d.counts.at(k)}`).join(', '));
  const ep = enrollmentProgressRows(fx, d.done);
  out(`enrollments ${ep.rows.length}; course progress buckets: ` + BUCKETS.map((lab, i) => `${lab} ${ep.hist.at(i)}`).join(', '));

  return { lines, tables: { edits, eligibility: elig, progress, drip: d.rows, enrollmentProgress: ep.rows }, maxCombinations };
}

/** Python's repr of the oracle's error tuple list, for the scheme line only. */
function pyErrors(errors: { code: string; detail: string }[]): string {
  const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return '[' + errors.map((e) => `(${q(e.code)}, ${q(e.detail)})`).join(', ') + ']';
}

export function runGradesEval(fx: Fixtures): { lines: string[]; tables: Pick<EvalTables, 'schemes' | 'grades'>; near: number } {
  const lines: string[] = [];
  const out = (s = '') => lines.push(s);
  const schemes = new Map(fx.schemes.map((s) => [s.id, s]));

  out('== Grade schemes (S1 publish check)');
  const schemeRows: Row[] = [];
  for (const sid of [...schemes.keys()].sort(cmpStr)) {
    const v = validateScheme(schemes.get(sid)!);
    out(`${sid.padEnd(9)} weights ${String(v.weights_bp).padStart(5)}  ${v.result}` + (v.errors.length ? `  ${pyErrors(v.errors)}` : ''));
    schemeRows.push({ scheme: sid, weights_bp: String(v.weights_bp), result: v.result, errors: v.errors.map((e) => `${e.code}:${e.detail}`).join(';') });
  }

  const byCohortAsg = new Map<string, Assignment[]>();
  for (const a of fx.assignments) {
    const l = byCohortAsg.get(a.cohort) ?? [];
    l.push({ code: a.assignment, category: a.category, points_possible: a.points_possible, due_day: a.due_day, extra_credit: a.extra_credit });
    byCohortAsg.set(a.cohort, l);
  }
  const subs = new Map<string, Map<string, Submission>>();
  for (const s of fx.submissions) {
    const k = `${s.cohort}\u0000${s.learner_id}`;
    const m = subs.get(k) ?? new Map<string, Submission>();
    m.set(s.assignment, { score_hp: s.score_hp, submitted_day: s.submitted_day });
    subs.set(k, m);
  }

  out();
  out('== Gradebook per graded cohort (scores in hundredths of a percent; rounded once, half-up, at the final grade)');
  out(`${'cohort'.padEnd(14)} ${'scheme'.padEnd(9)} ${'n'.padStart(3)} ${'mean_hp'.padStart(8)} ${'pass'.padStart(5)} ${'fail'.padStart(5)}  letters                flags`);
  const grades: Row[] = [];
  let near = 0;
  for (const co of fx.cohorts) {
    if (!co.scheme) continue;
    const scheme = schemes.get(co.scheme);
    if (!scheme) throw new Error(`cohort ${co.id}: unknown scheme ${co.scheme}`);
    if (validateScheme(scheme).result !== 'ACCEPT') throw new Error(`cohort ${co.id}: scheme ${scheme.id} does not pass S1`);
    const letters = new Counter<string>();
    const flags = new Counter<string>();
    let sum = 0;
    let n = 0;
    let passed = 0;
    for (const e of co.enrolled) {
      const g = gradeLearner(scheme, byCohortAsg.get(co.id) ?? [], subs.get(`${co.id}\u0000${e.learner_id}`) ?? new Map());
      sum += g.final_hp;
      n++;
      if (g.passed) passed++;
      letters.inc(g.letter);
      for (const f of g.flags) flags.inc(f.split(':')[0]!);
      // |exact − threshold| < 1/2  ⇔  |2·num − 2·den·threshold| < den
      const diff2 = g.exact.num * 2n - g.exact.den * 2n * BigInt(scheme.pass_threshold_hp);
      if ((diff2 < 0n ? -diff2 : diff2) < g.exact.den) near++;
      grades.push({
        cohort: co.id,
        learner_id: e.learner_id,
        scheme: scheme.id,
        final_hp: String(g.final_hp),
        letter: g.letter,
        passed: g.passed ? 'true' : 'false',
        exact: g.exactText,
        categories: categoriesText(g),
        flags: g.flags.join(';'),
      });
    }
    const lt = ['A', 'B', 'C', 'D', 'F'].map((k) => `${k}:${letters.at(k)}`).join(' ');
    const fl = sortedKeys(flags).map((k) => `${k}:${flags.at(k)}`).join(' ');
    out(`${co.id.padEnd(14)} ${scheme.id.padEnd(9)} ${String(n).padStart(3)} ${String(floorDiv(sum, n)).padStart(8)} ${String(passed).padStart(5)} ${String(n - passed).padStart(5)}  ${lt.padEnd(22)} ${fl}`);
  }
  out(`learners graded ${grades.length}; unrounded grade within 0.5 hp of the pass threshold (rounding decides): ${near}`);
  return { lines, tables: { schemes: schemeRows, grades }, near };
}

export function runEval(fx: Fixtures): EvalResult {
  const g = runGraphEval(fx);
  const s = runGradesEval(fx);
  return { lines: [...g.lines, '', ...s.lines], tables: { ...g.tables, ...s.tables }, maxCombinations: g.maxCombinations };
}

/** Row-by-row diff of a computed table against an expected one over the named columns. Returns the differing row indexes (0-based) with a one-line reason each. */
export function diffRows(got: readonly Row[], want: readonly Row[], cols: readonly string[]): string[] {
  const out: string[] = [];
  const n = Math.max(got.length, want.length);
  for (let i = 0; i < n; i++) {
    const a = got[i];
    const b = want[i];
    if (!a || !b) {
      out.push(`row ${i + 1}: ${a ? 'extra computed row' : 'missing computed row'}`);
      continue;
    }
    for (const c of cols) {
      if ((a[c] ?? '') !== (b[c] ?? '')) {
        out.push(`row ${i + 1} ${c}: computed ${JSON.stringify(a[c] ?? '')} expected ${JSON.stringify(b[c] ?? '')}`);
        break;
      }
    }
  }
  return out;
}
