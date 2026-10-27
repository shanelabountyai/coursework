import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { ActionForm } from '@/core/ui/action-form';
import { canEnterResults, cohortVisibleTo } from '@/course/access';
import { archiveOf } from '@/course/archive';
import { assignmentsOf, gradeFor } from '@/course/grades';
import { hpText } from '@/course/scores';
import { lateAdjustedHp } from '@/grades/grade';
import { mul, rational, roundHalfUp, toString as ratText, type Rational } from '@/grades/rational';
import { cmpStr } from '@/graph/types';
import { ScopeNote } from '@/app/ui/scope-note';
import { Pill } from '@/app/ui/status';
import { correctScoreAction, recordScoreAction } from '../../actions';

export const metadata = { title: 'Gradebook' };

// O-8: display may show two decimals of an exact ratio; the computation never rounds there (S8 rounds once).
const pct = (r: Rational) => `${hpText(Number(roundHalfUp(mul(r, rational(10000n)))))}%`;

// PRD P0-7 gradebook (task 3.3, S2–S9): scores, late-adjusted scores, dropped items, category fractions, the final
// grade with its exact rational, letter, pass and flags. Staff see every learner; a linked learner only herself.
// ?learner=<code> opens one learner's detail: every row of every score (corrections keep the old row) and, for
// results.write, entry and correction.
export default async function Grades({ params, searchParams }: { params: Promise<{ org: string; code: string }>; searchParams: Promise<{ learner?: string }> }) {
  const ctx = await requireOrg((await params).org);
  const { cohort, self } = await cohortVisibleTo(ctx, (await params).code);
  if (!cohort.schemeId) notFound();
  const assignments = await assignmentsOf(cohort.id);
  const enrollments = await db.enrollment.findMany({ where: { cohortId: cohort.id, ...(self && { learnerId: self.id }) }, select: { learner: { select: { id: true, code: true, name: true } } } });
  const learners = enrollments.map((e) => e.learner).sort((a, b) => cmpStr(a.code, b.code));
  const subs = await db.submission.findMany({ where: { cohortId: cohort.id, ...(self && { learnerId: self.id }) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, learnerId: true, scoreHp: true, submittedDay: true, reason: true, supersedesId: true, supersededBy: { select: { id: true } }, assignment: { select: { code: true } } } });
  const current = new Map(subs.filter((s) => !s.supersededBy).map((s) => [`${s.learnerId}|${s.assignment.code}`, s]));
  const rows = [];
  for (const l of learners) rows.push({ l, ...(await gradeFor(cohort.id, l.id)) });
  const scheme = rows[0]?.scheme ?? null;
  const focusCode = self ? self.code : (await searchParams).learner;
  const focus = learners.find((l) => l.code === focusCode) ?? null;
  const results = canEnterResults(ctx) && !(await archiveOf(ctx.orgId));
  const base = `/o/${ctx.slug}/cohorts/${cohort.code}/grades`;

  return (
    <main>
      <header className="page-head">
        <div>
          <p className="eyebrow"><Link href={`/o/${ctx.slug}/cohorts`}>Cohorts</Link> / {cohort.code}</p>
          <h1>Gradebook · {cohort.code}</h1>
          <p className="lede">Scores are whole hundredths of a percent and the arithmetic is exact. The final grade rounds once, half-up, at the end.</p>
        </div>
        <div className="actions"><Link href={`/o/${ctx.slug}/cohorts/${cohort.code}/drip`}>Drip calendar</Link></div>
      </header>
      {scheme && (
        <p className="callout">
          Scheme <strong>{scheme.id}</strong>: {scheme.categories.map((c) => `${c.code} ${hpText(c.weight_bp)}%${c.drop_lowest ? ` (drop ${c.drop_lowest})` : ''}`).join(' · ')}; late −{hpText(scheme.late.per_day_hp)} per day up to {scheme.late.max_days} days;
          missing work {scheme.missing}; pass at {hpText(scheme.pass_threshold_hp)}. The final is exact until one half-up rounding (S8).
        </p>
      )}
      <section className="card" aria-labelledby="book-h">
        <header><h2 id="book-h">{rows.length} learners</h2><p>Scroll sideways for every assignment; the learner column stays put.</p></header>
        <div className="table-wrap">
          <table className="table--matrix">
            <caption>Scores, category ratios and the final grade</caption>
            <thead>
              <tr>
                <th scope="col">Learner</th>
                {assignments.map((a) => <th scope="col" key={a.code} className="num">{a.code}<span className="muted"> {a.category}</span></th>)}
                {scheme?.categories.map((c) => <th scope="col" key={c.code}>{c.code} ratio</th>)}
                <th scope="col" className="num">Final</th><th scope="col">Letter</th><th scope="col">Pass</th><th scope="col">Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ l, scheme: s, grade }) => (
                <tr key={l.id}>
                  <th scope="row">{self ? l.code : <Link href={`${base}?learner=${l.code}`}>{l.code}</Link>}</th>
                  {assignments.map((a) => {
                    const sub = current.get(`${l.id}|${a.code}`);
                    if (!sub) return <td key={a.code} className="num muted">missing</td>;
                    const late = lateAdjustedHp(sub.scoreHp, a.due_day, sub.submittedDay, s.late);
                    const dropped = grade.flags.some((f) => f.startsWith(`DROPPED:${a.category}:`) && f.split(':')[2]!.split('+').includes(a.code));
                    return (
                      <td key={a.code} className="num">
                        {dropped ? <s>{hpText(sub.scoreHp)}</s> : hpText(sub.scoreHp)}
                        {late.daysLate > 0 && <span className="warn"> → {hpText(Number(late.adjusted))} ({late.daysLate}d late)</span>}
                        {dropped && <span className="muted"> dropped</span>}
                        {sub.supersedesId && <span className="muted"> (corrected)</span>}
                      </td>
                    );
                  })}
                  {s.categories.map((c) => {
                    const r = grade.categories.get(c.code) ?? null;
                    return <td key={c.code} className="mono">{r ? `${ratText(r)} = ${pct(r)}` : 'empty'}</td>;
                  })}
                  <td className="num">
                    <strong>{hpText(grade.final_hp)}</strong>
                    <details><summary>exact</summary><span className="mono">{grade.exactText}</span></details>
                  </td>
                  <td>{grade.letter}</td>
                  <td><Pill tone={grade.passed ? 'ok' : 'bad'}>{grade.passed ? 'pass' : 'fail'}</Pill></td>
                  <td><div className="chips">{grade.flags.map((f) => <Pill key={f}>{f}</Pill>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {focus && (
        <section aria-labelledby="detail-h" className="card">
          <header><h2 id="detail-h">{focus.code} · {focus.name}: every score row</h2><p>Corrections keep the old row.</p></header>
          <div className="table-wrap">
          <table>
            <caption>One row per assignment</caption>
            <thead><tr><th scope="col">Assignment</th><th scope="col">Rows (oldest first)</th>{results && <th scope="col">Enter or correct</th>}</tr></thead>
            <tbody>
              {assignments.map((a) => {
                const history = subs.filter((s) => s.learnerId === focus.id && s.assignment.code === a.code);
                const cur = current.get(`${focus.id}|${a.code}`);
                return (
                  <tr key={a.code}>
                    <td className="mono">{a.code}</td>
                    <td>
                      {history.length ? (
                        <ol>{history.map((h) => <li key={h.id}>{hpText(h.scoreHp)} on {h.submittedDay}{h.reason ? ` — corrected: ${h.reason}` : ''}{h.supersededBy ? ' (superseded)' : ' (current)'}</li>)}</ol>
                      ) : <span className="muted">no score</span>}
                    </td>
                    {results && (
                      <td>
                        {cur ? (
                          <ActionForm action={correctScoreAction.bind(null, ctx.slug)}>
                            <input type="hidden" name="submissionId" value={cur.id} />
                            <label className="field"><span>New %</span><input name="score" required size={6} inputMode="decimal" aria-label={`New score for ${a.code}`} /></label>
                            <label className="field"><span>Reason</span><input name="reason" required size={18} aria-label={`Reason for correcting ${a.code}`} /></label>
                            <button type="submit" className="btn-secondary" aria-label={`Correct ${a.code}`}>Correct</button>
                          </ActionForm>
                        ) : (
                          <RecordForm slug={ctx.slug} cohortId={cohort.id} learnerId={focus.id} assignmentCode={a.code} />
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </section>
      )}
      <ScopeNote />
    </main>
  );
}

async function RecordForm(p: { slug: string; cohortId: string; learnerId: string; assignmentCode: string }) {
  const a = await db.assignment.findUniqueOrThrow({ where: { cohortId_code: { cohortId: p.cohortId, code: p.assignmentCode } }, select: { id: true } });
  return (
    <ActionForm action={recordScoreAction.bind(null, p.slug)}>
      <input type="hidden" name="cohortId" value={p.cohortId} />
      <input type="hidden" name="learnerId" value={p.learnerId} />
      <input type="hidden" name="assignmentId" value={a.id} />
      <label className="field"><span>Score %</span><input name="score" required size={6} inputMode="decimal" aria-label={`Score for ${p.assignmentCode}`} /></label>
      <label className="field"><span>Submitted</span><input name="submittedDay" required placeholder="YYYY-MM-DD" size={11} aria-label={`Submitted day for ${p.assignmentCode}`} /></label>
      <button type="submit" aria-label={`Record ${p.assignmentCode}`}>Record</button>
    </ActionForm>
  );
}
