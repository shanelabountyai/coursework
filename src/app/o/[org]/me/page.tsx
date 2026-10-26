import { redirect } from 'next/navigation';
import { requireOrg } from '@/core/authz/guards';
import { viewerLearner } from '@/course/access';

// D-51: a linked learner's own path. Staff and unlinked members are told why there is nothing here.
export default async function Me({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrg((await params).org);
  const me = await viewerLearner(ctx);
  if (me) redirect(`/o/${ctx.slug}/learners/${me.code}`);
  return (
    <main>
      <h1>My path</h1>
      <p>Your account is not linked to a learner record in this org. An admin links a member to a learner explicitly (nothing is matched by email).</p>
    </main>
  );
}
