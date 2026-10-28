/**
 * Publish checks and draft edits (G5, D-14, D-15). Stage order: expression errors (G1) and unknown
 * references → PREREQ_UNPUBLISHED → CYCLE (G3). Every error is reported, sorted by (stage, code,
 * detail); the headline is `REJECT:<first code>`. A catalog that passes is `ACCEPT`, and only an
 * `ACCEPT` may become a published version (non-negotiable 1; Phase 2 enforces it at the write).
 */
import { cycles as findCycles, prereqEdges } from './dag';
import { leaves, validateExpr, type ExprErrorCode } from './expr';
import { cmpStr, courseMap, STATUSES, type Catalog, type Code, type Course, type Expr, type Status } from './types';

export type PublishErrorCode = ExprErrorCode | 'EQUIV_UNKNOWN' | 'CERT_UNKNOWN' | 'PREREQ_UNPUBLISHED' | 'CYCLE';
export interface PublishError {
  code: PublishErrorCode;
  detail: string;
}
export interface PublishCheck {
  result: 'ACCEPT' | `REJECT:${PublishErrorCode}`;
  errors: PublishError[];
  /** G3 reported paths, components by smallest member. */
  cycles: Code[][];
}

const STAGE: Record<PublishErrorCode, number> = {
  PREREQ_SHAPE: 0,
  PREREQ_DEPTH: 0,
  PREREQ_SAME_KIND: 0,
  PREREQ_EMPTY_GROUP: 0,
  PREREQ_UNKNOWN: 0,
  EQUIV_UNKNOWN: 0,
  CERT_UNKNOWN: 0,
  PREREQ_UNPUBLISHED: 1,
  CYCLE: 2,
};

/** G5 for a whole catalog version. */
export function validateCatalog(catalog: Catalog): PublishCheck {
  const courses = courseMap(catalog);
  const known = new Set(courses.keys());
  const codes = [...courses.keys()].sort(cmpStr);
  const errors: PublishError[] = [];
  for (const code of codes) errors.push(...validateExpr(code, courses.get(code)!.prereq, known));
  for (const code of codes) {
    const c = courses.get(code)!;
    if (c.status !== 'PUBLISHED') continue;
    for (const leaf of leaves(c.prereq)) {
      const dep = courses.get(leaf);
      if (dep && dep.status !== 'PUBLISHED') errors.push({ code: 'PREREQ_UNPUBLISHED', detail: `${code} requires ${leaf} (${dep.status})` });
    }
  }
  for (const eq of catalog.equivalencies ?? []) {
    for (const k of ['satisfies', 'by'] as const) {
      if (!known.has(eq[k])) errors.push({ code: 'EQUIV_UNKNOWN', detail: `equivalency ${eq.by} -> ${eq.satisfies}: unknown ${eq[k]}` });
    }
  }
  for (const cert of catalog.certificates ?? []) {
    for (const code of cert.courses) if (!known.has(code)) errors.push({ code: 'CERT_UNKNOWN', detail: `${cert.code} lists unknown ${code}` });
  }
  const cycles = findCycles(prereqEdges(courses));
  for (const cyc of cycles) errors.push({ code: 'CYCLE', detail: cyc.join(' -> ') });
  errors.sort((a, b) => STAGE[a.code] - STAGE[b.code] || cmpStr(a.code, b.code) || cmpStr(a.detail, b.detail));
  return { result: errors.length ? `REJECT:${errors[0]!.code}` : 'ACCEPT', errors, cycles };
}

/** A draft edit: a list of operations against a version (brief §2). */
export type EditOp =
  | { op: 'set_prereq'; course: Code; prereq: Expr }
  | { op: 'set_status'; course: Code; status: Status }
  | { op: 'add_course'; course: Code; title: string; status: Status; prereq?: Expr };
export interface DraftEdit {
  id: string;
  note?: string;
  ops: EditOp[];
}

/**
 * Apply an edit to a deep copy of the catalog; the input is never mutated (V1: versions are immutable).
 * Courses are re-sorted by code, as the oracle does, so the content hash does not depend on op order.
 * Throws on an unknown op, an unknown course or a bad status: a malformed edit is a caller bug, not a verdict.
 */
export function applyEdit(catalog: Catalog, edit: DraftEdit): Catalog {
  const next: Catalog = structuredClone(catalog);
  delete next.hash; // the new content has a new hash; catalogHash() recomputes it
  const byCode = new Map<Code, Course>(next.courses.map((c) => [c.code, c]));
  for (const op of edit.ops) {
    switch (op.op) {
      case 'set_prereq': {
        const c = byCode.get(op.course);
        if (!c) throw new Error(`${edit.id}: set_prereq on unknown course ${op.course}`);
        c.prereq = op.prereq;
        break;
      }
      case 'set_status': {
        const c = byCode.get(op.course);
        if (!c) throw new Error(`${edit.id}: set_status on unknown course ${op.course}`);
        if (!STATUSES.includes(op.status)) throw new Error(`${edit.id}: unknown status ${String(op.status)}`);
        c.status = op.status;
        break;
      }
      case 'add_course': {
        if (byCode.has(op.course)) throw new Error(`${edit.id}: add_course for existing ${op.course}`);
        if (!STATUSES.includes(op.status)) throw new Error(`${edit.id}: unknown status ${String(op.status)}`);
        const c: Course = { code: op.course, title: op.title, status: op.status, prereq: op.prereq ?? null };
        next.courses.push(c);
        byCode.set(c.code, c);
        break;
      }
      default:
        throw new Error(`${edit.id}: unknown op ${String((op as { op: unknown }).op)}`);
    }
  }
  next.courses.sort((a, b) => cmpStr(a.code, b.code));
  return next;
}
