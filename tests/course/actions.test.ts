// Phase 3 server actions, driven as the browser drives them (orgAction + the session jar), for the behaviour the
// INV harness does not check: who may act (D-53), what the learner's own completion does (D-51, D-57, R2), and
// that a score is parsed without a float and corrected without an edit.
import { beforeEach, describe, expect, it } from 'vitest';
import { advanceClock } from '@/core/clock';
import { db } from '@/core/db';
import { publishDraftAction } from '@/app/o/[org]/catalog/actions';
import { completeItemAction, correctScoreAction, recordScoreAction } from '@/app/o/[org]/cohorts/actions';
import { linkLearnerAction, recordCompletionAction } from '@/app/o/[org]/learners/actions';
import { archiveOrgAction } from '@/app/o/[org]/archive/actions';
import { AuthzError } from '@/core/authz/guards';
import { hpText, parsePercentHp } from '@/course/scores';
import { schoolToday } from '@/course/today';
import { resetAuthTables, signInAs } from '../helpers/auth';
import { addMember } from '../helpers/org';
import { NavSignal } from '../helpers/next';
import { seedMinimal } from './helpers';

beforeEach(resetAuthTables);

async function school() {
  const s = await seedMinimal('school');
  const admin = await addMember(s.org.id, 'admin', 'admin@example.test');
  const scorekeeper = await addMember(s.org.id, 'scorekeeper', 'sk@example.test');
  const ada = await addMember(s.org.id, 'member', 'ada@example.org');
  await db.enrollment.create({ data: { orgId: s.org.id, cohortId: s.cohort.id, learnerId: s.learner.id, catalogVersionId: s.version.id } });
  return { ...s, admin, scorekeeper, ada };
}

describe('scores are parsed without a float', () => {
  it('reads a percent with at most two decimals into hp', () => {
    expect(['79.5', '79.50', '0', '100', '100.00', ' 7.05 %', '69.99'].map(parsePercentHp)).toEqual([7950, 7950, 0, 10000, 10000, 705, 6999]);
    for (const bad of ['79.505', '-1', '1e2', '100.01', 'x', '', '0x10']) expect(() => parsePercentHp(bad), bad).toThrow();
    expect([hpText(6960), hpText(5), hpText(10000)]).toEqual(['69.60', '0.05', '100.00']);
  });
});

describe('D-53 who may act', () => {
  it('a scorekeeper enters and corrects scores but cannot publish; a member can do neither', async () => {
    const s = await school();
    await signInAs(s.scorekeeper.id, { mfa: true });
    const r = await recordScoreAction('school', { cohortId: s.cohort.id, learnerId: s.learner.id, assignmentId: s.assignment.id, score: '79.5', submittedDay: '2026-01-11' });
    expect(r).toEqual({ notice: 'HW1 for L-0001 recorded.' });
    const sub = await db.submission.findFirstOrThrow();
    expect(sub.scoreHp).toBe(7950);
    expect(await recordScoreAction('school', { cohortId: s.cohort.id, learnerId: s.learner.id, assignmentId: s.assignment.id, score: '80', submittedDay: '2026-01-11' })).toEqual({ error: expect.stringMatching(/already has a score/) });
    expect(await correctScoreAction('school', { submissionId: sub.id, score: '81.25', reason: 'regrade' })).toEqual({ notice: 'Score corrected; the old row is kept.' });
    expect((await db.submission.findUniqueOrThrow({ where: { id: sub.id } })).scoreHp).toBe(7950);
    expect(await db.submission.count()).toBe(2);
    await expect(publishDraftAction('school', { baseVersionId: s.version.id, ops: '[]', label: 'v2' })).rejects.toBeInstanceOf(AuthzError);

    await signInAs(s.ada.id, { mfa: true });
    await expect(recordCompletionAction('school', { learnerId: s.learner.id, course: 'ACC-101', kind: 'PASS', day: '2026-02-01' })).rejects.toBeInstanceOf(AuthzError);
    await expect(linkLearnerAction('school', { learnerId: s.learner.id, userId: s.ada.id })).rejects.toBeInstanceOf(AuthzError);
  });

  it('archiving is owner-only and needs the slug typed', async () => {
    const s = await school();
    await signInAs(s.admin.id, { mfa: true });
    await expect(archiveOrgAction('school', { confirm: 'school', reason: 'x' })).rejects.toBeInstanceOf(AuthzError);
    const owner = await addMember(s.org.id, 'owner', 'owner@example.test');
    await signInAs(owner.id, { mfa: true });
    expect(await archiveOrgAction('school', { confirm: 'schol', reason: 'x' })).toEqual({ error: 'Type the org address exactly to confirm.' });
    expect(await archiveOrgAction('school', { confirm: 'school', reason: 'closing' })).toEqual({ notice: expect.stringMatching(/^Archived/) });
    await signInAs(s.scorekeeper.id, { mfa: true });
    expect(await recordScoreAction('school', { cohortId: s.cohort.id, learnerId: s.learner.id, assignmentId: s.assignment.id, score: '50', submittedDay: '2026-01-11' })).toEqual({ error: expect.stringMatching(/^This org is archived/) });
  });
});

describe('D-51/D-57 a learner completes her own items, dated by the server', () => {
  it('only a linked learner may complete; the day is today at the school; a locked item is refused and logged', async () => {
    const s = await school();
    await signInAs(s.ada.id, { mfa: true });
    expect(await completeItemAction('school', { cohortId: s.cohort.id, itemCode: 'L01' })).toEqual({ error: 'Only a learner linked to your account can complete items.' });

    await signInAs(s.admin.id, { mfa: true });
    await linkLearnerAction('school', { learnerId: s.learner.id, userId: s.ada.id });
    await signInAs(s.ada.id, { mfa: true });
    const today = schoolToday();
    expect(await completeItemAction('school', { cohortId: s.cohort.id, itemCode: 'L01' })).toEqual({ notice: `L01 completed on ${today}.` });
    const row = await db.itemCompletion.findFirstOrThrow();
    expect([row.day, row.learnerId, row.actorUserId]).toEqual([today, s.learner.id, s.ada.id]);

    // a cohort that starts tomorrow: nothing is released yet, whatever the form says
    const tomorrow = await db.cohort.create({ data: { orgId: s.org.id, code: 'C-NEXT', course: 'ACC-101', startDay: (advanceClock(86_400_000), schoolToday()), catalogVersionId: s.version.id, items: { create: [{ code: 'L01', offsetDays: 0 }] } } });
    advanceClock(0);
    await db.enrollment.create({ data: { orgId: s.org.id, cohortId: tomorrow.id, learnerId: s.learner.id, catalogVersionId: s.version.id } });
    expect(await completeItemAction('school', { cohortId: tomorrow.id, itemCode: 'L01' })).toEqual({ error: `REJECT:NOT_RELEASED: L01 on ${today} was refused and logged.` });
    expect(await db.itemCompletion.count({ where: { cohortId: tomorrow.id } })).toBe(0);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'item.refused' } });
    expect(audit.data).toMatchObject({ cohort: 'C-NEXT', learner: 'L-0001', item: 'L01', day: today, verdict: 'REJECT:NOT_RELEASED' });
  });

  it('a cohort of another org is not found, whoever asks', async () => {
    const s = await school();
    const other = await seedMinimal('other');
    await signInAs(s.ada.id, { mfa: true });
    await expect(completeItemAction('school', { cohortId: other.cohort.id, itemCode: 'L01' })).rejects.toBeInstanceOf(NavSignal);
  });
});
