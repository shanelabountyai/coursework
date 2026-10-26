// progress:verify — P1: derives 341 enrollment progress values (accepted item events / items) and 300
// certificate progress values (G6-satisfied required courses / required) from the events alone, then
// diffs expected_enrollment_progress.csv and expected_progress.csv (progress columns). expected_* is
// read only in the diff step. Exit 1 on any diff. `--fixtures <dir>` for another fixture directory;
// `--drop-event <event_id>` removes one item event from the in-memory copy (the task 1.10 self-check).
import { certificateRows, diffRows, dripVerdicts, enrollmentProgressRows } from './lib/eval';
import { learnerStates, loadExpected, loadFixtures } from './lib/fixtures';

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const dir = arg('--fixtures') ?? 'fixtures';
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
console.log(`derived: ${ep.rows.length} enrollment progress values from ${d.counts.get('ACCEPT') ?? 0} accepted item events; ${cp.rows.length} certificate progress values from ${fx.completions.length} completion events`);

const diffsE = diffRows(ep.rows, loadExpected(dir, 'expected_enrollment_progress.csv'), ['cohort', 'learner_id', 'items_total', 'items_done', 'progress_bp']);
const diffsC = diffRows(cp.rows, loadExpected(dir, 'expected_progress.csv'), ['learner_id', 'certificate', 'required', 'satisfied', 'progress_bp']);
console.log(`expected_enrollment_progress.csv  rows ${ep.rows.length}  diffs ${diffsE.length}`);
for (const x of diffsE.slice(0, 10)) console.log(`  ${x}`);
console.log(`expected_progress.csv             rows ${cp.rows.length}  diffs ${diffsC.length}`);
for (const x of diffsC.slice(0, 10)) console.log(`  ${x}`);
if (diffsE.length + diffsC.length) process.exit(1);
console.log('progress:verify: 0 diffs');
