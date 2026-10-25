# Coursework — Portfolio Overlap Check

Checked 2026-10-25 against the build-log card list, `saas-foundation/CLONES.md` and the sibling kits readable from the kit workspace (housefile, bookable-appointment-service, the saas-foundation template). **The source trees of adjuster, loanbook, callboard, pulseboard and gavel were not readable from here**; the "Where" column names what to look for and the first session confirms each path before porting (CLAUDE.md "port before you write"). Purpose: keep Coursework from re-teaching what a sibling built, and keep the comfortable half (a course platform) from eating the new half (the graph and the arithmetic).

## Verdict

The card lists four chips. None is built anywhere in the portfolio:

| Card chip | Already in the portfolio? | What Coursework does |
|---|---|---|
| prerequisite DAG | **No.** Bracketry schedules rounds (a bipartite matching, not a dependency graph); Adjuster's rules are a flat ordered list; nothing has edges between records whose edits must keep the graph acyclic | Courses as nodes, every prerequisite leaf as an edge, AND/OR as a two-level expression; topological order, eligibility, exact shortest path |
| cycle detection | **No.** No sibling refuses a write because it would close a loop | Tarjan SCC on publish; `REJECT:CYCLE` with the path in a stated order; self-reference and OR-branch cycles included |
| derived progress | Partly — Pulseboard derives rollups from events; LoanBook derives balances from the ledger | Same discipline, applied to a graph: progress and eligibility recomputed from events against a content-hashed catalog version; `progress:verify` |
| weighted grades | **No.** LoanBook has integer money and interest math; nothing has basis-point weights with drop-lowest, redistribution and a stated single rounding over rationals | hp scores, bp weights, `Rational` with BigInt, half-up once; golden cases on both sides of the pass boundary |

Suggested card chips once it ships: `prerequisite DAG + cycle detection` · `eligibility with minimal missing set` · `exact shortest path over AND/OR` · `derived progress vs. versioned catalog` · `rational gradebook, rounded once` · `drip release on a day axis`.

## Reuse — port, do not rebuild

| Capability | Donor | Where to read first | Coursework use |
|---|---|---|---|
| Auth, orgs, roles, invites, audit log, cron, outbox, CI, invariants | saas-foundation v1.3.0 | template | As cloned; billing and share links removed or unwired (D-2) |
| Versioned rules as data; immutable published versions with a content hash; canonical JSON serializer | Adjuster | `RuleSetVersion`, `src/rules/canonical.ts`, its D1/D2/D5 | `CatalogVersion` hash (V1); prerequisite expressions as closed-vocabulary JSON (D-11) |
| Decision explanations: a result carries the rules that fired | Adjuster | decision trace output | Eligibility reasons (`PASSED` / `EQUIVALENT:` / `WAIVER:`), publish error lists, gradebook flags |
| Replay-and-compare verify with coded failures | Adjuster / LoanBook | `decisions:verify`, `ledger:verify` | `course:eval` and `progress:verify` drift checks |
| Integer arithmetic discipline, no floats, one numeric module, lint | LoanBook | `src/ledger/money.ts` (D11) | The shape of `src/grades/rational.ts` and the float lint; **not** the money type itself (no money here) |
| Append-only rows with superseding corrections; "current" derived | LoanBook / Adjuster | reversal entries; `DocumentVersion` | Phase 2: `Submission` corrections supersede, `CompletionEvent` append-only |
| Calendar-day strings, banned `Date` paths, non-UTC CI, DST-spanning fixtures | Bookable | `CLAUDE.md` rules on `@db.Date`, `new Date(string)`, `TZ=Pacific/Kiritimati` | D-8; `days.ts`; the repo-wide lint; drip release |
| Pure engine, deterministic, one scoring function | Bracketry | `src/lib/league/` rules in its CLAUDE.md | `src/graph/` and `src/grades/` purity rules |
| Frozen fixtures + Python oracle + golden answers + verify | Housefile / Adjuster / LoanBook | `tools/`, `fixtures/`, `golden_answers.py`, `verify_fixtures.py` | Same workflow, same file names |
| Notifications outbox: queued, templated, never sent | callboard / showcall | templates registered into the notifications module at runtime | Unlock notices `QUEUED` (D-22), Phase 3, optional |
| Derived aggregates recomputed from events, nothing stored as truth | Pulseboard | `src/lib/rollups.ts` | P1 discipline for progress |
| Model pin in settings | housefile / opsagent | `.claude/settings.json` | D-3 |

