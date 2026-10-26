// Task 2.4: publish goes through the engine. A refusal writes one PublishAttempt and no version; an
// acceptance writes the attempt and a version whose hash is the engine's; and nothing else in the tree
// inserts a CatalogVersion (non-negotiable 1).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { catalogHash } from '@/graph/canonical';
import { createInitialVersion, publishEdit } from '@/course/publish';
import { loadVersion } from '@/course/versions';
import { resetAuthTables } from '../helpers/auth';
import { seedMinimal, TINY_CATALOG } from './helpers';

beforeEach(resetAuthTables);

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n === 'node_modules' || n === 'generated' || n === '.next') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

describe('2.4 publish through the engine', () => {
  it('only src/course/publish.ts inserts a CatalogVersion', () => {
    const root = process.cwd();
    const hits = [...walk(join(root, 'src')), ...walk(join(root, 'scripts'))].filter((f) => /catalogVersion\s*\.\s*(create|createMany|upsert)\b/.test(readFileSync(f, 'utf8'))).map((f) => relative(root, f));
    expect(hits).toEqual(['src/course/publish.ts']);
    expect((readFileSync(join(root, 'src/course/publish.ts'), 'utf8').match(/catalogVersion\s*\.\s*create\b/g) ?? []).length).toBe(1);
  });

  it('createInitialVersion refuses what the engine refuses and writes nothing', async () => {
    const org = await db.org.create({ data: { slug: 'school', name: 'school' } });
    const bad = { ...TINY_CATALOG, courses: [...TINY_CATALOG.courses.slice(0, 1), { code: 'ACC-201', title: 'x', status: 'PUBLISHED' as const, prereq: 'ACC-101' }, { code: 'ACC-101', title: 'dup?', status: 'PUBLISHED' as const, prereq: 'ACC-201' }] };
    await expect(createInitialVersion({ orgId: org.id, userId: null }, bad)).rejects.toThrow(/REJECT:CYCLE/);
    expect(await db.catalogVersion.count()).toBe(0);
    expect(await db.auditEvent.count()).toBe(0);
  });

  it('a cycle-creating edit writes one PublishAttempt and zero versions', async () => {
    const { actor, version } = await seedMinimal();
    const r = await publishEdit(actor, version.id, { id: 'E-cycle', ops: [{ op: 'set_prereq', course: 'ACC-101', prereq: 'ACC-201' }] }, 'cat-v2');
    expect(r.check.result).toBe('REJECT:CYCLE');
    expect(r.check.cycles).toEqual([['ACC-101', 'ACC-201', 'ACC-101']]);
    expect(r.version).toBeNull();
    expect(await db.catalogVersion.count()).toBe(1);
    const attempts = await db.publishAttempt.findMany();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.result).toBe('REJECT:CYCLE');
    expect(attempts[0]!.resultVersionId).toBeNull();
    expect(attempts[0]!.cycles).toEqual([['ACC-101', 'ACC-201', 'ACC-101']]);
    expect(await db.auditEvent.count({ where: { action: 'catalog.publish_refused' } })).toBe(1);
  });

  it('an accepted edit writes the attempt and a version whose hash is the engine hash; content re-hashes', async () => {
    const { actor, version } = await seedMinimal();
    const r = await publishEdit(actor, version.id, { id: 'E-add', ops: [{ op: 'add_course', course: 'ACC-301', title: 'Audit', status: 'PUBLISHED', prereq: 'ACC-201' }] }, 'cat-v2');
    expect(r.check.result).toBe('ACCEPT');
    expect(r.version).not.toBeNull();
    const { row, catalog } = await loadVersion(r.version!.id);
    expect(row.parentId).toBe(version.id);
    expect(row.hash).toBe(catalogHash(catalog));
    expect(row.hash).not.toBe(version.hash);
    expect(catalog.courses.map((c) => c.code)).toEqual(['ACC-101', 'ACC-201', 'ACC-301']);
    const attempt = await db.publishAttempt.findUniqueOrThrow({ where: { id: r.attemptId } });
    expect(attempt.resultVersionId).toBe(r.version!.id);
    expect(attempt.result).toBe('ACCEPT');
    // the old version is untouched and still re-hashes
    const old = await loadVersion(version.id);
    expect(old.catalog.courses).toHaveLength(2);
    expect(await db.auditEvent.count({ where: { action: 'catalog.published' } })).toBe(1);
  });

  it('G9: an accepted edit that blocks an in-progress learner flags the enrollment and never blocks (V3)', async () => {
    const { actor, version, learner, cohort } = await seedMinimal();
    // the learner is in ACC-101's cohort; make a second cohort for ACC-201 where she is IN_PROGRESS and ELIGIBLE (ACC-101 passed)
    await db.completionEvent.create({ data: { orgId: actor.orgId, learnerId: learner.id, course: 'ACC-101', kind: 'PASS', day: '2026-01-20', catalogVersionId: version.id } });
    const c2 = await db.cohort.create({ data: { orgId: actor.orgId, code: 'C-ACC201', course: 'ACC-201', startDay: '2026-02-02', catalogVersionId: version.id, items: { create: [{ code: 'L01', offsetDays: 0 }] } } });
    const e = await db.enrollment.create({ data: { orgId: actor.orgId, cohortId: c2.id, learnerId: learner.id, catalogVersionId: version.id } });
    void cohort;
    const r = await publishEdit(actor, version.id, { id: 'E-tighten', ops: [{ op: 'add_course', course: 'ACC-102', title: 'Spreadsheets', status: 'PUBLISHED' }, { op: 'set_prereq', course: 'ACC-201', prereq: { all: ['ACC-101', 'ACC-102'] } }] }, 'cat-v2');
    expect(r.check.result).toBe('ACCEPT');
    expect(r.grandfathered).toEqual([{ learner: learner.id, course: 'ACC-201', cohort: 'C-ACC201', flag: 'GRANDFATHERED', missing: ['ACC-102'] }]);
    const row = await db.enrollment.findUniqueOrThrow({ where: { id: e.id } });
    expect(row.status).toBe('IN_PROGRESS');
    expect(row.grandfathered).toBe(true);
    expect(row.grandfatheredMissing).toBe('ACC-102');
    expect(row.catalogVersionId).toBe(version.id); // still evaluated under the enrolled version (P2)
    expect((await db.publishAttempt.findUniqueOrThrow({ where: { id: r.attemptId } })).grandfathered).toHaveLength(1);
  });
});
