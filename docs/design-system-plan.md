# Design system plan — Coursework (APPLIED 2026-10-27, D-69; plan v2 at the bottom wins over v1)

Replaces the stopgap in `docs/design-brief.md` (a recolour of the Phase 3 markup). Reason: the recolour fixed the palette and nav and left every screen a column of headings, paragraphs and bare tables. The owner's verdict: "looks super basic".

## What is wrong now (from screenshots of home, catalog, learner, grades, drip, cohorts, versions)

1. **No page structure.** Every page is `h1` then loose paragraphs. Nothing says what the page is for or what to do first. Home is a 3-item bullet list and an empty screen below it.
2. **Facts are prose.** "40 courses, 7 certificates, 2 equivalencies", "2 of 4 required courses satisfied: 50.00%", "7 / 9 (77.77%)" are sentences and cells. The numbers are the product and have no visual weight.
3. **State is plain text.** `IN_PROGRESS`, `PASSED`, `ACCEPT`, `REJECT:CYCLE`, `NOT_RELEASED`, `pass`/`fail` are raw words in monospace or body text. No status vocabulary.
4. **The editor is a form dumped in a panel.** Operation, Course, Prerequisite in one run-on row; the live verdict (the most important element on the page) is a small line; Publish, Save draft and Discard are three same-looking buttons stacked with no hierarchy, and Discard looks as safe as Save.
5. **Tables are narrow islands.** They hug the left at content width inside a 72rem page, mono codes mixed with proportional text, no row hover, no sticky header, no numeric emphasis, no empty states.
6. **Rule codes lead.** Headings read "Satisfied leaves and why (G6)", "Courses in topological order (G4)". The code is evidence for an engineer and noise for a registrar. It should be secondary text, not the heading.
7. **Long text blocks** (explanations at 44rem next to full-width tables) give a ragged left edge with dead space at right.

## The system

**Principle:** a catalog card that can be checked. Quiet paper, one green, serif for names and headings, tabular figures for every number, state always a word plus a shape. Density suits staff (registrar, scorekeeper) who scan; the learner screens get the same parts with more air.

### Tokens (extends the current palette; every text pair >= 4.5:1 both schemes, measured)
- Colour: keep `--bg --panel --fg --muted --line --accent --on-accent`. Add `--surface` (cards, one step off `--bg`), `--accent-soft` (tinted fill for selected/active), and soft fills for state: `--ok-soft --bad-soft --warn-soft --info-soft` with matching ink. State colour is never the only signal.
- Type: serif (Charter stack, no download) for `h1-h3`, card titles, stat numbers; system sans for body and UI; mono only for codes (`ACC-101`, hashes). Scale 12 / 14 / 16 / 18 / 22 / 30. Eyebrow 12px uppercase tracking .08em.
- Space: 4px base; steps 4 8 12 16 24 32 48. Radius 2px controls, 6px cards (one radius per role, nothing rounder). One shadow, only on the sticky bar and popovers; cards use a hairline.
- Layout: page max 72rem; `.stack` (vertical rhythm by gap, not margins); `.grid` auto-fit columns; a 2-column `.split` (main + aside 20rem) that collapses under 56rem.

### Components (CSS classes; plain markup, no JS, no dependencies)
| Component | Replaces | Notes |
|---|---|---|
| `.page-head` (eyebrow, h1, lede, actions) | bare `h1` + paragraph | eyebrow carries the org or parent ("Catalog / cat-v1"); actions right-aligned |
| `.stat` / `.stats` | sentences with counts | big serif number, label under, optional delta line; used on Home, learner, cohort |
| `.card` / `.card-head` | `.panel` | titled section container; replaces most `h2` + loose content |
| `.pill` (ok, bad, warn, info, neutral) | raw status words | word + dot shape; one mapping table (below) so a status looks the same everywhere |
| `.verdict` (accept / refuse) | the one-line "Verdict:" | large banner at the top of the editor: state word, cycle path as a chip list, Publish disabled reason beside it |
| `.progress` | "7 / 9 (77.77%)" text | thin bar + the same numbers as text; label and value remain real text |
| `.table-wrap` + `.table` | bare `table` | full width, sticky head, row hover, `.num` tabular right, `.code` mono cell, empty-state row |
| `.field` / `.form-row` / `.btn` (primary, secondary, quiet, danger) | inline labels and equal buttons | label above control, hint below; one primary per card; Discard is `danger-quiet`; Publish primary |
| `.callout` (note, warn) | `.scope`, warn panels | the scope-honesty note keeps its text verbatim (README banner rule) |
| `.crumbs` | none | parent link above the h1 on nested pages |
| `.empty` | "No attempts yet." | one sentence plus the next action |
| nav | current bar | add the active page (`aria-current="page"`) with an accent underline; the one markup change in the layout |

