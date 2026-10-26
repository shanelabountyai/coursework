import { expect, test, type Page } from '@playwright/test';
import { db } from '@/core/db';
import { createCohort, enroll } from '@/course/cohorts';
import { dayInZone, SCHOOL_TIME_ZONE } from '@/course/today';
import { demoEmail, seedSchool } from '../scripts/seed-school';
import { expectAccessible } from './helpers/a11y';

// Phase 3 (docs/phase-3-tasks.md 3.1–3.8) against the production build on port 7400 (playwright.config.ts starts
// it with DEMO_MODE=1). Its own org per run — fixtures/ through the write paths (seedSchool) — so a rerun on the
// same database never meets the previous run's publish or completions. Serial: later steps read earlier writes.
test.describe.configure({ mode: 'serial' });

const SLUG = `e2e-${Date.now().toString(36)}`;
const FUTURE = 'C-E2E-2099'; // a cohort that starts in 2099, so "locked" is still locked whenever this runs

test.beforeAll(async () => {
  test.setTimeout(180_000);
  const { orgId, users, learnerId } = await seedSchool(SLUG, 'L-0003');
  const version = await db.catalogVersion.findFirstOrThrow({ where: { orgId } });
  const cohort = await createCohort({ orgId, userId: users.admin! }, { code: FUTURE, course: 'ACC-101', startDay: '2099-01-05', schemeCode: null, catalogVersionId: version.id, items: [{ code: 'L01', title: 'Welcome', offsetDays: 0 }, { code: 'A01', title: 'Exercise', offsetDays: 7 }] });
  await enroll({ orgId, userId: users.admin! }, { cohortId: cohort.id, learnerId });
});
test.afterAll(() => db.$disconnect());

async function signInAs(page: Page, local: string) {
  await page.context().clearCookies();
  await page.goto('/demo');
  await page.getByRole('button', { name: demoEmail(SLUG, local), exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your orgs' })).toBeVisible();
}
const at = (path = '') => `/o/${SLUG}${path}`;

test('home and catalog: E-01 shows its cycle path live and cannot be published (3.1)', async ({ page }) => {
  await signInAs(page, 'admin');
  await page.goto(at());
  await expectAccessible(page, 'Current catalog version');
  await page.goto(at('/catalog'));
  await expect(page.getByText('Verdict: ACCEPT')).toBeVisible(); // the untouched catalog
  await page.getByLabel('Course', { exact: true }).selectOption('ACC-101');
  await page.getByLabel('Prerequisite').fill('ACC-201');
  const verdict = page.getByTestId('live-verdict');
  await expect(verdict).toContainText('REJECT:CYCLE');
  await expect(page.getByRole('list', { name: 'Cycle paths' }).getByRole('listitem')).toHaveText(['ACC-101 -> ACC-201 -> ACC-101']);
  await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled();
  await expectAccessible(page, 'ACC-101 -> ACC-201 -> ACC-101');
});

test('catalog: E-04 publishes through the server check and reports 17 grandfathered (3.1, 3.5)', async ({ page }) => {
  await signInAs(page, 'admin');
  await page.goto(at('/catalog'));
  await page.getByLabel('Course', { exact: true }).selectOption('WRT-202');
  await page.getByLabel('Prerequisite').fill('{"all":["WRT-101","DAT-101"]}');
  await expect(page.getByTestId('live-verdict')).toContainText('Verdict: ACCEPT');
  await page.getByLabel('New version name').fill('cat-v2');
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Published cat-v2' })).toContainText('17 grandfathered');
  await page.goto(at('/catalog/versions'));
  await expect(page.getByRole('heading', { name: /^cat-v2 / })).toBeVisible();
  await expect(page.getByText('Parent: cat-v1')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'ACCEPT' });
  await expect(row.getByRole('cell').nth(3)).toHaveText('17');
  await expectAccessible(page, 'Catalog versions');
});

test('learner path: L-0001 equals the oracle row; a grandfathered enrollment shows its flag (3.2)', async ({ page }) => {
  await signInAs(page, 'admin');
  await page.goto(at('/learners/L-0001'));
  // expected_progress.csv: L-0001,CERT-WRITE,4,2,5000,2,WRT-201+WRT-301,WRT-201
  await expect(page.getByText('2 of 4 required courses satisfied: 50.00%')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Shortest path' }).getByRole('listitem')).toHaveText(['WRT-201', 'WRT-301']);
  await expectAccessible(page, 'Satisfied leaves and why');

  const org = await db.org.findUniqueOrThrow({ where: { slug: SLUG } });
  const flagged = await db.enrollment.findFirstOrThrow({ where: { orgId: org.id, grandfathered: true }, include: { learner: { select: { code: true } } }, orderBy: { learner: { code: 'asc' } } });
  await page.goto(at(`/learners/${flagged.learner.code}?against=cat-v2`));
  await expect(page.getByText('GRANDFATHERED').first()).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Status (cat-v2)' })).toBeVisible(); // both answers, side by side
  await expectAccessible(page, 'GRANDFATHERED');
  await page.goto(at('/learners'));
  await expectAccessible(page, '300 learner(s).');
});

test('gradebook: L-0076 at 69.60 D fail with the drop-lowest tie; a correction keeps the old row (3.3)', async ({ page }) => {
  await signInAs(page, 'scorekeeper');
  await page.goto(at('/cohorts'));
  await expectAccessible(page, 'C-ACC101-F26');
  await page.goto(at('/cohorts/C-ACC101-F26/grades'));
  const row = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'L-0076' }) });
  await expect(row).toContainText('69.60');
  await expect(row).toContainText('DROPPED:HW:HW1');
  await expect(row.getByRole('cell').filter({ hasText: /^fail$/ })).toBeVisible();
  await row.getByText('exact').click();
  await expect(row).toContainText('6960/1');
  await expectAccessible(page, 'Gradebook · C-ACC101-F26');

  await page.goto(at('/cohorts/C-ACC101-F26/grades?learner=L-0076'));
  await page.getByLabel('New score for HW2').fill('75');
  await page.getByLabel('Reason for correcting HW2').fill('regrade after appeal');
  await page.getByRole('button', { name: 'Correct HW2' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Score corrected' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('corrected: regrade after appeal')).toBeVisible();
  await expect(page.getByText('(superseded)').first()).toBeVisible();
  await expectAccessible(page, 'every score row');
});

