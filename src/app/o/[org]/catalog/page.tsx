import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { canEditCatalog, currentVersion, isStaff } from '@/course/access';
import { archiveOf } from '@/course/archive';
import { draftFor, parseOps } from '@/course/drafts';
import { catalogOf, loadVersion } from '@/course/versions';
import { topoOrder, prereqEdges } from '@/graph/dag';
import type { Grandfathered } from '@/graph/retro';
import { courseMap } from '@/graph/types';
import { exprText } from '@/app/ui/expr';
import { ScopeNote } from '@/app/ui/scope-note';
import { Pill } from '@/app/ui/status';
import { discardDraftAction, publishDraftAction, saveDraftAction } from './actions';
import { CatalogEditor } from './editor';

export const metadata = { title: 'Catalog' };

// PRD P0-7 / task 3.1: the current version, the editor (owner/admin, D-53) and the recent attempts.
export default async function CatalogPage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrg((await params).org);
  if (!isStaff(ctx)) notFound();
  const current = await currentVersion(ctx.orgId);
  if (!current) notFound();
  const catalog = catalogOf(current);
  const draft = canEditCatalog(ctx) ? await draftFor(ctx.orgId, ctx.userId) : null;
  const base = draft ? await loadVersion(draft.baseVersionId) : { row: current, catalog };
  const archived = await archiveOf(ctx.orgId);
  const attempts = await db.publishAttempt.findMany({ where: { orgId: ctx.orgId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10, include: { fromVersion: { select: { label: true } } } });
  const versions = await db.catalogVersion.count({ where: { orgId: ctx.orgId } });
  const topo = topoOrder(prereqEdges(courseMap(catalog)));
  const byCode = courseMap(catalog);
  return (
    <main>
      <header className="page-head">
        <div>
          <p className="eyebrow">Catalog · {current.label}</p>
          <h1>Catalog</h1>
          <p className="lede">Change a prerequisite, read the verdict, then publish a new version. Published versions are never edited.</p>
        </div>
        <div className="actions"><Link href={`/o/${ctx.slug}/catalog/versions`}>All {versions} versions and attempts</Link></div>
      </header>
      <div className="stats">
        <div className="stat"><span className="stat-num">{catalog.courses.length}</span><span className="stat-label">Courses</span><span className="stat-note">in {current.label}</span></div>
        <div className="stat"><span className="stat-num">{catalog.certificates.length}</span><span className="stat-label">Certificates</span></div>
        <div className="stat"><span className="stat-num">{catalog.equivalencies.length}</span><span className="stat-label">Equivalencies</span></div>
        <div className="stat"><span className="stat-num">{attempts.length}</span><span className="stat-label">Recent attempts</span><span className="stat-note"><code title={current.hash}>{current.hash.slice(0, 12)}…</code></span></div>
      </div>
      {canEditCatalog(ctx) && !archived && (
        <CatalogEditor
          base={base.catalog}
          baseVersionId={base.row.id}
          savedOps={draft ? parseOps(draft.ops) : []}
          suggestedLabel={`v${versions + 1}`}
          save={saveDraftAction.bind(null, ctx.slug)}
          discard={discardDraftAction.bind(null, ctx.slug)}
          publish={publishDraftAction.bind(null, ctx.slug)}
        />
      )}
      <section className="card" aria-labelledby="attempts-h">
        <header><h2 id="attempts-h">Recent publish attempts</h2></header>
        {attempts.length ? (
          <div className="table-wrap">
            <table>
              <caption className="muted">The last {attempts.length} attempts, newest first</caption>
              <thead><tr><th scope="col">When (UTC)</th><th scope="col">From</th><th scope="col">Verdict</th><th scope="col">Cycles</th><th scope="col" className="num">Grandfathered</th></tr></thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id}>
                    <td className="date">{a.createdAt.toISOString().replace('T', ' ').slice(0, 19)}</td>
                    <td>{a.fromVersion.label}</td>
                    <td><Pill>{a.result}</Pill></td>
                    <td className="mono">{(a.cycles as string[][]).map((c) => c.join(' -> ')).join('; ')}</td>
                    <td className="num">{(a.grandfathered as unknown as Grandfathered[]).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">No attempts yet. The first publish, accepted or refused, is recorded here.</p>}
      </section>
      <section className="card" aria-labelledby="courses-h">
        <header><h2 id="courses-h">Courses of {current.label}</h2><p>Topological order (G4): every course comes after its prerequisites.</p></header>
        <div className="table-wrap">
          <table>
            <caption className="muted">{catalog.courses.length} courses</caption>
            <thead><tr><th scope="col">Code</th><th scope="col">Title</th><th scope="col">Status</th><th scope="col">Prerequisite</th></tr></thead>
            <tbody>
              {topo.map((code) => {
                const c = byCode.get(code)!;
                return <tr key={code}><td className="mono">{code}</td><td>{c.title}</td><td><Pill tone={c.status === 'PUBLISHED' ? 'ok' : 'neutral'}>{c.status}</Pill></td><td className="mono">{exprText(c.prereq)}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>
      <ScopeNote />
    </main>
  );
}
