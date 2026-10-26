/**
 * Prerequisite expressions (G1, D-11): the closed vocabulary, its validation and its leaves.
 * Written from `docs/domain-brief.md` §4 and checked against `tools/courselib.py` `validate_expr` / `expr_leaves`.
 */
import { cmpStr, type Code, type Expr } from './types';

export type ExprErrorCode = 'PREREQ_SHAPE' | 'PREREQ_DEPTH' | 'PREREQ_SAME_KIND' | 'PREREQ_EMPTY_GROUP' | 'PREREQ_UNKNOWN';
export interface ExprError {
  code: ExprErrorCode;
  detail: string;
}

type Kind = 'all' | 'any';

/** The one shape test the whole engine relies on: a group is an object with exactly one key, `all` or `any`. */
function groupKind(e: unknown): Kind | null {
  if (typeof e !== 'object' || e === null || Array.isArray(e)) return null;
  const keys = Object.keys(e);
  if (keys.length !== 1) return null;
  return keys[0] === 'all' || keys[0] === 'any' ? keys[0] : null;
}

/** Every course code referenced by an expression, sorted and deduplicated (G2 reads these as edges). */
export function leaves(expr: Expr): Code[] {
  const out = new Set<Code>();
  const walk = (e: Expr): void => {
    if (e === null) return;
    if (typeof e === 'string') {
      out.add(e);
      return;
    }
    const children = 'all' in e ? e.all : e.any;
    for (const c of children ?? []) walk(c);
  };
  walk(expr);
  return [...out].sort(cmpStr);
}

/**
 * G1 validation of one course's expression against the set of known codes. The order of the
 * errors is the traversal order, as in the oracle; `validateCatalog` sorts them later.
 * A self-reference is not an expression error: it is a 1-cycle for G3.
 */
export function validateExpr(code: Code, expr: unknown, known: ReadonlySet<Code>): ExprError[] {
  const errors: ExprError[] = [];
  const walk = (e: unknown, depth: number, parentKind: Kind | null): void => {
    if (typeof e === 'string') {
      if (e !== code && !known.has(e)) errors.push({ code: 'PREREQ_UNKNOWN', detail: `${code} requires unknown ${e}` });
      return;
    }
    const kind = groupKind(e);
    if (kind === null) {
      errors.push({ code: 'PREREQ_SHAPE', detail: `${code}: group must be {"all":[..]} or {"any":[..]}` });
      return;
    }
    if (depth > 2) {
      errors.push({ code: 'PREREQ_DEPTH', detail: `${code}: group nested deeper than 2` });
      return;
    }
    if (kind === parentKind) {
      errors.push({ code: 'PREREQ_SAME_KIND', detail: `${code}: ${kind} nested directly inside ${kind}` });
      return;
    }
    const children = (e as Record<Kind, unknown>)[kind];
    if (!Array.isArray(children) || children.length === 0) {
      errors.push({ code: 'PREREQ_EMPTY_GROUP', detail: `${code}: empty ${kind} group` });
      return;
    }
    for (const c of children) walk(c, depth + 1, kind);
  };
  if (expr !== null && expr !== undefined) walk(expr, 1, null);
  return errors;
}

/** True when `validateExpr` would report nothing against `known`; a typed guard for callers. */
export function isWellFormed(code: Code, expr: unknown, known: ReadonlySet<Code>): expr is Expr {
  return validateExpr(code, expr, known).length === 0;
}
