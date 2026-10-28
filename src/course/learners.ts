/**
 * D-51 (owner decision 2026-10-26): a learner signs in as an org member whose User is linked to their
 * Learner row. The link is made ONLY here, by an explicit admin action, and audited; an email match
 * never links by itself. One learner per user per org (unique index, D-51).
 */
import { audit } from '@/core/audit';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import type { Actor } from './actor';
import { assertWritable } from './archive';
import type { Tx } from './versions';

/** The learner row a signed-in user is, in one org; null for staff and unlinked members. */
export async function learnerForUser(orgId: string, userId: string, tx: Tx = db) {
  return tx.learner.findFirst({ where: { orgId, userId } });
}

export async function linkLearner(actor: Actor, input: { learnerId: string; userId: string }, tx?: Tx) {
  const run = async (t: Tx) => {
    await assertWritable(actor.orgId, t);
    const learner = await t.learner.findFirst({ where: { id: input.learnerId, orgId: actor.orgId } });
    if (!learner) throw new Refused('No such learner in this org.');
    const member = await t.membership.findUnique({ where: { orgId_userId: { orgId: actor.orgId, userId: input.userId } }, select: { user: { select: { email: true } } } });
    if (!member) throw new Refused('That person is not a member of this org. Invite them first.');
    if (learner.userId === input.userId) return learner;
    if (learner.userId) throw new Refused(`${learner.code} is already linked to another member. Unlink it first.`);
    const other = await t.learner.findFirst({ where: { orgId: actor.orgId, userId: input.userId }, select: { code: true } });
    if (other) throw new Refused(`${member.user.email} is already linked to ${other.code}.`);
    const row = await t.learner.update({ where: { id: learner.id }, data: { userId: input.userId } });
    await audit(actor, 'learner.linked', { targetType: 'Learner', targetId: learner.id, data: { code: learner.code, userId: input.userId } }, t);
    return row;
  };
  return tx ? run(tx) : db.$transaction(run);
}

export async function unlinkLearner(actor: Actor, input: { learnerId: string }, tx?: Tx) {
  const run = async (t: Tx) => {
    await assertWritable(actor.orgId, t);
    const learner = await t.learner.findFirst({ where: { id: input.learnerId, orgId: actor.orgId } });
    if (!learner) throw new Refused('No such learner in this org.');
    if (!learner.userId) return learner;
    const row = await t.learner.update({ where: { id: learner.id }, data: { userId: null } });
    await audit(actor, 'learner.unlinked', { targetType: 'Learner', targetId: learner.id, data: { code: learner.code, userId: learner.userId } }, t);
    return row;
  };
  return tx ? run(tx) : db.$transaction(run);
}
