'use server';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { orgAction, ref } from '@/core/authz/action';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { recordCompletion } from '@/course/completions';
import { linkLearner, unlinkLearner } from '@/course/learners';
import { loadVersion } from '@/course/versions';
import { isDay } from '@/graph/days';
import { courseMap } from '@/graph/types';

// D-51: linking is an explicit, audited admin action (`org.update`); D-53: a staff completion entry is a result (`results.write`).

const mine = async (orgId: string, learnerId: string) => {
  const l = await db.learner.findFirst({ where: { id: learnerId, orgId } });
  if (!l) notFound(); // not yours ≡ not found (INV-02/04)
  return l;
};

export const linkLearnerAction = orgAction('org.update', z.object({ learnerId: ref('learner'), userId: ref('member') }), async (ctx, input) => {
  const l = await mine(ctx.orgId, input.learnerId);
  if (!(await db.membership.findUnique({ where: { orgId_userId: { orgId: ctx.orgId, userId: input.userId } } }))) notFound(); // a non-member ≡ not found
  await linkLearner({ orgId: ctx.orgId, userId: ctx.userId }, input);
  revalidatePath(`/o/${ctx.slug}/learners/${l.code}`);
  return { notice: `${l.code} linked.` };
});

export const unlinkLearnerAction = orgAction('org.update', z.object({ learnerId: ref('learner') }), async (ctx, input) => {
  const l = await mine(ctx.orgId, input.learnerId);
  await unlinkLearner({ orgId: ctx.orgId, userId: ctx.userId }, input);
  revalidatePath(`/o/${ctx.slug}/learners/${l.code}`);
  return { notice: `${l.code} unlinked.` };
});

export const recordCompletionAction = orgAction(
  'results.write',
  z.object({ learnerId: ref('learner'), course: z.string().max(20), kind: z.enum(['PASS', 'FAIL']), day: z.string().max(10) }),
  async (ctx, input) => {
    const l = await mine(ctx.orgId, input.learnerId);
    if (!isDay(input.day)) throw new Refused('The day must be a calendar day, YYYY-MM-DD.');
    const { catalog } = await loadVersion(l.enrolledVersionId);
    if (!courseMap(catalog).has(input.course)) throw new Refused(`${input.course} is not a course of ${catalog.version}.`);
    // V2: the completion is evaluated under the learner's enrolled version.
    await recordCompletion({ orgId: ctx.orgId, userId: ctx.userId }, { learnerId: l.id, course: input.course, kind: input.kind, day: input.day, versionId: l.enrolledVersionId });
    revalidatePath(`/o/${ctx.slug}/learners/${l.code}`);
    return { notice: `${input.kind} in ${input.course} on ${input.day} recorded for ${l.code}.` };
  },
);
