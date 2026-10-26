/**
 * D-52 (owner decision 2026-10-26): one stored, mutable draft per editor. The editor page re-runs the
 * engine on every change in the browser (the engine is pure and ships unchanged); the draft row only
 * remembers the ops between visits. Publishing a draft goes through publishEdit — the one CatalogVersion
 * insert — which re-runs G1–G5 on the server and never trusts the browser's verdict.
 */
import { audit } from '@/core/audit';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import type { Prisma } from '@/generated/prisma/client';
import { applyEdit, type DraftEdit, type EditOp } from '@/graph/publish';
import { STATUSES, type Expr, type Status } from '@/graph/types';
import type { Actor } from './actor';
import { assertWritable } from './archive';
import { publishEdit, type PublishResult } from './publish';
import { loadVersion, type Tx } from './versions';

export const MAX_OPS = 50;
const CODE = /^[A-Z]{2,5}-\d{3}$/;
export const LABEL = /^[A-Za-z0-9._-]{1,40}$/;

/** A JSON value only (an expression is checked by the engine, G1 — a malformed one is a verdict, not a caller bug). */
function isJson(v: unknown, depth = 0): boolean {
  if (depth > 6) return false;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isSafeInteger(v);
  if (Array.isArray(v)) return v.every((x) => isJson(x, depth + 1));
  if (typeof v === 'object') return Object.values(v as object).every((x) => isJson(x, depth + 1));
  return false;
}

/** Structural check of a submitted op list. Refused (a sentence) on anything that is not an EditOp[]. */
export function parseOps(raw: unknown): EditOp[] {
  if (!Array.isArray(raw)) throw new Refused('The draft must be a list of operations.');
  if (raw.length > MAX_OPS) throw new Refused(`A draft holds at most ${MAX_OPS} operations.`);
  return raw.map((o, i) => {
    const op = o as Record<string, unknown>;
    const at = `Operation ${i + 1}`;
    if (!op || typeof op !== 'object') throw new Refused(`${at} is not an object.`);
    if (typeof op.course !== 'string' || !CODE.test(op.course)) throw new Refused(`${at}: course must be a code like ACC-101.`);
    const prereq = (p: unknown): Expr => {
      if (!isJson(p)) throw new Refused(`${at}: the prerequisite is not plain JSON.`);
      return p as Expr;
    };
    const status = (s: unknown): Status => {
      if (!(STATUSES as readonly unknown[]).includes(s)) throw new Refused(`${at}: status must be one of ${STATUSES.join(', ')}.`);
      return s as Status;
    };
    switch (op.op) {
      case 'set_prereq':
        return { op: 'set_prereq', course: op.course, prereq: prereq(op.prereq ?? null) };
      case 'set_status':
        return { op: 'set_status', course: op.course, status: status(op.status) };
      case 'add_course': {
        if (typeof op.title !== 'string' || !op.title.trim() || op.title.length > 120) throw new Refused(`${at}: a new course needs a title (at most 120 characters).`);
        return { op: 'add_course', course: op.course, title: op.title.trim(), status: status(op.status), prereq: prereq(op.prereq ?? null) };
      }
      default:
        throw new Refused(`${at}: unknown operation ${JSON.stringify(op.op)}.`);
    }
  });
}

export async function draftFor(orgId: string, editorUserId: string, tx: Tx = db) {
  return tx.catalogDraft.findUnique({ where: { orgId_editorUserId: { orgId, editorUserId } } });
}

function requireEditor(actor: Actor): string {
  if (!actor.userId) throw new Error('drafts: a draft belongs to a signed-in editor');
  return actor.userId;
}

/** Upsert the editor's draft. The ops must apply to the base version (an unknown course is refused here); the G5 verdict is NOT required — a draft may hold a cycle while it is being fixed. */
export async function saveDraft(actor: Actor, input: { baseVersionId: string; ops: EditOp[] }, tx?: Tx) {
  const editor = requireEditor(actor);
  const run = async (t: Tx) => {
    await assertWritable(actor.orgId, t);
    const base = await t.catalogVersion.findFirst({ where: { id: input.baseVersionId, orgId: actor.orgId }, select: { id: true } });
    if (!base) throw new Refused('No such catalog version in this org.');
    const { catalog } = await loadVersion(base.id, t);
    try {
      applyEdit(catalog, { id: 'draft', ops: input.ops });
    } catch (e) {
      throw new Refused((e as Error).message.replace(/^draft: /, ''));
    }
    const ops = input.ops as unknown as Prisma.InputJsonArray;
    const row = await t.catalogDraft.upsert({
      where: { orgId_editorUserId: { orgId: actor.orgId, editorUserId: editor } },
      create: { orgId: actor.orgId, editorUserId: editor, baseVersionId: base.id, ops },
      update: { baseVersionId: base.id, ops },
    });
    await audit(actor, 'catalog.draft_saved', { targetType: 'CatalogDraft', targetId: row.id, data: { baseVersionId: base.id, ops: input.ops.length } }, t);
    return row;
  };
  return tx ? run(tx) : db.$transaction(run);
}

export async function discardDraft(actor: Actor, tx?: Tx) {
  const editor = requireEditor(actor);
  const run = async (t: Tx) => {
    await assertWritable(actor.orgId, t);
    const n = await t.catalogDraft.deleteMany({ where: { orgId: actor.orgId, editorUserId: editor } });
    if (n.count) await audit(actor, 'catalog.draft_discarded', { targetType: 'CatalogDraft' }, t);
    return n.count;
  };
  return tx ? run(tx) : db.$transaction(run);
}

/**
 * Publish the editor's draft through the engine. ACCEPT → the draft is cleared; REJECT → it stays for the
 * next edit. The clear is a second statement after publishEdit's own transaction: if it failed the version
 * would still stand and the draft would merely linger, which is the safe direction.
 */
export async function publishDraft(actor: Actor, label: string): Promise<PublishResult> {
  const editor = requireEditor(actor);
  if (!LABEL.test(label)) throw new Refused('A version name is 1–40 letters, digits, dots, dashes or underscores.');
  await assertWritable(actor.orgId);
  const draft = await draftFor(actor.orgId, editor);
  if (!draft) throw new Refused('There is no draft to publish.');
  const ops = parseOps(draft.ops);
  if (!ops.length) throw new Refused('The draft has no changes.');
  if (await db.catalogVersion.findUnique({ where: { orgId_label: { orgId: actor.orgId, label } } })) throw new Refused(`A version named ${label} already exists.`);
  const edit: DraftEdit = { id: `DRAFT-${draft.id.slice(0, 8)}`, ops };
  const result = await publishEdit(actor, draft.baseVersionId, edit, label);
  if (result.version) await db.catalogDraft.deleteMany({ where: { id: draft.id } });
  return result;
}
