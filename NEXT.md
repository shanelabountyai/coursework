# NEXT

## ▶ Next item: closure deliverables (global "Definition of done")

Closeout mechanics done 2026-10-27 (local, D-66..D-68): `v1.3.0` tag on origin and CI drift un-pinned; `axe-core` 4.13.0 declared; port 7400 confirmed and in the port table; PRD P0-3 corrected; CLONES.md row as a template PR. CI run for this head: see the last commit / PR #1 checks.

Still to do, in order:
1. ~~`docs/DEMO.md`~~ DONE 2026-10-27 (commands run: fixtures:check, course:eval, progress:verify, seed:fixtures:test, progress:verify:db, seed:school:test, catalog:check x2, server health; the browser steps 2-5 mirror e2e/coursework.spec.ts, not clicked by hand). Was: demo script with screens, commands, accounts (`seed:school`), the acceptance numbers in `docs/CLOSEOUT.md`, troubleshooting, and what to concede up front. Run every command once.
2. ~~Exec brief~~ DONE: https://claude.ai/artifact/6HGL7P9KLq8wjHCUA8WiGy (private; no screenshots block, Quorum added its two later; share it; add the repo/live link if wanted).
3. LinkedIn drafts into the Ledger, mined from the defects (the CI red runs table in this file, the D-41 tag story, the 1.12 `engine:lint`-caught-the-comment run).
4. Cost review: not deployed, so only CI minutes; record keep/off in `docs/decisions.md`.
5. Still open for Shane: review D-51..D-68 and merge PR #1 (or don't); the D-58 org-list hook upstream.

Design: `docs/design-brief.md` + `src/app/globals.css` restyle (CSS only, 2026-10-27); e2e coursework.spec 7/7 incl. axe in both schemes. Not eyeballed in a browser by the agent: Shane to look.

Record every artifact URL in `docs/CLOSEOUT.md`.

## Phase 3 handoff (2026-10-26), kept as written

### State then: decisions pass applied (D-51..D-56) and Phase 3 built on branch `kickoff` (PR #1, never merged). Stopped at the Phase 3 gate; `docs/CLOSEOUT.md` is the draft closeout (the PRD has no Phase 4).

Unattended cloud session, 2026-10-26 (PHASE3-BRIEF, model `claude-opus-5-5`; commit attribution changed to Opus 5.5 as the brief says). **No fixture regeneration**: none of the owner's Coursework decisions (kit items 12–17) changes a rule, a golden case or a fixture; `fixtures/` and the brief §9 hashes are untouched.

### Decisions applied

D-51 learner link (explicit, audited, one per user per org) · D-52 stored `CatalogDraft` per editor · D-53 roles (publish = `org.update`, scores = `results.write`, item completion = the linked learner) · D-54 billing removed by the manifest + `DROP TABLE` migration (supersedes D-34/D-44) · D-55 D-46 confirmed · D-56 `OrgArchive` (insert-only), archived-write guard in all 18 writers + trigger on 13 tables, delete-org refused by the clone hook (closes the D-45 seam). Session defaults D-57 (the one instant→day module, `America/Chicago`), D-58 (`/orgs` hides archived; `/onboarding` seam), D-59 (axe-core from node_modules via one helper), D-60 (current version = newest), D-61 (e2e org per run + a 2099 cohort), D-62 (archive needs a fresh non-demo sign-in), D-63 (not-yours = notFound), D-64 (3.9 outbox dropped).

### Re-proved before any Phase 3 code (locally, then CI run 40345313191 green)

`course:eval` 7/7 files 0 diffs (15 + 10,800 + 300 + 2,051 + 341 + 3 + 106 rows); `progress:verify` 341 + 300, 0 diffs; `fixtures:check` OK; `npm test` 294 / 46 files; `seed:fixtures` 40/7/2/3/300/24/1,352/16/341/2,051 (1,885 + 166)/35/806 in 21 s; `progress:verify --db` 0 diffs.

