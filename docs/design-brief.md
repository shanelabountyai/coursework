# Design brief — Coursework (2026-10-27) — SUPERSEDED by `docs/design-system-plan.md` (D-69)

No design existed: Phase 3 shipped a plain stylesheet (`src/app/globals.css`, 50 lines, system font, blue links) on purpose, so the proofs came first. This brief and the stylesheet that implements it close that gap. **CSS only**: no markup, component, dependency or font download changed, so no e2e selector can move.

## Direction

A registrar's catalog card: warm paper, dark ink, one deep green. Serif headings (system serif stack, no web font), sans body, tabular numbers wherever a grade, a count or a day appears. The product is a rulebook, so the screens look like a printed page that can be checked, not an app dashboard.

## Tokens

| Token | Light | Dark | Job |
|---|---|---|---|
| `--bg` | `#fbfaf6` | `#131715` | page (paper) |
| `--panel` | `#f1f0e8` | `#1b211e` | table heads, panels |
| `--fg` | `#1c2420` | `#ecebe4` | text (15.2 / 15.1 on `--bg`) |
| `--muted` | `#50584f` | `#a9b0a6` | secondary text, input borders (7.1 / 8.1) |
| `--line` | `#cfcfc2` | `#36403a` | hairlines (decoration only, never text) |
| `--link`, `--accent` | `#1f5c43` | `#8fd3b0` | links, primary buttons, the one brand colour (7.5 / 10.4) |
| `--ok` `--bad` `--warn` | `#166534` `#a61b1b` `#8a4a06` | `#86efac` `#fca5a5` `#fcd34d` | state, always beside a word, never colour alone |
| `--note-bg` | `#fff6dc` | `#2a2310` | the scope-honesty note |

Every text token is at least 4.5:1 on `--bg`, `--panel` and `--note-bg` in both schemes (lowest: warn on panel in light, 6.0).

## Rules

- Headings: serif, balanced, `h1` once per page with a hairline under the nav. Body 16px, line 1.5, measure capped on prose, tables full width.
- Navigation: one quiet row, the org name in serif, links without underline until hover or focus; the visible `·` separators are text in the markup and are hidden by the stylesheet, so the screen-reader text is unchanged.
- Tables: hairline rows, small-caps header on `--panel`, numeric columns right-aligned and tabular.
- Buttons: one primary style (accent fill). A disabled Publish stays visibly dim and not-allowed. Focus ring is 2px `--accent` offset 2px on every control.
- Verdicts keep their words (`REJECT:CYCLE`, `ACCEPT`); the colour only repeats them.
- Dark mode is its own palette, not an inversion. `prefers-reduced-motion` is respected (no motion is added).
- Phone width: nav wraps, tables scroll inside their own container only where already wrapped; body never scrolls sideways.

## Out of scope

No logo, no illustration, no web font, no layout restructure, no new components. A real design pass with a school's brand is the next step, not this one.
