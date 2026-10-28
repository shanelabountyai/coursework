// engine:lint — D-7 purity of src/graph and src/grades, the no-float rule on the score path,
// and the D-8 date bans over clone-owned code. A grep, not a type check: it runs in CI even
// when the Prisma client could not be generated, and it reads the files as text so a ban
// cannot be dodged by an alias. Exit 1 with every hit listed; exit 0 silent except a summary.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
type Hit = { file: string; line: number; rule: string; text: string };
const hits: Hit[] = [];

function walk(dir: string, out: string[] = []): string[] {
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of names) {
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (n === 'node_modules' || n === '.next' || n === 'generated' || n === '.git') continue;
      walk(p, out);
    } else if (/\.(ts|tsx|mts|mjs|prisma)$/.test(n)) out.push(p);
  }
  return out;
}

function scan(files: string[], rules: { rule: string; re: RegExp }[]): void {
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((text, i) => {
      if (/engine-lint:allow/.test(text)) return; // only for the lint's own self-test fixtures, never in an engine
      for (const { rule, re } of rules) if (re.test(text)) hits.push({ file: relative(root, f), line: i + 1, rule, text: text.trim() });
    });
  }
}

// --- D-7: the engines import no database, clock, randomness, network or model client, and no foundation code.
const engineFiles = [...walk(join(root, 'src/graph')), ...walk(join(root, 'src/grades'))];
scan(engineFiles, [
  { rule: 'D-7 clock', re: /\bDate\.now\b|\bnew Date\b|\bperformance\.now\b|\bprocess\.hrtime\b/ },
  { rule: 'D-7 randomness', re: /\bMath\.random\b|\bcrypto\.randomUUID\b|\brandomBytes\b|\brandomInt\b/ },
  { rule: 'D-7 database', re: /\bprisma\b|@\/generated|\bPrismaClient\b|\bfrom ['"]pg['"]/i },
  { rule: 'D-7 network', re: /\bfetch\s*\(|\bfrom ['"]node:https?['"]|\bfrom ['"]https?['"]|\bWebSocket\b/ },
  { rule: 'D-7 model client', re: /anthropic|openai/i },
  { rule: 'D-7 foundation', re: /@\/core\b|@\/modules\b|@\/app\b/ },
  { rule: 'D-7 I/O', re: /\bfrom ['"](node:)?(fs|fs\/promises|child_process|os|net)['"]/ },
  { rule: 'D-7 environment', re: /\bprocess\.env\b/ },
]);

// --- No float on the score path (CLAUDE.md non-negotiable 4). Scores are hp, weights bp, intermediates Rational.
scan(walk(join(root, 'src/grades')), [
  { rule: 'grades float', re: /\bparseFloat\b|\bNumber\.parseFloat\b|\btoFixed\b|\bMath\.(round|floor|ceil|trunc|fround)\b/ },
  { rule: 'grades float', re: /\/\s*100(?!\d)/ }, // `/ 100` turns hp into a percent as a float; a Rational does that exactly
  { rule: 'grades float', re: /\b\d+\.\d+\b/ }, // a decimal literal has no place under src/grades
]);

// --- D-8 date bans over clone-owned code. Template-owned and template-authored paths are the template's business.
const templatePaths = [
  'src/core', 'src/modules', 'src/proxy.ts', 'prisma/schema/core.prisma', 'prisma/schema/billing.prisma', 'prisma/schema/notifications.prisma',
  'prisma/migrations', 'tests/invariants', 'tests/integration', 'tests/helpers', 'tests/unit', 'tests/fixtures', 'e2e',
  'src/app/(public)', 'src/app/onboarding', 'src/app/account', 'src/app/s', 'src/app/api', 'src/app/o/[org]/settings', 'src/app/o/[org]/projects',
  'scripts/foundation-drift.ts', 'scripts/foundation-status.ts', 'scripts/foundation-check-modules.ts', 'scripts/foundation-modules.ts',
  'scripts/db-setup.ts', 'scripts/new-project.ts', 'scripts/seed-demo.ts',
];
const cloneFiles = [...walk(join(root, 'src')), ...walk(join(root, 'scripts')), ...walk(join(root, 'tests')), ...walk(join(root, 'prisma'))].filter((f) => {
  const rel = relative(root, f);
  if (rel === 'scripts/engine-lint.ts') return false; // this file's own pattern source
  return !templatePaths.some((p) => rel === p || rel.startsWith(p + '/'));
});
scan(cloneFiles, [
  { rule: 'D-8 new Date(arg)', re: /\bnew Date\s*\(\s*[^)\s]/ },
  { rule: 'D-8 Date.parse', re: /\bDate\.parse\b/ },
  { rule: 'D-8 toISOString().slice', re: /toISOString\(\)\s*\.\s*slice\s*\(\s*0\s*,\s*10\s*\)/ },
  { rule: 'D-8 getTimezoneOffset', re: /\bgetTimezoneOffset\b/ },
  { rule: 'D-8 @db.Date', re: /@db\.Date\b/ },
]);

if (hits.length) {
  for (const h of hits) console.error(`${h.file}:${h.line}  [${h.rule}]  ${h.text}`);
  console.error(`engine:lint: ${hits.length} hit(s)`);
  process.exit(1);
}
console.log(`engine:lint: clean (${engineFiles.length} engine files, ${cloneFiles.length} clone-owned files scanned)`);
