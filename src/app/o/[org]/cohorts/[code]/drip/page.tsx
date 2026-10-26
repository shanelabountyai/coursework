import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { ActionForm } from '@/core/ui/action-form';
import { cohortVisibleTo } from '@/course/access';
import { archiveOf } from '@/course/archive';
import { cohortView } from '@/course/items';
import { bpText } from '@/course/scores';
import { schoolToday, SCHOOL_TIME_ZONE } from '@/course/today';
import { courseProgressBp, releaseDay } from '@/graph/drip';
import { cmpStr } from '@/graph/types';
import { ScopeNote } from '@/app/ui/scope-note';
import { completeItemAction } from '../../actions';

export const metadata = { title: 'Drip calendar' };

type Refusal = { learner: string; item: string; day: string; verdict: string };

// PRD P0-7 drip calendar (task 3.4, R1–R3): release days by item, completions, refused attempts, progress per
// enrollment (P1, derived on read). A linked learner sees only her own row: done, available, or locked until <day>.
export default async function Drip({ params }: { params: Promise<{ org: string; code: string }> }) {
  const ctx = await requireOrg((await params).org);
  const { cohort, self } = await cohortVisibleTo(ctx, (await params).code);
  const v = (await cohortView(ctx.orgId, cohort.code))!;
  const items = v.view.items.map((i) => ({ ...i, release: releaseDay(v.view, i.code) })).sort((a, b) => cmpStr(a.release, b.release) || cmpStr(a.code, b.code));
  const enrolled = v.view.enrolled.map((e) => e.learner_id).sort(cmpStr).filter((code) => !self || code === self.code);
  const rows = await db.itemCompletion.findMany({ where: { cohortId: cohort.id, ...(self && { learnerId: self.id }) }, select: { itemCode: true, day: true, learner: { select: { code: true } } } });
  const done = new Map(rows.map((r) => [`${r.learner.code}|${r.itemCode}`, r.day]));
  const audits = await db.auditEvent.findMany({ where: { orgId: ctx.orgId, action: 'item.refused', data: { path: ['cohort'], equals: cohort.code } }, orderBy: [{ at: 'asc' }, { id: 'asc' }], select: { data: true } });
  const refused = audits.map((a) => a.data as unknown as Refusal).filter((r) => !self || r.learner === self.code);
  const releaseOf = new Map(items.map((i) => [i.code, i.release]));
  const today = schoolToday();
  const archived = await archiveOf(ctx.orgId);
  return (
    <main>
      <h1>Drip calendar · {cohort.code}</h1>
      <p>
        Course <span className="mono">{cohort.course}</span>, starts <span className="mono">{cohort.startDay}</span>. An item is released on start day + its offset, inclusive (R1).
        Today at the school ({SCHOOL_TIME_ZONE}) is <span className="mono" data-testid="school-today">{today}</span>.
      </p>
      <h2>Items by release day</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Item</th><th scope="col">Title</th><th scope="col">Released</th>
            {enrolled.map((l) => <th scope="col" key={l}>{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const open = i.release <= today;
            return (
              <tr key={i.code}>
                <td className="mono">{i.code}</td>
                <td>{i.title}</td>
                <td className="mono">{i.release}{open ? '' : ' (locked)'}</td>
                {enrolled.map((l) => {
                  const d = done.get(`${l}|${i.code}`);
                  if (d) return <td key={l} className="ok">done {d}</td>;
                  if (!open) return <td key={l} className="muted">Locked until {i.release}</td>;
                  if (self && !archived) {
                    return (
                      <td key={l}>
                        <ActionForm action={completeItemAction.bind(null, ctx.slug)}>
                          <input type="hidden" name="cohortId" value={cohort.id} />
                          <input type="hidden" name="itemCode" value={i.code} />
                          <button type="submit" aria-label={`Complete ${i.code}`}>Complete</button>
                        </ActionForm>
                      </td>
                    );
                  }
                  return <td key={l}>available</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2>Progress per enrollment (derived, never stored)</h2>
      <table>
        <thead><tr><th scope="col">Learner</th><th scope="col" className="num">Done</th><th scope="col" className="num">Progress</th></tr></thead>
        <tbody>
          {enrolled.map((l) => {
            const n = items.filter((i) => done.has(`${l}|${i.code}`)).length;
            return <tr key={l}><td>{l}</td><td className="num">{n} of {items.length}</td><td className="num">{bpText(courseProgressBp(n, items.length))}</td></tr>;
          })}
        </tbody>
      </table>
      <h2>Refused attempts ({refused.length})</h2>
      {refused.length ? (
        <table>
          <thead><tr><th scope="col">Learner</th><th scope="col">Item</th><th scope="col">Attempted</th><th scope="col">Released</th><th scope="col">Verdict</th></tr></thead>
          <tbody>
            {refused.map((r, k) => (
              <tr key={k}><td>{r.learner}</td><td className="mono">{r.item}</td><td className="mono">{r.day}</td><td className="mono">{releaseOf.get(r.item) ?? '—'}</td><td className="bad">{r.verdict}</td></tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted">None.</p>}
      <ScopeNote />
    </main>
  );
}
