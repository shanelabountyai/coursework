// Prerequisite expressions as text on a screen (G1 shapes): none, a bare code, or the JSON of an all/any group.
// Shared by the server pages and the browser editor; pure.
import type { Expr } from '@/graph/types';

export const CODE_RE = /^[A-Z]{2,5}-\d{3}$/;

export function exprText(e: Expr | undefined): string {
  if (e === null || e === undefined) return 'none';
  if (typeof e === 'string') return e;
  return JSON.stringify(e);
}

/** Text typed in the editor → an expression. A bare code or "none" is accepted as typed; anything else must be JSON. */
export function parseExprText(text: string): { ok: true; expr: Expr } | { ok: false; message: string } {
  const t = text.trim();
  if (t === '' || t.toLowerCase() === 'none' || t === 'null') return { ok: true, expr: null };
  if (CODE_RE.test(t)) return { ok: true, expr: t };
  try {
    return { ok: true, expr: JSON.parse(t) as Expr };
  } catch {
    return { ok: false, message: 'Not a course code, "none", or JSON like {"all":["ACC-101","ACC-102"]}.' };
  }
}
