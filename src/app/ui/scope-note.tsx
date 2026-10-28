// The scope-honesty note (PRD banner, shortened for a screen; the README carries it verbatim). Every page that
// shows a number the product claims — eligibility, a path, progress, a grade, a publish verdict — renders it.
export function ScopeNote() {
  return (
    <aside className="scope" aria-label="Scope honesty">
      <strong>Scope honesty:</strong> learning project, synthetic data only. No real school, learner or transcript; nothing here is an
      accredited credential or a legal record. Eligibility, path, progress and grade numbers are agreement with the kit&apos;s own oracle on the
      kit&apos;s own data, never a claim about any institution&apos;s policy.
    </aside>
  );
}

export function ArchivedNote({ archived }: { archived: { archivedAt: Date; reason: string } | null }) {
  if (!archived) return null;
  return (
    <p className="panel warn" role="note">
      This org is archived (reason: {archived.reason}). Its history is kept and readable; every write is refused.
    </p>
  );
}
