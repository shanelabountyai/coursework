# Coursework — closeout (DRAFT, 2026-10-26)

Written at the Phase 3 gate by the unattended build session. The PRD names three phases and no Phase 4, so this replaces a Phase 4 task list. Branch `kickoff`, PR #1, never merged. Every number below is **oracle agreement on the generator's own data, same author, rules as stated in the brief** (D-31), not a claim about any institution.

## What shipped

**Phase 1 — two pure engines and the eval.** `src/graph/` (expressions G1, edges and cycles G2–G3, topological order G4, publish check G5, satisfaction G6, minimal missing set G7, exact shortest path G8, grandfather report G9, drip R1–R3, day arithmetic) and `src/grades/` (owned BigInt `Rational`, schemes S1, gradebook S2–S9, one half-up rounding). No database, clock, randomness, network or model client (`engine:lint`).

**Phase 2 — persistence around the engines.** Hand-written migrations; five append-only history tables by trigger; publish through the engine as the single `CatalogVersion` insert (grep-proved); item completions through the drip engine (a refusal is an audit row, D-46/D-55); superseding score corrections; `seed:fixtures`; `progress:verify --db`.

**Decisions pass (owner, 2026-10-26).** D-51 learners sign in through an audited admin link; D-52 stored per-editor drafts; D-53 roles; D-54 billing removed by the manifest; D-55 D-46 confirmed; D-56 archive, never delete, with an insert-only `OrgArchive`, an archived-write guard in all 18 clone writers and a trigger backstop on 13 tables.

**Phase 3 — the views.** Catalog editor running G1–G5 in the browser on every change; version history with every attempt; learner path ("what do I need next") with the G6 reason per satisfied leaf and side-by-side re-evaluation; gradebook with the exact rational; drip calendar with refused attempts and a learner's own locked items; archive; a role-aware nav.

## The proof numbers (all re-run 2026-10-26 after the decisions pass; CI run 40351666361 green)

| Proof | Number |
|---|---|
| `course:eval` | 7/7 `expected_*.csv`, **0 diffs**: edits 15, eligibility 10,800, certificate progress 300, drip 2,051, enrollment progress 341, schemes 3, grades 106; max branch combinations 16 |
| `progress:verify` (fixtures) / `--db` (after `seed:fixtures`) | 341 + 300 values, **0 diffs** each |
| `seed:fixtures` | 40 courses / 7 certificates / 2 equivalencies / 3 schemes (2 ACCEPT) / 300 learners / 24 waivers / 1,352 completions / 16 cohorts / 341 enrollments / 2,051 item events → 1,885 rows + 166 audit refusals / 35 assignments / 806 submissions |
| Catalog hash (`cat-v1`) | `32978f4b…` (fixtures unchanged: no fixture regeneration in the decisions pass) |
| vitest (`npm test`) | 299 tests / 47 files locally; CI runs the same |
| e2e (production build, port 7400) | 16 passed of 16 listed (7 Coursework + 9 template); axe 0 violations on 14 scans × 2 colour schemes |
| INV-01..04/22 | green with 9 new server actions discovered by glob |
| Archived org | 18/18 clone writers refused with the sentence, 0 rows changed; raw INSERT/UPDATE refused by trigger |
| Phase 3 acceptance on the fixture school | E-01 `ACC-101 -> ACC-201 -> ACC-101` with Publish disabled; E-04 → 17 grandfathered; L-0001 `WRT-201, WRT-301` at 50.00%; L-0076 69.60 D fail `DROPPED:HW:HW1`, exact `6960/1`; L-0003 4 of 9 (44.44%) |

## Out of scope (seams only)

Payments · content hosting · sending anything (3.9 outbox notices dropped, D-64; nothing is queued) · transcripts or credentials · minimum-grade prerequisites (O-3) · automatic re-evaluation (O-7) · certificate issuance · cohort transfer · un-archive · an org-list filter in the template's `/onboarding` (D-58) · a second large catalog · CSV export.

## By hand (Shane)

1. Review D-51..D-64, `docs/phase-3-tasks.md` (status table) and this file; merge or not — the agent never merges.
2. Push the `v1.3.0` tag from the Mac, then un-pin `foundation:drift --base e8c0f74…` in CI (D-41).
3. Upstream an org-list hook to `saas-foundation` so `/onboarding` can hide archived orgs (D-58).
4. Declare `axe-core` as a devDependency (it is used transitively today, D-59).
5. Confirm port 7400 in the port table; add the `CLONES.md` row (D-5, D-33).
6. Correct PRD P0-3's drip check-order sentence (Phase 1 plan contradiction 5).
7. Decide O-9 (outbox unlock notices) if wanted; O-1..O-8 defaults still in force.
