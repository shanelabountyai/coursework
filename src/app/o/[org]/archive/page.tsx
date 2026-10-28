import { requireOrg } from '@/core/authz/guards';
import { ActionForm } from '@/core/ui/action-form';
import { archiveOf, deletionBlocker, historyCounts } from '@/course/archive';
import { archiveOrgAction } from './actions';

export const metadata = { title: 'Archive org' };

// D-56: an org with append-only history is archived, never deleted. Owner only (org.delete).
export default async function Archive({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrg((await params).org, 'org.delete');
  const archived = await archiveOf(ctx.orgId);
  const counts = await historyCounts(ctx.orgId);
  const blocker = await deletionBlocker(ctx.orgId);
  return (
    <main>
      <header className="page-head">
        <div>
          <p className="eyebrow">Settings / archive</p>
          <h1>Archive this org</h1>
          <p className="lede">
            History rows: {Object.entries(counts).map(([t, n]) => `${t} ${n.toLocaleString('en-US')}`).join(' · ')}.{' '}
            {blocker ? 'Deleting is refused: ' + blocker : 'This org has no history yet and can still be deleted from Settings.'}
          </p>
        </div>
      </header>
      {archived ? (
        <p className="callout warn">Archived on {archived.archivedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC. Reason: {archived.reason}. There is no un-archive.</p>
      ) : (
        <section className="card" aria-labelledby="arch-h">
          <header><h2 id="arch-h">Archive</h2></header>
          <div className="card-body">
            <ActionForm action={archiveOrgAction.bind(null, ctx.slug)}>
              <p className="callout warn">Archiving keeps every row and every page readable and refuses every new write: no publish, completion, score or link. It cannot be undone.</p>
              <div className="form-row">
                <label className="field"><span>Reason</span><input name="reason" required maxLength={300} size={40} /></label>
                <label className="field"><span>Type <code>{ctx.slug}</code> to confirm</span><input name="confirm" autoComplete="off" required /></label>
                <button type="submit" className="btn-danger">Archive org</button>
              </div>
            </ActionForm>
          </div>
        </section>
      )}
    </main>
  );
}
