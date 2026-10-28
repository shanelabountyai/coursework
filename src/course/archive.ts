/**
 * D-56 (owner decision 2026-10-26): an org with append-only history is archived, never deleted.
 * `assertWritable` is the first call of every clone writer in src/course/ (tests/course/archive.test.ts
 * drives each one against an archived org); the `coursework_refuse_archived` trigger is the backstop for
 * any path that forgets. `beforeOrgDelete` (src/app/org-hooks.ts) asks `deletionBlocker` so the template's
 * delete-org refuses with a sentence instead of a foreign-key error.
 */
import { audit } from '@/core/audit';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import type { Actor } from './actor';
import type { Tx } from './versions';

export const ARCHIVED_MESSAGE = 'This org is archived. Its history is kept and can be read, but nothing new can be written.';

export async function archiveOf(orgId: string, tx: Tx = db) {
  return tx.orgArchive.findUnique({ where: { orgId } });
}

/** Throws Refused (a user-facing sentence) when the org is archived. */
export async function assertWritable(orgId: string, tx: Tx = db): Promise<void> {
  if (await archiveOf(orgId, tx)) throw new Refused(ARCHIVED_MESSAGE);
}

/** The append-only tables whose rows make an org undeletable (D-45: their Org FK is Restrict). */
export async function historyCounts(orgId: string, tx: Tx = db): Promise<Record<string, number>> {
  const where = { orgId };
  // Sequential: inside a transaction these share one connection.
  return {
    CatalogVersion: await tx.catalogVersion.count({ where }),
    PublishAttempt: await tx.publishAttempt.count({ where }),
    CompletionEvent: await tx.completionEvent.count({ where }),
    ItemCompletion: await tx.itemCompletion.count({ where }),
    Submission: await tx.submission.count({ where }),
  };
}

/** Why this org may not be deleted, as a sentence for the delete screen; null when it may. */
export async function deletionBlocker(orgId: string, tx: Tx = db): Promise<string | null> {
  if (await archiveOf(orgId, tx)) return 'This org is archived and keeps its history; an archived org is never deleted.';
  const counts = await historyCounts(orgId, tx);
  const held = Object.entries(counts).filter(([, n]) => n > 0);
  if (!held.length) return null;
  const list = held.map(([t, n]) => `${n.toLocaleString('en-US')} ${t}`).join(', ');
  return `This org has append-only history (${list}) and cannot be deleted. Archive it instead: Settings → Archive.`;
}

/** Owner action (D-56). Insert-only: there is no un-archive. */
export async function archiveOrg(actor: Actor, reason: string, tx?: Tx) {
  if (!reason.trim()) throw new Refused('Say why the org is being archived.');
  const run = async (t: Tx) => {
    await assertWritable(actor.orgId, t);
    const row = await t.orgArchive.create({ data: { orgId: actor.orgId, archivedBy: actor.userId, reason: reason.trim() } });
    await audit(actor, 'org.archived', { targetType: 'org', targetId: actor.orgId, data: { reason: row.reason } }, t);
    return row;
  };
  return tx ? run(tx) : db.$transaction(run);
}
