# CLAUDE.md — Coursework

Learning project: a course platform for a small training school whose catalog is a prerequisite DAG. Cycle detection on publish with the cycle path named, topological order, eligibility with a minimal missing set, an exact shortest path to a certificate over AND/OR prerequisites, progress derived from completion events against an immutable content-hashed catalog version, drip-released content on a calendar-day axis, and a weighted gradebook in integer hundredths of a percent with exact rationals rounded once. **Synthetic data only. No real school, learner or transcript; nothing here is a credential.** Keep the scope-honesty banner verbatim in README.md.

Read first: `prd-coursework.md` (what), `docs/decisions.md` (authoritative; outranks the PRD), `docs/domain-brief.md` (vocabulary, rules G/R/P/V/S, golden cases, measurements, fixture hashes), `docs/portfolio-overlap.md` (what to port, what not to build). Current work: `docs/phase-1-tasks.md`. Session state: `NEXT.md`.

## Non-negotiables
1. **A cycle never reaches a published catalog version.** Publish runs G1–G5 and refuses `REJECT:CYCLE` with every cycle path listed in G3 order. There is no code path that writes a `CatalogVersion` without the engine's `ACCEPT`.
2. **Progress is never stored.** Course progress, certificate progress, eligibility and grades are computed from events and a catalog version on every read (P1). No `progress`, `percent` or `eligible` column exists; a schema test asserts it. Display caches, if any, carry the source hash and are never read as truth.
3. **The engines are pure.** `src/graph/` and `src/grades/` import no database, clock, randomness, network or model client (`engine:lint`). Same inputs, same output, byte for byte against the Python oracle.
4. **Integers and rationals, never floats.** Scores are hp (hundredths of a percent), weights are bp, intermediates are `Rational` with BigInt; the final grade rounds half-up exactly once (S8). No float on any score path; `engine:lint` greps for `parseFloat`, `toFixed`, `Math.round` and `/ 100` under `src/grades/`.
5. **Days are strings.** `YYYY-MM-DD` on a calendar axis; arithmetic only via `daysFromCivil`/`civilFromDays`. Banned repo-wide: `new Date(string)`, `Date.parse`, `toISOString().slice(0,10)`, `getTimezoneOffset`, `@db.Date`. Drip release compares day numbers (R1–R2).
6. **Fixtures are frozen.** `fixtures/` is generated once by `tools/build_fixtures.py --seed 20261025`; `tools/verify_fixtures.py` prints OK in CI. Product code never reads `expected_*.csv`; only `course:eval` and `progress:verify` do.
7. **Catalog versions are immutable and content-hashed** (V1); completion events and enrollments record the version they were evaluated under (V2). An edit that would retroactively block an in-progress learner is reported as `GRANDFATHERED`, never blocked (G9).
8. **Never edit an expected value to pass a test.** GG/GS values and `expected_*.csv` come from the oracle in `tools/`. If TypeScript disagrees, stop and show the owner both derivations.
9. **Numbers, not adjectives.** Screens, commit messages and write-ups report row counts, diff counts, the catalog hash and the fixture seed. Never "accurate", "robust", "optimal" without the number (D-31).
10. **Nothing leaves.** Unlock notices are queued to the outbox and never sent; no email or external API in Phases 1–3.
11. **CI is the gate.** Built unattended in a cloud session; delivered as branch + PR, never merged by the agent. If the sandbox cannot download Prisma engines or Playwright browsers, report the failure verbatim in `NEXT.md` and let CI decide (D-4).

