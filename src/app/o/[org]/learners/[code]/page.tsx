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
  const statusClass = (s: string) => (s === 'BLOCKED' ? 'bad' : s === 'COMPLETED' || s === 'ELIGIBLE' ? 'ok' : 'muted');

  return (
    <main>
      <h1>{learner.code} · {learner.name}</h1>
      <p>
        Target certificate <strong>{path.certificate}</strong> ({cert.title}) · enrolled under catalog version <strong>{elig.versionLabel}</strong> (P2: every answer
        below is read against it)
      </p>

      <h2>Certificate progress and shortest path</h2>
      <p>
        {path.progress.satisfied} of {path.progress.required} required courses satisfied: <strong>{bpText(path.progress.progress_bp)}</strong>.{' '}
        {path.path.path.length === 0 ? (
          <strong className="ok">Nothing left to take.</strong>
        ) : (
          <>Fewest courses still to pass ({path.path.path.length}), in the order they can be taken: </>
        )}
      </p>
      {path.path.path.length > 0 && (
        <ol aria-label="Shortest path">{path.path.path.map((c) => <li key={c} className="mono">{c}</li>)}</ol>
      )}
      <p className="muted">Exact over {path.path.combinations} branch combination(s) of the OR prerequisites (G8); ties by course code.</p>

      <h2>Satisfied leaves and why (G6)</h2>
      {satisfied.length ? (
        <table>
          <thead><tr><th scope="col">Course</th><th scope="col">Satisfied by</th></tr></thead>
          <tbody>{satisfied.map((s) => <tr key={s.code}><td className="mono">{s.code}</td><td className="mono">{s.why}</td></tr>)}</tbody>
        </table>
      ) : <p className="muted">Nothing satisfied yet.</p>}

      {enrollments.length > 0 && (
        <>
          <h2>Cohorts</h2>
          <table>
            <thead><tr><th scope="col">Cohort</th><th scope="col">Course</th><th scope="col">Status</th><th scope="col">Version</th><th scope="col" className="num">Items</th><th scope="col">Flag</th></tr></thead>
            <tbody>
              {enrollments.map((e, i) => (
                <tr key={e.id}>
                  <td><Link href={`${base}/cohorts/${e.cohort.code}/drip`}>{e.cohort.code}</Link></td>
                  <td className="mono">{e.cohort.course}</td>
                  <td>{e.status}</td>
                  <td>{e.catalogVersion.label}</td>
                  <td className="num">{progress[i]!.itemsDone} / {progress[i]!.itemsTotal} ({bpText(progress[i]!.progressBp)})</td>
                  <td>{e.grandfathered ? <span className="warn">GRANDFATHERED — missing {e.grandfatheredMissing?.split('+').join(', ')} under the newer version; the enrollment stands (G9)</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>Every course: status and minimal missing set (G7)</h2>
      <form>
        <label>
          Re-evaluate against{' '}
          <select name="against" defaultValue={against?.label ?? ''}>
            <option value="">(only the enrolled version)</option>
            {versions.filter((v) => v.id !== elig.versionId).map((v) => <option key={v.id} value={v.label}>{v.label}</option>)}
          </select>
        </label>{' '}
        <button type="submit">Compare</button> <span className="muted">Shows both answers; changes nothing (O-7).</span>
      </form>
      <table>
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
                <td className={statusClass(c.status)}>{c.status}</td>
                <td className="mono">{c.missing.join(', ')}</td>
                {both && (
                  <>
                    <td className={statusClass(o?.status ?? '')}>{o?.status ?? 'not in this version'}{differs ? ' ≠' : ''}</td>
                    <td className="mono">{o?.missing.join(', ')}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Completion history</h2>
      {completions.length ? (
        <table>
          <thead><tr><th scope="col">Day</th><th scope="col">Course</th><th scope="col">Result</th><th scope="col">Version</th></tr></thead>
          <tbody>{completions.map((c) => <tr key={c.id}><td className="mono">{c.day}</td><td className="mono">{c.course}</td><td>{c.kind}</td><td>{c.catalogVersion.label}</td></tr>)}</tbody>
        </table>
      ) : <p className="muted">No completions recorded.</p>}

      {staff && !archived && (
        <section aria-labelledby="staff-h" className="panel">
          <h2 id="staff-h">Staff</h2>
          <p>Linked member: {linked ? <strong>{linked.email}</strong> : <span className="muted">none</span>}</p>
          {canEditCatalog(ctx) && learner.userId && (
            <ActionForm action={unlinkLearnerAction.bind(null, ctx.slug)}>
              <input type="hidden" name="learnerId" value={learner.id} />
              <button type="submit">Unlink</button>
            </ActionForm>
          )}
          {canEditCatalog(ctx) && !learner.userId && (
            <ActionForm action={linkLearnerAction.bind(null, ctx.slug)}>
              <input type="hidden" name="learnerId" value={learner.id} />
              <label>
                Link member{' '}
                <select name="userId" required defaultValue="">
                  <option value="" disabled>choose…</option>
                  {members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.email}</option>)}
                </select>
              </label>
              <button type="submit">Link (audited)</button>
              <span className="muted"> Nothing is linked by email match (D-51).</span>
            </ActionForm>
          )}
          {canEnterResults(ctx) && (
            <ActionForm action={recordCompletionAction.bind(null, ctx.slug)}>
              <input type="hidden" name="learnerId" value={learner.id} />
              <label>
                Course{' '}
                <select name="course" required>
                  {catalog.courses.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
              </label>
              <label>
                Result{' '}
                <select name="kind"><option value="PASS">PASS</option><option value="FAIL">FAIL</option></select>
              </label>
              <label>Day <input name="day" required placeholder="YYYY-MM-DD" pattern="\d{4}-\d{2}-\d{2}" size={11} /></label>
              <button type="submit">Record completion</button>
            </ActionForm>
          )}
        </section>
      )}
      <ScopeNote />
    </main>
  );
}
