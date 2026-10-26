# Phase 1 plan — written 2026-10-25 by the unattended build session

Order of work, donors per port, every contradiction found in the docs, every default taken, and what the sandbox could not run. `docs/decisions.md` D-32..D-40 record the defaults as decisions; this file is the narrative. The owner can reverse any default by editing the decision and the code that cites it.

## Order

Tasks 1.1 and 1.2 are done (see `NEXT.md`). The remaining tasks follow CLAUDE.md's TDD order; each step is a failing vitest case in `tests/engine/` copied from `tools/golden_answers.py`, then the engine code, then `course:eval` re-run with the diff count in the commit message.

| Step | Task | Module | Golden / fixture that proves it |
|---|---|---|---|
| 1 | 1.4 | `src/graph/days.ts` — `daysFromCivil`, `civilFromDays`, `addDays` | GG-20 four dates; round trip 1970-01-01..2100-12-31; planted `new Date("…")` fails `engine:lint` |
| 2 | 1.3 | `src/graph/canonical.ts` — canonical JSON + `sha256Hex` + `catalogHash` | GG-20 hash `32978f4b…`; E-15 changes it; a float is refused |
| 3 | 1.5 | `src/graph/expr.ts` — G1 validation, `leaves` | GG-09 (E-08 / E-09 / E-10) |
| 4 | 1.5 | `src/graph/dag.ts` — G2 edges, G3 Tarjan + reported path, G4 Kahn | GG-01 topo string, GG-02..GG-07 cycle paths |
| 5 | 1.5 | `src/graph/publish.ts` — G5 stage order, `applyEdit`, `validateCatalog` | GG-08, GG-09; `catalog:check` over all 15 edits = `expected_edits.csv` columns `result`, `cycles`, `errors` |
| 6 | 1.6 | `src/graph/eligibility.ts` — `LearnerState`, `satisfied` (G6), `missingSet` (G7), `eligibility` | GG-10..GG-15; 10,800 rows of `expected_eligibility.csv` |
| 7 | 1.7 | `src/graph/path.ts` (G8), `src/graph/retro.ts` (G9) | GG-16..GG-19; `expected_progress.csv` `path_len`/`path`/`next`; `expected_edits.csv` `grandfathered` 17 / 6 / 0 / 0 |
| 8 | 1.9a | `src/graph/drip.ts` (R1–R3) | GG-20 three verdicts; 2,051 rows of `expected_drip.csv` (1,885 / 154 / 12) |
| 9 | 1.8 | `src/grades/rational.ts`, `src/grades/scheme.ts` (S1), `src/grades/grade.ts` (S2–S9) | GS-01..GS-15; 106 rows of `expected_grades.csv` with `exact` and `categories` |
| 10 | 1.9b | `scripts/course-eval.ts` + `scripts/lib/` loaders (CSV reader owned here, no library) | both reference outputs reproduced; exit non-zero on a planted one-row change |
| 11 | 1.10 | `scripts/progress-verify.ts` | 341 + 300 values, 0 diffs; fails when one accepted item event is removed |
| 12 | 1.11 | `docs/EVAL.md` | every number next to the command that prints it |
| 13 | 1.12 | CI gate proof | one throwaway commit flipping the S5 tie order (GS-03 9233 → 9250) pushed and reverted; both runs linked in `NEXT.md` |
| 14 | gate | `MGT-301` → `any(MGT-201, MGT-202, MGT-401)` through `catalog:check` prints `REJECT:CYCLE` `MGT-301 -> MGT-401 -> MGT-301`; write `docs/phase-2-tasks.md`; stop | — |

Drip (step 8) is pulled ahead of the gradebook because it is forty lines on top of `days.ts` and lets `course:eval`'s graph half be complete before the grades half starts.

## Donors per port (task 1.3)

| Port | Donor named in `portfolio-overlap.md` | Reachable from the cloud? | What was done |
|---|---|---|---|
| D-8 date bans as lint | Bookable `eslint.config.mjs` + `eslint-rules/no-axis-crossing.mjs` | **Yes** — public repo, also cloned at `../bookable-appointment-service` | Ported as `eslint-rules/no-date-axis.mjs` (D-35) |
| `daysFromCivil` / `civilFromDays` | Bookable `packages/core/time` (instants, not days) / `tools/courselib.py` | Bookable's module is an instant module and does not have the civil-day functions; `courselib.py` has them | Written from `courselib.py` lines 41–67 (Hinnant's algorithm, integer only) |
| Canonical JSON + SHA-256 | Adjuster `src/rules/canonical.ts` | **No** (`GitHub access to this repository is not enabled for this session`) | Written fresh from the brief to agree with `courselib.canonical()` (D-36) |
| Rational / one numeric module + float lint | LoanBook `src/ledger/money.ts` | **No** | Written fresh (D-37); the lint shape (grep list in a script) follows Housefile's `model:lint` description, which is readable at `../housefile/CLAUDE.md` |
| Frozen fixtures + oracle + goldens + verify | Housefile `tools/` | **Yes** — cloned at `../housefile` | Already the kit's shape; nothing to port in Phase 1 |
| Outbox pattern | callboard | **No** | Phase 3 only; not needed now |
| Derived aggregates | Pulseboard `src/lib/rollups.ts` | **No** | Discipline only (P1); no code to port |
| Pure engine rules | Bracketry `src/lib/league/` | **No** | Discipline only (D-7); no code to port |

