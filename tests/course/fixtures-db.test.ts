// Tasks 2.6–2.10 against the whole fixture book: seed fixtures/ through the write paths (every row through
// an engine), then recompute 10,800 eligibility rows, 300 certificate progress rows, 341 enrollment progress
// rows and 106 grades FROM THE DATABASE and diff the oracle's expected_*.csv (0 diffs); E-04 through the live
// book reports 17 grandfathered; a score correction changes the next read and leaves the old row; a row
// removed behind the trigger shows up as exactly one diff; every write has its audit row.
//
// The seed runs once for the file (≈25 s) and the assertions are read-only until the last block, which
// is the only one that writes. Nothing re-seeds.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { pathFor, eligibilityFor, reevaluate } from '@/course/completions';
import { correctScore, gradeFor } from '@/course/grades';
import { courseProgressFor } from '@/course/items';
import { publishEdit } from '@/course/publish';
import { seedFixtures, type SeedCounts } from '@/course/seed';
import { dbCertificateProgress, dbEligibility, dbEnrollmentProgress, dbGrades } from '@/course/verify';
import { COLUMNS, diffRows } from '../../scripts/lib/eval';
import { loadExpected, loadFixtures } from '../../scripts/lib/fixtures';
import { resetAuthTables } from '../helpers/auth';

const fx = loadFixtures('fixtures');
const expectedEdits = loadExpected('fixtures', 'expected_edits.csv');
let seed: SeedCounts;
let actor: { orgId: string; userId: string | null };

beforeAll(async () => {
  await resetAuthTables();
  seed = await seedFixtures(fx, 'fixtures-school');
  actor = { orgId: seed.orgId, userId: (await db.membership.findFirstOrThrow({ where: { orgId: seed.orgId } })).userId };
}, 180_000);
afterAll(() => db.$disconnect());

const byKey = <T extends Record<string, string | undefined>>(rows: readonly T[], keys: string[]) =>
  [...rows].sort((a, b) => keys.map((k) => ((a[k] ?? '') < (b[k] ?? '') ? -1 : (a[k] ?? '') > (b[k] ?? '') ? 1 : 0)).find((c) => c !== 0) ?? 0);

describe('2.8 seed:fixtures', () => {
  it('row counts: 300 / 24 / 1,352 / 16 / 341 / 1,885 + 166 / 35 / 806 and the catalog hash', async () => {
    expect(seed.versionHash).toBe('32978f4b386ea7ce1fdf1018f67633def259d08808c501cdedea84c849197e8d');
    expect([seed.courses, seed.certificates, seed.equivalencies]).toEqual([40, 7, 2]);
    expect(seed.schemesAccepted).toBe(2);
    const where = { orgId: seed.orgId };
    expect(await db.catalogVersion.count({ where })).toBe(1);
    expect(await db.gradeScheme.count({ where })).toBe(3);
    expect(await db.gradeScheme.count({ where: { ...where, status: 'DRAFT' } })).toBe(1); // SCH-BAD, REJECT:WEIGHTS_SUM, never attachable
    expect(await db.learner.count({ where })).toBe(300);
    expect(await db.waiver.count({ where })).toBe(24);
    expect(await db.completionEvent.count({ where })).toBe(1352);
    expect(await db.completionEvent.count({ where: { ...where, kind: 'PASS' } })).toBe(1164);
    expect(await db.cohort.count({ where })).toBe(16);
    expect(await db.enrollment.count({ where })).toBe(341);
    expect(await db.itemCompletion.count({ where })).toBe(1885);
    expect(seed.itemsRefused).toEqual({ 'REJECT:NOT_RELEASED': 154, 'REJECT:NOT_ENROLLED': 12 });
    expect(await db.auditEvent.count({ where: { ...where, action: 'item.refused' } })).toBe(166);
    expect(await db.assignment.count()).toBe(35);
    expect(await db.submission.count({ where })).toBe(806);
  });

  it('refuses to run twice into the same org', async () => {
    await expect(seedFixtures(fx, 'fixtures-school')).rejects.toThrow(/already exists/);
    expect(await db.learner.count({ where: { orgId: seed.orgId } })).toBe(300);
  });

  it('2.10 every write carries its actor and its audit row', async () => {
    const where = { orgId: seed.orgId };
    const actions = Object.fromEntries((await db.auditEvent.groupBy({ by: ['action'], where, _count: true })).map((r) => [r.action, r._count]));
    expect(actions).toEqual({
      'catalog.version_created': 1, 'scheme.created': 3, 'learner.created': 300, 'waiver.granted': 24, 'completion.recorded': 1352,
      'cohort.created': 16, 'enrollment.created': 341, 'item.completed': 1885, 'item.refused': 166, 'assignment.created': 35, 'submission.recorded': 806,
    });
    expect(await db.auditEvent.count({ where: { ...where, actorUserId: null } })).toBe(0);
    expect(await db.completionEvent.count({ where: { ...where, actorUserId: null } })).toBe(0);
    expect(await db.itemCompletion.count({ where: { ...where, actorUserId: null } })).toBe(0);
    expect(await db.submission.count({ where: { ...where, actorUserId: null } })).toBe(0);
    expect(await db.completionEvent.count({ where: { ...where, catalogVersionId: seed.versionId } })).toBe(1352); // V2
    expect(await db.enrollment.count({ where: { ...where, catalogVersionId: seed.versionId } })).toBe(341);
  });
});