test('drip: the linked learner sees 4 of 9, completes a released item, and a 2099 item stays locked (3.4)', async ({ page }) => {
  await signInAs(page, 'learner');
  await page.goto(at('/me'));
  await expect(page).toHaveURL(new RegExp(`${at('/learners/L-0003')}$`));
  await page.goto(at('/cohorts/C-ACC101-F26/drip'));
  const today = dayInZone(Date.now(), SCHOOL_TIME_ZONE); // the server computes the same day (D-57)
  await expect(page.getByTestId('school-today')).toHaveText(today);
  await expect(page.getByRole('row').filter({ hasText: /^L-0003/ })).toContainText('4 of 9');
  await expect(page.getByText('44.44%')).toBeVisible();
  await expectAccessible(page, 'Items by release day');
  await page.getByRole('button', { name: 'Complete A01' }).click();
  // the cell's form is replaced by the completion itself once the page revalidates
  await expect(page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'A01', exact: true }) })).toContainText(`done ${today}`);
  await page.reload();
  await expect(page.getByText('5 of 9')).toBeVisible();

  await page.goto(at(`/cohorts/${FUTURE}/drip`));
  await expect(page.getByText('Locked until 2099-01-05')).toBeVisible();
  await expect(page.getByText('Locked until 2099-01-12')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Complete / })).toHaveCount(0);

  await page.goto(at('/cohorts/C-DAT102-F26/drip'));
  await expect(page.getByRole('row').filter({ hasText: 'REJECT:NOT_RELEASED' }).first()).toBeVisible(); // her refused attempts, from the audit log
  await expectAccessible(page, 'Refused attempts');
});

test('a member sees only her own learner pages; others are not found (D-51, D-53)', async ({ page }) => {
  await signInAs(page, 'learner');
  const res = await page.goto(at('/learners/L-0001'));
  expect(res!.status()).toBe(404);
  expect((await page.goto(at('/catalog')))!.status()).toBe(404);
  await signInAs(page, 'member');
  await page.goto(at('/me'));
  await expectAccessible(page, 'not linked to a learner record');
});

test('archive: the owner sees why delete is refused; a demo session cannot archive (D-56)', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto(at('/archive'));
  await expect(page.getByText(/Deleting is refused: This org has append-only history \(\d/)).toBeVisible();
  await page.getByLabel('Reason').fill('e2e');
  await page.getByLabel(/Type .* to confirm/).fill(SLUG);
  await page.getByRole('button', { name: 'Archive org' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'shared demo account' })).toHaveText('This is a shared demo account, so that is switched off here.');
  await expectAccessible(page, 'Archive this org');
  await page.goto('/orgs');
  await expect(page.getByRole('link', { name: 'Coursework demo school' }).first()).toBeVisible();
  await expectAccessible(page, 'Your orgs');
});
