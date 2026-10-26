/**
 * LearnerState from rows (G6, V2): PASS completion events + waivers + the version's equivalencies.
 * A FAIL satisfies nothing; the engine decides everything else.
 */
import { db } from '@/core/db';
import { LearnerState, WAIVER_REASONS, type WaiverReason } from '@/graph/eligibility';
import type { Catalog } from '@/graph/types';
import type { Tx } from './versions';

export function asWaiverReason(reason: string): WaiverReason {
  if (!(WAIVER_REASONS as readonly string[]).includes(reason)) throw new Error(`unknown waiver reason ${reason}`);
  return reason as WaiverReason;
}

/** One state per learner id of the org, against `catalog`'s equivalencies. Learners with no rows get an empty state. */
export async function learnerStatesFor(orgId: string, catalog: Catalog, tx: Tx = db): Promise<Map<string, LearnerState>> {
  // Sequential on purpose: inside a transaction the three queries share one connection (pg refuses concurrent queries there).
  const learners = await tx.learner.findMany({ where: { orgId }, select: { id: true } });
  const passes = await tx.completionEvent.findMany({ where: { orgId, kind: 'PASS' }, select: { learnerId: true, course: true } });
  const waivers = await tx.waiver.findMany({ where: { orgId }, select: { learnerId: true, course: true, reason: true } });
  const passed = new Map<string, Set<string>>();
  for (const p of passes) {
    const s = passed.get(p.learnerId) ?? new Set<string>();
    s.add(p.course);
    passed.set(p.learnerId, s);
  }
  const waived = new Map<string, Map<string, WaiverReason>>();
  for (const w of waivers) {
    const m = waived.get(w.learnerId) ?? new Map<string, WaiverReason>();
    m.set(w.course, asWaiverReason(w.reason));
    waived.set(w.learnerId, m);
  }
  return new Map(learners.map((l) => [l.id, new LearnerState(passed.get(l.id) ?? [], waived.get(l.id) ?? new Map(), catalog.equivalencies)]));
}

export async function learnerStateFor(learnerId: string, catalog: Catalog, tx: Tx = db): Promise<LearnerState> {
  const passes = await tx.completionEvent.findMany({ where: { learnerId, kind: 'PASS' }, select: { course: true } });
  const waivers = await tx.waiver.findMany({ where: { learnerId }, select: { course: true, reason: true } });
  return new LearnerState(
    passes.map((p) => p.course),
    new Map(waivers.map((w) => [w.course, asWaiverReason(w.reason)])),
    catalog.equivalencies,
  );
}