### Phase 3 (docs/phase-3-tasks.md: 3.0–3.8 done, 3.9 dropped)

- Pages: `/o/[org]` home, `catalog` (editor with live in-browser G1–G5), `catalog/versions`, `learners`, `learners/[code]`, `me`, `cohorts`, `cohorts/[code]/grades`, `cohorts/[code]/drip`, `archive`; `/orgs`. Nine server actions through `orgAction`.
- Local gate at the head: `lint` 0 problems, `typecheck`, `engine:lint` (13 engine / 82 clone files), `foundation:drift` clean (modules removed: billing), `npm test` **299 tests / 47 files**, e2e **16 passed of 16 listed** (7 new), axe 0 violations in light and dark.
- Acceptance numbers on the fixture school: E-01 `ACC-101 -> ACC-201 -> ACC-101`, Publish disabled; E-04 → 17 grandfathered; L-0001 `WRT-201, WRT-301`, 50.00%; L-0076 69.60 D fail `DROPPED:HW:HW1`, exact `6960/1`; L-0003 4 of 9 → 5 of 9 after completing A01.

### CI runs this session

| Run | Head | Result | What |
|---|---|---|---|
| https://github.com/shanelabountyai/coursework/actions/runs/40344199829 | 9337fba | green | decisions doc + billing removal |
| https://github.com/shanelabountyai/coursework/actions/runs/40345313191 | 532bc69 | green | archive, learner link, drafts, today; Phase 1/2 proofs re-run in CI |
| https://github.com/shanelabountyai/coursework/actions/runs/40351666361 | aefd586 | green | Phase 3: pages, actions, e2e with axe (no red runs this session) |
| https://github.com/shanelabountyai/coursework/actions/runs/40352540079 | 5006bb7 | green | Phase 3 gate docs — the head |

### What the sandbox could and could not run

- **Could:** everything except Prisma's schema engine — client generated with `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate` (D-47), migrations applied with `psql -f` in order, full `npm test`, `next build`, and **Playwright e2e** (Chromium 1243 is preinstalled at `/opt/pw-browsers`; the download is skipped by `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`).
- **Could not:** `prisma migrate deploy/diff/validate` (schema engine 403). CI's `migrate diff` is the only proof the two new hand-written migrations equal the schema — it was green.

### What Shane needs to do

See `docs/CLOSEOUT.md` "By hand": review D-51..D-64 and the Phase 3 status table; push the `v1.3.0` tag and un-pin drift (D-41); upstream an org-list hook for `/onboarding` (D-58); declare `axe-core` as a devDependency (D-59); confirm port 7400 and the CLONES.md row; PRD P0-3 sentence; O-9 if wanted.

## Phase 2 handoff (2026-10-26), kept as written


### State then: Phase 2 complete on branch `kickoff` (PR #1, never merged). Stopped at the Phase 2 gate for review.

Unattended cloud build session, 2026-10-26 ("Go phase 2"), model `claude-fable-5-1`, after the Phase 1 session of 2026-10-25/26 (its handoff is kept below). Everything is on `origin/kickoff`; PR #1 (`kickoff` → `main`, https://github.com/shanelabountyai/coursework/pull/1) is the CI trigger and stays open. **Phase 3 is not started**: `docs/phase-3-tasks.md` is a draft for review. **Port 7400 still unverified** (D-33).

### Phase 2 numbers (D-31: oracle agreement on the generator's own data, through the database this time)

