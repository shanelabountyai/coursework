// catalog:check -- --edit <json> — applies a draft edit to fixtures/catalog.json (or --catalog <file>) and
// prints the publish verdict with every error, the cycle paths and the grandfather report against the
// fixture enrollments. Writes nothing. <json> is a file path or inline JSON of a DraftEdit
// ({"id","ops":[…]}) or of a bare ops list. Exit 0 on ACCEPT, 2 on REJECT, 1 on a usage error.
import { existsSync, readFileSync } from 'node:fs';
import { catalogHash } from '../src/graph/canonical';
import { applyEdit, validateCatalog, type DraftEdit } from '../src/graph/publish';
import { retroactiveReport } from '../src/graph/retro';
import { enrollmentRefs } from './lib/eval';
import { learnerStates, loadFixtures } from './lib/fixtures';

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const editArg = arg('--edit');
if (!editArg) {
  console.error('usage: npm run catalog:check -- --edit <file.json | inline JSON> [--fixtures <dir>] [--no-report]');
  process.exit(1);
}
const text = existsSync(editArg) ? readFileSync(editArg, 'utf8') : editArg;
const parsed = JSON.parse(text);
const edit: DraftEdit = Array.isArray(parsed) ? { id: 'inline', ops: parsed } : parsed;
if (!Array.isArray(edit.ops)) {
  console.error('the edit needs an "ops" list');
  process.exit(1);
}

const fx = loadFixtures(arg('--fixtures') ?? 'fixtures');
const next = applyEdit(fx.catalog, edit);
const v = validateCatalog(next);
console.log(`edit ${edit.id}: ${edit.ops.length} op(s) against ${fx.catalog.version} (${catalogHash(fx.catalog).slice(0, 12)}…)`);
console.log(`verdict ${v.result}`);
for (const e of v.errors) console.log(`  ${e.code}: ${e.detail}`);
if (v.cycles.length) {
  console.log(`cycles ${v.cycles.length}:`);
  for (const c of v.cycles) console.log(`  ${c.join(' -> ')}`);
}
if (v.result === 'ACCEPT') {
  console.log(`new version would hash ${catalogHash(next)} (${next.courses.length} courses)`);
  if (!process.argv.includes('--no-report')) {
    const report = retroactiveReport(fx.catalog, next, enrollmentRefs(fx), learnerStates(fx));
    console.log(`grandfathered ${report.length} (G9: reported, never blocked)`);
    for (const g of report) console.log(`  ${g.learner} ${g.course} ${g.cohort} missing ${g.missing.join('+')}`);
  }
  process.exit(0);
}
process.exit(2);
