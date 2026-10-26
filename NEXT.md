# NEXT

## ▶ State: Phase 1 complete on branch `kickoff` (PR #1, never merged). Stopped at the Phase 1 gate for review.

Unattended cloud build session, 2026-10-25/26, model `claude-fable-5-1`. Everything is on `origin/kickoff`; PR #1 (`kickoff` → `main`, https://github.com/shanelabountyai/coursework/pull/1) is the CI trigger and stays open. **Phase 2 is not started**: `docs/phase-2-tasks.md` is a draft for review. **Port 7400 unverified against the port table; Shane confirms** (D-33).

### Numbers (D-31: oracle agreement on the generator's own data, not a product claim)

`npm run course:eval` → 7/7 `expected_*.csv` with **0 diffs**: edits 15, eligibility 10,800, progress 300, drip 2,051, enrollment progress 341, schemes 3, grades 106; `total diffs 0; max branch combinations 16`; the §8 report equals `fixtures/samples/reference_graph.output.txt` and `reference_grades.output.txt` line for line. `npm run progress:verify` → 341 + 300 values, 0 diffs. `npm run test:engine` → 96 tests (GG-01..GG-20, GS-01..GS-15, Rational, days, CSV, the eval diffs). `npm run engine:lint` → clean. `npm run fixtures:check` → `OK seed=20261025 catalog_hash=32978f4b…`. Full table: `docs/EVAL.md`.

### What Shane needs to do

1. **Review** `docs/phase-1-plan.md` (8 contradictions, defaults D-32..D-41) and `docs/phase-2-tasks.md` (draft; three open questions at the bottom). Reply go / changes.
2. **Push the template tag** from the Mac: `git push origin v1.3.0` (the clone repo has no tags; the cloud could not push one — D-41). Then change the CI step back to plain `npm run foundation:drift` (it is pinned `--base e8c0f74…` in `.github/workflows/ci.yml`).
3. **CLONES.md row** on `saas-foundation` (KICKOFF step 3) — not opened from the cloud (no instruction to push to the template remote; KICKOFF lists it under "still to do by hand").
4. **PRD P0-3** lists the drip codes "in that check order" as NOT_RELEASED, NOT_ENROLLED, UNKNOWN_ITEM; brief R3 / D-20 / the oracle check enrollment → item → release and the engine follows them. Correct the PRD sentence (plan contradiction 5).
5. Confirm port 7400 and add the port-table row (D-5, D-33).

### CI runs (the gate)

| Run | Head | Result | Why |
|---|---|---|---|
| https://github.com/shanelabountyai/coursework/actions/runs/40238858812 | bc83c1a (kit) | green | before this session |
| https://github.com/shanelabountyai/coursework/actions/runs/40259270242 | 135b1f0 | **red** | `foundation:drift`: shallow checkout had no `v1.3.0` tag |
| https://github.com/shanelabountyai/coursework/actions/runs/40259527052 | 54a6f7b | **red** | `foundation:drift`: `fetch-depth: 0` does not help — the clone repo has no tags at all (D-41) |
| https://github.com/shanelabountyai/coursework/actions/runs/40260733897 | 601746c | green | drift pinned to the v1.3.0 commit; engines through 1.8 |
| https://github.com/shanelabountyai/coursework/actions/runs/40261205255 | 6ced3ab | green | `course:eval` and `progress:verify` wired (0 diffs in CI) |
| https://github.com/shanelabountyai/coursework/actions/runs/40261465771 | 0a6503b | **red on purpose** | task 1.12 proof: S5 tie order flipped, GS-03 9233 → 9250, 15 grade rows diverge |
| (see below) | revert + docs | green expected | task 1.12 green half; recorded at the end of this file |

### What the sandbox could not run (D-4: CI is the gate)

- `npm ci` fails at `postinstall` (`prisma generate`), verbatim:
  ```
  Error: Failed to fetch sha256 checksum at https://binaries.prisma.sh/all_commits/0edf323efd1d98336f3f0a68684b56f689b900d3/debian-openssl-3.0.x/schema-engine.sha256 - 403 Forbidden
  ```
  and with `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1`:
  ```
  Error: Failed to fetch the engine file at https://binaries.prisma.sh/all_commits/0edf323efd1d98336f3f0a68684b56f689b900d3/debian-openssl-3.0.x/schema-engine.gz - 403 Forbidden
  ```
  Worked around locally with `npm ci --ignore-scripts`. Consequences: `src/generated/prisma` does not exist here, so `npm run typecheck` reports `Cannot find module '@/generated/prisma/enums'` in the template's tests (not a Coursework defect), and `npm test` (database half) cannot run. Local Postgres 16 is installed but down and the migrations need the Prisma schema engine. Not patched; CI runs all of it and is green.
