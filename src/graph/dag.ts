/**
 * The prerequisite graph (G2–G4): structural edges, Tarjan's strongly connected components with
 * lexical visiting, the reported cycle path, and Kahn's topological order with a lexical tiebreak.
 * Written from `docs/domain-brief.md` §4; the visiting orders are the oracle's so that the two
 * engines report the same path for the same cycle (D-12, D-13).
 */
import { leaves } from './expr';
import { cmpStr, type Code, type Course } from './types';

/** G2: successors[p] = the courses that list p as a leaf, sorted. ALL and ANY alike; every status. Unknown leaves are not edges. */
export type Successors = ReadonlyMap<Code, readonly Code[]>;

export function prereqEdges(courses: ReadonlyMap<Code, Course>): Successors {
  const succ = new Map<Code, Set<Code>>();
  for (const code of courses.keys()) succ.set(code, new Set());
  for (const code of [...courses.keys()].sort(cmpStr)) {
    for (const leaf of leaves(courses.get(code)!.prereq)) succ.get(leaf)?.add(code);
  }
  return new Map([...succ].map(([k, v]) => [k, [...v].sort(cmpStr)]));
}

/** Number of edges in the graph = Σ |leaves(course)| (the brief's "56 edges" counts unknown leaves too, as the oracle does). */
export function edgeCount(courses: ReadonlyMap<Code, Course>): number {
  let n = 0;
  for (const c of courses.values()) n += leaves(c.prereq).length;
  return n;
}

/**
 * G3: Tarjan, nodes and successors visited in lexical order. Returns only the components that
 * contain a cycle (size > 1, or one node with a self-edge), each sorted, ordered by smallest member.
 * Iterative so a 10,000-course chain cannot overflow the stack; the visiting order is the recursive one.
 */
export function cyclicComponents(succ: Successors): Code[][] {
  const index = new Map<Code, number>();
  const low = new Map<Code, number>();
  const on = new Set<Code>();
  const stack: Code[] = [];
  const comps: Code[][] = [];
  let counter = 0;

  const visit = (root: Code): void => {
    // explicit frames: [node, position in its successor list]
    const frames: { v: Code; i: number }[] = [{ v: root, i: 0 }];
    index.set(root, counter);
    low.set(root, counter);
    counter++;
    stack.push(root);
    on.add(root);
    while (frames.length) {
      const f = frames[frames.length - 1]!;
      const ws = succ.get(f.v) ?? [];
      if (f.i < ws.length) {
        const w = ws[f.i++]!;
        if (!index.has(w)) {
          index.set(w, counter);
          low.set(w, counter);
          counter++;
          stack.push(w);
          on.add(w);
          frames.push({ v: w, i: 0 });
        } else if (on.has(w)) {
          low.set(f.v, Math.min(low.get(f.v)!, index.get(w)!));
        }
        continue;
      }
      // all successors done: close the component if this is its root, then propagate low to the parent
      if (low.get(f.v) === index.get(f.v)) {
        const comp: Code[] = [];
        for (;;) {
          const w = stack.pop()!;
          on.delete(w);
          comp.push(w);
          if (w === f.v) break;
        }
        if (comp.length > 1 || (succ.get(f.v) ?? []).includes(f.v)) comps.push(comp.sort(cmpStr));
      }
      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent) low.set(parent.v, Math.min(low.get(parent.v)!, low.get(f.v)!));
    }
  };

  for (const v of [...succ.keys()].sort(cmpStr)) if (!index.has(v)) visit(v);
  return comps.sort((a, b) => cmpStr(a[0]!, b[0]!));
}

/**
 * G3: the reported cycle for one component. Start at the lexically smallest member s; breadth-first
 * inside the component expanding successors in lexical order; the first edge back into s closes it.
 * The path is `[s, …, u, s]` in edge direction (prerequisite → dependent). A self-reference is `[s, s]`.
 */
export function cyclePath(comp: readonly Code[], succ: Successors): Code[] {
  const members = new Set(comp);
  const s = comp[0]!;
  if ((succ.get(s) ?? []).includes(s)) return [s, s];
  const parent = new Map<Code, Code | null>([[s, null]]);
  const queue: Code[] = [s];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++]!;
    for (const w of succ.get(u) ?? []) {
      if (!members.has(w)) continue;
      if (w === s) {
        const path: Code[] = [u];
        for (let p = parent.get(u); p !== null && p !== undefined; p = parent.get(p)) path.push(p);
        path.reverse();
        path.push(s);
        return path;
      }
      if (!parent.has(w)) {
        parent.set(w, u);
        queue.push(w);
      }
    }
  }
  throw new Error('cyclePath: component without a cycle');
}

/** Every cycle's reported path, components by smallest member (G3). Empty when the graph is a DAG. */
export function cycles(succ: Successors): Code[][] {
  return cyclicComponents(succ).map((comp) => cyclePath(comp, succ));
}

/**
 * G4: Kahn's algorithm; among ready courses the lexically smallest goes first. Drafts and retired
 * courses are ordered too. On a cyclic graph the courses inside cycles are left out (the oracle's
 * heap simply never reaches them); callers check `cycles()` first.
 */
export function topoOrder(succ: Successors): Code[] {
  const indeg = new Map<Code, number>();
  for (const v of succ.keys()) indeg.set(v, 0);
  for (const ws of succ.values()) for (const w of ws) indeg.set(w, (indeg.get(w) ?? 0) + 1);
  const ready = new MinHeap();
  for (const [v, d] of indeg) if (d === 0) ready.push(v);
  const out: Code[] = [];
  while (ready.size) {
    const v = ready.pop();
    out.push(v);
    for (const w of succ.get(v) ?? []) {
      const d = indeg.get(w)! - 1;
      indeg.set(w, d);
      if (d === 0) ready.push(w);
    }
  }
  return out;
}

/** Binary min-heap on strings. A sorted insert would do for 40 courses; the heap keeps G4 O(E log V) for a real catalog. */
class MinHeap {
  private a: string[] = [];
  get size(): number {
    return this.a.length;
  }
  push(x: string): void {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (cmpStr(a[p]!, a[i]!) <= 0) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): string {
    const a = this.a;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && cmpStr(a[l]!, a[m]!) < 0) m = l;
        if (r < a.length && cmpStr(a[r]!, a[m]!) < 0) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}
