/**
 * Read-only loaders for `fixtures/` (Phase 1 has no database). Product code never reads
 * `expected_*.csv`; only `course:eval` and `progress:verify` do, through `loadExpected` here.
 * Integers are parsed once, at the boundary, so the engines see numbers and never strings.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LearnerState, WAIVER_REASONS, type WaiverReason } from '../../src/graph/eligibility';
import type { DraftEdit } from '../../src/graph/publish';
import type { Catalog } from '../../src/graph/types';
import type { Cohort } from '../../src/graph/drip';
import type { Scheme } from '../../src/grades/scheme';
import { readCsv, type Row } from './csv';

export interface Learner {
  learner_id: string;
  name: string;
  email: string;
  target_certificate: string;
  enrolled_catalog_version: string;
}
export interface Waiver {
  learner_id: string;
  course: string;
  reason: WaiverReason;
  granted_day: string;
  granted_by: string;
}
export interface Completion {
  learner_id: string;
  course: string;
  kind: 'PASS' | 'FAIL';
  day: string;
  catalog_version: string;
}
export interface ItemEvent {
  event_id: string;
  learner_id: string;
  cohort: string;
  item: string;
  day: string;
}
export interface AssignmentRow {
  cohort: string;
  assignment: string;
  category: string;
  points_possible: number;
  due_day: string;
  extra_credit: boolean;
}
export interface SubmissionRow {
  cohort: string;
  learner_id: string;
  assignment: string;
  score_hp: number;
  submitted_day: string;
}

export interface Fixtures {
  dir: string;
  catalog: Catalog;
  edits: DraftEdit[];
  cohorts: Cohort[];
  schemes: Scheme[];
  learners: Learner[];
  waivers: Waiver[];
  completions: Completion[];
  itemEvents: ItemEvent[];
  assignments: AssignmentRow[];
  submissions: SubmissionRow[];
}

function int(v: string | undefined, where: string): number {
  if (v === undefined || !/^-?\d+$/.test(v)) throw new Error(`${where}: expected an integer, got ${JSON.stringify(v)}`);
  return Number(v);
}
function need(r: Row, k: string, where: string): string {
  const v = r[k];
  if (v === undefined) throw new Error(`${where}: missing column ${k}`);
  return v;
}

export function loadFixtures(dir = 'fixtures'): Fixtures {
  const json = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const csv = (name: string) => readCsv(readFileSync(join(dir, name), 'utf8'));
  const waivers = csv('waivers.csv').map((r, i) => {
    const reason = need(r, 'reason', `waivers.csv:${i + 2}`);
    if (!(WAIVER_REASONS as readonly string[]).includes(reason)) throw new Error(`waivers.csv:${i + 2}: unknown reason ${reason}`);
    return { learner_id: need(r, 'learner_id', 'waivers'), course: need(r, 'course', 'waivers'), reason: reason as WaiverReason, granted_day: need(r, 'granted_day', 'waivers'), granted_by: need(r, 'granted_by', 'waivers') };
  });
  const completions = csv('completions.csv').map((r, i) => {
    const kind = need(r, 'kind', `completions.csv:${i + 2}`);
    if (kind !== 'PASS' && kind !== 'FAIL') throw new Error(`completions.csv:${i + 2}: kind ${kind}`);
    return { learner_id: need(r, 'learner_id', 'completions'), course: need(r, 'course', 'completions'), kind, day: need(r, 'day', 'completions'), catalog_version: need(r, 'catalog_version', 'completions') };
  });
  return {
    dir,
    catalog: json('catalog.json'),
    edits: json('draft_edits.json').edits,
    cohorts: json('cohorts.json').cohorts,
    schemes: json('schemes.json').schemes,
    learners: csv('learners.csv') as unknown as Learner[],
    waivers,
    completions,
    itemEvents: csv('item_completions.csv') as unknown as ItemEvent[],
    assignments: csv('assignments.csv').map((r, i) => ({
      cohort: need(r, 'cohort', 'assignments'),
      assignment: need(r, 'assignment', 'assignments'),
      category: need(r, 'category', 'assignments'),
      points_possible: int(r.points_possible, `assignments.csv:${i + 2} points_possible`),
      due_day: need(r, 'due_day', 'assignments'),
      extra_credit: need(r, 'extra_credit', 'assignments') === 'true',
    })),
    submissions: csv('submissions.csv').map((r, i) => ({
      cohort: need(r, 'cohort', 'submissions'),
      learner_id: need(r, 'learner_id', 'submissions'),
      assignment: need(r, 'assignment', 'submissions'),
      score_hp: int(r.score_hp, `submissions.csv:${i + 2} score_hp`),
      submitted_day: need(r, 'submitted_day', 'submissions'),
    })),
  };
}

/** One LearnerState per learner from PASS completions + waivers + the catalog's equivalencies (brief §4, reference_graph.py §2). */
export function learnerStates(fx: Fixtures): Map<string, LearnerState> {
  const passed = new Map<string, Set<string>>();
  for (const c of fx.completions) {
    if (c.kind !== 'PASS') continue;
    const s = passed.get(c.learner_id) ?? new Set<string>();
    s.add(c.course);
    passed.set(c.learner_id, s);
  }
  const waivers = new Map<string, Map<string, WaiverReason>>();
  for (const w of fx.waivers) {
    const m = waivers.get(w.learner_id) ?? new Map<string, WaiverReason>();
    m.set(w.course, w.reason);
    waivers.set(w.learner_id, m);
  }
  return new Map(fx.learners.map((l) => [l.learner_id, new LearnerState(passed.get(l.learner_id) ?? [], waivers.get(l.learner_id) ?? new Map(), fx.catalog.equivalencies)]));
}

/** The only reader of `expected_*.csv` (D-6): the eval's diff step. */
export function loadExpected(dir: string, name: string): Row[] {
  return readCsv(readFileSync(join(dir, name), 'utf8'));
}
