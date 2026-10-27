import Link from 'next/link';
import { can } from '@/core/authz/permissions';
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { isStaff, viewerLearner } from '@/course/access';
import { archiveOf } from '@/course/archive';
import { ArchivedNote } from '@/app/ui/scope-note';
import { NavLink } from '@/app/ui/nav-link';

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
        <strong>{org.name}</strong> · <NavLink href={base} exact>Home</NavLink>
        {staff && <> · <NavLink href={`${base}/catalog`}>Catalog</NavLink> · <NavLink href={`${base}/learners`}>Learners</NavLink></>}
        {(staff || me) && <> · <NavLink href={`${base}/cohorts`}>Cohorts</NavLink></>}
        {me && <> · <NavLink href={`${base}/me`}>My path</NavLink></>}
        {' · '}<NavLink href={`${base}/settings/members`}>Members</NavLink>
        {can(ctx.role, 'org.delete') && <> · <NavLink href={`${base}/archive`}>Archive</NavLink> · <NavLink href={`${base}/settings/danger`}>Delete org</NavLink></>}
        {' · '}<Link href="/orgs">Your orgs</Link> · <Link href="/account/security">Account</Link>
      </nav>
      <ArchivedNote archived={archived} />
      {children}
    </>
  );
}
