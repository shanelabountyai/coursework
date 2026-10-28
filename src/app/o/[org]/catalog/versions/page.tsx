import { notFound } from 'next/navigation';
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { isStaff } from '@/course/access';
import type { PublishError } from '@/graph/publish';
import type { Grandfathered } from '@/graph/retro';
import { ScopeNote } from '@/app/ui/scope-note';
import { Pill } from '@/app/ui/status';

export const metadata = { title: 'Catalog versions' };

// Task 3.5: every version (immutable, content-hashed, V1) and every attempt made against it. Read-only.
export default async function Versions({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrg((await params).org);
  if (!isStaff(ctx)) notFound();
  const versions = await db.catalogVersion.findMany({
    where: { orgId: ctx.orgId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, label: true, hash: true, createdAt: true, actorUserId: true, parent: { select: { label: true } }, publishAttempts: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
  });
  const labelOf = new Map(versions.map((v) => [v.id, v.label]));
  const actors = new Map((await db.user.findMany({ where: { id: { in: versions.flatMap((v) => [v.actorUserId, ...v.publishAttempts.map((a) => a.actorUserId)]).filter((x): x is string => !!x) } }, select: { id: true, email: true } })).map((u) => [u.id, u.email]));
  return (
    <main>
      <header className="page-head">
        <div>
          <p className="eyebrow">Catalog / versions</p>
          <h1>Catalog versions</h1>
          <p className="lede">{versions.length} versions; {versions.reduce((n, v) => n + v.publishAttempts.length, 0)} publish attempts. A version is never edited: an accepted edit is a new version whose parent is the one it was applied to.</p>
        </div>
      </header>
      {versions.map((v) => (
        <section key={v.id} aria-labelledby={`v-${v.id}`} className="card">
          <header><h2 id={`v-${v.id}`}>
            {v.label} <code className="muted" title={v.hash}>{v.hash.slice(0, 16)}…</code>
          </h2>
          <p>
            Parent: {v.parent?.label ?? 'none (first version)'} · by {v.actorUserId ? actors.get(v.actorUserId) ?? 'a deleted user' : 'the seed'} · {v.createdAt.toISOString().replace('T', ' ').slice(0, 19)} UTC
          </p></header>
          {v.publishAttempts.length > 0 && (
            <div className="table-wrap"><table>
              <caption>Attempts against {v.label}</caption>
              <thead><tr><th scope="col">Edit</th><th scope="col">Verdict</th><th scope="col">Errors</th><th scope="col" className="num">Grandfathered</th><th scope="col">Result</th></tr></thead>
              <tbody>
                {v.publishAttempts.map((a) => {
                  const edit = a.edit as { id?: string; ops?: unknown[] };
                  return (
                    <tr key={a.id}>
                      <td><details><summary>{edit.id ?? 'edit'} ({edit.ops?.length ?? 0} ops)</summary><pre className="mono">{JSON.stringify(edit.ops, null, 1)}</pre></details></td>
                      <td><Pill>{a.result}</Pill></td>
                      <td>{(a.errors as unknown as PublishError[]).map((e) => `${e.code}: ${e.detail}`).join('; ') || '—'}</td>
                      <td className="num">{(a.grandfathered as unknown as Grandfathered[]).length}</td>
                      <td>{a.resultVersionId ? labelOf.get(a.resultVersionId) ?? '—' : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </section>
      ))}
      <ScopeNote />
    </main>
  );
}
