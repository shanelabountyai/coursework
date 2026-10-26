import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { noDateAxisRules } from './eslint-rules/no-date-axis.mjs';

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'src/generated/**', 'spikes/**', 'next-env.d.ts'] },
  // Spec §4: core never reaches into modules or app. This is what keeps the D-7
  // package extraction mechanical, so it is an error from the first commit.
  {
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/modules/*', '@/modules/**', '**/modules/**'], message: 'src/core must not import from src/modules (spec §4).' },
          { group: ['@/app/*', '@/app/**', '**/app/**'], message: 'src/core must not import from src/app (spec §4).' },
        ],
      }],
    },
  },
  // Coursework D-8: the date bans, repo-wide over clone-owned code. Template-owned paths
  // (scripts/foundation-drift.ts OWNED) and template-authored files a clone never edits are
  // excluded: they are the template's business and foundation:drift keeps them untouched.
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'scripts/**/*.ts', 'tests/**/*.ts', 'tools/**/*.ts'],
    ignores: [
      'src/core/**', 'src/modules/**', 'src/proxy.ts',
      'src/app/(public)/**', 'src/app/onboarding/**', 'src/app/account/**', 'src/app/s/**', 'src/app/api/**',
      'src/app/o/\\[org\\]/settings/**', 'src/app/o/\\[org\\]/projects/**', // `[org]` is a glob class unless escaped
      'tests/invariants/**', 'tests/integration/**', 'tests/helpers/**', 'tests/unit/**', 'tests/fixtures/**',
      'scripts/foundation-*.ts', 'scripts/db-setup.ts', 'scripts/new-project.ts', 'scripts/seed-demo.ts',
    ],
    rules: { ...noDateAxisRules },
  },
  // D-7: the two engines are pure. Nothing under src/graph or src/grades may reach the
  // database, the foundation, the network or a clock. engine:lint greps for the same list
  // (plus floats on the score path) so the rule holds even when eslint is not the runner.
  {
    files: ['src/graph/**/*.ts', 'src/grades/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/core/*', '@/core/**', '**/core/**'], message: 'engines import nothing from the foundation (D-7).' },
          { group: ['@/generated/*', '@/generated/**', '@prisma/*', '@prisma/**', 'prisma'], message: 'engines import no database (D-7).' },
          { group: ['node:fs', 'fs', 'node:fs/promises', 'node:child_process', 'child_process', 'node:http', 'node:https', 'http', 'https'], message: 'engines do no I/O (D-7).' },
        ],
      }],
    },
  },
  // Phase 3, task 3.7 (Bookable A-096): axe runs ONLY through e2e/helpers/a11y.ts, which scans both colour
  // schemes. A spec that loads axe itself would be light-only by default, so it is refused here.
  {
    files: ['e2e/**/*.ts'],
    ignores: ['e2e/helpers/a11y.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['axe-core', 'axe-core/*', '@axe-core/*'], message: 'Use expectAccessible from e2e/helpers/a11y.ts: it scans light AND dark (D-59).' }] }],
      'no-restricted-syntax': ['error', { selector: 'Literal[value=/axe-core/]', message: 'Use expectAccessible from e2e/helpers/a11y.ts: it scans light AND dark (D-59).' }],
    },
  },
];

export default config;