- `seed:fixtures` (through the write paths, every row through an engine): catalog `cat-v1` hash `32978f4b…`, 40 courses / 7 certificates / 2 equivalencies, 3 schemes (2 ACCEPT, `SCH-BAD` stored DRAFT), 300 learners, 24 waivers, 1,352 completion events (1,164 PASS), 16 cohorts, 341 enrollments, 2,051 item events → **1,885 `ItemCompletion` rows + 166 `item.refused` audit rows** (154 NOT_RELEASED, 12 NOT_ENROLLED), 35 assignments, 806 submissions; 2,629 audit rows across 11 actions, none without an actor; 22 s locally.
- From the database rows, 0 diffs against the oracle: eligibility **10,800** rows, certificate progress + paths **300**, enrollment progress **341**, grades **106** (`tests/course/fixtures-db.test.ts`; `progress:verify --db` 0 diffs, also a CI step).
- E-01..E-15 through the live book: 15 attempts, 4 versions, verdicts and cycle paths equal `expected_edits.csv`; E-04 flags 17 enrollments and E-11 6, all still `IN_PROGRESS` (V3).
- Tamper: UPDATE and DELETE refused on all 5 append-only tables (Prisma and raw SQL); a planted `Enrollment.progressBp` column fails the schema test; one `ItemCompletion` deleted with the trigger disabled is exactly one diff (4 → 3 of 9, 4444 → 3333).
- Local gate: `lint` (1 template warning), `typecheck`, `engine:lint` clean (13 engine files, 55 clone files), `foundation:drift` clean, `npm test` **295 tests / 45 files** (Phase 1: 268 / 40), `course:eval` and `progress:verify` unchanged (0 diffs).

### What Shane needs to do

1. **Review** `docs/phase-2-tasks.md` (status table at the bottom: where the build departed from the draft) and decisions **D-42..D-50**; then `docs/phase-3-tasks.md` (draft; three open questions at the bottom). Reply go / changes.
2. **D-45 seam**: an org with catalog history cannot be deleted through `deleteOrg` (Restrict FKs into append-only tables). Decide for Phase 3: archive, or allow the delete inside `deleteOrg` only.
3. **D-46**: a refused item completion is an audit row and no table row (PRD P0-6 wording). If you want refused rows in `ItemCompletion` instead (the draft 2.5 wording), say so — the engine call is the same; only the write changes.
4. Still open from Phase 1: push the `v1.3.0` tag and un-pin `foundation:drift` in CI (D-41); `CLONES.md` row; PRD P0-3 drip-order sentence; confirm port 7400.

### CI runs this session (the gate)

| Run | Head | Result | Why |
|---|---|---|---|
| https://github.com/shanelabountyai/coursework/actions/runs/40319180795 | 527f082 | **red** at `migrate diff` | the step used Prisma 6 flags (`--from-url`), which Prisma 7 removed; logs are unreadable from the cloud, so the next two pushes made the step print its output into an error annotation (readable through the API) |
| https://github.com/shanelabountyai/coursework/actions/runs/40320245350 | 1d87c91 | **red** at `migrate diff` | same cause; the PR-comment diagnostic did not post (token) |
| https://github.com/shanelabountyai/coursework/actions/runs/40320706824 | 03cb04a | **red** at `migrate diff` | same cause, now with the message in the annotation: `--from-url was removed` |
| https://github.com/shanelabountyai/coursework/actions/runs/40321125370 | e66d14d | **green** | flags fixed (`--from-config-datasource --to-schema prisma/schema`); the whole Phase 2 tree: migrate diff empty (hand-written SQL = schema), 295 vitest tests, Playwright |
| https://github.com/shanelabountyai/coursework/actions/runs/40321531319 | 5bcc251 | **green** | 2.11 CI seed (`ci-fixtures`) + `progress:verify --db` steps, docs, Phase 3 draft — the Phase 2 head |

### What the sandbox could and could not run (D-47)

