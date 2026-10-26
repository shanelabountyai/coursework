/**
 * Completion events and the eligibility / path reads (G6–G8, V2, P2; task 2.6). A completion is
 * append-only and records the version it was evaluated under. Reads build a LearnerState from rows
 * and call the engine; nothing here decides a rule.
 */
import { audit } from '@/core/audit';
import { db } from '@/core/db';
import { eligibility, type Eligibility, type LearnerState } from '@/graph/eligibility';
import { certificateProgress, shortestPath, type ShortestPath } from '@/graph/path';

export type CertificateProgress = ReturnType<typeof certificateProgress>;
import { cmpStr, courseMap, type Catalog, type Code } from '@/graph/types';
import type { Actor } from './actor';
import { learnerStateFor } from './state';
import { loadVersion, type Tx } from './versions';

export type CompletionKind = 'PASS' | 'FAIL';

/** Append one completion. `day` is a calendar day string; `versionId` is the version it was evaluated under (V2). */
export async function recordCompletion(actor: Actor, input: { learnerId: string; course: Code; kind: CompletionKind; day: string; versionId: string }, tx?: Tx) {
  const run = async (t: Tx) => {
    const learner = await t.learner.findUniqueOrThrow({ where: { id: input.learnerId }, select: { orgId: true } });
    if (learner.orgId !== actor.orgId) throw new Error('recordCompletion: learner belongs to another org');
    const { catalog } = await loadVersion(input.versionId, t);
    if (!courseMap(catalog).has(input.course)) throw new Error(`recordCompletion: ${input.course} is not in version ${catalog.version}`);
    const ev = await t.completionEvent.create({ data: { orgId: actor.orgId, learnerId: input.learnerId, course: input.course, kind: input.kind, day: input.day, catalogVersionId: input.versionId, actorUserId: actor.userId } });
    await audit(actor, 'completion.recorded', { targetType: 'CompletionEvent', targetId: ev.id, data: { learnerId: input.learnerId, course: input.course, kind: input.kind, day: input.day, versionId: input.versionId } }, t);
    return ev;
  };
  return tx ? run(tx) : db.$transaction(run);
}

export interface EligibilityView {
  versionId: string;
  versionLabel: string;
  /** Every course of the version, by code, in code order. */
  courses: { code: Code; status: Eligibility['status']; missing: Code[] }[];
}

async function stateAndCatalog(learnerId: string, versionId: string, tx: Tx): Promise<{ catalog: Catalog; state: LearnerState; label: string }> {
  const { row, catalog } = await loadVersion(versionId, tx);
  const state = await learnerStateFor(learnerId, catalog, tx);
  return { catalog, state, label: row.label };
}

export function eligibilityOver(catalog: Catalog, state: LearnerState): EligibilityView['courses'] {
  return [...catalog.courses]
    .sort((a, b) => cmpStr(a.code, b.code))
    .map((c) => {
      const e = eligibility(c, state);
      return { code: c.code, status: e.status, missing: e.missing };
    });
}

/** G7 for every course of one version. Defaults to the learner's enrolled version (P2). */
export async function eligibilityFor(learnerId: string, versionId?: string, tx: Tx = db): Promise<EligibilityView> {
  const vid = versionId ?? (await tx.learner.findUniqueOrThrow({ where: { id: learnerId }, select: { enrolledVersionId: true } })).enrolledVersionId;
  const { catalog, state, label } = await stateAndCatalog(learnerId, vid, tx);
  return { versionId: vid, versionLabel: label, courses: eligibilityOver(catalog, state) };
}

export interface PathView {
  versionId: string;
  certificate: Code;
  progress: CertificateProgress;
  path: ShortestPath;
}

/** G8 + P2 certificate progress against one version (default: the enrolled one). */
export async function pathFor(learnerId: string, certificate?: Code, versionId?: string, tx: Tx = db): Promise<PathView> {
  const learner = await tx.learner.findUniqueOrThrow({ where: { id: learnerId }, select: { enrolledVersionId: true, targetCertificate: true } });
  const vid = versionId ?? learner.enrolledVersionId;
  const code = certificate ?? learner.targetCertificate;
  const { catalog, state } = await stateAndCatalog(learnerId, vid, tx);
  const cert = catalog.certificates.find((c) => c.code === code);
  if (!cert) throw new Error(`pathFor: version ${catalog.version} has no certificate ${code}`);
  return { versionId: vid, certificate: code, progress: certificateProgress(cert, state), path: shortestPath(catalog, cert, state) };
}

/**
 * P2 / O-7: re-evaluation against another version is explicit and returns BOTH answers; it writes nothing
 * and changes no enrolled version.
 */
export async function reevaluate(learnerId: string, againstVersionId: string, tx: Tx = db): Promise<{ enrolled: EligibilityView; against: EligibilityView }> {
  const enrolled = await eligibilityFor(learnerId, undefined, tx);
  const against = await eligibilityFor(learnerId, againstVersionId, tx);
  return { enrolled, against };
}