## New — each with the fixture that proves it

| # | Lesson | Not in any sibling because | Proven by |
|---|---|---|---|
| 1 | Prerequisites as a closed two-level AND/OR expression validated at the write | Adjuster's rules are flat; no sibling nests conditions | GG-09 (`PREREQ_UNKNOWN`, `PREREQ_DEPTH`, `PREREQ_EMPTY_GROUP`); E-08/09/10 in `expected_edits.csv` |
| 2 | Cycle detection with a deterministic reported path, including self-loops and cycles through OR branches | Nothing in the portfolio has a graph of records | GG-02..GG-07; 6 `REJECT:CYCLE` edits; two-cycle edit E-14 ordered |
| 3 | Topological order with a stated tiebreak | — | GG-01 full order string |
| 4 | Eligibility with a *minimal* missing set over AND/OR, with satisfaction reasons (pass / equivalency / waiver) | — | GG-10..GG-15; 10,800 rows; waiver trap GG-10; retired-equivalency trap GG-14 |
| 5 | Exact shortest path over OR branches with a lexical tie (not greedy) | — | GG-17 9-vs-9 tie; 300 paths; combination count printed |
| 6 | Retroactive-block report with a grandfather flag instead of a refusal | Adjuster's impact diff is on rule outcomes, not on people mid-process | GG-19; E-04 17, E-11 6 |
| 7 | Derived progress against the enrolled catalog version | Pulseboard rollups have no version axis | `progress:verify`, 341 + 300 values |
| 8 | Drip release as day arithmetic with a refusal | Bookable's lesson was slots and DST, not release gates | 154 `REJECT:NOT_RELEASED`, 12 `REJECT:NOT_ENROLLED` |
| 9 | Weighted gradebook in rationals: drop-lowest ties, late floor, missing-as-zero vs exclude, empty-category redistribution, extra-credit cap, single half-up rounding | LoanBook's integers never needed a fraction | GS-01..GS-15; 106 grades with the exact fraction in the fixture |
| 10 | A pass/fail decided by rounding, stated and tested on both sides | — | GS-13 (6999.5 → 7000 pass), GS-14 (6999.2 → 6999 fail) |

## Guardrails — lessons Coursework must not take

| Lesson | Owner | Rule here |
|---|---|---|
| Double-entry ledger, accrual, money | 08 LoanBook | No money in Coursework; grades are hp, not cents |
| Rules engine with an authoring UI and an impact diff | 09 Adjuster | A fixed two-level expression; the "impact" is the grandfather count only |
| Slot booking, DST instants, exclusion constraints | Bookable | Days only; no instants, no times of day |
| Round-robin scheduling, standings | Bracketry | Cohort start days are data, never computed |
| Entity resolution, review queues | 22 Housefile | Learner identity is given |
| Auction contention, row locks | Gavel | Single-writer administrative edits; no race tests in Phase 1–2 |
| High-volume ingestion | 07 Pulseboard | 2,051 events; no load test |
| Tenant billing, public API, LLM features | planned / none | Out of scope |

## How this was checked

- Read: the saas-foundation template (README, CLONES, new-project script), the housefile kit (all docs and tools), bookable's CLAUDE.md rules, the COMMON-BRIEF. The source trees of adjuster, loanbook, callboard, pulseboard and gavel were **not** reachable from the kit workspace; the "Where" column is from their CLONES notes and the housefile kit's own overlap table, and must be confirmed by reading the code before each port (task 1.3). Where a donor is not reachable from the cloud either, the session writes from the brief and records that in `docs/decisions.md`.
- The reuse scanner `~/Projects/reuse-scan.py` is not reachable from the cloud; KICKOFF step 6 records the skip.