- **Could, this time:** `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate` generates the client without the engine download, so `npm run typecheck` and the **full** `npm test` ran locally against a local Postgres 16 (started with `service postgresql start`; migrations applied in order with `psql -f` from a scratchpad script, since `prisma migrate deploy` needs the schema engine). `.env.test` / `.env.local` written locally (gitignored).
- **Could not:** `prisma migrate deploy`, `migrate diff`, `migrate dev --create-only` (403 on `binaries.prisma.sh`, verbatim error in the Phase 1 section below). The migration SQL is hand-written; **CI's `migrate diff` is the only proof it equals the schema**. Playwright not attempted locally. CI job logs still unreadable (`Forbidden` on the blob URL); annotations are readable, so failing steps now put their output there.

## Phase 1 handoff (2026-10-25/26), kept as written

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
| https://github.com/shanelabountyai/coursework/actions/runs/40261465771 | 0a6503b | **red, but for the wrong reason** | first 1.12 attempt: the flip was right but its comment held `1.12`, which `engine:lint`'s decimal-literal grep under `src/grades/` caught before `course:eval` ran. The lint reads comments too — by design, it is a grep. Redone below |
| https://github.com/shanelabountyai/coursework/actions/runs/40261661360 | 4965a52 | green | revert of the first flip + Phase 1 gate docs |
| https://github.com/shanelabountyai/coursework/actions/runs/40261702476 | cf25905 | **red on purpose at `course:eval`** | task 1.12 proof: S5 tie order flipped (lint-clean comment), GS-03 9233 → 9250, 15 grade rows diverge; `engine:lint` passed, `course:eval` failed |
| https://github.com/shanelabountyai/coursework/actions/runs/40261927041 | 93c3bbe | green | revert of cf25905 + run links; the Phase 1 head |

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
- **1.12 CI gate** — red run 40261702476 (deliberate, fails at `course:eval`), green run 40261661360 before it and the revert push after it; the first attempt 40261465771 was red at `engine:lint` instead (comment held a decimal), so it was redone.
- **Pre-Phase-2 check** — `catalog:check` with `MGT-301 → any(MGT-201, MGT-202, MGT-401)` prints `REJECT:CYCLE` `MGT-301 -> MGT-401 -> MGT-301` and nothing else; `fixtures/` unchanged. `docs/phase-2-tasks.md` drafted.

### Decided this session

D-32 reuse scan skipped · D-33 port unverified · D-34 billing/share links unwired · D-35 lint scope and lineage · D-36 canonical JSON written fresh · D-37 `Rational` shape · D-38 `tests/engine/` + `test:engine` · D-39 CI `TZ` · D-40 zero states · D-41 drift pinned to the v1.3.0 commit. Also: drip built before the gradebook; the CSV reader is owned here (`scripts/lib/csv.ts`); no dependency added.

### Left open

O-1..O-9 defaults in force (none touched). Phase 2 questions at the bottom of `docs/phase-2-tasks.md`: `Learner` vs foundation `User`; remove billing by the manifest or keep unwired; `CatalogVersion.content` JSONB vs normalised `Course` rows.

### Kickoff measurements (oracle on the frozen fixtures)

catalog `cat-v1` 40 courses / 56 edges / 0 cycles, hash `32978f4b…`; 15 draft edits → 4 accept, 11 reject (6 cycles); eligibility 10,800 rows (COMPLETED 1,140 / ELIGIBLE 2,613 / BLOCKED 7,047); 300 paths, lengths 0–9, max 16 branch combinations; drip 2,051 events (1,885 accept / 154 not released / 12 not enrolled); 106 grades (67 pass / 39 fail), 0 within 0.5 hp of the threshold.

### History

**2026-10-25 (kickoff kit):** PRD v1.0, decisions D-1..D-31 + O-1..O-9, domain brief with rules G1–G9 / R1–R3 / P1–P2 / V1–V3 / S1–S9, golden cases GG-01..GG-20 and GS-01..GS-15, kickoff measurements, portfolio overlap, Phase 1 tasks, CLAUDE.md, KICKOFF.md, `.claude/settings.json` (Fable pin). Tools in `tools/` (Python 3, stdlib). Fixtures generated twice in separate directories with identical sha256 values (brief §9).
