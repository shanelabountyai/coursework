/**
 * Shortest path to a certificate (G8, D-18): exact over every combination of ANY-branch choices in
 * the certificate's upstream cone, fewest courses, ties by lexicographic comparison of the sorted
 * lists, returned in topological order (G4). Not greedy: on CERT-DATA-ADV two branches tie at 9
 * courses and the lexical rule picks the ACC branch (GG-17). The combination count is asserted
 * ≤ 4,096 and returned so `course:eval` can print it.
 */
import { prereqEdges, topoOrder } from './dag';
import type { LearnerState } from './eligibility';
import { leaves } from './expr';
import { cmpList, cmpStr, courseMap, type Catalog, type Certificate, type Code, type Course, type Expr } from './types';

export const MAX_COMBINATIONS = 4096;

/** Every ANY group under one course's expression, in pre-order, as (ordinal within the course, children). */
function anyGroups(expr: Expr, out: Expr[][]): void {
  if (expr === null || typeof expr === 'string') return;
  if ('any' in expr) {
    out.push(expr.any);
    for (const c of expr.any) anyGroups(c, out);
  } else {
    for (const c of expr.all) anyGroups(c, out);
  }
}

/**
 * Leaves that must still be passed under the chosen branches; satisfied leaves contribute nothing.
 * `choice` is indexed by the ANY group's ordinal within this course, counted in traversal order, which
 * equals the pre-order ordinal because depth ≤ 2 forbids an ANY inside a chosen ANY branch (G1).
 */
function neededUnder(expr: Expr, state: LearnerState, choice: readonly number[], counter: { i: number }): Set<Code> {
  if (expr === null) return new Set();
  if (typeof expr === 'string') return state.satisfied(expr) ? new Set() : new Set([expr]);
  if ('all' in expr) {
    const out = new Set<Code>();
    for (const c of expr.all) for (const x of neededUnder(c, state, choice, counter)) out.add(x);
    return out;
  }
  const chosen = expr.any[choice[counter.i++]!]!;
  if (chosen !== null && typeof chosen !== 'string' && 'any' in chosen) throw new Error('neededUnder: any inside any (G1 forbids it)');
  return neededUnder(chosen, state, choice, counter);
}

export interface ShortestPath {
  /** Courses still to pass, in topological order (G4). Empty when the certificate is complete. */
  path: Code[];
  /** Branch combinations examined (≥ 1). */
  combinations: number;
}

export function shortestPath(catalog: Catalog, cert: Certificate, state: LearnerState): ShortestPath {
  const courses = courseMap(catalog);
  // upstream cone of the certificate: all leaves, all branches
  const cone = new Set<Code>();
  const frontier = cert.courses.filter((c) => courses.has(c));
  while (frontier.length) {
    const c = frontier.pop()!;
    if (cone.has(c)) continue;
    cone.add(c);
    for (const l of leaves(courses.get(c)!.prereq)) if (courses.has(l)) frontier.push(l);
  }
  // one ordinal-indexed list of ANY groups per course in the cone
  const groupsByCourse = new Map<Code, Expr[][]>();
  const sizes: number[] = [];
  const keys: { course: Code; ordinal: number }[] = [];
  for (const code of [...cone].sort(cmpStr)) {
    const gs: Expr[][] = [];
    anyGroups(courses.get(code)!.prereq, gs);
    groupsByCourse.set(code, gs);
    gs.forEach((g, ordinal) => {
      keys.push({ course: code, ordinal });
      sizes.push(g.length);
    });
  }
  let total = 1;
  for (const n of sizes) total *= n;
  if (total > MAX_COMBINATIONS) throw new Error(`${cert.code}: ${total} branch combinations; shrink the cone or revisit D-18`);

  let best: Code[] | null = null;
  let combinations = 0;
  const pick = new Array<number>(sizes.length).fill(0);
  for (;;) {
    combinations++;
    // choices per course, by ordinal
    const choice = new Map<Code, number[]>();
    keys.forEach((k, i) => {
      const arr = choice.get(k.course) ?? [];
      arr[k.ordinal] = pick[i]!;
      choice.set(k.course, arr);
    });
    const needed = new Set<Code>(cert.courses.filter((c) => !state.satisfied(c)));
    const todo = [...needed];
    while (todo.length) {
      const c = todo.pop()!;
      const course: Course | undefined = courses.get(c);
      if (!course) continue; // an unknown certificate course is a CERT_UNKNOWN publish error, not a path
      const more = neededUnder(course.prereq, state, choice.get(c) ?? [], { i: 0 });
      for (const m of more) {
        if (!needed.has(m)) {
          needed.add(m);
          todo.push(m);
        }
      }
    }
    const cand = [...needed].sort(cmpStr);
    if (best === null || cand.length < best.length || (cand.length === best.length && cmpList(cand, best) < 0)) best = cand;
    // next combination (odometer over `sizes`, last key fastest, like itertools.product)
    let i = sizes.length - 1;
    while (i >= 0 && pick[i]! + 1 >= sizes[i]!) pick[i--] = 0;
    if (i < 0) break;
    pick[i]!++;
  }
  // topological order of the induced subgraph
  const succ = prereqEdges(courses);
  const bestSet = new Set(best!);
  const sub = new Map<Code, Code[]>([...bestSet].map((c) => [c, (succ.get(c) ?? []).filter((w) => bestSet.has(w))]));
  return { path: topoOrder(sub), combinations };
}

/** P1: certificate progress = satisfied required courses / required, as bp, floor. */
export function certificateProgress(cert: Certificate, state: LearnerState): { required: number; satisfied: number; progress_bp: number } {
  const required = cert.courses.length;
  if (required === 0) throw new Error(`${cert.code}: a certificate with no courses has no progress`);
  const satisfied = cert.courses.filter((c) => state.satisfied(c)).length;
  return { required, satisfied, progress_bp: Math.floor((satisfied * 10000) / required) };
}
