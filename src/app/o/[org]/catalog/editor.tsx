'use client';
// PRD P0-7 catalog editor (task 3.1). The engine is pure, so the browser runs it unchanged: every change to the
// pending operation re-runs applyEdit + validateCatalog (G1–G5) and the verdict, every error and every cycle path
// are on screen before the publish button can be pressed. The server re-runs the same check (publishDraftAction).
import { useMemo, useState } from 'react';
import { ActionForm } from '@/core/ui/action-form';
import { applyEdit, validateCatalog, type EditOp, type PublishCheck } from '@/graph/publish';
import { STATUSES, type Catalog, type Status } from '@/graph/types';
import { exprText, parseExprText } from '@/app/ui/expr';

type Bound = (form: FormData) => Promise<unknown>;
type Kind = EditOp['op'];

export function CatalogEditor(props: {
  base: Catalog;
  baseVersionId: string;
  savedOps: EditOp[];
  suggestedLabel: string;
  save: Bound;
  discard: Bound;
  publish: Bound;
}) {
  const { base } = props;
  const codes = useMemo(() => base.courses.map((c) => c.code), [base]);
  const [ops, setOps] = useState<EditOp[]>(props.savedOps);
  const [kind, setKind] = useState<Kind>('set_prereq');
  const [course, setCourse] = useState(codes[0] ?? '');
  const [prereq, setPrereq] = useState(exprText(base.courses[0]?.prereq ?? null));
  const [status, setStatus] = useState<Status>('PUBLISHED');
  const [newCode, setNewCode] = useState('');
  const [title, setTitle] = useState('');

  const pending = useMemo((): { op: EditOp | null; problem: string | null } => {
    if (kind === 'set_status') return { op: { op: 'set_status', course, status }, problem: null };
    const p = parseExprText(prereq);
    if (!p.ok) return { op: null, problem: p.message };
    if (kind === 'set_prereq') return { op: { op: 'set_prereq', course, prereq: p.expr }, problem: null };
    if (!newCode.trim()) return { op: null, problem: 'A new course needs a code.' };
    return { op: { op: 'add_course', course: newCode.trim(), title: title.trim() || newCode.trim(), status, prereq: p.expr }, problem: null };
  }, [kind, course, prereq, status, newCode, title]);

  const effective = useMemo(() => (pending.op ? [...ops, pending.op] : ops), [ops, pending.op]);
  const live = useMemo((): { check: PublishCheck | null; problem: string | null; changed: boolean } => {
    try {
      const next = applyEdit(base, { id: 'live', ops: effective });
      return { check: validateCatalog(next), problem: null, changed: JSON.stringify(next.courses) !== JSON.stringify(base.courses) };
    } catch (e) {
      return { check: null, problem: (e as Error).message.replace(/^live: /, ''), changed: false };
    }
  }, [base, effective]);
  const problem = pending.problem ?? live.problem;
  const accepted = !problem && live.check?.result === 'ACCEPT' && live.changed;
  const changesNothing = !problem && !live.changed;

  const pickCourse = (code: string) => {
    setCourse(code);
    setPrereq(exprText(base.courses.find((c) => c.code === code)?.prereq ?? null));
    setStatus(base.courses.find((c) => c.code === code)?.status ?? 'PUBLISHED');
  };

  const tone = problem ? 'refuse' : live.check ? (live.check.result === 'ACCEPT' ? 'accept' : 'refuse') : '';
  return (
    <section className="card" aria-labelledby="editor-h">
      <header>
        <h2 id="editor-h">Edit (draft on {base.version})</h2>
        <p>Operations apply in order. The check runs in your browser on every change; the server runs it again at publish.</p>
      </header>
      <div className="card-body">
        {ops.length > 0 && (
          <ol aria-label="Draft operations" className="stack">
            {ops.map((o, i) => (
              <li key={i}>
                <code>{describe(o)}</code>{' '}
                <button type="button" className="btn-quiet" onClick={() => setOps(ops.filter((_, j) => j !== i))}>Remove</button>
              </li>
            ))}
          </ol>
        )}
        <div className="form-row">
          <div className="field">
            <label htmlFor="op-kind">Operation</label>
            <select id="op-kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              <option value="set_prereq">Set prerequisite</option>
              <option value="set_status">Set status</option>
              <option value="add_course">Add course</option>
            </select>
          </div>
          {kind === 'add_course' ? (
            <>
              <label className="field"><span>New code</span><input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="ACC-203" size={9} /></label>
              <label className="field"><span>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} size={24} /></label>
            </>
          ) : (
            <div className="field">
              <label htmlFor="op-course">Course</label>
              <select id="op-course" value={course} onChange={(e) => pickCourse(e.target.value)}>
                {codes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          {kind !== 'set_prereq' && (
            <div className="field">
              <label htmlFor="op-status">Status</label>
              <select id="op-status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
        {kind !== 'set_status' && (
          <label className="field">
            <span>Prerequisite</span>
            <input value={prereq} onChange={(e) => setPrereq(e.target.value)} size={48} className="mono" aria-describedby="expr-help" />
            <span id="expr-help" className="hint">A course code, <code>none</code>, or JSON: <code>{'{"all":["ACC-101",{"any":["ACC-102","DAT-101"]}]}'}</code> (two levels at most, alternating kinds).</span>
          </label>
        )}
        <div className="actions">
          <button type="button" className="btn-secondary" disabled={!pending.op || !!live.problem} onClick={() => pending.op && setOps([...ops, pending.op])}>Add to draft</button>
        </div>

        <div data-testid="live-verdict" className={`verdict ${tone}`}>
          {problem ? (
            <p role="status" aria-atomic="true" className="verdict-line bad">Cannot apply: {problem}</p>
          ) : live.check ? (
            <>
              <p role="status" aria-atomic="true" className="verdict-line">
                Verdict: <strong>{live.check.result}</strong>
                {changesNothing && <span className="muted"> (no change from {base.version} yet)</span>}
              </p>
              {live.check.cycles.length > 0 && (
                <ul aria-label="Cycle paths" className="chips">
                  {live.check.cycles.map((c) => <li key={c.join()} className="chip">{c.join(' -> ')}</li>)}
                </ul>
              )}
              {live.check.errors.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <caption>Every error, in stage order (G1–G5)</caption>
                    <thead><tr><th scope="col">Code</th><th scope="col">Detail</th></tr></thead>
                    <tbody>{live.check.errors.map((e, i) => <tr key={i}><td className="mono">{e.code}</td><td>{e.detail}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>

        <ActionForm action={props.publish}>
          <input type="hidden" name="baseVersionId" value={props.baseVersionId} />
          <input type="hidden" name="ops" value={JSON.stringify(effective)} />
          <div className="form-row">
            <label className="field"><span>New version name</span><input name="label" defaultValue={props.suggestedLabel} required maxLength={40} size={12} /></label>
            <button type="submit" disabled={!accepted}>Publish</button>
            <span className="muted">Publish will apply {effective.length} operation{effective.length === 1 ? '' : 's'}.</span>
          </div>
          {!accepted && <p className="hint muted">Publish is enabled when the draft changes the catalog and the live verdict is ACCEPT.</p>}
        </ActionForm>
        <p className="callout warn">Learners already enrolled keep their path under the version they started in. Anyone an edit would leave short of a prerequisite is reported as grandfathered when you publish; nobody is blocked.</p>
        <div className="actions">
          <ActionForm action={props.save}>
            <input type="hidden" name="baseVersionId" value={props.baseVersionId} />
            <input type="hidden" name="ops" value={JSON.stringify(effective)} />
            <button type="submit" className="btn-secondary" disabled={!!problem}>Save draft</button>
          </ActionForm>
          <ActionForm action={props.discard}>
            <button type="submit" className="btn-danger">Discard saved draft</button>
          </ActionForm>
        </div>
      </div>
    </section>
  );
}

function describe(o: EditOp): string {
  if (o.op === 'set_prereq') return `set_prereq ${o.course} = ${exprText(o.prereq)}`;
  if (o.op === 'set_status') return `set_status ${o.course} = ${o.status}`;
  return `add_course ${o.course} "${o.title}" ${o.status} requires ${exprText(o.prereq ?? null)}`;
}
