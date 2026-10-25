# NEXT

## ▶ Next session: clone the template in the cloud, run the oracle, plan Phase 1 (stop before code)

Paste the block in `KICKOFF.md` into a Claude Code cloud session on Fable.

**2026-10-25 (kickoff kit):** Kit written in the cloud workspace: PRD v1.0, decisions D-1..D-31 + O-1..O-9, domain brief with rules G1–G9 / R1–R3 / P1–P2 / V1–V3 / S1–S9, golden cases GG-01..GG-20 and GS-01..GS-15, kickoff measurements, portfolio overlap, Phase 1 tasks, CLAUDE.md, KICKOFF.md, `.claude/settings.json` (Fable pin). Tools in `tools/` (Python 3, stdlib): `courselib.py` (spec made executable), `build_fixtures.py` (seed 20261025), `reference_graph.py`, `reference_grades.py`, `golden_answers.py` (prints OK), `verify_fixtures.py` (prints OK). Fixtures generated twice in separate directories with identical sha256 values (brief §9); the full `fixtures/` set is in the kit and the first session recommits it after regenerating; samples and `MANIFEST.json` are under `fixtures/samples/`. **Not done:** the clone, `npm ci`, `db:setup`, any commit, the port-table row (not reachable from the cloud), the GitHub repo, the build-log card.

Kickoff measurements (oracle on the frozen fixtures): catalog `cat-v1` 40 courses / 56 edges / 0 cycles, hash `32978f4b…`; 15 draft edits → 4 accept, 11 reject (6 cycles); eligibility 10,800 rows (COMPLETED 1,140 / ELIGIBLE 2,613 / BLOCKED 7,047); 300 paths, lengths 0–9, max 16 branch combinations; drip 2,051 events (1,885 accept / 154 not released / 12 not enrolled); 106 grades (67 pass / 39 fail), 0 within 0.5 hp of the threshold. These prove oracle agreement on the generator's own data (D-31), nothing about any real school.

Not verified from this workspace: the donor repos' file paths named in `docs/portfolio-overlap.md`; port 6400 against the port table; whether saas-foundation v1.3.0's `foundation:check-modules` removes billing and share links cleanly with notifications kept (D-2 says what to do either way); whether the cloud sandbox can download Prisma engines and Playwright browsers (D-4: CI decides).
