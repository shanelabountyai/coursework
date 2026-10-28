// Task 2.2 tamper tests: a direct UPDATE or DELETE on each append-only table fails with the trigger's message,
// through Prisma and through raw SQL, and the row is unchanged afterwards.
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { catalogHash } from '@/graph/canonical';
import { resetAuthTables } from '../helpers/auth';
import { seedMinimal } from './helpers';

beforeEach(resetAuthTables);

describe('2.2 append-only triggers', () => {
  it('CatalogVersion refuses UPDATE and DELETE', async () => {
    const { version } = await seedMinimal();
    await expect(db.catalogVersion.update({ where: { id: version.id }, data: { label: 'forged' } })).rejects.toThrow(/CatalogVersion is append-only/);
    await expect(db.$executeRawUnsafe(`UPDATE "CatalogVersion" SET "hash" = repeat('0', 64)`)).rejects.toThrow(/append-only/);
    await expect(db.catalogVersion.delete({ where: { id: version.id } })).rejects.toThrow(/append-only/);
    const row = await db.catalogVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(row.label).toBe('cat-v1');
    expect(row.hash).toBe(catalogHash(row.content as { courses: unknown; equivalencies: unknown; certificates: unknown }));
  });

  it('CompletionEvent refuses UPDATE and DELETE', async () => {
    const { org, learner, version } = await seedMinimal();
    const ev = await db.completionEvent.create({ data: { orgId: org.id, learnerId: learner.id, course: 'ACC-101', kind: 'PASS', day: '2026-01-10', catalogVersionId: version.id } });
    await expect(db.completionEvent.update({ where: { id: ev.id }, data: { kind: 'FAIL' } })).rejects.toThrow(/CompletionEvent is append-only/);
    await expect(db.completionEvent.deleteMany()).rejects.toThrow(/append-only/);
    expect((await db.completionEvent.findUniqueOrThrow({ where: { id: ev.id } })).kind).toBe('PASS');
  });

  it('ItemCompletion refuses UPDATE and DELETE', async () => {
    const { org, learner, cohort } = await seedMinimal();
    const ic = await db.itemCompletion.create({ data: { orgId: org.id, cohortId: cohort.id, learnerId: learner.id, itemCode: 'L01', day: '2026-01-10' } });
    await expect(db.$executeRawUnsafe(`UPDATE "ItemCompletion" SET "itemCode" = 'L02'`)).rejects.toThrow(/ItemCompletion is append-only/);
    await expect(db.itemCompletion.delete({ where: { id: ic.id } })).rejects.toThrow(/append-only/);
    expect((await db.itemCompletion.findUniqueOrThrow({ where: { id: ic.id } })).itemCode).toBe('L01');
  });

  it('Submission refuses UPDATE and DELETE; a correction is a new row', async () => {
    const { org, learner, cohort, assignment } = await seedMinimal();
    const s = await db.submission.create({ data: { orgId: org.id, cohortId: cohort.id, learnerId: learner.id, assignmentId: assignment.id, scoreHp: 7900, submittedDay: '2026-01-10' } });
    await expect(db.submission.update({ where: { id: s.id }, data: { scoreHp: 10000 } })).rejects.toThrow(/Submission is append-only/);
    await expect(db.submission.delete({ where: { id: s.id } })).rejects.toThrow(/append-only/);
    const fix = await db.submission.create({ data: { orgId: org.id, cohortId: cohort.id, learnerId: learner.id, assignmentId: assignment.id, scoreHp: 8100, submittedDay: '2026-01-10', supersedesId: s.id, reason: 'regrade' } });
    expect((await db.submission.findUniqueOrThrow({ where: { id: s.id } })).scoreHp).toBe(7900);
    // one correction per row: the unique index on supersedesId
    await expect(db.submission.create({ data: { orgId: org.id, cohortId: cohort.id, learnerId: learner.id, assignmentId: assignment.id, scoreHp: 8200, submittedDay: '2026-01-10', supersedesId: s.id, reason: 'again' } })).rejects.toThrow();
    expect(fix.supersedesId).toBe(s.id);
  });

  it('PublishAttempt refuses UPDATE and DELETE', async () => {
    const { org, version } = await seedMinimal();
    const a = await db.publishAttempt.create({ data: { orgId: org.id, fromVersionId: version.id, edit: {}, result: 'REJECT:CYCLE', errors: [], cycles: [], grandfathered: [] } });
    await expect(db.publishAttempt.update({ where: { id: a.id }, data: { result: 'ACCEPT' } })).rejects.toThrow(/PublishAttempt is append-only/);
    await expect(db.publishAttempt.deleteMany()).rejects.toThrow(/append-only/);
    expect((await db.publishAttempt.findUniqueOrThrow({ where: { id: a.id } })).result).toBe('REJECT:CYCLE');
  });

  it('an org with history cannot be deleted (Restrict, D-45), an org without one can', async () => {
    const { org } = await seedMinimal();
    await expect(db.org.delete({ where: { id: org.id } })).rejects.toThrow();
    const empty = await db.org.create({ data: { slug: 'empty', name: 'empty' } });
    await db.org.delete({ where: { id: empty.id } });
  });
});
