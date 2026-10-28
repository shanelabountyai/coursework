/**
 * `seed:fixtures` (task 2.8): load `fixtures/` (never `expected_*`) into one org through the write
 * paths, so every row passes through the engines — the catalog through G5, every item event through
 * R1–R3 (a refusal is an AuditEvent and no row, D-46), every score through recordSubmission. Refuses
 * a non-empty target: the org slug must not exist yet.
 */
import { db } from '@/core/db';
import type { Fixtures } from '../../scripts/lib/fixtures';
import type { Actor } from './actor';
import { createAssignment, createCohort, createLearner, enroll, grantWaiver } from './cohorts';
import { recordCompletion } from './completions';
import { createScheme, recordSubmission } from './grades';
import { completeItem } from './items';
import { createInitialVersion } from './publish';
import type { Tx } from './versions';

export interface SeedCounts {
  orgId: string;
  versionId: string;
  versionHash: string;
  courses: number;
  certificates: number;
  equivalencies: number;
  schemes: number;
  schemesAccepted: number;
  learners: number;
  waivers: number;
  completions: number;
  cohorts: number;
  enrollments: number;
  itemEvents: number;
  itemsAccepted: number;
  itemsRefused: Record<string, number>;
  assignments: number;
  submissions: number;
}

const TX = { timeout: 120_000, maxWait: 10_000 };

export async function seedFixtures(fx: Fixtures, slug: string, log: (s: string) => void = () => {}): Promise<SeedCounts> {
  if (await db.org.findUnique({ where: { slug } })) throw new Error(`seed:fixtures: org "${slug}" already exists; reset the database or choose another slug (the seed is not idempotent by design)`);
  const org = await db.org.create({ data: { slug, name: `Fixtures school (${slug})` } });
  const user = await db.user.upsert({ where: { email: `seed@${slug}.example.org` }, create: { email: `seed@${slug}.example.org`, name: 'fixtures seed' }, update: {} });
  await db.membership.create({ data: { orgId: org.id, userId: user.id, role: 'owner' } });
  const actor: Actor = { orgId: org.id, userId: user.id };

  const version = await createInitialVersion(actor, fx.catalog);
  log(`catalog ${version.label} ${version.hash}`);

  let schemesAccepted = 0;
  await db.$transaction(async (tx: Tx) => {
    for (const s of fx.schemes) if ((await createScheme(actor, s, tx)).check.result === 'ACCEPT') schemesAccepted++;
  }, TX);

  const learnerIds = new Map<string, string>();
  await db.$transaction(async (tx: Tx) => {
    for (const l of fx.learners) {
      if (l.enrolled_catalog_version !== fx.catalog.version) throw new Error(`learner ${l.learner_id}: enrolled under ${l.enrolled_catalog_version}, not ${fx.catalog.version}`);
      const row = await createLearner(actor, { code: l.learner_id, name: l.name, email: l.email, targetCertificate: l.target_certificate, enrolledVersionId: version.id }, tx);
      learnerIds.set(l.learner_id, row.id);
    }
    for (const w of fx.waivers) await grantWaiver(actor, { learnerId: learnerIds.get(w.learner_id)!, course: w.course, reason: w.reason, grantedDay: w.granted_day, grantedBy: w.granted_by }, tx);
  }, TX);
  log(`learners ${learnerIds.size}, waivers ${fx.waivers.length}`);

  await db.$transaction(async (tx: Tx) => {
    for (const c of fx.completions) {
      if (c.catalog_version !== fx.catalog.version) throw new Error(`completion ${c.learner_id}/${c.course}: version ${c.catalog_version}`);
      await recordCompletion(actor, { learnerId: learnerIds.get(c.learner_id)!, course: c.course, kind: c.kind, day: c.day, versionId: version.id }, tx);
    }
  }, TX);
  log(`completions ${fx.completions.length}`);

  const cohortIds = new Map<string, string>();
  let enrollments = 0;
  await db.$transaction(async (tx: Tx) => {
    for (const co of fx.cohorts) {
      const row = await createCohort(actor, { code: co.id, course: co.course, startDay: co.start_day, schemeCode: co.scheme, catalogVersionId: version.id, items: co.items.map((i) => ({ code: i.code, title: i.title, offsetDays: i.offset_days })) }, tx);
      cohortIds.set(co.id, row.id);
      for (const e of co.enrolled) {
        await enroll(actor, { cohortId: row.id, learnerId: learnerIds.get(e.learner_id)!, status: e.status as 'IN_PROGRESS' | 'COMPLETED' }, tx);
        enrollments++;
      }
    }
  }, TX);
  log(`cohorts ${cohortIds.size}, enrollments ${enrollments}`);

  let itemsAccepted = 0;
  const itemsRefused: Record<string, number> = {};
  await db.$transaction(async (tx: Tx) => {
    for (const ev of fx.itemEvents) {
      const r = await completeItem(actor, { cohortCode: ev.cohort, learnerCode: ev.learner_id, itemCode: ev.item, day: ev.day, eventRef: ev.event_id }, tx);
      if (r.verdict === 'ACCEPT') itemsAccepted++;
      else itemsRefused[r.verdict] = (itemsRefused[r.verdict] ?? 0) + 1;
    }
  }, TX);
  log(`item events ${fx.itemEvents.length}: accepted ${itemsAccepted}, refused ${JSON.stringify(itemsRefused)}`);

  await db.$transaction(async (tx: Tx) => {
    for (const a of fx.assignments) {
      await createAssignment(actor, { cohortId: cohortIds.get(a.cohort)!, code: a.assignment, category: a.category, pointsPossible: a.points_possible, dueDay: a.due_day, extraCredit: a.extra_credit }, tx);
    }
    for (const s of fx.submissions) await recordSubmission(actor, { cohortCode: s.cohort, learnerCode: s.learner_id, assignmentCode: s.assignment, scoreHp: s.score_hp, submittedDay: s.submitted_day }, tx);
  }, TX);
  log(`assignments ${fx.assignments.length}, submissions ${fx.submissions.length}`);

  return {
    orgId: org.id,
    versionId: version.id,
    versionHash: version.hash,
    courses: fx.catalog.courses.length,
    certificates: fx.catalog.certificates.length,
    equivalencies: fx.catalog.equivalencies.length,
    schemes: fx.schemes.length,
    schemesAccepted,
    learners: learnerIds.size,
    waivers: fx.waivers.length,
    completions: fx.completions.length,
    cohorts: cohortIds.size,
    enrollments,
    itemEvents: fx.itemEvents.length,
    itemsAccepted,
    itemsRefused,
    assignments: fx.assignments.length,
    submissions: fx.submissions.length,
  };
}