## Working rules
- **TDD order:** day arithmetic (GG-20) → expression validation (G1) → edges, SCC, cycle path, topo (GG-01..09) → learner state and satisfaction (G6) → missing set and eligibility (GG-10..15) → shortest path (GG-16..18) → grandfather report (GG-19) → drip (R1–R3) → `Rational` → gradebook S1–S9 (GS-01..15) → `course:eval` and `progress:verify` → (Phase 2) schema and triggers → (Phase 3) UI. Write the failing test from the golden table first.
- **Fixtures:** tests read `fixtures/`; code never generates them. To change a fixture, change `docs/decisions.md` first, regenerate with `tools/build_fixtures.py`, re-run both reference scripts with `--write-expected`, confirm `verify_fixtures.py` and `golden_answers.py` print OK, update the hashes in `docs/domain-brief.md` §9, review the diff.
- `tools/*.py` are test oracles, not product code. Don't port them line for line; `courselib.py` is the spec made executable, the TypeScript is written from `docs/domain-brief.md` §4–§6 and must agree with it on every row.
- **Port before you write.** Donors are listed in `docs/portfolio-overlap.md`. Read the donor, port it, record the lineage in `docs/decisions.md`.
- Phase gate: don't start the next phase until the current phase's exit criteria pass. Phases: 1 engines + eval (no writes) → 2 schema, writes, proofs → 3 UI. Write the next phase's task list at the gate and stop for review.
- Adding a rule code, flag, scheme field or expression form needs a `docs/decisions.md` entry and a golden case.
- Prerequisite expressions, equivalencies, certificates, schemes and bands are JSON data, not TypeScript.
- Small commits, one concern each, naming specific files (never `git add -A`). Note seams for non-goals but don't build them.
- **Ask before adding dependencies.** Ask-before-add list: graph library, rational/bignum library, date library, CSV library, charting library. Own the DAG, the rationals and the day math.
- **Model is pinned to Claude Fable 5.1 (`claude-fable-5-1`)** in `.claude/settings.json` (D-3).
- End each session by updating `NEXT.md`: what was built, decided, left open, the gate output, and anything the sandbox could not run.

## Session 0 — reuse check
The reuse scanner (`~/Projects/reuse-scan.py`) is not reachable from the cloud session. Record in `docs/decisions.md`: "Reuse check skipped: not reachable from the cloud; `docs/portfolio-overlap.md` stands in; Shane may run it locally." Then read `docs/portfolio-overlap.md` and port what it names before writing the equivalent.

## Stack
TypeScript on a clone of saas-foundation v1.3.0: Next.js 16, Prisma 7, PostgreSQL 17, vitest, Playwright. **Port 6400** (proposed; unverified against the port table from the cloud — D-5; add the row when confirmed). Foundation modules: keep orgs, roles, invites, audit, notifications (outbox for unlock notices); remove or leave unwired billing and share links (D-2). Immutability via triggers as hand-written SQL in Prisma migrations. Python only in `tools/` (stdlib only). Template-owned paths (`src/core/**`, `tests/invariants/**`, core migrations, security routes) are never edited here. Local `DATABASE_URL`s carry `?connection_limit=10&pool_timeout=20`. `vercel.json` carries the house `ignoreCommand`. CI runs with a non-UTC `TZ`.

## Commands (create in Phase 1, task 1.1)
- `npm test` — vitest against the local `coursework_test` database
- `npm run course:eval` — loads `fixtures/`, runs both engines, prints brief §8, diffs the seven `expected_*.csv`; exits non-zero on any diff. Prints `0 rows` and exits 0 until task 1.9
- `npm run progress:verify` — recomputes 341 enrollment and 300 certificate progress values from events and diffs `expected_enrollment_progress.csv` / `expected_progress.csv`
- `npm run fixtures:check` — `python3 -I tools/verify_fixtures.py && python3 -I tools/golden_answers.py && git diff --exit-code fixtures/ && test -z "$(git status --porcelain fixtures/)"`
- `npm run engine:lint` — greps `src/graph/` and `src/grades/` for `Date.now`, `new Date`, `Math.random`, `prisma`, `fetch`, `anthropic`, `@/core`; greps `src/grades/` for `parseFloat`, `toFixed`, `Math.round`; greps the repo for the D-8 date bans
- `npm run catalog:check -- --edit <json>` — Phase 1 CLI: applies a draft edit to `fixtures/catalog.json` and prints the publish verdict with cycle paths and the grandfather report; writes nothing

## Definition of done (any task)
Tests green, `course:eval` matching the reference with 0 diffs, `fixtures:check` OK, `engine:lint` OK, no float on a score path, no `Date` on a day path, decisions doc updated if a rule changed, `NEXT.md` updated, numbers (not adjectives) in the commit message when a measurement changed.
