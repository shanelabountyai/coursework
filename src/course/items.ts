/**
 * Item completion through the drip engine (R1–R3, P1; task 2.5). The cohort view is built from rows,
 * `checkItemCompletion` decides, and only an ACCEPT becomes an ItemCompletion row. A REJECT:* writes
 * one AuditEvent and nothing else (PRD P0-6, D-46). Course progress is a read.
 */
import { audit } from '@/core/audit';
import { db } from '@/core/db';
import { checkItemCompletion, courseProgressBp, type Cohort as CohortView, type DripVerdict } from '@/graph/drip';
import type { Actor } from './actor';
import { assertWritable } from './archive';
import type { Tx } from './versions';

export interface ItemCompletionInput {
  cohortCode: string;
  learnerCode: string;
  itemCode: string;
  day: string;
  /** The caller's own id for the event (a fixture event_id, an LMS message id), kept for replay audits. */
  eventRef?: string;
}

export type ItemCompletionResult = { verdict: 'ACCEPT'; id: string } | { verdict: Exclude<DripVerdict, 'ACCEPT'>; id: null };

/** The engine's Cohort for one stored cohort (items + enrolled learners by learner CODE, as the engine keys them). */
export async function cohortView(orgId: string, cohortCode: string, tx: Tx = db): Promise<{ id: string; view: CohortView; learnerIds: Map<string, string> } | null> {
  const row = await tx.cohort.findUnique({
    where: { orgId_code: { orgId, code: cohortCode } },
    include: { items: { orderBy: { code: 'asc' } }, enrollments: { select: { status: true, learner: { select: { id: true, code: true } } } }, scheme: { select: { code: true } }, catalogVersion: { select: { label: true } } },
  });
  if (!row) return null;
  return {
    id: row.id,
    view: {
      id: row.code,
      course: row.course,
      start_day: row.startDay,
      scheme: row.scheme?.code ?? null,
      catalog_version: row.catalogVersion.label,
      items: row.items.map((i) => ({ code: i.code, title: i.title, offset_days: i.offsetDays })),
      enrolled: row.enrollments.map((e) => ({ learner_id: e.learner.code, status: e.status })),
    },
    learnerIds: new Map(row.enrollments.map((e) => [e.learner.code, e.learner.id])),
  };
}

export async function completeItem(actor: Actor, input: ItemCompletionInput, tx?: Tx): Promise<ItemCompletionResult> {
  const run = async (t: Tx): Promise<ItemCompletionResult> => {
    await assertWritable(actor.orgId, t);
    const c = await cohortView(actor.orgId, input.cohortCode, t);
    const cohorts = new Map(c ? [[c.view.id, c.view]] : []);
    const verdict = checkItemCompletion({ learner: input.learnerCode, cohort: input.cohortCode, item: input.itemCode, day: input.day }, cohorts, (l, co) => co === c?.view.id && c.learnerIds.has(l));
    const data = { cohort: input.cohortCode, learner: input.learnerCode, item: input.itemCode, day: input.day, verdict, ...(input.eventRef && { eventRef: input.eventRef }) };
    if (verdict !== 'ACCEPT' || !c) {
      await audit(actor, 'item.refused', { targetType: 'Cohort', targetId: c?.id, data }, t);
      return { verdict: verdict as Exclude<DripVerdict, 'ACCEPT'>, id: null };
    }
    const row = await t.itemCompletion.create({
      data: { orgId: actor.orgId, cohortId: c.id, learnerId: c.learnerIds.get(input.learnerCode)!, itemCode: input.itemCode, day: input.day, eventRef: input.eventRef ?? null, actorUserId: actor.userId },
    });
    await audit(actor, 'item.completed', { targetType: 'ItemCompletion', targetId: row.id, data }, t);
    return { verdict: 'ACCEPT', id: row.id };
  };
  return tx ? run(tx) : db.$transaction(run);
}

/** P1: accepted distinct items / items in the cohort, as bp, floor. Read every time; nothing stores it. */
export async function courseProgressFor(enrollmentId: string, tx: Tx = db): Promise<{ itemsTotal: number; itemsDone: number; progressBp: number }> {
  const e = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, select: { cohortId: true, learnerId: true, cohort: { select: { items: { select: { code: true } } } } } });
  const items = new Set(e.cohort.items.map((i) => i.code));
  const done = await tx.itemCompletion.findMany({ where: { cohortId: e.cohortId, learnerId: e.learnerId }, select: { itemCode: true } });
  const itemsDone = new Set(done.map((d) => d.itemCode).filter((code) => items.has(code))).size;
  return { itemsTotal: items.size, itemsDone, progressBp: courseProgressBp(itemsDone, items.size) };
}
