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
      <h1>Catalog</h1>
      <p>
        Current version <strong>{current.label}</strong> <code title={current.hash}>{current.hash.slice(0, 12)}…</code>: {catalog.courses.length} courses,{' '}
        {catalog.certificates.length} certificates, {catalog.equivalencies.length} equivalencies. <Link href={`/o/${ctx.slug}/catalog/versions`}>All {versions} versions and attempts</Link>
      </p>
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
      <h2>Recent publish attempts</h2>
      {attempts.length ? (
        <table>
          <thead><tr><th scope="col">When (UTC)</th><th scope="col">From</th><th scope="col">Verdict</th><th scope="col">Cycles</th><th scope="col" className="num">Grandfathered</th></tr></thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.createdAt.toISOString().replace('T', ' ').slice(0, 19)}</td>
                <td>{a.fromVersion.label}</td>
                <td className={a.result === 'ACCEPT' ? 'ok' : 'bad'}>{a.result}</td>
                <td className="mono">{(a.cycles as string[][]).map((c) => c.join(' -> ')).join('; ')}</td>
                <td className="num">{(a.grandfathered as unknown as Grandfathered[]).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted">No attempts yet.</p>}
      <h2>Courses of {current.label} in topological order (G4)</h2>
      <table>
        <thead><tr><th scope="col">Code</th><th scope="col">Title</th><th scope="col">Status</th><th scope="col">Prerequisite</th></tr></thead>
        <tbody>
          {topo.map((code) => {
            const c = byCode.get(code)!;
            return <tr key={code}><td className="mono">{code}</td><td>{c.title}</td><td>{c.status}</td><td className="mono">{exprText(c.prereq)}</td></tr>;
          })}
        </tbody>
      </table>
      <ScopeNote />
    </main>
  );
}
