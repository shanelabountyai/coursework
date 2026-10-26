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
      <h1>Archive this org</h1>
      <p>
        History rows: {Object.entries(counts).map(([t, n]) => `${t} ${n.toLocaleString('en-US')}`).join(' · ')}.{' '}
        {blocker ? 'Deleting is refused: ' + blocker : 'This org has no history yet and can still be deleted from Settings.'}
      </p>
      {archived ? (
        <p className="panel">Archived on {archived.archivedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC. Reason: {archived.reason}. There is no un-archive.</p>
      ) : (
        <ActionForm action={archiveOrgAction.bind(null, ctx.slug)}>
          <p>Archiving keeps every row and every page readable and refuses every new write: no publish, completion, score or link. It cannot be undone.</p>
          <label>Reason <input name="reason" required maxLength={300} size={40} /></label>
          <label>
            Type <code>{ctx.slug}</code> to confirm <input name="confirm" autoComplete="off" required />
          </label>
          <button type="submit">Archive org</button>
        </ActionForm>
      )}
    </main>
  );
}
