import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { endCredentialsOf } from '@/modules/apikeys/keys'; // apikeys
import type { ListedOrg } from '@/core/tenancy/listed';
import type { MembershipEnded, RoleChanged } from '@/core/tenancy/orgs';
import { deletionBlocker } from '@/course/archive';

// Clone-owned, like cron-jobs.ts: what must happen before an org is deleted. Throwing stops the
// deletion. (Billing was removed by the manifest, D-54, which took its `// billing` lines with it.)
// D-56: an org with append-only history (or an archive row) is never deleted. The template's deleteOrg
// calls this hook after its own checks and before its delete, so a Refused here reaches the danger page
// as a sentence; without it the Restrict foreign keys would fail the delete with a database error.
export async function beforeOrgDelete(orgId: string): Promise<void> {
  const blocker = await deletionBlocker(orgId);
  if (blocker) throw new Refused(blocker);
}

// Clone-owned (v1.4.0): which of a user's orgs the template's org lists show — `/onboarding`, where every
// sign-in lands, and each account on `/demo`. Return the ones to show; the default shows them all. A clone
// that archives orgs returns `orgs` minus the archived ones. The template keeps only ids that were in
// `orgs` (core/tenancy/listed.ts), so this can hide an org but never add or rename one. Display only:
// it does not stop a member opening `/o/<slug>`, which the clone's own pages decide.
// D-58: hides archived orgs, closing the /onboarding seam.
export async function filterListedOrgs(_userId: string, orgs: readonly ListedOrg[]): Promise<readonly ListedOrg[]> {
  const archived = await db.orgArchive.findMany({ where: { orgId: { in: orgs.map((o) => o.id) } }, select: { orgId: true } });
  const hidden = new Set(archived.map((a) => a.orgId));
  return orgs.filter((o) => !hidden.has(o.id));
}

// Clone-owned (v1.6.0): what ends with a membership (removed, left, or account deleted), in the same transaction. The
// template revokes the API keys the person created (owner decision 2026-11-05, like K6's share links). A clone adds its
// own per-person credentials here. Throwing stops the removal.
export const onMembershipEnded: MembershipEnded = async (tx, orgId, userId) => {
  await endCredentialsOf(tx, orgId, userId, null); // apikeys
};

// Clone-owned (v1.7.0): what follows a role change, in the same transaction (audit A-08). The template ends the API keys and
// webhook endpoints a person created once their new role cannot manage them (admin → member or scorekeeper); a move that
// keeps `apikeys.manage` (owner ↔ admin) changes nothing. A clone with its own role-bound credentials adds them here.
// Throwing stops the role change.
export const onRoleChanged: RoleChanged = async (tx, orgId, userId, to) => {
  await endCredentialsOf(tx, orgId, userId, to); // apikeys
};
