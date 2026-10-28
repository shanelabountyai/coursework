// seed:school — Phase 3 task 3.0. A demo school for the screens and the e2e: fixtures/ through the write paths
// (seedFixtures, task 2.8) plus one demo user per role, signed in at /demo with DEMO_MODE=1 (the template's
// demo sign-in and its two locks: the flag and `isDemo`). The learner user is linked to a learner record
// through the audited linkLearner path (D-51), never by email. Idempotent: an existing org is left as it is
// and only the users and the link are upserted. `--slug <slug>` (default demo-school), `--learner <code>`.
import { pathToFileURL } from 'node:url';
import { sealSecret } from '@/core/auth/secret-box';
import { now } from '@/core/clock';
import { db } from '@/core/db'; // importing it is what refuses a cloud database (INV-18, INV-27)
import { linkLearner } from '@/course/learners';
import { seedFixtures } from '@/course/seed';
import type { Role } from '@/generated/prisma/enums';
import { loadFixtures } from './lib/fixtures';

// The template's public demo TOTP secret (scripts/seed-demo.ts): safe only because a demo session resolves
// only while DEMO_MODE=1 and cannot change its email or TOTP.
const DEMO_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const ROLES: { local: string; role: Role }[] = [
  { local: 'owner', role: 'owner' },
  { local: 'admin', role: 'admin' },
  { local: 'scorekeeper', role: 'scorekeeper' },
  { local: 'learner', role: 'member' },
  { local: 'member', role: 'member' }, // a member with no learner link: sees only "not linked"
];

export const demoEmail = (slug: string, local: string) => `${local}@${slug}.demo.test`;

export async function seedSchool(slug = 'demo-school', learnerCode = 'L-0003', log: (s: string) => void = () => {}) {
  if (!(await db.org.findUnique({ where: { slug } }))) {
    const c = await seedFixtures(loadFixtures('fixtures'), slug, log);
    log(`seeded ${slug}: ${c.learners} learners, ${c.cohorts} cohorts, version ${c.versionHash.slice(0, 12)}…`);
  }
  const org = await db.org.update({ where: { slug }, data: { name: 'Coursework demo school' } });
  const users: Record<string, string> = {};
  for (const { local, role } of ROLES) {
    const email = demoEmail(slug, local);
    const mfa = role === 'owner' || role === 'admin';
    const data = { isDemo: true, name: `${local} (demo school)`, ...(mfa && { totpSecretSealed: sealSecret(DEMO_TOTP_SECRET, 'totp'), totpEnrolledAt: now(), totpLastStep: null }) };
    const u = await db.user.upsert({ where: { email }, create: { email, ...data }, update: data });
    await db.membership.upsert({ where: { orgId_userId: { orgId: org.id, userId: u.id } }, create: { orgId: org.id, userId: u.id, role }, update: { role } });
    users[local] = u.id;
  }
  const learner = await db.learner.findUniqueOrThrow({ where: { orgId_code: { orgId: org.id, code: learnerCode } } });
  if (learner.userId !== users.learner) await linkLearner({ orgId: org.id, userId: users.admin! }, { learnerId: learner.id, userId: users.learner! });
  return { orgId: org.id, users, learnerId: learner.id };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const slug = arg('--slug') ?? 'demo-school';
  try {
    await seedSchool(slug, arg('--learner') ?? 'L-0003', (s) => console.log(`  ${s}`));
    console.log(`seed:school: ${slug} ready. Sign in at /demo (DEMO_MODE=1) as ${ROLES.map((r) => demoEmail(slug, r.local)).join(', ')}.`);
  } catch (e) {
    console.error(`seed:school: ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