describe('2.6 eligibility and paths through the database', () => {
  it('10,800 eligibility rows equal expected_eligibility.csv (0 diffs)', async () => {
    const got = await dbEligibility(seed.orgId, 'cat-v1');
    expect(got).toHaveLength(10800);
    expect(diffRows(got, loadExpected('fixtures', 'expected_eligibility.csv'), COLUMNS.eligibility)).toEqual([]);
  }, 60_000);

  it('300 certificate progress + path rows equal expected_progress.csv (0 diffs)', async () => {
    const got = await dbCertificateProgress(seed.orgId, 'cat-v1');
    expect(got).toHaveLength(300);
    expect(diffRows(got, loadExpected('fixtures', 'expected_progress.csv'), COLUMNS.progress)).toEqual([]);
  }, 60_000);

  it('eligibilityFor / pathFor read against the enrolled version; reevaluate returns both answers and writes nothing', async () => {
    const l = await db.learner.findUniqueOrThrow({ where: { orgId_code: { orgId: seed.orgId, code: 'L-0001' } } });
    const e = await eligibilityFor(l.id);
    expect(e.versionId).toBe(seed.versionId);
    expect(e.courses).toHaveLength(40);
    const p = await pathFor(l.id);
    const want = loadExpected('fixtures', 'expected_progress.csv').find((r) => r.learner_id === 'L-0001')!;
    expect(String(p.progress.progress_bp)).toBe(want.progress_bp);
    expect(p.path.path.join('+')).toBe(want.path);
    const before = await db.auditEvent.count();
    const both = await reevaluate(l.id, seed.versionId);
    expect(both.against).toEqual(both.enrolled);
    expect(await db.auditEvent.count()).toBe(before);
  });
});

describe('2.5 / 2.9 progress through the database', () => {
  it('341 enrollment progress rows equal expected_enrollment_progress.csv (0 diffs); C-ACC101-F26 / L-0003 reads 4444 with nothing stored', async () => {
    const got = await dbEnrollmentProgress(seed.orgId);
    expect(got).toHaveLength(341);
    expect(diffRows(got, byKey(loadExpected('fixtures', 'expected_enrollment_progress.csv'), ['cohort', 'learner_id']), COLUMNS.enrollmentProgress)).toEqual([]);
    const cohort = await db.cohort.findUniqueOrThrow({ where: { orgId_code: { orgId: seed.orgId, code: 'C-ACC101-F26' } } });
    const learner = await db.learner.findUniqueOrThrow({ where: { orgId_code: { orgId: seed.orgId, code: 'L-0003' } } });
    const e = await db.enrollment.findUniqueOrThrow({ where: { cohortId_learnerId: { cohortId: cohort.id, learnerId: learner.id } } });
    expect(await courseProgressFor(e.id)).toEqual({ itemsTotal: 9, itemsDone: 4, progressBp: 4444 });
  }, 60_000);
});

describe('2.7 gradebook through the database', () => {
  it('106 grades equal expected_grades.csv (0 diffs), exact fraction and categories included', async () => {
    const got = await dbGrades(seed.orgId);
    expect(got).toHaveLength(106);
    expect(diffRows(got, byKey(loadExpected('fixtures', 'expected_grades.csv'), ['cohort', 'learner_id']), COLUMNS.grades)).toEqual([]);
  }, 60_000);
});

