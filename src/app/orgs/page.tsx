import Link from 'next/link';
import { requireUser } from '@/core/auth/session';
import { db } from '@/core/db';

export const metadata = { title: 'Your orgs' };

// D-56 / D-58: the clone's org list, which hides archived orgs. The template's /onboarding (where sign-in lands)
// is template-owned and still lists them; that is the recorded seam.
export default async function Orgs() {
  const s = await requireUser();
  const memberships = await db.membership.findMany({
    where: { userId: s.userId, org: { archive: null } },
    select: { role: true, org: { select: { slug: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return (
    <main>
      <h1>Your orgs</h1>
      <p>Signed in as {s.email} · <Link href="/onboarding">Create an org or see invitations</Link> · <Link href="/account/security">Account</Link></p>
      {memberships.length ? (
        <ul>{memberships.map((m) => <li key={m.org.slug}><Link href={`/o/${m.org.slug}`}>{m.org.name}</Link> ({m.role})</li>)}</ul>
      ) : (
        <p>No active orgs. Archived orgs are not listed here.</p>
      )}
    </main>
  );
}