- Playwright browsers: not attempted locally (e2e is the template's, unchanged).
- `git push origin v1.3.0` and the REST `git/refs` write are refused by the session's proxy (D-41).
- CI logs cannot be downloaded through the proxy (`Forbidden` on the blob URL); failures were diagnosed by reproducing in a fresh clone.
- What does run locally: `npm run lint`, `npm run foundation:drift` (clean against v1.3.0), `npm run engine:lint`, `npm run fixtures:check`, `npm run test:engine`, `course:eval`, `progress:verify`, `catalog:check`, and `tsc --noEmit` filtered to Coursework files (clean).

### Task log (Phase 1, all done)

- **1.1 Scaffold** — commands exist; scope banner verbatim in README; model pin present; `?connection_limit=10&pool_timeout=20` on CI's URLs and written by `scripts/db-setup.ts`; `vercel.json` has the house `ignoreCommand`; D-8 lint ported from Bookable (D-35); billing and share links left unwired (D-34); reuse scan skipped (D-32); CI gained `foundation:drift`, `engine:lint`, `course:eval`, `progress:verify`, `fixtures:check` under job-level `TZ=America/Chicago` (D-39).
- **1.2 Fixtures committed** — from the kit; `fixtures:check` OK; CI runs it after `course:eval` so a write into `fixtures/` fails the tree check.
- **1.3 Port, with lineage** — Bookable lint ported (D-35); canonical JSON + SHA-256 written fresh, Adjuster unreachable (D-36); `catalogHash(cat-v1)` = `32978f4b…`.
- **1.4 Days** — `src/graph/days.ts`; GG-20 dates; 47,847-day round trip; planted `new Date("…")` fails both `eslint` and `engine:lint` (checked, then removed).
- **1.5 Expressions and graph** — `expr.ts`, `dag.ts`, `publish.ts`; GG-01..GG-09; 15/15 edits; `catalog:check` CLI.
- **1.6 Eligibility** — `eligibility.ts`; GG-10..GG-15; 10,800/10,800 rows.
- **1.7 Path and grandfather** — `path.ts`, `retro.ts`; GG-16..GG-19; 300/300 paths; grandfathered 17/6/0/0.
- **1.8 Rational and gradebook** — `rational.ts`, `scheme.ts`, `grade.ts`; GS-01..GS-15; 106/106 grades with `exact` and `categories`.
- **1.9 Drip and `course:eval`** — `drip.ts`; `scripts/course-eval.ts` + `scripts/lib/{csv,fixtures,eval}.ts`; both reference outputs line for line; exit 1 on a planted row.
- **1.10 `progress:verify`** — 341 + 300 from events; `--drop-event IE-00001` moves exactly one row.
- **1.11 `docs/EVAL.md`** — every number next to its command.
- **1.12 CI gate** — red run 40261465771 (deliberate), green run after the revert (below).
- **Pre-Phase-2 check** — `catalog:check` with `MGT-301 → any(MGT-201, MGT-202, MGT-401)` prints `REJECT:CYCLE` `MGT-301 -> MGT-401 -> MGT-301` and nothing else; `fixtures/` unchanged. `docs/phase-2-tasks.md` drafted.

### Decided this session

D-32 reuse scan skipped · D-33 port unverified · D-34 billing/share links unwired · D-35 lint scope and lineage · D-36 canonical JSON written fresh · D-37 `Rational` shape · D-38 `tests/engine/` + `test:engine` · D-39 CI `TZ` · D-40 zero states · D-41 drift pinned to the v1.3.0 commit. Also: drip built before the gradebook; the CSV reader is owned here (`scripts/lib/csv.ts`); no dependency added.

### Left open

O-1..O-9 defaults in force (none touched). Phase 2 questions at the bottom of `docs/phase-2-tasks.md`: `Learner` vs foundation `User`; remove billing by the manifest or keep unwired; `CatalogVersion.content` JSONB vs normalised `Course` rows.

### Kickoff measurements (oracle on the frozen fixtures)

catalog `cat-v1` 40 courses / 56 edges / 0 cycles, hash `32978f4b…`; 15 draft edits → 4 accept, 11 reject (6 cycles); eligibility 10,800 rows (COMPLETED 1,140 / ELIGIBLE 2,613 / BLOCKED 7,047); 300 paths, lengths 0–9, max 16 branch combinations; drip 2,051 events (1,885 accept / 154 not released / 12 not enrolled); 106 grades (67 pass / 39 fail), 0 within 0.5 hp of the threshold.

### History

**2026-10-25 (kickoff kit):** PRD v1.0, decisions D-1..D-31 + O-1..O-9, domain brief with rules G1–G9 / R1–R3 / P1–P2 / V1–V3 / S1–S9, golden cases GG-01..GG-20 and GS-01..GS-15, kickoff measurements, portfolio overlap, Phase 1 tasks, CLAUDE.md, KICKOFF.md, `.claude/settings.json` (Fable pin). Tools in `tools/` (Python 3, stdlib). Fixtures generated twice in separate directories with identical sha256 values (brief §9).
