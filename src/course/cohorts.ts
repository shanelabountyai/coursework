/** Cohorts, items, enrollments and learners: plain rows, the S1 gate on attaching a scheme, and tenancy checks. */
import { audit } from '@/core/audit';
import { db } from '@/core/db';
import { validateScheme } from '@/grades/scheme';
import { courseMap } from '@/graph/types';
import type { Actor } from './actor';
import { schemeOf } from './grades';
import { loadVersion, type Tx } from './versions';

export async function createLearner(actor: Actor, input: { code: string; name: string; email: string; targetCertificate: string; enrolledVersionId: string; userId?: string | null }, tx?: Tx) {
  const run = async (t: Tx) => {
    const { catalog } = await loadVersion(input.enrolledVersionId, t);
    if (!catalog.certificates.some((c) => c.code === input.targetCertificate)) throw new Error(`createLearner: version ${catalog.version} has no certificate ${input.targetCertificate}`);
    const row = await t.learner.create({ data: { orgId: actor.orgId, code: input.code, name: input.name, email: input.email.toLowerCase(), targetCertificate: input.targetCertificate, enrolledVersionId: input.enrolledVersionId, userId: input.userId ?? null } });
    await audit(actor, 'learner.created', { targetType: 'Learner', targetId: row.id, data: { code: input.code, versionId: input.enrolledVersionId } }, t);
    return row;
  };
  return tx ? run(tx) : db.$transaction(run);
}

export async function grantWaiver(actor: Actor, input: { learnerId: string; course: string; reason: string; grantedDay: string; grantedBy: string }, tx?: Tx) {
  const run = async (t: Tx) => {
    const row = await t.waiver.create({ data: { orgId: actor.orgId, ...input, actorUserId: actor.userId } });
    await audit(actor, 'waiver.granted', { targetType: 'Waiver', targetId: row.id, data: { learnerId: input.learnerId, course: input.course, reason: input.reason, day: input.grantedDay } }, t);
    return row;
  };
  return tx ? run(tx) : db.$transaction(run);
}

export interface CohortInput {
  code: string;
  course: string;
  startDay: string;
  schemeCode: string | null;
  catalogVersionId: string;
  items: { code: string; title?: string; offsetDays: number }[];
}

/** A cohort runs a course of its version; a scheme may be attached only if it passes S1 (REJECT schemes are stored DRAFT). */
export async function createCohort(actor: Actor, input: CohortInput, tx?: Tx) {
  const run = async (t: Tx) => {
    const { catalog } = await loadVersion(input.catalogVersionId, t);
    if (!courseMap(catalog).has(input.course)) throw new Error(`createCohort: ${input.course} is not in version ${catalog.version}`);
    let schemeId: string | null = null;
    if (input.schemeCode !== null) {
      const s = await t.gradeScheme.findUniqueOrThrow({ where: { orgId_code: { orgId: actor.orgId, code: input.schemeCode } } });
      const check = validateScheme(schemeOf(s));
      if (check.result !== 'ACCEPT') throw new Error(`createCohort: scheme ${input.schemeCode} is ${check.result} and cannot be attached (S1)`);
      schemeId = s.id;
    }
    const row = await t.cohort.create({
      data: { orgId: actor.orgId, code: input.code, course: input.course, startDay: input.startDay, schemeId, catalogVersionId: input.catalogVersionId, items: { create: input.items.map((i) => ({ code: i.code, title: i.title ?? '', offsetDays: i.offsetDays })) } },
    });
    await audit(actor, 'cohort.created', { targetType: 'Cohort', targetId: row.id, data: { code: input.code, course: input.course, startDay: input.startDay, items: input.items.length } }, t);
    return row;
  };
  return tx ? run(tx) : db.$transaction(run);
}

export async function enroll(actor: Actor, input: { cohortId: string; learnerId: string; status?: 'IN_PROGRESS' | 'COMPLETED'; catalogVersionId?: string }, tx?: Tx) {
  const run = async (t: Tx) => {
    const cohort = await t.cohort.findUniqueOrThrow({ where: { id: input.cohortId }, select: { orgId: true, catalogVersionId: true } });
    if (cohort.orgId !== actor.orgId) throw new Error('enroll: cohort belongs to another org');
    const row = await t.enrollment.create({ data: { orgId: actor.orgId, cohortId: input.cohortId, learnerId: input.learnerId, status: input.status ?? 'IN_PROGRESS', catalogVersionId: input.catalogVersionId ?? cohort.catalogVersionId } });
    await audit(actor, 'enrollment.created', { targetType: 'Enrollment', targetId: row.id, data: { cohortId: input.cohortId, learnerId: input.learnerId, versionId: row.catalogVersionId } }, t);
    return row;
  };
  return tx ? run(tx) : db.$transaction(run);
}

export async function createAssignment(actor: Actor, input: { cohortId: string; code: string; category: string; pointsPossible: number; dueDay: string; extraCredit: boolean }, tx?: Tx) {
  const run = async (t: Tx) => {
    const cohort = await t.cohort.findUniqueOrThrow({ where: { id: input.cohortId }, select: { orgId: true, scheme: true } });
    if (cohort.orgId !== actor.orgId) throw new Error('createAssignment: cohort belongs to another org');
    if (!cohort.scheme) throw new Error('createAssignment: the cohort has no grade scheme');
    if (!schemeOf(cohort.scheme).categories.some((c) => c.code === input.category)) throw new Error(`createAssignment: scheme has no category ${input.category}`);
    const row = await t.assignment.create({ data: input });
    await audit(actor, 'assignment.created', { targetType: 'Assignment', targetId: row.id, data: { cohortId: input.cohortId, code: input.code } }, t);
    return row;
  };
  return tx ? run(tx) : db.$transaction(run);
}
