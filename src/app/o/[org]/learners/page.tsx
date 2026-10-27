import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { isStaff } from '@/course/access';
import { Pill } from '@/app/ui/status';

export const metadata = { title: 'Learners' };

// Staff list (D-53). ?q= filters by code or name; 300 fixture learners fit on one page.
export default async function Learners({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireOrg((await params).org);
  if (!isStaff(ctx)) notFound();
  const q = ((await searchParams).q ?? '').trim();
  const learners = await db.learner.findMany({
    where: { orgId: ctx.orgId, ...(q && { OR: [{ code: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }) },
    orderBy: { code: 'asc' },
    select: { code: true, name: true, targetCertificate: true, enrolledVersion: { select: { label: true } }, user: { select: { email: true } } },
  });
  return (
    <main>
      <header className="page-head">
        <div>
          <p className="eyebrow">Learners</p>
          <h1>Learners</h1>
          <p className="lede">Open a learner to see what they have satisfied, what is missing and the shortest path to their certificate.</p>
        </div>
      </header>
      <form className="form-row">
        <label className="field"><span>Find</span><input name="q" defaultValue={q} placeholder="L-0001 or a name" /></label>
        <button type="submit">Search</button>
      </form>
      <section className="card" aria-labelledby="learners-h">
        <header><h2 id="learners-h">All learners</h2><p>{learners.length} learner(s).</p></header>
        <div className="table-wrap">
          <table>
            <caption>{learners.length} learners, by code</caption>
            <thead><tr><th scope="col">Code</th><th scope="col">Name</th><th scope="col">Target</th><th scope="col">Enrolled version</th><th scope="col">Linked member</th></tr></thead>
            <tbody>
              {learners.map((l) => (
                <tr key={l.code}>
                  <td><Link href={`/o/${ctx.slug}/learners/${l.code}`}>{l.code}</Link></td>
                  <td>{l.name}</td>
                  <td className="mono">{l.targetCertificate}</td>
                  <td>{l.enrolledVersion.label}</td>
                  <td>{l.user?.email ?? <Pill tone="neutral">not linked</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
