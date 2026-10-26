'use server';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { orgAction, ref } from '@/core/authz/action';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { correctScore, recordSubmission } from '@/course/grades';
import { completeItem } from '@/course/items';
import { learnerForUser } from '@/course/learners';
import { parsePercentHp } from '@/course/scores';
import { schoolToday } from '@/course/today';
import { isDay } from '@/graph/days';

// D-53: scores are `results.write` (owner, admin, scorekeeper). Completing an item is the linked learner's
// own act: no learner id and no day come from the form — the learner is the session's (D-51), the day is the
// server's (D-57), and the drip engine decides (R1–R3).

const cohortOf = async (orgId: string, id: string) => {
  const c = await db.cohort.findFirst({ where: { id, orgId } });
  if (!c) notFound();
  return c;
};

export const recordScoreAction = orgAction(
  'results.write',
  z.object({ cohortId: ref('cohort'), learnerId: ref('learner'), assignmentId: ref('assignment'), score: z.string().max(10), submittedDay: z.string().max(10) }),
  async (ctx, input) => {
    const cohort = await cohortOf(ctx.orgId, input.cohortId);
    const learner = await db.learner.findFirst({ where: { id: input.learnerId, orgId: ctx.orgId } });
    const assignment = await db.assignment.findFirst({ where: { id: input.assignmentId, cohortId: cohort.id } });
    if (!learner || !assignment) notFound();
    if (!(await db.enrollment.findUnique({ where: { cohortId_learnerId: { cohortId: cohort.id, learnerId: learner.id } } }))) throw new Refused(`${learner.code} is not enrolled in ${cohort.code}.`);
    if (!isDay(input.submittedDay)) throw new Refused('The submitted day must be a calendar day, YYYY-MM-DD.');
    const scoreHp = parsePercentHp(input.score);
    const current = await db.submission.findFirst({ where: { cohortId: cohort.id, learnerId: learner.id, assignmentId: assignment.id, supersededBy: null } });
    if (current) throw new Refused(`${assignment.code} already has a score for ${learner.code}; correct it instead (a correction keeps the old row).`);
    await recordSubmission({ orgId: ctx.orgId, userId: ctx.userId }, { cohortCode: cohort.code, learnerCode: learner.code, assignmentCode: assignment.code, scoreHp, submittedDay: input.submittedDay });
    revalidatePath(`/o/${ctx.slug}/cohorts/${cohort.code}/grades`);
    return { notice: `${assignment.code} for ${learner.code} recorded.` };
  },
);

export const correctScoreAction = orgAction(
  'results.write',
  z.object({ submissionId: ref('submission'), score: z.string().max(10), reason: z.string().max(200) }),
  async (ctx, input) => {
    const sub = await db.submission.findFirst({ where: { id: input.submissionId, orgId: ctx.orgId }, include: { supersededBy: { select: { id: true } }, cohort: { select: { code: true } } } });
    if (!sub) notFound();
    if (sub.supersededBy) throw new Refused('That score has already been corrected; correct the current one.');
    if (!input.reason.trim()) throw new Refused('Say why the score is being corrected.');
    await correctScore({ orgId: ctx.orgId, userId: ctx.userId }, sub.id, parsePercentHp(input.score), input.reason.trim());
    revalidatePath(`/o/${ctx.slug}/cohorts/${sub.cohort.code}/grades`);
    return { notice: 'Score corrected; the old row is kept.' };
  },
);

export const completeItemAction = orgAction(null, z.object({ cohortId: ref('cohort'), itemCode: z.string().max(20) }), async (ctx, input) => {
  const cohort = await cohortOf(ctx.orgId, input.cohortId);
  const me = await learnerForUser(ctx.orgId, ctx.userId);
  if (!me) throw new Refused('Only a learner linked to your account can complete items.');
  const day = schoolToday();
  const r = await completeItem({ orgId: ctx.orgId, userId: ctx.userId }, { cohortCode: cohort.code, learnerCode: me.code, itemCode: input.itemCode, day });
  revalidatePath(`/o/${ctx.slug}/cohorts/${cohort.code}/drip`);
  if (r.verdict !== 'ACCEPT') return { error: `${r.verdict}: ${input.itemCode} on ${day} was refused and logged.` };
  return { notice: `${input.itemCode} completed on ${day}.` };
});
