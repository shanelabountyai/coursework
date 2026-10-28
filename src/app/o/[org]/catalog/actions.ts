'use server';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { orgAction, ref } from '@/core/authz/action';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { discardDraft, parseOps, publishDraft, saveDraft } from '@/course/drafts';

// D-52 / D-53: drafts and publish are owner/admin (`org.update`). The browser's live verdict is never
// trusted: publishDraft → publishEdit re-runs G1–G5 here and writes only what the engine accepts.

const opsOf = (text: string) => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Refused('The draft could not be read. Reload the page and try again.');
  }
  return parseOps(raw);
};

const ownVersion = async (orgId: string, id: string) => {
  if (!(await db.catalogVersion.findFirst({ where: { id, orgId }, select: { id: true } }))) notFound(); // not yours ≡ not found
};

const draftInput = z.object({ baseVersionId: ref('catalogVersion'), ops: z.string().max(20_000) });

export const saveDraftAction = orgAction('org.update', draftInput, async (ctx, input) => {
  await ownVersion(ctx.orgId, input.baseVersionId);
  await saveDraft({ orgId: ctx.orgId, userId: ctx.userId }, { baseVersionId: input.baseVersionId, ops: opsOf(input.ops) });
  revalidatePath(`/o/${ctx.slug}/catalog`);
  return { notice: 'Draft saved.' };
});

export const discardDraftAction = orgAction('org.update', z.object({}), async (ctx) => {
  await discardDraft({ orgId: ctx.orgId, userId: ctx.userId });
  revalidatePath(`/o/${ctx.slug}/catalog`);
  return { notice: 'Draft discarded.' };
});

/** Save the ops as the draft, then publish it through the engine. */
export const publishDraftAction = orgAction('org.update', draftInput.extend({ label: z.string().max(40) }), async (ctx, input) => {
  const actor = { orgId: ctx.orgId, userId: ctx.userId };
  await ownVersion(ctx.orgId, input.baseVersionId);
  await saveDraft(actor, { baseVersionId: input.baseVersionId, ops: opsOf(input.ops) });
  const r = await publishDraft(actor, input.label.trim());
  revalidatePath(`/o/${ctx.slug}/catalog`);
  if (!r.version) return { error: `Refused by the server's check: ${r.check.result}. ${r.check.errors.map((e) => `${e.code} ${e.detail}`).join('; ')}` };
  return { notice: `Published ${r.version.label} (${r.version.hash.slice(0, 12)}…): ${r.grandfathered.length} grandfathered.` };
});
