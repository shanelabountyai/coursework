'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertFresh } from '@/core/auth/session';
import { orgAction } from '@/core/authz/action';
import { Refused } from '@/core/errors';
import { archiveOrg } from '@/course/archive';

// D-56: owner-only (`org.delete`, the template's owner grant). Insert-only; there is no un-archive.
// A stale sign-in (ReauthRequired) or a demo session comes back as the form's error sentence, as on delete-org.
export const archiveOrgAction = orgAction('org.delete', z.object({ confirm: z.string().max(80), reason: z.string().max(300) }), async (ctx, input) => {
  assertFresh(ctx.session); // irreversible, like the template's delete-org: a fresh sign-in, and never a shared demo account
  if (input.confirm.trim() !== ctx.slug) throw new Refused('Type the org address exactly to confirm.');
  await archiveOrg({ orgId: ctx.orgId, userId: ctx.userId }, input.reason);
  revalidatePath(`/o/${ctx.slug}`);
  return { notice: 'Archived. History is kept and readable; nothing new can be written.' };
});
