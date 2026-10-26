import Link from 'next/link';
import { can } from '@/core/authz/permissions';
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { isStaff, viewerLearner } from '@/course/access';
import { archiveOf } from '@/course/archive';
import { ArchivedNote } from '@/app/ui/scope-note';

// Navigation only. Layouts do not re-run on every navigation, so each page calls requireOrg itself.
// Clone edit (Phase 3): Coursework's own links by role (D-53); "Your orgs" is the clone's /orgs, which hides archived orgs (D-58).
export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const ctx = await requireOrg((await params).org);
  const org = await db.org.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { name: true } });
  const [me, archived] = [await viewerLearner(ctx), await archiveOf(ctx.orgId)];
  const base = `/o/${ctx.slug}`;
  const staff = isStaff(ctx);
  return (
    <>
      <nav aria-label="Org">
        <strong>{org.name}</strong> · <Link href={base}>Home</Link>
        {staff && <> · <Link href={`${base}/catalog`}>Catalog</Link> · <Link href={`${base}/learners`}>Learners</Link></>}
        {(staff || me) && <> · <Link href={`${base}/cohorts`}>Cohorts</Link></>}
        {me && <> · <Link href={`${base}/me`}>My path</Link></>}
        {' · '}<Link href={`${base}/settings/members`}>Members</Link>
        {can(ctx.role, 'org.delete') && <> · <Link href={`${base}/archive`}>Archive</Link> · <Link href={`${base}/settings/danger`}>Delete org</Link></>}
        {' · '}<Link href="/orgs">Your orgs</Link> · <Link href="/account/security">Account</Link>
      </nav>
      <ArchivedNote archived={archived} />
      {children}
    </>
  );
}
