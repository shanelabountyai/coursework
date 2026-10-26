/**
 * D-53 (owner decision 2026-10-26): who sees and does what. Staff = `org.update` (owner, admin) or
 * `results.write` (owner, admin, scorekeeper). A plain member sees only the learner row linked to her
 * own user (D-51). "Not yours" is "not found" (template INV-04), so pages call notFound() on a refusal.
 */
import { notFound } from 'next/navigation';
import type { OrgCtx } from '@/core/authz/guards';
import { can } from '@/core/authz/permissions';
import { db } from '@/core/db';
import { learnerForUser } from './learners';

export const isStaff = (ctx: Pick<OrgCtx, 'role'>) => can(ctx.role, 'org.update') || can(ctx.role, 'results.write');
export const canEditCatalog = (ctx: Pick<OrgCtx, 'role'>) => can(ctx.role, 'org.update');
export const canEnterResults = (ctx: Pick<OrgCtx, 'role'>) => can(ctx.role, 'results.write');

/** The learner row of the signed-in member in this org, or null. */
export const viewerLearner = (ctx: Pick<OrgCtx, 'orgId' | 'userId'>) => learnerForUser(ctx.orgId, ctx.userId);

/** A learner of this org by code that the viewer may see (staff: any; a member: only her own); 404 otherwise. */
export async function learnerVisibleTo(ctx: OrgCtx, code: string) {
  const learner = await db.learner.findUnique({ where: { orgId_code: { orgId: ctx.orgId, code } } });
  if (!learner) notFound();
  if (!isStaff(ctx) && learner.userId !== ctx.userId) notFound();
  return learner;
}

/** A cohort of this org by code that the viewer may see (staff: any; a member: only one she is enrolled in); 404 otherwise. */
export async function cohortVisibleTo(ctx: OrgCtx, code: string) {
  const cohort = await db.cohort.findUnique({ where: { orgId_code: { orgId: ctx.orgId, code } } });
  if (!cohort) notFound();
  if (isStaff(ctx)) return { cohort, self: null };
  const me = await viewerLearner(ctx);
  if (!me || !(await db.enrollment.findUnique({ where: { cohortId_learnerId: { cohortId: cohort.id, learnerId: me.id } } }))) notFound();
  return { cohort, self: me };
}

/** The most recently created version of the org's catalog (D-60), or null before the first. */
export const currentVersion = (orgId: string) => db.catalogVersion.findFirst({ where: { orgId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
