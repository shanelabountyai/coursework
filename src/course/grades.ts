/**
 * Gradebook reads and score corrections (S1–S9; task 2.7). A scheme is stored as data with its hash;
 * only an S1 ACCEPT scheme may be attached to a cohort. A submission is append-only; a correction is a
 * new row that supersedes the old one, and "current" is derived here (the row nothing supersedes).
 */
import { audit } from '@/core/audit';
import { db } from '@/core/db';
import type { Prisma } from '@/generated/prisma/client';
import { gradeLearner, type Assignment, type Grade, type Submission } from '@/grades/grade';
import { validateScheme, type Scheme } from '@/grades/scheme';
import { canonical, sha256Hex, type Json } from '@/graph/canonical';
import type { Actor } from './actor';
import type { Tx } from './versions';


export function schemeHash(scheme: Scheme): string {
  return sha256Hex(canonical(scheme as unknown as Json));
}

/** S1 at the write: a scheme that does not validate is stored only as DRAFT and can never be attached. */
export async function createScheme(actor: Actor, scheme: Scheme, tx?: Tx) {
  const check = validateScheme(scheme);
  const status = check.result === 'ACCEPT' ? (scheme.status ?? 'PUBLISHED') : 'DRAFT';
  const run = async (t: Tx) => {
    const row = await t.gradeScheme.create({ data: { orgId: actor.orgId, code: scheme.id, content: scheme as unknown as Prisma.InputJsonObject, status, hash: schemeHash(scheme) } });
    await audit(actor, 'scheme.created', { targetType: 'GradeScheme', targetId: row.id, data: { code: scheme.id, result: check.result, weights_bp: check.weights_bp } }, t);
    return { row, check };
  };
  return tx ? run(tx) : db.$transaction(run);
}

export function schemeOf(row: { code: string; content: Prisma.JsonValue; hash: string }): Scheme {
  const scheme = row.content as unknown as Scheme;
  const hash = schemeHash(scheme);
  if (hash !== row.hash) throw new Error(`GradeScheme ${row.code}: stored hash ${row.hash} != content hash ${hash}`);
  return scheme;
}

export async function recordSubmission(actor: Actor, input: { cohortCode: string; learnerCode: string; assignmentCode: string; scoreHp: number; submittedDay: string }, tx?: Tx) {
  if (!Number.isInteger(input.scoreHp) || input.scoreHp < 0) throw new Error(`recordSubmission: score_hp must be a non-negative integer, got ${String(input.scoreHp)}`);
  const run = async (t: Tx) => {
    const cohort = await t.cohort.findUniqueOrThrow({ where: { orgId_code: { orgId: actor.orgId, code: input.cohortCode } }, select: { id: true } });
    const learner = await t.learner.findUniqueOrThrow({ where: { orgId_code: { orgId: actor.orgId, code: input.learnerCode } }, select: { id: true } });
    const assignment = await t.assignment.findUniqueOrThrow({ where: { cohortId_code: { cohortId: cohort.id, code: input.assignmentCode } }, select: { id: true } });
    await t.enrollment.findUniqueOrThrow({ where: { cohortId_learnerId: { cohortId: cohort.id, learnerId: learner.id } }, select: { id: true } }); // a score for someone not in the cohort is a caller bug
    const row = await t.submission.create({ data: { orgId: actor.orgId, cohortId: cohort.id, learnerId: learner.id, assignmentId: assignment.id, scoreHp: input.scoreHp, submittedDay: input.submittedDay, actorUserId: actor.userId } });
    await audit(actor, 'submission.recorded', { targetType: 'Submission', targetId: row.id, data: { ...input } }, t);
    return row;
  };
  return tx ? run(tx) : db.$transaction(run);
}

/** A correction supersedes exactly one current row; the old row is untouched (the trigger would refuse anyway). */
export async function correctScore(actor: Actor, submissionId: string, newScoreHp: number, reason: string, tx?: Tx) {
  if (!Number.isInteger(newScoreHp) || newScoreHp < 0) throw new Error('correctScore: score_hp must be a non-negative integer');
  if (!reason.trim()) throw new Error('correctScore: a reason is required');
  const run = async (t: Tx) => {
    const old = await t.submission.findUniqueOrThrow({ where: { id: submissionId }, include: { supersededBy: { select: { id: true } } } });
    if (old.orgId !== actor.orgId) throw new Error('correctScore: submission belongs to another org');
    if (old.supersededBy) throw new Error(`correctScore: ${submissionId} is already superseded by ${old.supersededBy.id}`);
    const row = await t.submission.create({
      data: { orgId: old.orgId, cohortId: old.cohortId, learnerId: old.learnerId, assignmentId: old.assignmentId, scoreHp: newScoreHp, submittedDay: old.submittedDay, supersedesId: old.id, reason, actorUserId: actor.userId },
    });
    await audit(actor, 'submission.corrected', { targetType: 'Submission', targetId: row.id, data: { supersedes: old.id, from: old.scoreHp, to: newScoreHp, reason } }, t);
    return row;
  };
  return tx ? run(tx) : db.$transaction(run);
}

/** The current submission per assignment code: rows that nothing supersedes. */
export async function currentSubmissions(cohortId: string, learnerId: string, tx: Tx = db): Promise<Map<string, Submission>> {
  const rows = await tx.submission.findMany({ where: { cohortId, learnerId, supersededBy: null }, select: { scoreHp: true, submittedDay: true, assignment: { select: { code: true } } } });
  return new Map(rows.map((r) => [r.assignment.code, { score_hp: r.scoreHp, submitted_day: r.submittedDay }]));
}

export async function assignmentsOf(cohortId: string, tx: Tx = db): Promise<Assignment[]> {
  const rows = await tx.assignment.findMany({ where: { cohortId }, orderBy: { code: 'asc' } });
  return rows.map((a) => ({ code: a.code, category: a.category, points_possible: a.pointsPossible, due_day: a.dueDay, extra_credit: a.extraCredit }));
}

/** S2–S9 for one learner of one cohort, from current submissions. Throws if the cohort has no scheme. */
export async function gradeFor(cohortId: string, learnerId: string, tx: Tx = db): Promise<{ scheme: Scheme; grade: Grade }> {
  const cohort = await tx.cohort.findUniqueOrThrow({ where: { id: cohortId }, select: { scheme: true } });
  if (!cohort.scheme) throw new Error('gradeFor: the cohort has no grade scheme');
  const scheme = schemeOf(cohort.scheme);
  const assignments = await assignmentsOf(cohortId, tx);
  const submissions = await currentSubmissions(cohortId, learnerId, tx);
  return { scheme, grade: gradeLearner(scheme, assignments, submissions) };
}