## Contradictions and things that cannot be built as written

1. **Branch and PR.** `KICKOFF.md` step 8 says branch `phase-1`, three commits, open a PR titled "Phase 1 kickoff: kit, oracle, fixtures". The build brief says branch `kickoff`, and PR #1 (`kickoff` → `main`, "Kickoff kit — Coursework (Build Log #15)") already exists and is green. Followed the brief: work on `kickoff`, PR #1 is the CI trigger. Not resolved by me: whether the owner wants a second PR titled as KICKOFF says.
2. **`KICKOFF.md` steps 9 and the closing paragraph say stop after the plan ("Do not create … engine code before Shane has reviewed the plan"); the build brief says continue through Phase 1 on plan defaults.** Followed the brief (it is the later instruction and gives its reasoning: Phase 1 writes nothing and lives on a never-merged branch). Every default is in this file and in `docs/decisions.md` so each can be reversed.
3. **CLONES.md row on `saas-foundation`** (task 1.1, D-5, KICKOFF step 3) needs a push to the template repo. The session has read access to `shanelabountyai/saas-foundation` through the `template` remote but no instruction to push there, and KICKOFF's "Still to do by hand (Shane)" already lists merging that PR as Shane's. Not opened from the cloud; recorded in `NEXT.md`.
4. **`engine:lint` "greps the repo for the D-8 date bans" (CLAUDE.md Commands) cannot be literally repo-wide**: template-authored files the clone never edits use `new Date(string)` and `toISOString().slice(0, 10)` on instants (`src/app/o/[org]/projects/page.tsx:40`, `src/app/o/[org]/settings/billing/page.tsx:23`, `tests/integration/*.test.ts`). Scoped to clone-owned paths (D-35). The engines and every Coursework file are covered.
5. **PRD P0-3 lists the drip codes as "`REJECT:NOT_RELEASED`, `REJECT:NOT_ENROLLED`, `REJECT:UNKNOWN_ITEM` in that check order"; brief R3, D-20 and `courselib.check_item_completion` check enrollment → item → release.** The brief and decisions outrank the PRD; the engine checks enrollment first. The PRD sentence should be corrected by the owner.
6. **Template-owned `tests/` rely on the generated Prisma client**, so `npm run typecheck` fails in any sandbox that cannot download Prisma engines. Not a Coursework defect and not patched (KICKOFF step 4: "Do not patch the template to get past it"); CI typechecks with the client generated.
7. **`docs/portfolio-overlap.md` names Bookable `packages/core/time` as the donor for the day-string rules**, but that module is Bookable's instant/wall-time boundary and has no civil-day arithmetic; the day arithmetic donor is in fact `tools/courselib.py` (which the brief says is the executable spec). Lint was the real port from Bookable.
8. **`CLAUDE.md` "Commands" says `npm test` runs "against the local `coursework_test` database"** while the Phase 1 engines need no database. Added `npm run test:engine` (D-38) rather than changing `npm test`; CI still runs `npm test`.

Nothing in the brief's rules G1–G9, R1–R3, S1–S9 contradicted `courselib.py` on reading; the golden-answers script ends with OK and `verify_fixtures.py` ends with OK on this checkout (`OK seed=20261025 catalog_hash=32978f4b386ea7ce1fdf1018f67633def259d08808c501cdedea84c849197e8d`).

## Defaults taken

D-32 reuse scan skipped · D-33 port 7400 unverified · D-34 billing and share links left unwired · D-35 D-8 lint scope · D-36 canonical JSON written fresh · D-37 `Rational` shape · D-38 `tests/engine/` and `test:engine` · D-39 job-level `TZ` in CI · D-40 zero states. Plus, from this plan: drip built before the gradebook (ordering only); the CSV reader is written here (no library; ask-before-add list); engine test files are one per module and copy the golden inputs from `tools/golden_answers.py` by hand rather than reading `build_fixtures.py` at test time, because product-side tests must not import the generator.

## What the sandbox could not run

See `NEXT.md` "What the sandbox could not run": Prisma engine download 403 (verbatim), so no `src/generated`, no `typecheck` of the template's tests, no `npm test` database half; CI is the gate.
