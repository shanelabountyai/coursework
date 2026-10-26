# NEXT

## ▶ State: Phase 1 in progress on branch `kickoff` (PR #1, never merged)

Unattended cloud build session, 2026-10-25/26, model `claude-fable-5-1`. Everything below is on `origin/kickoff`; PR #1 (`kickoff` → `main`, https://github.com/shanelabountyai/coursework/pull/1) is the CI trigger and stays open. **Port 7400 unverified against the port table; Shane confirms** (D-33).

### What the sandbox could not run (D-4: CI is the gate)

- `npm ci` fails at `postinstall` (`prisma generate`), verbatim:
  ```
  Error: Failed to fetch sha256 checksum at https://binaries.prisma.sh/all_commits/0edf323efd1d98336f3f0a68684b56f689b900d3/debian-openssl-3.0.x/schema-engine.sha256 - 403 Forbidden
  ```
  and with `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1`:
  ```
  Error: Failed to fetch the engine file at https://binaries.prisma.sh/all_commits/0edf323efd1d98336f3f0a68684b56f689b900d3/debian-openssl-3.0.x/schema-engine.gz - 403 Forbidden
  ```
  Worked around locally with `npm ci --ignore-scripts`. Consequences: `src/generated/prisma` does not exist here, so `npm run typecheck` reports `Cannot find module '@/generated/prisma/enums'` in the template's tests (not a Coursework defect), and `npm test` (database half) cannot run. Local Postgres 16 is installed but down and the migrations need the Prisma schema engine. Not patched; CI runs all of it.
- Playwright browsers: not attempted locally (e2e is the template's, unchanged).
- What does run locally: `npm run lint`, `npm run foundation:drift` (clean against v1.3.0), `npm run engine:lint`, `npm run fixtures:check` (OK, seed 20261025, catalog hash `32978f4b…`), `npm run test:engine`, `course:eval`, `progress:verify`, `catalog:check`.

### Task log

- **1.1 Scaffold** — done. Commands exist (`course:eval` / `progress:verify` / `catalog:check` print their zero state and exit 0; `fixtures:check`; `engine:lint`; `test:engine`). Scope banner verbatim in README. Model pin already in `.claude/settings.json`. `?connection_limit=10&pool_timeout=20` is on CI's URLs and written by `scripts/db-setup.ts` for local ones. `vercel.json` has the house `ignoreCommand`. D-8 lint ported from Bookable (`eslint-rules/no-date-axis.mjs`, D-35). Billing and share links left unwired (D-34). Reuse scan skipped (D-32). CI gained `foundation:drift`, `engine:lint`, `course:eval`, `progress:verify`, `fixtures:check` steps and job-level `TZ=America/Chicago` (D-39). The CLONES.md row on the template is Shane's (KICKOFF "still to do by hand"); not opened from here.
- **1.2 Fixtures committed** — already in the branch from the kit; `fixtures:check` OK on this checkout; CI runs it from this commit on.

### Kickoff measurements (oracle on the frozen fixtures)

catalog `cat-v1` 40 courses / 56 edges / 0 cycles, hash `32978f4b…`; 15 draft edits → 4 accept, 11 reject (6 cycles); eligibility 10,800 rows (COMPLETED 1,140 / ELIGIBLE 2,613 / BLOCKED 7,047); 300 paths, lengths 0–9, max 16 branch combinations; drip 2,051 events (1,885 accept / 154 not released / 12 not enrolled); 106 grades (67 pass / 39 fail), 0 within 0.5 hp of the threshold. These prove oracle agreement on the generator's own data (D-31), nothing about any real school.

### History

**2026-10-25 (kickoff kit):** PRD v1.0, decisions D-1..D-31 + O-1..O-9, domain brief with rules G1–G9 / R1–R3 / P1–P2 / V1–V3 / S1–S9, golden cases GG-01..GG-20 and GS-01..GS-15, kickoff measurements, portfolio overlap, Phase 1 tasks, CLAUDE.md, KICKOFF.md, `.claude/settings.json` (Fable pin). Tools in `tools/` (Python 3, stdlib). Fixtures generated twice in separate directories with identical sha256 values (brief §9).