Status mapping (single source, in one TS file `src/app/ui/status.tsx`, so labels cannot drift): `ACCEPT`/`PASSED`/`pass`/`done` = ok; `REJECT:*`/`fail`/`refused` = bad; `GRANDFATHERED`/`NOT_RELEASED`/`DROPPED:*` = warn; `IN_PROGRESS`/`EQUIVALENT:*`/`WAIVER:*` = info; `DRAFT` = neutral. The pill shows the readable label ("Passed", "Cycle refused") with the raw code in `title` and visually secondary text where an engineer needs it.

### Page application (markup edits only where listed; all server components stay server components)
- **Home**: `.page-head`; four `.stats` (catalog version, learners with linked count, cohorts, grandfathered flags); a "start here" `.card` by role (staff: Edit catalog; learner: My path); scope note as `.callout`.
- **Catalog**: `.split`. Main: `.verdict` banner (live), editor `.card` with `.field`s on separate rows (Operation, Course, Prerequisite, hint), action bar (Add to draft primary, Save draft secondary, Discard danger-quiet, Publish primary with version name field and the reason it is disabled in text). Aside: current version `.stats`, recent attempts as a compact list with pills. Course table below in a `.card` with search-free filters deferred.
- **Versions**: table in `.card`, verdict pills, grandfathered count as a number with warn pill when > 0.
- **Learners / learner**: list as `.table` with progress and flag pills; learner page `.page-head` (code, name, certificate target), `.stats` (certificate progress %, courses satisfied, next course), shortest path as a numbered `.steps` list of course chips, satisfied-leaves and cohorts as `.table`s, "against version" switcher as a segmented control.
- **Cohorts / gradebook**: cohort list with `.progress` and scheme pill; gradebook table with grade letter and pass/fail pills, dropped and penalty flags as small pills, the exact fraction in a secondary line; correction form as `.field`s inside an expandable row.
- **Drip calendar**: release days as a dated list with state pill (released / locked / done), the learner's Complete button as the only primary on the row.
- **Archive, Members, /orgs**: `.page-head` + `.card`/`.table` only; no new behaviour.

### Constraints (non-negotiable)
- **CSS plus presentational markup only.** No change to server actions, props the engines see, routes, data shapes, or anything under `src/graph/`, `src/grades/`, `src/core/**` (template-owned). `engine:lint` unchanged.
- **No new dependency** (ask-before-add list; no icon or component library). Icons are CSS shapes or inline SVG written here.
- **e2e selectors must keep working:** roles, names and texts used by `e2e/coursework.spec.ts` stay (`Verdict: ACCEPT`, `Publish`, `Cycle paths` list, `Correct HW2`, `Complete A01`, `4 of 9`, `done <today>`, row `L-0076` rowheader, etc.). Run the spec after each page.
- **axe: 0 violations on all 14 scans in both colour schemes.** Pills, soft fills and muted text measured before use; disabled states exempt but still legible.
- Light and dark are separate palettes; keyboard focus visible on every control; `prefers-reduced-motion` respected (no motion added except a 100ms colour transition).
- Phone width: nav wraps, `.split` stacks, tables scroll inside `.table-wrap` only; no horizontal page scroll.
- Numbers not adjectives: copy changes limited to labels; no new claims.

