// course:eval — loads fixtures/, runs both engines, prints brief §8 in the oracle's layout, diffs the
// seven expected_*.csv row by row and prints the diff count per file. Exit 1 on any diff (D-30).
// `--fixtures <dir>` points at another fixture directory (the tests use a copy with a planted change).
import { EXPECTED_FILES, COLUMNS, diffRows, runEval, type EvalTables } from './lib/eval';
import { loadExpected, loadFixtures } from './lib/fixtures';

const i = process.argv.indexOf('--fixtures');
const dir = i > 0 ? process.argv[i + 1]! : 'fixtures';
const fx = loadFixtures(dir);
const r = runEval(fx);
for (const line of r.lines) console.log(line);

console.log('');
console.log('== Diff against the oracle (expected_*.csv)');
let total = 0;
for (const key of Object.keys(EXPECTED_FILES) as (keyof EvalTables)[]) {
  const name = EXPECTED_FILES[key];
  const want = loadExpected(dir, name);
  const got = r.tables[key];
  const diffs = diffRows(got, want, COLUMNS[key]);
  total += diffs.length;
  console.log(`${name.padEnd(36)} rows ${String(got.length).padStart(6)} / ${String(want.length).padStart(6)}  diffs ${diffs.length}`);
  for (const d of diffs.slice(0, 10)) console.log(`  ${d}`);
  if (diffs.length > 10) console.log(`  … ${diffs.length - 10} more`);
}
console.log(`total diffs ${total}; max branch combinations ${r.maxCombinations}`);
if (total) process.exit(1);
