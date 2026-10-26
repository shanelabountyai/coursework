import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { isStaff, viewerLearner } from '@/course/access';

export const metadata = { title: 'Cohorts' };

// Staff see every cohort; a linked learner sees the cohorts she is enrolled in (D-51, D-53).
export default async function Cohorts({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrg((await params).org);
  const staff = isStaff(ctx);
  const me = staff ? null : await viewerLearner(ctx);
  if (!staff && !me) notFound();
  const cohorts = await db.cohort.findMany({
    where: { orgId: ctx.orgId, ...(me && { enrollments: { some: { learnerId: me.id } } }) },
    orderBy: { code: 'asc' },
    select: { code: true, course: true, startDay: true, scheme: { select: { code: true } }, _count: { select: { enrollments: true, items: true } } },
  });
  const base = `/o/${ctx.slug}/cohorts`;
  return (
    <main>
      <h1>{staff ? 'Cohorts' : 'Your cohorts'}</h1>
      <table>
        <thead><tr><th scope="col">Cohort</th><th scope="col">Course</th><th scope="col">Starts</th><th scope="col" className="num">Items</th><th scope="col" className="num">Enrolled</th><th scope="col">Drip</th><th scope="col">Grades</th></tr></thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.code}>
              <td>{c.code}</td>
              <td className="mono">{c.course}</td>
              <td className="mono">{c.startDay}</td>
              <td className="num">{c._count.items}</td>
              <td className="num">{c._count.enrollments}</td>
              <td><Link href={`${base}/${c.code}/drip`} aria-label={`Drip calendar for ${c.code}`}>Drip calendar</Link></td>
              <td>{c.scheme ? <Link href={`${base}/${c.code}/grades`} aria-label={`Gradebook for ${c.code}`}>Gradebook ({c.scheme.code})</Link> : <span className="muted">not graded</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
