# Kickoff — Coursework (Build Log #15, Course Platform)

Cloud-session variant. Paste the block below into a Claude Code cloud session on Fable (`/model claude-fable-5-1`) with the kit available at `./coursework-kickoff/` (upload it or clone the kit repo). Nothing has been cloned, installed or committed yet. There is no `~/Projects` and no `reuse-scan.py` in the cloud; the steps say what to do instead.

```
Coursework — course platform with a prerequisite DAG and an exact gradebook (Build Log #15,
main track). The kickoff kit is in ./coursework-kickoff/. Nothing exists yet besides the kit.

Read, in order, from the kit: CLAUDE.md, prd-coursework.md, docs/decisions.md
(authoritative), docs/domain-brief.md, docs/portfolio-overlap.md, docs/phase-1-tasks.md.

Steps, in order:
1. Port check. The port table in ~/.claude/CLAUDE.md is not reachable from here. Use 7400
   as proposed (D-5) and write "port 7400 unverified against the port table; Shane confirms"
   in NEXT.md. Do not pick another port yourself.
2. Clone the template with shared history (NOT the GitHub template button):
     git clone https://github.com/shanelabountyai/saas-foundation.git coursework
     cd coursework && git remote rename origin template && git checkout -B main v1.3.0
     npm ci && npm run new-project -- coursework 7400
   Do not run new-project twice. Copy the kit in: CLAUDE.md, KICKOFF.md, NEXT.md,
   prd-coursework.md, docs/*.md, tools/*.py, fixtures/samples/, .claude/settings.json
   (merge the model pin; keep anything the template put there). Add the scope-honesty
   banner from the PRD to README.md verbatim.
3. Add the clone row to saas-foundation/CLONES.md in a separate clone of the template
   (v1.3.0, 2026-10-25, "course platform: prerequisite DAG with cycle detection, derived
   progress, exact weighted gradebook, drip release; synthetic only; not deployed; public;
   port 7400; tools/, fixtures/ clone-owned") and open it as a PR against the template —
   do not merge. Put ?connection_limit=10&pool_timeout=20 on the local DATABASE_URLs.
   Confirm vercel.json has the house ignoreCommand. Keep notifications; remove or unwire
   billing and share links per D-2 and record which path foundation:check-modules allowed.
4. npm run db:setup if Postgres is available here; then npm run foundation:drift and
   npm test. If Prisma engines or Playwright browsers cannot be downloaded in this sandbox,
   paste the exact error into NEXT.md and continue: CI is the gate (D-4). Do not patch
   the template to get past it.
5. Oracle check: python3 -I tools/golden_answers.py ends with OK. Then
   python3 -I tools/build_fixtures.py --seed 20261025 (writes fixtures/), then
   python3 -I tools/reference_graph.py --write-expected, then
   python3 -I tools/reference_grades.py --write-expected, then
   python3 -I tools/verify_fixtures.py ends with OK. Compare every sha256 with
   docs/domain-brief.md section 9 and fixtures/samples/MANIFEST.json, and the printed
   tables with fixtures/samples/reference_graph.output.txt and
   reference_grades.output.txt. Report any mismatch; do not fix either side.
6. Reuse check: skipped — reuse-scan.py is not reachable from the cloud. Record exactly
   that in docs/decisions.md with the date, and that docs/portfolio-overlap.md stands in.
7. Read every doc. List anything that contradicts itself or can't be built as written,
   and anything in docs/portfolio-overlap.md whose donor path you could not confirm
   (the donor repos may not be reachable; say which). Don't resolve these yourself.
8. Commit on branch phase-1 in three commits, naming files explicitly (never git add -A):
   (a) the new-project rewrite (package.json, playwright.config.ts, CI workflow,
       README.md, vercel.json, .env.example if changed);
   (b) the kickoff docs and tools (CLAUDE.md, KICKOFF.md, NEXT.md, prd-coursework.md,
       docs/*.md, tools/*.py, fixtures/samples/, .claude/settings.json);
   (c) the generated fixtures (fixtures/*.json, fixtures/*.csv, fixtures/MANIFEST.json) —
       put the hash table in the commit message.
   Push the branch and open a PR against main titled "Phase 1 kickoff: kit, oracle,
   fixtures". Do not merge it.
9. Plan first: write the Phase 1 plan as the order you will do tasks 1.1 to 1.12 in,
   which donor you will read for each port in 1.3, and how you will represent Rational
   (1.8). Put the plan, the step 5 output, the step 4 result, the contradictions list and
   the reuse-check note in NEXT.md and in the PR description. Stop there.

Do not create Prisma models, migrations, UI or engine code before Shane has reviewed the
plan. Update NEXT.md before you stop.

Rules from the first commit: a cycle never reaches a published version; progress is never
stored; the engines under src/graph/ and src/grades/ import no database, clock, randomness,
network or model client; scores are integer hundredths of a percent and intermediates are
rationals, no floats; days are strings with no Date arithmetic; fixtures are never
generated or read by product code; never edit an expected value to pass a test; never
edit template-owned paths (src/core/**, tests/invariants/**, core migrations); no new
dependencies without asking; no "accurate", "robust" or "optimal" anywhere without the
number; never merge a PR.
```

## Still to do by hand (Shane)

- Create the **public** GitHub repo `shanelabountyai/coursework` (empty) before the session so step 8 can push; or give the session a token scoped to create it. Before the first push: `git ls-files | grep -iE "\.env|secret|credential|\.pem$|\.key$"` (only `.env.example` may appear); confirm `.gitignore` covers `.env` and `.env*.local`.
- Confirm port 7400 against the port table in `~/.claude/CLAUDE.md` and add the row; merge the CLONES.md PR on the template.
- Build-log card #15: name **Coursework**, PRD and repo links, status `in progress`, chips per `docs/portfolio-overlap.md` "Suggested card chips".
- Review the Phase 1 plan in the PR; reply with go / changes. Decide O-1..O-9 when they come up; defaults are in force.
- Neon and Vercel only if this is ever deployed (not planned; synthetic data).
