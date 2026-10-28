# Coursework — demo script

Synthetic data only. No real school, learner or transcript; nothing here is a credential. Every number below was read off a command in this repo on 2026-10-27 (D-31: oracle agreement on the generator's own data, same author).

**Time:** about 12 minutes. **Machine:** the Mac, Postgres local, `coursework_test` database, port 7400.

## Setup (once, before the audience arrives)

Not deployed: this runs only on localhost. Publishing in step 2 writes a `cat-v2` into `demo-school`; to rerun the demo clean, drop and recreate `coursework_test` (`npm run db:setup` after `dropdb coursework_test`) and redo steps 1–3.

```bash
cd ~/Projects/coursework
lsof -ti :7400                       # prints nothing; if it prints a pid, stop that server
sysctl -n kern.memorystatus_level    # want well above 30
export TZ=America/Chicago            # CI's zone; the drip calendar compares day strings, not instants

npm ci && npm run db:setup           # first time only; writes .env.local/.env.test, ends: coursework_test: migrated

npm run seed:fixtures:test           # org fixtures-school; ends: courses 40 / certificates 7 ... submissions 806
npm run seed:school:test             # org demo-school + five demo users; ends: seed:school: demo-school ready
DEMO_MODE=1 npm run e2e:server       # builds, then serves the production build on 7400 (about a minute cold)
```

When `curl -s localhost:7400/api/health` prints `{"ok":true}`, open <http://localhost:7400/demo>.

**Accounts.** One-click sign-in at `/demo`; no password is typed. They exist only while `DEMO_MODE=1` and `isDemo` is set by `scripts/seed-school.ts`. Owner and admin are TOTP-enrolled but `/demo` skips it. The public TOTP secret is `DEMO_TOTP_SECRET` in `scripts/seed-school.ts` (safe only because a demo session cannot change its email or TOTP).

| Account | Role | Use it for |
|---|---|---|
| `admin@demo-school.demo.test` | admin | catalog editor, publish, learners, cohorts |
| `scorekeeper@demo-school.demo.test` | scorekeeper | grade corrections (`results.write`) |
| `learner@demo-school.demo.test` | member, linked to L-0003 | the learner's own path and drip |
| `member@demo-school.demo.test` | member, not linked | the "not linked" view |
| `owner@demo-school.demo.test` | owner | archive (needs a fresh non-demo sign-in, D-62, so it is not demoed) |

## 1. The oracle (2 min)

*Say:* "The rules are written down twice, in Python and in TypeScript, and they have to agree on every row."

```bash
npm run fixtures:check     # ends: OK  (verify_fixtures.py + golden_answers.py, fixtures unchanged)
npm run course:eval        # ends: total diffs 0; max branch combinations 16
npm run progress:verify    # ends: progress:verify: 0 diffs   (341 enrollment + 300 certificate values)
npm run progress:verify:db # needs seed:fixtures:test; ends: progress:verify --db ... 0 diffs
```

Point at: edits 15, eligibility 10,800, certificate progress 300, drip 2,051, enrollment progress 341, schemes 3, grades 106 — all 0 diffs. Catalog hash `32978f4b…`, fixture seed 20261025. `progress:verify` computes from events every time; no progress column exists (a schema test asserts it).

## 2. The catalog: a cycle cannot publish (3 min)

*Say:* "A prerequisite loop can never reach a published catalog."

First the CLI, no browser:

```bash
npm run catalog:check -- --edit '[{"op":"set_prereq","course":"ACC-101","prereq":"ACC-201"}]'
# verdict REJECT:CYCLE / ACC-101 -> ACC-201 -> ACC-101   (exit 2)
```

Then sign in at `/demo` as `admin@demo-school.demo.test` → `/o/demo-school/catalog`:

1. Untouched catalog shows `Verdict: ACCEPT`.
2. Course `ACC-101`, Prerequisite `ACC-201`: the live verdict flips to `REJECT:CYCLE`, the cycle path `ACC-101 -> ACC-201 -> ACC-101` is listed, **Publish is disabled**.
3. Clear it. Course `WRT-202`, Prerequisite `{"all":["WRT-101","DAT-101"]}`: `Verdict: ACCEPT`. Name it `cat-v2`, **Publish**. The status line says **17 grandfathered**.
4. `/o/demo-school/catalog/versions`: every attempt is listed, the `cat-v2` row shows 17.

Point at: grandfathered is reported, never blocked (G9) — the 17 in-progress learners keep their `cat-v1` enrollment. The same edit from the CLI: `--edit '[{"op":"set_prereq","course":"WRT-202","prereq":{"all":["WRT-101","DAT-101"]}}]'` prints `grandfathered 17`.

## 3. The learner path: "what do I need next" (2 min)

*Say:* "Eligibility and the shortest route to a certificate are computed on every read, from completion events."

`/o/demo-school/learners/L-0001`: shortest path **WRT-201, WRT-301**, certificate progress 50.00%. Open one of the 17 flagged learners with `?against=cat-v2` (for example `/o/demo-school/learners/L-0076?against=cat-v2`): the table shows the status under both catalog versions side by side. L-0076's missing course is WRT-101.

## 4. The gradebook: exact rationals (2 min)

*Say:* "Scores are integers; the grade rounds once, at the end."

Sign in as `scorekeeper@demo-school.demo.test` → `/o/demo-school/cohorts/C-ACC101-F26/grades`: row **L-0076** shows 69.60, D, fail, `DROPPED:HW:HW1`, exact `6960/1`.

Open `?learner=L-0076`, set **New score for HW2** to `75`, reason `regrade after appeal`, **Correct HW2**. The page reloads showing `corrected: regrade after appeal` and the old row marked `(superseded)`. History is insert-only: nothing was overwritten.

## 5. Drip release (2 min)

*Say:* "Content unlocks on a calendar day. The learner can only complete what is released."

Sign in as `learner@demo-school.demo.test`. `/o/demo-school/me` redirects to `/learners/L-0003`. Then `/o/demo-school/cohorts/C-ACC101-F26/drip`: L-0003 shows **4 of 9**. Click **Complete A01** (released): the row shows `done <today>` and the count goes to **5 of 9**. `/o/demo-school/cohorts/C-DAT102-F26/drip` lists refused attempts as `REJECT:NOT_RELEASED`, read from the audit log (166 refusals across the school: 154 NOT_RELEASED, 12 NOT_ENROLLED).

Click-through of steps 2–5 is the same sequence `e2e/coursework.spec.ts` runs (16 of 16 passed in CI, axe 0 violations in light and dark).

## What to concede before you're asked

- **The data is generated by the same author who wrote the rules.** Zero diffs against the Python oracle proves the TypeScript matches the spec, not that the spec fits any real school.
- **Nothing is deployed.** Local only; no password gate, no hosted URL.
- **Nothing is sent.** Unlock notices were dropped (D-64); there is no email, payment, content hosting, transcript or credential issuance.
- **No minimum-grade prerequisites** (O-3) and **no automatic re-evaluation** after a publish (O-7); grandfathering reports, an admin acts.
- **Archive and un-archive:** archive exists, un-archive does not; archiving needs a non-demo sign-in, so it is not in this script.
- **The migrations are hand-written SQL.** CI's `migrate diff` (empty) is what proves they equal the schema.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `/o/demo-school/...` returns 307 | Not signed in; go to `/demo` first |
| `/demo` shows no buttons | Server started without `DEMO_MODE=1` |
| `progress:verify:db`: `no org "fixtures-school"` | Run `npm run seed:fixtures:test` first |
| Port 7400 busy | `lsof -ti :7400 \| xargs kill`, then restart; never run two servers or sweeps at once |
| `L-0003` shows a different count than 4 of 9 | Dates differ: `TZ` not set, or the drip rows were already completed in a previous run; reseed from a fresh database |
| Step 2 shows `cat-v2` already exists / count is off | The publish was already done; drop and recreate `coursework_test` and reseed |
| `Cannot find module '@/generated/prisma/...'` | Run `npx prisma generate` |
| Wall of ~1-second failures | Memory pressure: check `kern.memorystatus_level` before reading a stack trace |
