// Shared rows for the Phase 2 database tests: one org, one tiny valid catalog version (through the
// write path, so the hash is the engine's), one learner, one cohort with one item and one assignment.
import { db } from '@/core/db';
import type { Catalog } from '@/graph/types';
import { createInitialVersion } from '@/course/publish';

export const TINY_CATALOG: Catalog = {
  version: 'cat-v1',
  courses: [
    { code: 'ACC-101', title: 'Bookkeeping Basics', status: 'PUBLISHED', prereq: null },
    { code: 'ACC-201', title: 'Financial Statements', status: 'PUBLISHED', prereq: 'ACC-101' },
  ],
  equivalencies: [],
  certificates: [{ code: 'CERT-ACC', title: 'Accounting', courses: ['ACC-101', 'ACC-201'] }],
};

export async function seedMinimal(slug = 'school') {
  const org = await db.org.create({ data: { slug, name: slug } });
  const actor = { orgId: org.id, userId: null };
  const version = await createInitialVersion(actor, TINY_CATALOG);
  const learner = await db.learner.create({ data: { orgId: org.id, code: 'L-0001', name: 'Ada', email: 'ada@example.org', targetCertificate: 'CERT-ACC', enrolledVersionId: version.id } });
  const cohort = await db.cohort.create({
    data: { orgId: org.id, code: 'C-ACC101', course: 'ACC-101', startDay: '2026-01-05', catalogVersionId: version.id, items: { create: [{ code: 'L01', title: 'Welcome', offsetDays: 0 }, { code: 'A01', title: 'Exercise', offsetDays: 3 }] } },
  });
  const assignment = await db.assignment.create({ data: { cohortId: cohort.id, code: 'HW1', category: 'HW', pointsPossible: 20, dueDay: '2026-01-12' } });
  return { org, actor, version, learner, cohort, assignment };
}
