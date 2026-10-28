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
  const attempts = counts ? await db.publishAttempt.count({ where }) : 0;
  return (
    <main>
      <header className="page-head">
        <div>
          <p className="eyebrow">Home</p>
          <h1>Coursework</h1>
          <p className="lede">The catalog is a prerequisite graph. Progress, eligibility and grades are worked out from completion events each time you look.</p>
        </div>
      </header>
      {counts && (
        <div className="stats">
          <div className="stat"><span className="stat-num">{version.label}</span><span className="stat-label">Current catalog version</span><span className="stat-note"><code title={version.hash}>{version.hash.slice(0, 12)}…</code></span></div>
          <div className="stat"><span className="stat-num">{counts.learners}</span><span className="stat-label">Learners</span><span className="stat-note">{counts.linked} linked to a member</span></div>
          <div className="stat"><span className="stat-num">{counts.cohorts}</span><span className="stat-label">Cohorts</span><span className="stat-note">{counts.versions} catalog version(s)</span></div>
          <div className="stat"><span className="stat-num">{attempts}</span><span className="stat-label">Publish attempts</span><span className="stat-note">accepted and refused</span></div>
        </div>
      )}
      {!counts && (
        <p>
          Current catalog version <strong>{version.label}</strong> <code title={version.hash}>{version.hash.slice(0, 12)}…</code>
        </p>
      )}
      {me && (
        <section className="card" aria-labelledby="mine-h">
          <header><h2 id="mine-h">Your learning</h2><p>You are learner <strong>{me.code}</strong></p></header>
          <div className="card-body">
            <p><Link href={`${base}/learners/${me.code}`}>Your path to {me.targetCertificate}</Link> shows what you have done, what you still need and the shortest route.</p>
            <p><Link href={`${base}/cohorts`}>Your cohorts</Link> list the lessons that are open now and the ones still locked.</p>
          </div>
        </section>
      )}
      {counts && (
        <div className="grid">
          <section className="card" aria-labelledby="start-catalog"><header><h2 id="start-catalog">Edit the catalog</h2></header><div className="card-body"><p>Change a prerequisite and see the verdict before you publish. A loop is refused and its path is named.</p><p><Link href={`${base}/catalog`}>Open the catalog</Link></p></div></section>
          <section className="card" aria-labelledby="start-learners"><header><h2 id="start-learners">Look up a learner</h2></header><div className="card-body"><p>See what a learner has satisfied, what is missing and the shortest path to their certificate.</p><p><Link href={`${base}/learners`}>Open learners</Link></p></div></section>
          <section className="card" aria-labelledby="start-cohorts"><header><h2 id="start-cohorts">Grades and release</h2></header><div className="card-body"><p>Each cohort has a gradebook and a drip calendar showing which lessons are open.</p><p><Link href={`${base}/cohorts`}>Open cohorts</Link></p></div></section>
        </div>
      )}
      {!me && !counts && <p className="callout">You are a member of this org but not linked to a learner record. Ask an admin to link you.</p>}
      <ScopeNote />
    </main>
  );
}
