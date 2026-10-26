// CLONE-OWNED. The INV-01..04 harness seeds these rows in both fixture orgs, so it can drive
// actions whose inputs use ref('<model>') for the clone's own tables. Return { model: id } for
// one row of each model, owned by `org.orgId`.
import { db } from '@/core/db';
import { schemeHash } from '@/course/grades';
import type { Prisma } from '@/generated/prisma/client';
import type { Scheme } from '@/grades/scheme';
import { catalogHash } from '@/graph/canonical';
import { validateCatalog } from '@/graph/publish';
import type { Catalog } from '@/graph/types';

const CATALOG: Catalog = {
  version: 'cat-v1',
  courses: [
    { code: 'ACC-101', title: 'Bookkeeping Basics', status: 'PUBLISHED', prereq: null },
    { code: 'ACC-201', title: 'Financial Statements', status: 'PUBLISHED', prereq: 'ACC-101' },
  ],
  equivalencies: [],
  certificates: [{ code: 'CERT-ACC', title: 'Accounting', courses: ['ACC-101', 'ACC-201'] }],
};

const SCHEME: Scheme = {
  id: 'SCH-T',
  status: 'PUBLISHED',
  categories: [{ code: 'HW', name: 'Homework', weight_bp: 10000, drop_lowest: 0 }],
  late: { per_day_hp: 500, max_days: 5 },
  extra_credit_cap_hp: 0,
  pass_threshold_hp: 7000,
  missing: 'ZERO',
  bands: [{ min_hp: 7000, letter: 'P' }, { min_hp: 0, letter: 'F' }],
};

// The harness re-seeds before every call and resolves ref('<model>') ids once, so the ids must be fixed:
// rows are written with Prisma directly (stable uuids), the catalog hash is still the engine's own.
const ID = (key: 'a' | 'b', n: number) => `00000000-0000-4000-9000-${String((key === 'a' ? 300 : 400) + n).padStart(12, '0')}`;

export async function seedApp(org: { orgId: string; userId: string }, key: 'a' | 'b'): Promise<Record<string, string>> {
  const orgId = org.orgId;
  const ids = { catalogVersion: ID(key, 1), scheme: ID(key, 2), learner: ID(key, 3), cohort: ID(key, 4), assignment: ID(key, 5), submission: ID(key, 6) };
  const content = { courses: CATALOG.courses, equivalencies: CATALOG.equivalencies, certificates: CATALOG.certificates };
  if (validateCatalog(CATALOG).result !== 'ACCEPT') throw new Error('seedApp: the harness catalog must pass G5');
  await db.catalogVersion.create({ data: { id: ids.catalogVersion, orgId, label: 'cat-v1', hash: catalogHash(content), content: content as unknown as Prisma.InputJsonObject } });
  await db.gradeScheme.create({ data: { id: ids.scheme, orgId, code: SCHEME.id, content: SCHEME as unknown as Prisma.InputJsonObject, status: 'PUBLISHED', hash: schemeHash(SCHEME) } });
  await db.learner.create({ data: { id: ids.learner, orgId, code: 'L-0001', name: `Learner ${key}`, email: `learner-${key}@example.org`, targetCertificate: 'CERT-ACC', enrolledVersionId: ids.catalogVersion } });
  await db.cohort.create({ data: { id: ids.cohort, orgId, code: 'C-ACC101', course: 'ACC-101', startDay: '2026-01-05', schemeId: ids.scheme, catalogVersionId: ids.catalogVersion, items: { create: [{ code: 'L01', offsetDays: 0 }] } } });
  await db.enrollment.create({ data: { orgId, cohortId: ids.cohort, learnerId: ids.learner, catalogVersionId: ids.catalogVersion } });
  await db.assignment.create({ data: { id: ids.assignment, cohortId: ids.cohort, code: 'HW1', category: 'HW', pointsPossible: 10, dueDay: '2026-01-12' } });
  await db.submission.create({ data: { id: ids.submission, orgId, cohortId: ids.cohort, learnerId: ids.learner, assignmentId: ids.assignment, scoreHp: 8000, submittedDay: '2026-01-10' } });
  void org.userId;
  return { catalogVersion: ids.catalogVersion, learner: ids.learner, cohort: ids.cohort, assignment: ids.assignment, submission: ids.submission };
}
