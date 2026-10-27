import Link from 'next/link';
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { ActionForm } from '@/core/ui/action-form';
import { canEditCatalog, canEnterResults, isStaff, learnerVisibleTo } from '@/course/access';
import { archiveOf } from '@/course/archive';
import { eligibilityFor, pathFor, reevaluate } from '@/course/completions';
import { courseProgressFor } from '@/course/items';
import { bpText } from '@/course/scores';
import { learnerStateFor } from '@/course/state';
import { loadVersion } from '@/course/versions';
import { cmpStr } from '@/graph/types';
import { ScopeNote } from '@/app/ui/scope-note';
import { Bar, Pill, toneOf } from '@/app/ui/status';
import { linkLearnerAction, recordCompletionAction, unlinkLearnerAction } from '../actions';

export const metadata = { title: 'Learner path' };

// PRD P0-7 "what do I need next" (task 3.2): G7 status per course with the minimal missing set, G8 shortest path
// to the target certificate, the G6 reason for every satisfied leaf, against the ENROLLED version (P2); an
// explicit ?against=<label> re-evaluation shows both answers and writes nothing (O-7).
export default async function LearnerPage({ params, searchParams }: { params: Promise<{ org: string; code: string }>; searchParams: Promise<{ against?: string }> }) {
  const ctx = await requireOrg((await params).org);
  const learner = await learnerVisibleTo(ctx, (await params).code);
  const staff = isStaff(ctx);
  const base = `/o/${ctx.slug}`;
  const elig = await eligibilityFor(learner.id);
  const path = await pathFor(learner.id);
  const { catalog } = await loadVersion(learner.enrolledVersionId);
  const state = await learnerStateFor(learner.id, catalog);
  const satisfied = [...catalog.courses.map((c) => c.code)].sort(cmpStr).flatMap((c) => {
    const why = state.satisfied(c);
    return why ? [{ code: c, why }] : [];
  });
  const cert = catalog.certificates.find((c) => c.code === path.certificate)!;
  const versions = await db.catalogVersion.findMany({ where: { orgId: ctx.orgId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, label: true } });
  const againstLabel = (await searchParams).against;
  const against = againstLabel ? versions.find((v) => v.label === againstLabel) : undefined;
  const both = against ? await reevaluate(learner.id, against.id) : null;
  const enrollments = await db.enrollment.findMany({ where: { learnerId: learner.id }, include: { cohort: { select: { code: true, course: true } }, catalogVersion: { select: { label: true } } }, orderBy: { cohort: { code: 'asc' } } });
  const progress = await Promise.all(enrollments.map((e) => courseProgressFor(e.id)));
  const completions = await db.completionEvent.findMany({ where: { learnerId: learner.id }, orderBy: [{ day: 'asc' }, { createdAt: 'asc' }], include: { catalogVersion: { select: { label: true } } } });
  const archived = await archiveOf(ctx.orgId);
  const linked = learner.userId ? await db.user.findUnique({ where: { id: learner.userId }, select: { email: true } }) : null;
  const members = staff && canEditCatalog(ctx) && !learner.userId
    ? await db.membership.findMany({ where: { orgId: ctx.orgId, user: { learners: { none: { orgId: ctx.orgId } } } }, select: { user: { select: { id: true, email: true } } }, orderBy: { user: { email: 'asc' } } })
    : [];
  const statusTone = (st: string) => (st === 'BLOCKED' ? 'bad' : st === 'COMPLETED' || st === 'ELIGIBLE' ? 'ok' : 'neutral') as 'bad' | 'ok' | 'neutral';

  return (
    <main>
      <header className="page-head">
        <div>
          <p className="eyebrow">{staff ? <><Link href={`${base}/learners`}>Learners</Link> / Learner path</> : 'Your path'}</p>
          <h1>{learner.code} · {learner.name}</h1>
          <p className="lede">
            Target certificate <strong>{path.certificate}</strong> ({cert.title}) · enrolled under catalog version <strong>{elig.versionLabel}</strong> (P2: every answer
            below is read against it)
          </p>
        </div>
      </header>

      <div className="stats">
        <div className="stat"><span className="stat-num">{bpText(path.progress.progress_bp)}</span><span className="stat-label">Certificate progress</span><span className="stat-note">{path.progress.satisfied} of {path.progress.required} required courses</span></div>
        <div className="stat"><span className="stat-num">{path.path.path.length}</span><span className="stat-label">Courses still to pass</span><span className="stat-note">fewest possible</span></div>
        <div className="stat"><span className="stat-num">{enrollments.length}</span><span className="stat-label">Cohorts</span><span className="stat-note">{completions.length} completion events</span></div>
      </div>

      <section className="card" aria-labelledby="path-h">
        <header><h2 id="path-h">Certificate progress and shortest path</h2><p>Exact over {path.path.combinations} branch combination(s) of the OR prerequisites (G8); ties by course code.</p></header>
        <div className="card-body">
          <p>
            {path.progress.satisfied} of {path.progress.required} required courses satisfied: <strong>{bpText(path.progress.progress_bp)}</strong>.{' '}
            {path.path.path.length === 0 ? (
              <strong className="ok">Nothing left to take.</strong>
            ) : (
              <>Fewest courses still to pass ({path.path.path.length}), in the order they can be taken: </>
            )}
          </p>
          {path.path.path.length > 0 && (
            <ol aria-label="Shortest path" className="steps">{path.path.path.map((c) => <li key={c}><span className="chip">{c}</span></li>)}</ol>
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="sat-h">
        <header><h2 id="sat-h">Satisfied leaves and why</h2><p>G6: a passed course, an equivalent, or a waiver, each with its reason.</p></header>
        {satisfied.length ? (
          <div className="table-wrap">
            <table>
              <caption>{satisfied.length} courses satisfied</caption>
              <thead><tr><th scope="col">Course</th><th scope="col">Satisfied by</th></tr></thead>
              <tbody>{satisfied.map((x) => <tr key={x.code}><td className="mono">{x.code}</td><td><Pill tone={toneOf(x.why)}>{x.why}</Pill></td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="empty">Nothing satisfied yet.</p>}
      </section>

      {enrollments.length > 0 && (
        <section className="card" aria-labelledby="coh-h">
          <header><h2 id="coh-h">Cohorts</h2></header>
          <div className="table-wrap">
            <table>
              <caption>{enrollments.length} enrollments</caption>
              <thead><tr><th scope="col">Cohort</th><th scope="col">Course</th><th scope="col">Status</th><th scope="col">Version</th><th scope="col">Items</th><th scope="col">Flag</th></tr></thead>
              <tbody>
                {enrollments.map((e, i) => (
                  <tr key={e.id}>
                    <td><Link href={`${base}/cohorts/${e.cohort.code}/drip`}>{e.cohort.code}</Link></td>
                    <td className="mono">{e.cohort.course}</td>
                    <td><Pill>{e.status}</Pill></td>
                    <td>{e.catalogVersion.label}</td>
                    <td><span className="progress"><Bar done={progress[i]!.itemsDone} total={progress[i]!.itemsTotal} />{progress[i]!.itemsDone} / {progress[i]!.itemsTotal} ({bpText(progress[i]!.progressBp)})</span></td>
                    <td>{e.grandfathered ? <><Pill tone="warn">GRANDFATHERED</Pill> <span className="muted">missing {e.grandfatheredMissing?.split('+').join(', ')} under the newer version; the enrollment stands (G9)</span></> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card" aria-labelledby="elig-h">
        <header><h2 id="elig-h">Every course: status and minimal missing set</h2><p>G7. Changes nothing (O-7).</p></header>
        <div className="card-body">
          <form className="form-row">
            <label className="field">
              <span>Re-evaluate against</span>
              <select name="against" defaultValue={against?.label ?? ''}>
                <option value="">(only the enrolled version)</option>
                {versions.filter((v) => v.id !== elig.versionId).map((v) => <option key={v.id} value={v.label}>{v.label}</option>)}
              </select>
            </label>
            <button type="submit" className="btn-secondary">Compare</button>
            <span className="muted">Shows both answers; changes nothing (O-7).</span>
          </form>
        </div>
        <div className="table-wrap">
          <table>
            <caption>{elig.courses.length} courses</caption>
            <thead>
              <tr>
                <th scope="col">Course</th><th scope="col">Status ({elig.versionLabel})</th><th scope="col">Missing</th>
                {both && <><th scope="col">Status ({both.against.versionLabel})</th><th scope="col">Missing</th></>}
              </tr>
            </thead>
            <tbody>
              {elig.courses.map((c) => {
                const o = both?.against.courses.find((x) => x.code === c.code);
                const differs = o && (o.status !== c.status || o.missing.join() !== c.missing.join());
                return (
                  <tr key={c.code}>
                    <td className="mono">{c.code}</td>
                    <td><Pill tone={statusTone(c.status)}>{c.status}</Pill></td>
                    <td className="mono">{c.missing.join(', ')}</td>
                    {both && (
                      <>
                        <td><Pill tone={statusTone(o?.status ?? '')}>{`${o?.status ?? 'not in this version'}${differs ? ' ≠' : ''}`}</Pill></td>
                        <td className="mono">{o?.missing.join(', ')}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" aria-labelledby="hist-h">
        <header><h2 id="hist-h">Completion history</h2></header>
        {completions.length ? (
          <div className="table-wrap">
            <table>
              <caption>{completions.length} events, oldest first</caption>
              <thead><tr><th scope="col">Day</th><th scope="col">Course</th><th scope="col">Result</th><th scope="col">Version</th></tr></thead>
              <tbody>{completions.map((c) => <tr key={c.id}><td className="date">{c.day}</td><td className="mono">{c.course}</td><td><Pill tone={c.kind === 'PASS' ? 'ok' : 'bad'}>{c.kind}</Pill></td><td>{c.catalogVersion.label}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="empty">No completions recorded.</p>}
      </section>

      {staff && !archived && (
        <section aria-labelledby="staff-h" className="card">
          <header><h2 id="staff-h">Staff</h2><p>Linked member: {linked ? <strong>{linked.email}</strong> : <span className="muted">none</span>}</p></header>
          <div className="card-body">
            {canEditCatalog(ctx) && learner.userId && (
              <ActionForm action={unlinkLearnerAction.bind(null, ctx.slug)}>
                <input type="hidden" name="learnerId" value={learner.id} />
                <button type="submit" className="btn-secondary">Unlink</button>
              </ActionForm>
            )}
            {canEditCatalog(ctx) && !learner.userId && (
              <ActionForm action={linkLearnerAction.bind(null, ctx.slug)}>
                <input type="hidden" name="learnerId" value={learner.id} />
                <div className="form-row">
                  <label className="field">
                    <span>Link member</span>
                    <select name="userId" required defaultValue="">
                      <option value="" disabled>choose…</option>
                      {members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.email}</option>)}
                    </select>
                  </label>
                  <button type="submit">Link (audited)</button>
                  <span className="muted">Nothing is linked by email match (D-51).</span>
                </div>
              </ActionForm>
            )}
            {canEnterResults(ctx) && (
              <ActionForm action={recordCompletionAction.bind(null, ctx.slug)}>
                <input type="hidden" name="learnerId" value={learner.id} />
                <div className="form-row">
                  <label className="field">
                    <span>Course</span>
                    <select name="course" required>
                      {catalog.courses.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Result</span>
                    <select name="kind"><option value="PASS">PASS</option><option value="FAIL">FAIL</option></select>
                  </label>
                  <label className="field"><span>Day</span><input name="day" required placeholder="YYYY-MM-DD" pattern="\d{4}-\d{2}-\d{2}" size={11} /></label>
                  <button type="submit">Record completion</button>
                </div>
              </ActionForm>
            )}
          </div>
        </section>
      )}
      <ScopeNote />
    </main>
  );
}
