// Task 2.5: item completion through the drip engine. ACCEPT writes an ItemCompletion; every REJECT:* writes
// one AuditEvent and no row (D-46); course progress is a read with nothing stored.
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { completeItem, courseProgressFor } from '@/course/items';
import { resetAuthTables } from '../helpers/auth';
import { seedMinimal } from './helpers';

beforeEach(resetAuthTables);

describe('2.5 completeItem', () => {
  it('ACCEPT / NOT_RELEASED / UNKNOWN_ITEM / NOT_ENROLLED, each with exactly its rows', async () => {
    const { actor, learner, cohort } = await seedMinimal();
    const e = await db.enrollment.create({ data: { orgId: actor.orgId, cohortId: cohort.id, learnerId: learner.id, catalogVersionId: cohort.catalogVersionId } });
    expect(await courseProgressFor(e.id)).toEqual({ itemsTotal: 2, itemsDone: 0, progressBp: 0 });

    expect((await completeItem(actor, { cohortCode: 'C-ACC101', learnerCode: 'L-0001', itemCode: 'A01', day: '2026-01-07' })).verdict).toBe('REJECT:NOT_RELEASED'); // start 01-05 + 3 = 01-08
    expect((await completeItem(actor, { cohortCode: 'C-ACC101', learnerCode: 'L-0001', itemCode: 'ZZZ', day: '2026-01-09' })).verdict).toBe('REJECT:UNKNOWN_ITEM');
    expect((await completeItem(actor, { cohortCode: 'C-ACC101', learnerCode: 'L-9999', itemCode: 'A01', day: '2026-01-09' })).verdict).toBe('REJECT:NOT_ENROLLED');
    expect((await completeItem(actor, { cohortCode: 'C-NOPE', learnerCode: 'L-0001', itemCode: 'A01', day: '2026-01-09' })).verdict).toBe('REJECT:NOT_ENROLLED');
    expect(await db.itemCompletion.count()).toBe(0);
    expect(await db.auditEvent.count({ where: { action: 'item.refused' } })).toBe(4);

    const ok = await completeItem(actor, { cohortCode: 'C-ACC101', learnerCode: 'L-0001', itemCode: 'A01', day: '2026-01-08', eventRef: 'IE-1' });
    expect(ok.verdict).toBe('ACCEPT');
    const row = await db.itemCompletion.findUniqueOrThrow({ where: { id: ok.id! } });
    expect(row).toMatchObject({ itemCode: 'A01', day: '2026-01-08', eventRef: 'IE-1', learnerId: learner.id, cohortId: cohort.id });
    expect(await db.auditEvent.count({ where: { action: 'item.completed' } })).toBe(1);
    expect(await courseProgressFor(e.id)).toEqual({ itemsTotal: 2, itemsDone: 1, progressBp: 5000 });

    // the same item again is refused by the unique index, not re-counted
    await expect(completeItem(actor, { cohortCode: 'C-ACC101', learnerCode: 'L-0001', itemCode: 'A01', day: '2026-01-09' })).rejects.toThrow();
    expect(await courseProgressFor(e.id)).toEqual({ itemsTotal: 2, itemsDone: 1, progressBp: 5000 });
  });
});
