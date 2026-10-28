/**
 * Publishing through the engine (G5, G9, V1; task 2.4). THE ONLY MODULE THAT INSERTS A CatalogVersion
 * (CLAUDE.md non-negotiable 1): `insertVersion` below is private and takes the engine's `ACCEPT`
 * check as an argument, and tests/course/publish.test.ts greps src/ and scripts/ for any other
 * Prisma create call on the model. A refused edit writes a PublishAttempt and nothing else; an accepted one
 * writes the attempt, the version and the G9 report in one transaction, and flags the grandfathered
 * enrollments (V3).
 */
import { audit } from '@/core/audit';
import { db } from '@/core/db';
import type { Prisma } from '@/generated/prisma/client';
import { catalogHash } from '@/graph/canonical';
import { applyEdit, validateCatalog, type DraftEdit, type PublishCheck } from '@/graph/publish';
import { retroactiveReport, type EnrollmentRef, type Grandfathered } from '@/graph/retro';
import type { Catalog } from '@/graph/types';
import type { Actor } from './actor';
import { assertWritable } from './archive';
import { learnerStatesFor } from './state';
import { contentOf, loadVersion, type Tx } from './versions';

type Accepted = PublishCheck & { result: 'ACCEPT' };

async function insertVersion(tx: Tx, actor: Actor, label: string, catalog: Catalog, check: Accepted, parentId: string | null) {
  if (check.result !== 'ACCEPT') throw new Error('insertVersion: not an ACCEPT'); // belt and braces: the type already says so
  const content = contentOf(catalog);
  return tx.catalogVersion.create({
    data: { orgId: actor.orgId, label, hash: catalogHash(content), content: content as unknown as Prisma.InputJsonObject, parentId, actorUserId: actor.userId },
  });
}

/** The first version of an org's catalog (a seed or an import). Refuses anything the engine refuses. */
export async function createInitialVersion(actor: Actor, catalog: Catalog, tx?: Tx) {
  const check = validateCatalog(catalog);
  if (check.result !== 'ACCEPT') throw new Error(`createInitialVersion: ${check.result} — ${check.errors.map((e) => `${e.code}: ${e.detail}`).join('; ')}`);
  const run = async (t: Tx) => {
    await assertWritable(actor.orgId, t);
    const v = await insertVersion(t, actor, catalog.version, catalog, check as Accepted, null);
    await audit(actor, 'catalog.version_created', { targetType: 'CatalogVersion', targetId: v.id, data: { label: v.label, hash: v.hash } }, t);
    return v;
  };
  return tx ? run(tx) : db.$transaction(run);
}

export interface PublishResult {
  attemptId: string;
  check: PublishCheck;
  /** Set on ACCEPT only. */
  version: { id: string; label: string; hash: string } | null;
  grandfathered: Grandfathered[];
}

async function enrollmentRefs(orgId: string, tx: Tx): Promise<EnrollmentRef[]> {
  const rows = await tx.enrollment.findMany({ where: { orgId }, select: { learnerId: true, status: true, cohort: { select: { code: true, course: true } } } });
  return rows.map((e) => ({ learner: e.learnerId, course: e.cohort.course, cohort: e.cohort.code, status: e.status }));
}

/**
 * Apply `edit` to the version `fromVersionId`, run G5, and write the verdict. `label` names the new
 * version on ACCEPT. The G9 report is computed from the live enrollments and learner states and
 * stored with the attempt; each flagged enrollment gets `grandfathered = true` (V3 — a flag, never a block).
 */
export async function publishEdit(actor: Actor, fromVersionId: string, edit: DraftEdit, label: string): Promise<PublishResult> {
  return db.$transaction(async (tx) => {
    await assertWritable(actor.orgId, tx);
    const { row: from, catalog } = await loadVersion(fromVersionId, tx);
    if (from.orgId !== actor.orgId) throw new Error('publishEdit: version belongs to another org');
    const next = applyEdit(catalog, edit);
    const check = validateCatalog(next);
    const base = { orgId: actor.orgId, fromVersionId, edit: edit as unknown as Prisma.InputJsonObject, result: check.result, errors: check.errors as unknown as Prisma.InputJsonArray, cycles: check.cycles as unknown as Prisma.InputJsonArray, actorUserId: actor.userId };
    if (check.result !== 'ACCEPT') {
      const attempt = await tx.publishAttempt.create({ data: { ...base, grandfathered: [] } });
      await audit(actor, 'catalog.publish_refused', { targetType: 'PublishAttempt', targetId: attempt.id, data: { edit: edit.id, result: check.result, errors: check.errors.length } }, tx);
      return { attemptId: attempt.id, check, version: null, grandfathered: [] };
    }
    const states = await learnerStatesFor(actor.orgId, catalog, tx);
    const grandfathered = retroactiveReport(catalog, next, await enrollmentRefs(actor.orgId, tx), states);
    const version = await insertVersion(tx, actor, label, { ...next, version: label }, check as Accepted, from.id);
    const attempt = await tx.publishAttempt.create({ data: { ...base, grandfathered: grandfathered as unknown as Prisma.InputJsonArray, resultVersionId: version.id } });
    for (const g of grandfathered) {
      const cohort = await tx.cohort.findUniqueOrThrow({ where: { orgId_code: { orgId: actor.orgId, code: g.cohort } }, select: { id: true } });
      await tx.enrollment.update({ where: { cohortId_learnerId: { cohortId: cohort.id, learnerId: g.learner } }, data: { grandfathered: true, grandfatheredMissing: g.missing.join('+') } });
    }
    await audit(actor, 'catalog.published', { targetType: 'CatalogVersion', targetId: version.id, data: { edit: edit.id, attempt: attempt.id, label, hash: version.hash, grandfathered: grandfathered.length } }, tx);
    return { attemptId: attempt.id, check, version: { id: version.id, label: version.label, hash: version.hash }, grandfathered };
  });
}
