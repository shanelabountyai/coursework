// progress:verify — P1: derives 341 enrollment progress values (accepted item events / items) and 300
// certificate progress values (G6-satisfied required courses / required) from the events alone, then
// diffs expected_enrollment_progress.csv and expected_progress.csv (progress columns). expected_* is
// read only in the diff step. Exit 1 on any diff. `--fixtures <dir>` for another fixture directory;
// `--drop-event <event_id>` removes one item event from the in-memory copy (the task 1.10 self-check).
//
// `--db` (task 2.9): the same two tables recomputed from the DATABASE rows of the org `--slug` (default
// fixtures-school, see seed:fixtures) through src/course/verify.ts, diffed against the same files. Nothing
// is stored: a row deleted behind the trigger (superuser) shows up as exactly the diff it causes.
import { certificateRows, diffRows, dripVerdicts, enrollmentProgressRows } from './lib/eval';
import type { Row } from './lib/csv';
import { learnerStates, loadExpected, loadFixtures } from './lib/fixtures';

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const dir = arg('--fixtures') ?? 'fixtures';
const byKey = (rows: readonly Row[], keys: string[]): Row[] => [...rows].sort((a, b) => keys.map((k) => ((a[k] ?? '') < (b[k] ?? '') ? -1 : (a[k] ?? '') > (b[k] ?? '') ? 1 : 0)).find((c) => c !== 0) ?? 0);

let epRows: Row[];
let cpRows: Row[];
let derivedLine: string;

if (process.argv.includes('--db')) {
  const { db } = await import('@/core/db');
  const { dbCertificateProgress, dbEnrollmentProgress } = await import('@/course/verify');
  const slug = arg('--slug') ?? 'fixtures-school';
  const org = await db.org.findUnique({ where: { slug } });
  if (!org) {
    console.error(`progress:verify --db: no org "${slug}" — run seed:fixtures first`);
    process.exit(1);
  }
  const label = arg('--version') ?? 'cat-v1';
  epRows = byKey(await dbEnrollmentProgress(org.id), ['cohort', 'learner_id']);
  cpRows = byKey(await dbCertificateProgress(org.id, label), ['learner_id']);
  const [items, completions] = [await db.itemCompletion.count({ where: { orgId: org.id } }), await db.completionEvent.count({ where: { orgId: org.id } })];
  derivedLine = `derived from the database (org ${slug}, version ${label}): ${epRows.length} enrollment progress values from ${items} ItemCompletion rows; ${cpRows.length} certificate progress values from ${completions} CompletionEvent rows`;
  await db.$disconnect();
} else {
  const fx = loadFixtures(dir);
  const drop = arg('--drop-event');
  if (drop) {
    const before = fx.itemEvents.length;
    fx.itemEvents = fx.itemEvents.filter((e) => e.event_id !== drop);
    console.log(`dropped ${before - fx.itemEvents.length} item event(s) matching ${drop} from the in-memory copy`);
  }
  const d = dripVerdicts(fx);
  const ep = enrollmentProgressRows(fx, d.done);
  const states = learnerStates(fx);
  const cp = certificateRows(fx, states);
  epRows = byKey(ep.rows, ['cohort', 'learner_id']);
  cpRows = byKey(cp.rows, ['learner_id']);
  derivedLine = `derived: ${ep.rows.length} enrollment progress values from ${d.counts.get('ACCEPT') ?? 0} accepted item events; ${cp.rows.length} certificate progress values from ${fx.completions.length} completion events`;
}
console.log(derivedLine);

const diffsE = diffRows(epRows, byKey(loadExpected(dir, 'expected_enrollment_progress.csv'), ['cohort', 'learner_id']), ['cohort', 'learner_id', 'items_total', 'items_done', 'progress_bp']);
const diffsC = diffRows(cpRows, byKey(loadExpected(dir, 'expected_progress.csv'), ['learner_id']), ['learner_id', 'certificate', 'required', 'satisfied', 'progress_bp']);
console.log(`expected_enrollment_progress.csv  rows ${epRows.length}  diffs ${diffsE.length}`);
for (const x of diffsE.slice(0, 10)) console.log(`  ${x}`);
console.log(`expected_progress.csv             rows ${cpRows.length}  diffs ${diffsC.length}`);
for (const x of diffsC.slice(0, 10)) console.log(`  ${x}`);
if (diffsE.length + diffsC.length) process.exit(1);
console.log('progress:verify: 0 diffs');