### Build order (one commit per step, e2e + axe after each)
1. Tokens + base + components CSS and `status.tsx`; 2. nav active state and `.page-head`/`.callout` on all pages; 3. Home + Catalog (the verdict banner and editor); 4. Learner path + learners list; 5. Cohorts, gradebook, drip; 6. Versions, archive, members, orgs; 7. Screens captured at 1280 and 400 in both schemes; 8. decisions entry (D-69 design system, supersedes the design-brief stopgap).

### Out of scope
Logo, illustration, web fonts, charts, dashboards, a theme switcher, a component library, learner-facing marketing pages, any change to what a number means.

## Open questions for review
1. Rule codes (G4, G6, P2) as secondary tags beside headings, or removed from the UI? (default: secondary tag)
2. Is a `.verdict` banner above the editor the right hierarchy, or should the draft's ops list lead?
3. Stat tiles on Home: which four numbers matter to an admin on arrival?
4. Is a segmented "against version" control clearer than the current query-string link?

---

## Review outcome — plan v2 (2026-10-27): design and UX reviewers, both Opus, read-only

Accepted changes to the plan above (the v1 text stays for the record; where they differ, this section wins):

1. **Status pills style the existing words; no relabelling in this pass.** The e2e spec matches raw visible text (`Verdict: ACCEPT`, `GRANDFATHERED`, `REJECT:NOT_RELEASED`, an exact `fail` cell, `done <today>`), and `title` never reaches keyboard or touch. A registrar glossary (REJECT:CYCLE = "Refused: circular prerequisite") is deferred to its own item, with a spec amendment.
2. **Publish is the only primary** in the editor (it sends the pending op too, so "Add to draft" is optional). Fields, then one action block: verdict, "Publish will apply N operation(s)", version name, Publish. Discard is quiet-danger and separated. The grandfather count cannot be computed in the browser (it needs enrollments), so a callout says so beside Publish; a pre-publish count is a later item that needs one read-only server prop.
3. **Live region narrowed** to the one verdict sentence; the error list and cycle paths move outside it.
4. **Nav**: primary links left, utility right; active page by `aria-current` through one small client `NavLink` (`usePathname`).
5. **Dense matrices** (gradebook, drip) get `.table--matrix`: nowrap cells, first column sticky, scroll inside the wrapper, full-bleed past 72rem on those two pages. One value per cell; the extras (raw, late, dropped) become small flags.
6. **State vs accent**: ok pills always soft fill + dot, never bare green text; non-status numbers use `--fg`. Disabled Publish: panel fill, muted text, dashed border (white on 3.66:1 reads as a glitch).
7. **Tokens** now have values (below). Added `--line-strong`, `--surface`, a 40px stat size. Day strings are sans with tabular figures, not mono; mono only for course codes and hashes.
8. **Home**: stats are catalog version (name + short hash), learners (linked), cohorts, publish attempts; role cards fill the page. No grandfathered tile (0 in the demo). Catalog drops the aside while there is no data for it.
9. **Cut**: segmented version control (keep the GET select), expandable correction row (keep the `?learner=` panel), sticky table headers, delta lines, the colour transition, `.crumbs` (the eyebrow does it), the drip "dated list" (it is a learners x items grid).
10. **Added**: styling for ActionForm `role=status`/`role=alert`; not-found and no-catalog screens; `<caption>` on every table; focus to the status message after Publish and Correct stays as-is (not changed here).

Token values (contrast of ink on its own fill, computed by the design reviewer): ok `#14532d`/`#e3efe6` 7.7, dark `#9fe0b5`/`#16291e` 10.1; bad `#8f1d1d`/`#f8e4e1` 7.3, dark `#f4b0aa`/`#331a19` 8.9; warn `#7a3e05`/`#f6ead2` 7.0, dark `#f0c870`/`#2f2511` 9.5; info `#1e4a6d`/`#e2ebf2` 7.7, dark `#a9c8e8`/`#172433` 9.1; surface `#ffffff` / dark `#1d2420`; accent-soft `#e1ece5` / dark `#1a2d24`.

Open questions answered: rule codes become muted text at the end of a section's explanation line, not in the heading; the verdict sits beside Publish after the fields; no segmented control.
