/** Catalog vocabulary (brief §2). Plain data; the engine never mutates what it is given. */

export type Code = string;
export type Status = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
export const STATUSES: readonly Status[] = ['DRAFT', 'PUBLISHED', 'RETIRED'];

/** G1: `null` · a code · `{all:[…]}` · `{any:[…]}`; children are codes or groups of the other kind; depth ≤ 2. */
export type Expr = null | Code | { all: Expr[] } | { any: Expr[] };

export interface Course {
  code: Code;
  title: string;
  status: Status;
  prereq: Expr;
}

export interface Equivalency {
  satisfies: Code;
  by: Code;
  reason: string;
}

export interface Certificate {
  code: Code;
  title: string;
  courses: Code[];
}

export interface Catalog {
  version: string;
  courses: Course[];
  equivalencies: Equivalency[];
  certificates: Certificate[];
  /** V1 content hash as stored; `catalogHash()` recomputes it. */
  hash?: string;
}

export type CourseMap = ReadonlyMap<Code, Course>;

export function courseMap(catalog: Catalog): CourseMap {
  return new Map(catalog.courses.map((c) => [c.code, c]));
}

/** Python-compatible string comparison for sort callbacks: ASCII codes compare the same by code point and by UTF-16 unit. */
export function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Lexicographic comparison of two string lists (Python's list `<`). */
export function cmpList(a: readonly string[], b: readonly string[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = cmpStr(a[i]!, b[i]!);
    if (c !== 0) return c;
  }
  return a.length - b.length;
}
