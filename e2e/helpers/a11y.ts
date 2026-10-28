import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, type Page } from '@playwright/test';

// Task 3.7 / D-59: THE ONE axe entry point for e2e (lint refuses axe-core anywhere else under e2e/). Bookable A-096:
// Playwright defaults to light, so a scan written the obvious way measures half the screens; this helper scans
// BOTH prefers-color-scheme values on every call and puts the URL it measured in the failure, so a green run over
// the wrong page (a login redirect) cannot pass for a green run over the right one. axe-core is the copy already in
// node_modules (eslint-config-next → eslint-plugin-jsx-a11y); no dependency is added.
const AXE_SOURCE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

type Violation = { id: string; impact: string | null; nodes: { target: unknown; failureSummary?: string }[] };

/** `mustShow` is text that proves the interesting content is on screen before anything is measured. */
export async function expectAccessible(page: Page, mustShow: string | RegExp) {
  await expect(page.getByText(mustShow).first()).toBeVisible();
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: AXE_SOURCE });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: Violation[] }> } }).axe;
      const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target, failureSummary: n.failureSummary })) }));
    });
    expect(violations, `axe on ${page.url()} in ${colorScheme}`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });
}
