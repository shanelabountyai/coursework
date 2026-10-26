// D-51 learner link (explicit, audited, one per user per org), D-52 stored drafts (mutable; publish only
// through the engine), D-57 the one instant→day boundary.
import { beforeEach, describe, expect, it } from 'vitest';
import { advanceClock } from '@/core/clock';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { discardDraft, draftFor, parseOps, publishDraft, saveDraft } from '@/course/drafts';
import { learnerForUser, linkLearner, unlinkLearner } from '@/course/learners';
import { dayInZone } from '@/course/today';
import { resetAuthTables } from '../helpers/auth';
import { addMember } from '../helpers/org';
import { seedMinimal } from './helpers';

beforeEach(resetAuthTables);

describe('D-51 linking a learner to a member', () => {
  it('links only by the explicit action, audits it, and never by email', async () => {
    const s = await seedMinimal();
    const admin = await addMember(s.org.id, 'admin', 'admin@example.test');
    const ada = await addMember(s.org.id, 'member', 'ada@example.org'); // the learner's own email: still not linked
    expect(await learnerForUser(s.org.id, ada.id)).toBeNull();
    const actor = { orgId: s.org.id, userId: admin.id };
    await linkLearner(actor, { learnerId: s.learner.id, userId: ada.id });
    expect((await learnerForUser(s.org.id, ada.id))?.code).toBe('L-0001');
    const ev = await db.auditEvent.findFirstOrThrow({ where: { action: 'learner.linked' } });
    expect([ev.actorUserId, ev.targetId, (ev.data as { userId: string }).userId]).toEqual([admin.id, s.learner.id, ada.id]);
    await unlinkLearner(actor, { learnerId: s.learner.id });
    expect(await learnerForUser(s.org.id, ada.id)).toBeNull();
    expect(await db.auditEvent.count({ where: { action: 'learner.unlinked' } })).toBe(1);
  });

  it('refuses a non-member, a second learner for one user, and a learner already linked to someone else', async () => {
    const s = await seedMinimal();
    const actor = { orgId: s.org.id, userId: null };
    const outsider = await db.user.create({ data: { email: 'out@example.test' } });
    await expect(linkLearner(actor, { learnerId: s.learner.id, userId: outsider.id })).rejects.toThrow(/not a member of this org/);
    const ada = await addMember(s.org.id, 'member', 'ada@example.org');
    const bob = await addMember(s.org.id, 'member', 'bob@example.org');
    const second = await db.learner.create({ data: { orgId: s.org.id, code: 'L-0002', name: 'Bob', email: 'bob@example.org', targetCertificate: 'CERT-ACC', enrolledVersionId: s.version.id } });
    await linkLearner(actor, { learnerId: s.learner.id, userId: ada.id });
    await expect(linkLearner(actor, { learnerId: second.id, userId: ada.id })).rejects.toThrow('ada@example.org is already linked to L-0001.');
    await expect(linkLearner(actor, { learnerId: s.learner.id, userId: bob.id })).rejects.toThrow('L-0001 is already linked to another member. Unlink it first.');
    // the database says the same thing if the check is skipped
    await expect(db.learner.update({ where: { id: second.id }, data: { userId: ada.id } })).rejects.toThrow();
  });

  it('refuses a learner of another org as "no such learner"', async () => {
    const a = await seedMinimal('a');
    const b = await seedMinimal('b');
    const m = await addMember(a.org.id, 'member', 'm@example.test');
    await expect(linkLearner(a.actor, { learnerId: b.learner.id, userId: m.id })).rejects.toThrow('No such learner in this org.');
  });
});

