import { Refused } from '@/core/errors';
import { deletionBlocker } from '@/course/archive';

// Clone-owned, like cron-jobs.ts: what must happen before an org is deleted. Throwing stops the
// deletion. (Billing was removed by the manifest, D-54, which took its `// billing` lines with it.)
// D-56: an org with append-only history (or an archive row) is never deleted. The template's deleteOrg
// calls this hook after its own checks and before its delete, so a Refused here reaches the danger page
// as a sentence; without it the Restrict foreign keys would fail the delete with a database error.
export async function beforeOrgDelete(orgId: string): Promise<void> {
  const blocker = await deletionBlocker(orgId);
  if (blocker) throw new Refused(blocker);
}
