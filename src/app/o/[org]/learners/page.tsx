import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { isStaff } from '@/course/access';

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
      <h1>Learners</h1>
      <form>
        <label>Find <input name="q" defaultValue={q} placeholder="L-0001 or a name" /></label> <button type="submit">Search</button>
      </form>
      <p>{learners.length} learner(s).</p>
      <table>
        <thead><tr><th scope="col">Code</th><th scope="col">Name</th><th scope="col">Target</th><th scope="col">Enrolled version</th><th scope="col">Linked member</th></tr></thead>
        <tbody>
          {learners.map((l) => (
            <tr key={l.code}>
              <td><Link href={`/o/${ctx.slug}/learners/${l.code}`}>{l.code}</Link></td>
              <td>{l.name}</td>
              <td>{l.targetCertificate}</td>
              <td>{l.enrolledVersion.label}</td>
              <td>{l.user?.email ?? <span className="muted">not linked</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
