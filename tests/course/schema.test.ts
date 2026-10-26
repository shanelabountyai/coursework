// Task 2.1 / 2.3: the clone's tables exist as the schema says, no column stores progress (P1), and no day
// column is a Postgres DATE (D-8). Read from information_schema, so a planted `progressBp Int` on Enrollment
// fails here whatever the Prisma schema calls it.
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/core/db';

afterAll(() => db.$disconnect());

export const COURSE_TABLES = [
  'CatalogVersion', 'PublishAttempt', 'Learner', 'Waiver', 'CompletionEvent', 'Cohort', 'ContentItem', 'Enrollment', 'ItemCompletion', 'GradeScheme', 'Assignment', 'Submission',
  'OrgArchive', 'CatalogDraft', // D-56, D-52
] as const;
// The five history tables (D-45) plus the insert-only archive row (D-56). CatalogDraft is mutable on purpose (D-52).
export const APPEND_ONLY_TABLES = ['CatalogVersion', 'PublishAttempt', 'CompletionEvent', 'ItemCompletion', 'Submission', 'OrgArchive'] as const;

// A stored answer under any of these names is the P1 violation; `scoreHp` is an input, not a derived value.
const STORED_ANSWER = /progress|percent|eligib|final|letter|passed|grade_hp|gradeHp|satisfied|missing_set|\bbp$/i;
const ALLOWED = new Set(['Enrollment.grandfatheredMissing']); // the G9 report's text, a flag on the enrollment (V3), not an eligibility answer

type Col = { table_name: string; column_name: string; data_type: string; character_maximum_length: number | null };
const columns = async () =>
  db.$queryRaw<Col[]>`SELECT table_name, column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_schema = current_schema() ORDER BY table_name, ordinal_position`;

describe('2.1 schema', () => {
  it('every clone table exists', async () => {
    const tables = new Set((await columns()).map((c) => c.table_name));
    for (const t of COURSE_TABLES) expect(tables.has(t), t).toBe(true);
  });

  it('every day column is CHAR(10) and nothing is a DATE (D-8)', async () => {
    const cols = (await columns()).filter((c) => (COURSE_TABLES as readonly string[]).includes(c.table_name));
    expect(cols.filter((c) => c.data_type === 'date').map((c) => `${c.table_name}.${c.column_name}`)).toEqual([]);
    const days = cols.filter((c) => /day$/i.test(c.column_name));
    expect(days.map((c) => `${c.table_name}.${c.column_name}`).sort()).toEqual(
      ['Assignment.dueDay', 'Cohort.startDay', 'CompletionEvent.day', 'ItemCompletion.day', 'Submission.submittedDay', 'Waiver.grantedDay'].sort(),
    );
    for (const c of days) {
      expect(c.data_type, `${c.table_name}.${c.column_name}`).toBe('character');
      expect(c.character_maximum_length, `${c.table_name}.${c.column_name}`).toBe(10);
    }
  });

  it('the append-only trigger is on exactly the five history tables and OrgArchive (2.2, D-56)', async () => {
    const rows = await db.$queryRaw<{ t: string }[]>`SELECT event_object_table AS t FROM information_schema.triggers WHERE trigger_schema = current_schema() AND action_statement LIKE '%coursework_append_only%' GROUP BY 1 ORDER BY 1`;
    expect(rows.map((r) => r.t)).toEqual([...APPEND_ONLY_TABLES].sort());
  });

  it('the archived-org guard (D-56) is on every clone table that can be written', async () => {
    const rows = await db.$queryRaw<{ t: string }[]>`SELECT event_object_table AS t FROM information_schema.triggers WHERE trigger_schema = current_schema() AND action_statement LIKE '%coursework_refuse_archived%' GROUP BY 1 ORDER BY 1`;
    expect(rows.map((r) => r.t)).toEqual(COURSE_TABLES.filter((t) => t !== 'OrgArchive').sort());
  });
});

describe('2.3 progress is never stored (P1)', () => {
  it('no clone column is named like a derived answer', async () => {
    const cols = (await columns()).filter((c) => (COURSE_TABLES as readonly string[]).includes(c.table_name));
    const bad = cols.map((c) => `${c.table_name}.${c.column_name}`).filter((n) => STORED_ANSWER.test(n.split('.')[1]!) && !ALLOWED.has(n));
    expect(bad).toEqual([]);
  });
});
