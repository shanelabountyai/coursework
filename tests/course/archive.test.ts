// D-56 (owner decision 2026-10-26): an org with append-only history is archived, never deleted.
//   - the template's deleteOrg refuses an org with history (or an archive row) with a sentence, and leaves every row;
//   - every clone writer in src/course/ refuses in an archived org, and writes nothing;
//   - the database trigger refuses a raw INSERT that skips the application check;
//   - no application code disables a trigger (grep).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { Refused } from '@/core/errors';
import { db } from '@/core/db';
import { deleteOrg } from '@/core/tenancy/delete';
import { beforeOrgDelete } from '@/app/org-hooks';
import { ARCHIVED_MESSAGE, archiveOrg, deletionBlocker } from '@/course/archive';
import { createAssignment, createCohort, createLearner, enroll, grantWaiver } from '@/course/cohorts';
import { recordCompletion } from '@/course/completions';
import { discardDraft, publishDraft, saveDraft } from '@/course/drafts';
import { correctScore, createScheme, recordSubmission } from '@/course/grades';
import { completeItem } from '@/course/items';
import { linkLearner, unlinkLearner } from '@/course/learners';
import { createInitialVersion, publishEdit } from '@/course/publish';
import type { Scheme } from '@/grades/scheme';
import { allTables, resetAuthTables } from '../helpers/auth';
import { actAs, addMember } from '../helpers/org';
import { seedMinimal, TINY_CATALOG } from './helpers';

beforeEach(resetAuthTables);

const SCHEME: Scheme = {
  id: 'SCH-T',
  status: 'PUBLISHED',
  categories: [{ code: 'HW', name: 'Homework', weight_bp: 10000, drop_lowest: 0 }],
  late: { per_day_hp: 500, max_days: 5 },
  missing: 'ZERO',
  extra_credit_cap_hp: 0,
  pass_threshold_hp: 7000,
  bands: [{ min_hp: 7000, letter: 'P' }, { min_hp: 0, letter: 'F' }],
};

async function snapshot() {
  const out: string[] = [];
  for (const t of await allTables()) {
    const r = await db.$queryRawUnsafe<{ j: string }[]>(`SELECT coalesce(json_agg(x ORDER BY x::text)::text, '[]') AS j FROM "${t}" x`);
    out.push(`${t}:${r[0]!.j}`);
  }
  return out.join('\n');
}

describe('D-56 delete-org on an org with history', () => {
  it('refuses with a sentence through the template deleteOrg + the clone hook, and every row stays', async () => {
    const { org } = await seedMinimal('school');
    const owner = await addMember(org.id, 'owner', 'owner@example.test');
    const ctx = await actAs(owner.id, 'school');
    const before = await snapshot();
    const err = await deleteOrg(ctx, 'school', beforeOrgDelete).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Refused);
    expect((err as Error).message).toBe('This org has append-only history (1 CatalogVersion) and cannot be deleted. Archive it instead: Settings → Archive.');
    expect(await snapshot()).toBe(before);
  });

  it('refuses an archived org even when it has no history rows', async () => {
    const org = await db.org.create({ data: { slug: 'empty', name: 'empty' } });
    await archiveOrg({ orgId: org.id, userId: null }, 'closed');
    expect(await deletionBlocker(org.id)).toBe('This org is archived and keeps its history; an archived org is never deleted.');
    await expect(db.org.delete({ where: { id: org.id } })).rejects.toThrow(); // Restrict FK from OrgArchive
  });

  it('still deletes an org with no history and no archive (the template path is unchanged)', async () => {
    const org = await db.org.create({ data: { slug: 'fresh', name: 'fresh' } });
    const owner = await addMember(org.id, 'owner', 'owner@example.test');
    await deleteOrg(await actAs(owner.id, 'fresh'), 'fresh', beforeOrgDelete);
    expect(await db.org.count()).toBe(0);
  });

  it('the archive row is insert-only', async () => {
    const org = await db.org.create({ data: { slug: 'a', name: 'a' } });
    const row = await archiveOrg({ orgId: org.id, userId: null }, 'closed');
    await expect(db.orgArchive.update({ where: { id: row.id }, data: { reason: 'reopened' } })).rejects.toThrow(/OrgArchive is append-only/);
    await expect(db.orgArchive.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    await expect(archiveOrg({ orgId: org.id, userId: null }, 'again')).rejects.toThrow(ARCHIVED_MESSAGE);
    await expect(archiveOrg({ orgId: org.id, userId: null }, '  ')).rejects.toThrow(/Say why/);
  });
});