describe('2.4 E-01..E-15 through the live book', () => {
  it('every draft edit gets the oracle verdict; E-04 reports 17 grandfathered and flags them; refusals write no version', async () => {
    const before = await db.catalogVersion.count({ where: { orgId: seed.orgId } });
    let accepted = 0;
    for (const edit of fx.edits) {
      const want = expectedEdits.find((r) => r.edit_id === edit.id)!;
      const r = await publishEdit(actor, seed.versionId, edit, `cat-v1+${edit.id}`);
      expect(r.check.result, edit.id).toBe(want.result);
      expect(String(r.grandfathered.length), edit.id).toBe(want.grandfathered);
      expect(r.check.cycles.map((c) => c.join(' -> ')).join(';'), edit.id).toBe(want.cycles);
      if (r.check.result === 'ACCEPT') accepted++;
      else expect(r.version).toBeNull();
    }
    expect(accepted).toBe(4);
    expect(await db.catalogVersion.count({ where: { orgId: seed.orgId } })).toBe(before + 4);
    expect(await db.publishAttempt.count({ where: { orgId: seed.orgId } })).toBe(15);
    expect(await db.enrollment.count({ where: { orgId: seed.orgId, grandfathered: true } })).toBe(17 + 6); // E-04's 17 and E-11's 6 are disjoint (different courses)
    const flagged = await db.enrollment.findMany({ where: { orgId: seed.orgId, grandfathered: true }, select: { status: true, learner: { select: { code: true } }, cohort: { select: { course: true } } } });
    const e04 = expectedEdits.find((r) => r.edit_id === 'E-04')!.grandfathered_learners!.split('+');
    for (const g of e04) {
      const [learner, course] = g.split('@');
      expect(flagged.some((f) => f.learner.code === learner && f.cohort.course === course), g).toBe(true);
    }
    expect(flagged.every((f) => f.status === 'IN_PROGRESS')).toBe(true); // never blocked (V3)
  }, 120_000);
});

describe('2.7 corrections and 2.9 tamper (the only writes after the seed)', () => {
  it('a correction changes the next read, leaves the old row, and is the one superseding row', async () => {
    const cohort = await db.cohort.findUniqueOrThrow({ where: { orgId_code: { orgId: seed.orgId, code: 'C-ACC101-F26' } } });
    const learner = await db.learner.findUniqueOrThrow({ where: { orgId_code: { orgId: seed.orgId, code: 'L-0003' } } });
    const old = await db.submission.findFirstOrThrow({ where: { cohortId: cohort.id, learnerId: learner.id, assignment: { code: 'HW1' } } });
    const before = (await gradeFor(cohort.id, learner.id)).grade;
    const fix = await correctScore(actor, old.id, 10000, 'regrade: rubric line 3 was mis-keyed');
    const after = (await gradeFor(cohort.id, learner.id)).grade;
    expect(after.final_hp).not.toBe(before.final_hp);
    expect(after.final_hp).toBeGreaterThan(before.final_hp);
    expect((await db.submission.findUniqueOrThrow({ where: { id: old.id } })).scoreHp).toBe(old.scoreHp);
    await expect(db.submission.update({ where: { id: old.id }, data: { scoreHp: 0 } })).rejects.toThrow(/append-only/);
    await expect(correctScore(actor, old.id, 9000, 'twice')).rejects.toThrow(/already superseded/);
    expect(await db.auditEvent.count({ where: { action: 'submission.corrected', targetId: fix.id } })).toBe(1);
  });

  it('a row removed behind the trigger is exactly one diff in progress:verify --db', async () => {
    const cohort = await db.cohort.findUniqueOrThrow({ where: { orgId_code: { orgId: seed.orgId, code: 'C-ACC101-F26' } } });
    const learner = await db.learner.findUniqueOrThrow({ where: { orgId_code: { orgId: seed.orgId, code: 'L-0003' } } });
    await db.$executeRaw`ALTER TABLE "ItemCompletion" DISABLE TRIGGER "ItemCompletion_append_only"`;
    try {
      expect(await db.$executeRaw`DELETE FROM "ItemCompletion" WHERE "cohortId" = ${cohort.id}::uuid AND "learnerId" = ${learner.id}::uuid AND "itemCode" = 'L01'`).toBe(1);
    } finally {
      await db.$executeRaw`ALTER TABLE "ItemCompletion" ENABLE TRIGGER "ItemCompletion_append_only"`;
    }
    const got = await dbEnrollmentProgress(seed.orgId);
    const diffs = diffRows(got, byKey(loadExpected('fixtures', 'expected_enrollment_progress.csv'), ['cohort', 'learner_id']), COLUMNS.enrollmentProgress);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatch(/items_done: computed "3" expected "4"/);
    expect(await courseProgressFor((await db.enrollment.findUniqueOrThrow({ where: { cohortId_learnerId: { cohortId: cohort.id, learnerId: learner.id } } })).id)).toEqual({ itemsTotal: 9, itemsDone: 3, progressBp: 3333 });
  }, 60_000);
});
