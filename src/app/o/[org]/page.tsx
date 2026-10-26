import Link from 'next/link';
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { currentVersion, isStaff, viewerLearner } from '@/course/access';
import { ScopeNote } from '@/app/ui/scope-note';

// Coursework's org home: the current catalog version and the counts of the book, or the learner's own links.
export default async function OrgHome({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrg((await params).org);
  const base = `/o/${ctx.slug}`;
  const version = await currentVersion(ctx.orgId);
  const me = await viewerLearner(ctx);
  if (!version) {
    return (
      <main>
        <h1>Nothing here yet</h1>
        <p>This org has no catalog yet. <Link href={`${base}/settings/members`}>Invite your team</Link> to get started.</p>
      </main>
    );
  }
  const where = { orgId: ctx.orgId };
  const counts = isStaff(ctx)
    ? { versions: await db.catalogVersion.count({ where }), learners: await db.learner.count({ where }), cohorts: await db.cohort.count({ where }), linked: await db.learner.count({ where: { ...where, userId: { not: null } } }) }
    : null;
  return (
    <main>
      <h1>Coursework</h1>
      <p>
        Current catalog version <strong>{version.label}</strong> <code title={version.hash}>{version.hash.slice(0, 12)}…</code>
      </p>
      {me && (
        <p>
          You are learner <strong>{me.code}</strong>. <Link href={`${base}/learners/${me.code}`}>Your path to {me.targetCertificate}</Link> · <Link href={`${base}/cohorts`}>Your cohorts</Link>
        </p>
      )}
      {counts && (
        <ul>
          <li><Link href={`${base}/catalog`}>Catalog</Link>: {counts.versions} version(s)</li>
          <li><Link href={`${base}/learners`}>Learners</Link>: {counts.learners} ({counts.linked} linked to a member)</li>
          <li><Link href={`${base}/cohorts`}>Cohorts</Link>: {counts.cohorts}</li>
        </ul>
      )}
      {!me && !counts && <p>You are a member of this org but not linked to a learner record. Ask an admin to link you.</p>}
      <ScopeNote />
    </main>
  );
}