describe('D-52 drafts', () => {
  it('saves, replaces and discards one draft per editor; a draft may hold a cycle', async () => {
    const s = await seedMinimal();
    const ruth = await addMember(s.org.id, 'admin', 'ruth@example.test');
    const actor = { orgId: s.org.id, userId: ruth.id };
    await saveDraft(actor, { baseVersionId: s.version.id, ops: [{ op: 'set_prereq', course: 'ACC-101', prereq: 'ACC-201' }] });
    await saveDraft(actor, { baseVersionId: s.version.id, ops: [{ op: 'set_prereq', course: 'ACC-101', prereq: 'ACC-201' }, { op: 'set_status', course: 'ACC-201', status: 'DRAFT' }] });
    expect(await db.catalogDraft.count()).toBe(1);
    expect(((await draftFor(s.org.id, ruth.id))!.ops as unknown[]).length).toBe(2);
    expect(await discardDraft(actor)).toBe(1);
    expect(await db.catalogDraft.count()).toBe(0);
  });

  it('refuses an op on an unknown course and a malformed op list', async () => {
    const s = await seedMinimal();
    const u = await addMember(s.org.id, 'admin', 'ruth@example.test');
    await expect(saveDraft({ orgId: s.org.id, userId: u.id }, { baseVersionId: s.version.id, ops: [{ op: 'set_status', course: 'ZZZ-999', status: 'RETIRED' }] })).rejects.toThrow(/unknown course ZZZ-999/);
    expect(() => parseOps('x')).toThrow(Refused);
    expect(() => parseOps([{ op: 'drop_table', course: 'ACC-101' }])).toThrow('Operation 1: unknown operation "drop_table".');
    expect(() => parseOps([{ op: 'set_prereq', course: 'acc 101', prereq: null }])).toThrow(/code like ACC-101/);
    expect(parseOps([{ op: 'set_prereq', course: 'ACC-101', prereq: { all: ['ACC-201'] } }])).toEqual([{ op: 'set_prereq', course: 'ACC-101', prereq: { all: ['ACC-201'] } }]);
  });

  it('publishing a cycle writes one attempt and no version and keeps the draft; an accepted one writes the version and clears it', async () => {
    const s = await seedMinimal();
    const u = await addMember(s.org.id, 'admin', 'ruth@example.test');
    const actor = { orgId: s.org.id, userId: u.id };
    await saveDraft(actor, { baseVersionId: s.version.id, ops: [{ op: 'set_prereq', course: 'ACC-101', prereq: 'ACC-201' }] });
    const refused = await publishDraft(actor, 'cat-v2');
    expect([refused.check.result, refused.check.cycles, refused.version]).toEqual(['REJECT:CYCLE', [['ACC-101', 'ACC-201', 'ACC-101']], null]);
    expect([await db.catalogVersion.count(), await db.publishAttempt.count(), await db.catalogDraft.count()]).toEqual([1, 1, 1]);

    await saveDraft(actor, { baseVersionId: s.version.id, ops: [{ op: 'add_course', course: 'ACC-301', title: 'Audit', status: 'PUBLISHED', prereq: 'ACC-201' }] });
    const ok = await publishDraft(actor, 'cat-v2');
    expect(ok.check.result).toBe('ACCEPT');
    expect([await db.catalogVersion.count(), await db.publishAttempt.count(), await db.catalogDraft.count()]).toEqual([2, 2, 0]);
    await expect(publishDraft(actor, 'cat-v2')).rejects.toThrow('There is no draft to publish.');
    await saveDraft(actor, { baseVersionId: s.version.id, ops: [{ op: 'set_status', course: 'ACC-201', status: 'PUBLISHED' }] });
    await expect(publishDraft(actor, 'cat-v2')).rejects.toThrow('A version named cat-v2 already exists.');
    await expect(publishDraft(actor, 'bad label!')).rejects.toThrow(/version name/);
  });
});

describe('D-57 today at the school', () => {
  it('is the calendar day in America/Chicago, not UTC, on both sides of midnight UTC', () => {
    expect(dayInZone(Date.UTC(2026, 9, 27, 3, 30), 'America/Chicago')).toBe('2026-10-26'); // 22:30 CDT
    expect(dayInZone(Date.UTC(2026, 9, 27, 5, 30), 'America/Chicago')).toBe('2026-10-27'); // 00:30 CDT
    expect(dayInZone(Date.UTC(2026, 9, 27, 3, 30), 'UTC')).toBe('2026-10-27');
  });

  it('follows the injectable clock', async () => {
    const { schoolToday } = await import('@/course/today');
    const a = schoolToday();
    advanceClock(86_400_000);
    expect(schoolToday()).not.toBe(a);
  });
});