describe('D-56 every clone writer refuses in an archived org', () => {
  it('each writer throws the archived sentence and the database is unchanged', async () => {
    const s = await seedMinimal('school');
    const user = await addMember(s.org.id, 'admin', 'admin@example.test');
    const learnerUser = await addMember(s.org.id, 'member', 'ada@example.org');
    const actor = { orgId: s.org.id, userId: user.id };
    // rows the writers need, written while the org is still open
    await createScheme(actor, SCHEME);
    const graded = await createCohort(actor, { code: 'C-G', course: 'ACC-101', startDay: '2026-01-05', schemeCode: 'SCH-T', catalogVersionId: s.version.id, items: [] });
    const enrollment = await enroll(actor, { cohortId: s.cohort.id, learnerId: s.learner.id });
    await enroll(actor, { cohortId: graded.id, learnerId: s.learner.id });
    const hw = await createAssignment(actor, { cohortId: graded.id, code: 'HW1', category: 'HW', pointsPossible: 10, dueDay: '2026-01-10', extraCredit: false });
    const sub = await recordSubmission(actor, { cohortCode: 'C-G', learnerCode: 'L-0001', assignmentCode: 'HW1', scoreHp: 8000, submittedDay: '2026-01-09' });
    await saveDraft(actor, { baseVersionId: s.version.id, ops: [{ op: 'set_status', course: 'ACC-201', status: 'RETIRED' }] });
    void enrollment;
    void hw;

    await archiveOrg(actor, 'the school closed');
    const before = await snapshot();
    const writers: [string, () => Promise<unknown>][] = [
      ['createInitialVersion', () => createInitialVersion(actor, { ...TINY_CATALOG, version: 'cat-v2' })],
      ['publishEdit', () => publishEdit(actor, s.version.id, { id: 'E', ops: [{ op: 'set_status', course: 'ACC-201', status: 'RETIRED' }] }, 'cat-v2')],
      ['saveDraft', () => saveDraft(actor, { baseVersionId: s.version.id, ops: [] })],
      ['discardDraft', () => discardDraft(actor)],
      ['publishDraft', () => publishDraft(actor, 'cat-v2')],
      ['createLearner', () => createLearner(actor, { code: 'L-0002', name: 'B', email: 'b@example.org', targetCertificate: 'CERT-ACC', enrolledVersionId: s.version.id })],
      ['linkLearner', () => linkLearner(actor, { learnerId: s.learner.id, userId: learnerUser.id })],
      ['unlinkLearner', () => unlinkLearner(actor, { learnerId: s.learner.id })],
      ['grantWaiver', () => grantWaiver(actor, { learnerId: s.learner.id, course: 'ACC-101', reason: 'PLACEMENT_TEST', grantedDay: '2026-01-02', grantedBy: 'registrar' })],
      ['recordCompletion', () => recordCompletion(actor, { learnerId: s.learner.id, course: 'ACC-101', kind: 'PASS', day: '2026-02-01', versionId: s.version.id })],
      ['createCohort', () => createCohort(actor, { code: 'C-X', course: 'ACC-101', startDay: '2026-03-01', schemeCode: null, catalogVersionId: s.version.id, items: [] })],
      ['enroll', () => enroll(actor, { cohortId: graded.id, learnerId: s.learner.id })],
      ['createAssignment', () => createAssignment(actor, { cohortId: graded.id, code: 'HW2', category: 'HW', pointsPossible: 10, dueDay: '2026-01-20', extraCredit: false })],
      ['createScheme', () => createScheme(actor, { ...SCHEME, id: 'SCH-2' })],
      ['recordSubmission', () => recordSubmission(actor, { cohortCode: 'C-G', learnerCode: 'L-0001', assignmentCode: 'HW1', scoreHp: 9000, submittedDay: '2026-01-09' })],
      ['correctScore', () => correctScore(actor, sub.id, 9000, 'regrade')],
      ['completeItem', () => completeItem(actor, { cohortCode: 'C-ACC101', learnerCode: 'L-0001', itemCode: 'L01', day: '2026-01-06' })],
      ['archiveOrg', () => archiveOrg(actor, 'twice')],
    ];
    const outcomes = [];
    for (const [name, fn] of writers) {
      const e = await fn().then(() => null, (x: unknown) => x);
      outcomes.push([name, e instanceof Refused ? (e as Error).message : `NOT REFUSED: ${String(e)}`]);
    }
    expect(outcomes).toEqual(writers.map(([n]) => [n, ARCHIVED_MESSAGE]));
    expect(await snapshot()).toBe(before);
  });

  it('every exported async writer of src/course/ is in the list above (a new writer must be added)', () => {
    const src = readdirSync(join(process.cwd(), 'src/course')).filter((f) => f.endsWith('.ts'));
    const guarded = src.flatMap((f) => {
      const text = readFileSync(join(process.cwd(), 'src/course', f), 'utf8');
      return [...text.matchAll(/export async function (\w+)\([^)]*actor: Actor/g)].map((m) => m[1]!);
    });
    expect(guarded.sort()).toEqual(
      ['archiveOrg', 'correctScore', 'createAssignment', 'createCohort', 'createInitialVersion', 'createLearner', 'createScheme', 'completeItem', 'discardDraft', 'enroll', 'grantWaiver', 'linkLearner', 'publishDraft', 'publishEdit', 'recordCompletion', 'recordSubmission', 'saveDraft', 'unlinkLearner'].sort(),
    );
  });

  it('the trigger refuses a raw INSERT that skips the application check (backstop)', async () => {
    const s = await seedMinimal('school');
    await archiveOrg(s.actor, 'closed');
    await expect(db.completionEvent.create({ data: { orgId: s.org.id, learnerId: s.learner.id, course: 'ACC-101', kind: 'PASS', day: '2026-02-01', catalogVersionId: s.version.id } })).rejects.toThrow(/is archived: INSERT on CompletionEvent refused/);
    await expect(db.$executeRawUnsafe(`UPDATE "Learner" SET "name" = 'x'`)).rejects.toThrow(/is archived: UPDATE on Learner refused/);
    await expect(db.contentItem.create({ data: { cohortId: s.cohort.id, code: 'L09', offsetDays: 9 } })).rejects.toThrow(/is archived: INSERT on ContentItem refused/);
    await expect(db.assignment.create({ data: { cohortId: s.cohort.id, code: 'HW9', category: 'HW', pointsPossible: 1, dueDay: '2026-02-01' } })).rejects.toThrow(/is archived: INSERT on Assignment refused/);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (['node_modules', 'generated', '.next'].includes(n)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx|sql)$/.test(n)) out.push(p);
  }
  return out;
}

describe('D-56 no application code disables a trigger', () => {
  it('DISABLE TRIGGER / session_replication_role appear only in tests', () => {
    const root = process.cwd();
    const hits = [...walk(join(root, 'src')), ...walk(join(root, 'scripts')), ...walk(join(root, 'prisma'))]
      .filter((f) => /DISABLE\s+TRIGGER|session_replication_role/i.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f));
    expect(hits).toEqual([]);
  });
});
