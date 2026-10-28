"""Coursework — the two pure engines as executable spec (test oracle, never product code).

Everything in docs/domain-brief.md §4 (prerequisite graph, rules G1–G9), §5 (drip, rules
R1–R3) and §6 (gradebook, rules S1–S9) is implemented here, stdlib only. The TypeScript
engines under src/graph/ and src/grades/ are written from the brief and must agree with
this file on every fixture row and every golden case. No clock, no randomness, no I/O.

Numbers: scores are integer hundredths of a percent ("hp": 8550 = 85.50%); weights are
basis points ("bp", sum 10000); intermediate grade arithmetic is exact rationals
(fractions.Fraction here; integer numerator/denominator with BigInt in TypeScript) and
is rounded once, half-up, at the final grade (S8). Days are "YYYY-MM-DD" strings on a
calendar axis; the only arithmetic on them is days_from_civil/civil_from_days below.
"""
from __future__ import annotations

import hashlib
import heapq
import json
from fractions import Fraction
from itertools import product
from typing import Any

# ---------------------------------------------------------------- canonical JSON / hashes

def canonical(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def catalog_hash(catalog: dict) -> str:
    """Content hash of a catalog version: courses, equivalencies, certificates (not the label)."""
    body = {k: catalog[k] for k in ("courses", "equivalencies", "certificates")}
    return sha256_text(canonical(body))


# ---------------------------------------------------------------- calendar days (no timezone)

def days_from_civil(day: str) -> int:
    """'YYYY-MM-DD' -> days since 1970-01-01 (Howard Hinnant's algorithm). Pure integer math."""
    y, m, d = int(day[0:4]), int(day[5:7]), int(day[8:10])
    y -= m <= 2
    era = (y if y >= 0 else y - 399) // 400
    yoe = y - era * 400
    doy = (153 * (m + (-3 if m > 2 else 9)) + 2) // 5 + d - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    return era * 146097 + doe - 719468


def civil_from_days(z: int) -> str:
    z += 719468
    era = (z if z >= 0 else z - 146096) // 146097
    doe = z - era * 146097
    yoe = (doe - doe // 1460 + doe // 36524 - doe // 146096) // 365
    y = yoe + era * 400
    doy = doe - (365 * yoe + yoe // 4 - yoe // 100)
    mp = (5 * doy + 2) // 153
    d = doy - (153 * mp + 2) // 5 + 1
    m = mp + 3 if mp < 10 else mp - 9
    y += m <= 2
    return f"{y:04d}-{m:02d}-{d:02d}"


def add_days(day: str, n: int) -> str:
    return civil_from_days(days_from_civil(day) + n)


# ---------------------------------------------------------------- prerequisite expressions (G1)

STATUSES = ("DRAFT", "PUBLISHED", "RETIRED")


def expr_leaves(expr: Any) -> list[str]:
    """Every course code referenced by an expression, sorted, deduplicated."""
    out: set[str] = set()

    def walk(e: Any) -> None:
        if e is None:
            return
        if isinstance(e, str):
            out.add(e)
            return
        for child in (e.get("all") or e.get("any") or []):
            walk(child)

    walk(expr)
    return sorted(out)


def validate_expr(code: str, expr: Any, known: set[str]) -> list[tuple[str, str]]:
    """G1: closed vocabulary. Returns [(error_code, detail)] in a deterministic order."""
    errors: list[tuple[str, str]] = []

    def walk(e: Any, depth: int, parent_kind: str | None) -> None:
        if isinstance(e, str):
            if e == code:
                pass  # self-reference is reported by the cycle check (G3) as a 1-cycle
            elif e not in known:
                errors.append(("PREREQ_UNKNOWN", f"{code} requires unknown {e}"))
            return
        if not isinstance(e, dict) or len(e) != 1 or next(iter(e)) not in ("all", "any"):
            errors.append(("PREREQ_SHAPE", f"{code}: group must be {{\"all\":[..]}} or {{\"any\":[..]}}"))
            return
        if depth > 2:
            errors.append(("PREREQ_DEPTH", f"{code}: group nested deeper than 2"))
            return
        kind = next(iter(e))
        if kind == parent_kind:
            errors.append(("PREREQ_SAME_KIND", f"{code}: {kind} nested directly inside {kind}"))
            return
        children = e[kind]
        if not isinstance(children, list) or len(children) == 0:
            errors.append(("PREREQ_EMPTY_GROUP", f"{code}: empty {kind} group"))
            return
        for c in children:
            walk(c, depth + 1, kind)

    if expr is not None:
        walk(expr, 1, None)
    return errors


# ---------------------------------------------------------------- graph (G2–G4)

def prereq_edges(courses: dict[str, dict]) -> dict[str, list[str]]:
    """G2: successors[p] = courses that list p as a leaf, sorted. Structural: ALL and ANY alike."""
    succ: dict[str, list[str]] = {c: [] for c in courses}
    for code in sorted(courses):
        for leaf in expr_leaves(courses[code].get("prereq")):
            if leaf in succ:
                succ[leaf].append(code)
    for k in succ:
        succ[k] = sorted(set(succ[k]))
    return succ


def strongly_connected(succ: dict[str, list[str]]) -> list[list[str]]:
    """Tarjan, nodes visited in lexical order. Returns components that contain a cycle
    (size > 1, or a single node with a self-edge), each sorted, ordered by smallest member."""
    index: dict[str, int] = {}
    low: dict[str, int] = {}
    on: set[str] = set()
    stack: list[str] = []
    comps: list[list[str]] = []
    counter = [0]

    def visit(v: str) -> None:
        index[v] = low[v] = counter[0]
        counter[0] += 1
        stack.append(v)
        on.add(v)
        for w in succ[v]:
            if w not in index:
                visit(w)
                low[v] = min(low[v], low[w])
            elif w in on:
                low[v] = min(low[v], index[w])
        if low[v] == index[v]:
            comp = []
            while True:
                w = stack.pop()
                on.discard(w)
                comp.append(w)
                if w == v:
                    break
            if len(comp) > 1 or v in succ[v]:
                comps.append(sorted(comp))

    for v in sorted(succ):
        if v not in index:
            visit(v)
    return sorted(comps, key=lambda c: c[0])


def cycle_path(comp: list[str], succ: dict[str, list[str]]) -> list[str]:
    """G3: the reported cycle. Start at the lexically smallest member s; BFS inside the
    component expanding successors in lexical order; the first edge back into s closes it.
    Path is [s, ..., u, s] in edge direction (prerequisite -> dependent)."""
    members = set(comp)
    s = comp[0]
    if s in succ[s]:
        return [s, s]
    parent: dict[str, str | None] = {s: None}
    queue = [s]
    while queue:
        u = queue.pop(0)
        for w in succ[u]:
            if w not in members:
                continue
            if w == s:
                path = [u]
                while parent[path[-1]] is not None:
                    path.append(parent[path[-1]])  # type: ignore[arg-type]
                path.reverse()
                return path + [s]
            if w not in parent:
                parent[w] = u
                queue.append(w)
    raise AssertionError("component without a cycle")  # pragma: no cover


def topo_order(succ: dict[str, list[str]]) -> list[str]:
    """G4: Kahn's algorithm; among ready courses the lexically smallest code goes first."""
    indeg = {v: 0 for v in succ}
    for v in succ:
        for w in succ[v]:
            indeg[w] += 1
    heap = [v for v in succ if indeg[v] == 0]
    heapq.heapify(heap)
    out: list[str] = []
    while heap:
        v = heapq.heappop(heap)
        out.append(v)
        for w in succ[v]:
            indeg[w] -= 1
            if indeg[w] == 0:
                heapq.heappush(heap, w)
    return out


def validate_catalog(catalog: dict) -> dict:
    """Publish check for a whole catalog version (G1, G5, G3 in that order).
    Returns {"result": "ACCEPT" | "REJECT:<headline>", "errors": [(code, detail)], "cycles": [[...]]}."""
    courses = {c["code"]: c for c in catalog["courses"]}
    known = set(courses)
    errors: list[tuple[str, str]] = []
    for code in sorted(courses):
        errors += validate_expr(code, courses[code].get("prereq"), known)
    for code in sorted(courses):
        c = courses[code]
        if c["status"] != "PUBLISHED":
            continue
        for leaf in expr_leaves(c.get("prereq")):
            if leaf in courses and courses[leaf]["status"] != "PUBLISHED":
                errors.append(("PREREQ_UNPUBLISHED", f"{code} requires {leaf} ({courses[leaf]['status']})"))
    for eq in catalog.get("equivalencies", []):
        for k in ("satisfies", "by"):
            if eq[k] not in known:
                errors.append(("EQUIV_UNKNOWN", f"equivalency {eq['by']} -> {eq['satisfies']}: unknown {eq[k]}"))
    for cert in catalog.get("certificates", []):
        for code in cert["courses"]:
            if code not in known:
                errors.append(("CERT_UNKNOWN", f"{cert['code']} lists unknown {code}"))
    succ = prereq_edges(courses)
    cycles = [cycle_path(comp, succ) for comp in strongly_connected(succ)]
    for cyc in cycles:
        errors.append(("CYCLE", " -> ".join(cyc)))
    stage = {"PREREQ_SHAPE": 0, "PREREQ_DEPTH": 0, "PREREQ_SAME_KIND": 0, "PREREQ_EMPTY_GROUP": 0, "PREREQ_UNKNOWN": 0,
             "EQUIV_UNKNOWN": 0, "CERT_UNKNOWN": 0, "PREREQ_UNPUBLISHED": 1, "CYCLE": 2}
    errors.sort(key=lambda e: (stage[e[0]], e[0], e[1]))
    result = "ACCEPT" if not errors else "REJECT:" + errors[0][0]
    return {"result": result, "errors": errors, "cycles": cycles}


def apply_edit(catalog: dict, edit: dict) -> dict:
    """Apply a draft edit (list of ops) to a copy of the catalog. Ops: set_prereq, set_status, add_course."""
    new = json.loads(json.dumps(catalog))
    by_code = {c["code"]: c for c in new["courses"]}
    for op in edit["ops"]:
        if op["op"] == "set_prereq":
            by_code[op["course"]]["prereq"] = op["prereq"]
        elif op["op"] == "set_status":
            by_code[op["course"]]["status"] = op["status"]
        elif op["op"] == "add_course":
            c = {"code": op["course"], "title": op["title"], "status": op["status"], "prereq": op.get("prereq")}
            new["courses"].append(c)
            by_code[c["code"]] = c
        else:
            raise ValueError(op["op"])
    new["courses"].sort(key=lambda c: c["code"])
    return new


# ---------------------------------------------------------------- learner state and eligibility (G6–G7)

class LearnerState:
    """passed: codes with a PASS completion; waivers: code -> reason; equivalents: satisfied -> by."""

    def __init__(self, passed: set[str], waivers: dict[str, str], equivalencies: list[dict]):
        self.passed = set(passed)
        self.waivers = dict(waivers)
        self.equiv: dict[str, list[str]] = {}
        for eq in equivalencies:
            self.equiv.setdefault(eq["satisfies"], []).append(eq["by"])
        for k in self.equiv:
            self.equiv[k].sort()

    def satisfied(self, leaf: str) -> str | None:
        """G6 reason, by precedence: PASSED > EQUIVALENT:<by> > WAIVER:<reason>; None if unsatisfied."""
        if leaf in self.passed:
            return "PASSED"
        for by in self.equiv.get(leaf, []):
            if by in self.passed:
                return f"EQUIVALENT:{by}"
        if leaf in self.waivers:
            return f"WAIVER:{self.waivers[leaf]}"
        return None


def missing_set(expr: Any, state: LearnerState) -> list[str]:
    """G7: the minimal missing set. Leaf: [] or [leaf]. ALL: union of children's missing.
    ANY: [] if any child is satisfied; else the child's missing with the fewest codes,
    ties broken by lexicographic comparison of the sorted lists."""
    if expr is None:
        return []
    if isinstance(expr, str):
        return [] if state.satisfied(expr) else [expr]
    if "all" in expr:
        out: set[str] = set()
        for c in expr["all"]:
            out.update(missing_set(c, state))
        return sorted(out)
    candidates = [missing_set(c, state) for c in expr["any"]]
    return min(candidates, key=lambda m: (len(m), m))


def eligibility(course: dict, state: LearnerState) -> tuple[str, list[str]]:
    """-> (status, missing). Status order of precedence: UNAVAILABLE, COMPLETED, ELIGIBLE, BLOCKED."""
    if course["status"] != "PUBLISHED":
        return "UNAVAILABLE", []
    if course["code"] in state.passed:
        return "COMPLETED", []
    miss = missing_set(course.get("prereq"), state)
    return ("ELIGIBLE", []) if not miss else ("BLOCKED", miss)


# ---------------------------------------------------------------- shortest path to a certificate (G8)

def _any_groups(expr: Any, course: str, out: list[tuple[str, int, list]]) -> None:
    """Collect every ANY group under a course's expression as (course, ordinal, children)."""
    if expr is None or isinstance(expr, str):
        return
    if "any" in expr:
        out.append((course, len([g for g in out if g[0] == course]), expr["any"]))
        for c in expr["any"]:
            _any_groups(c, course, out)
    else:
        for c in expr["all"]:
            _any_groups(c, course, out)


def _needed_under(expr: Any, state: LearnerState, choice: dict[tuple[str, int], int], course: str,
                  counter: list[int]) -> set[str]:
    """Leaves that must be passed under the chosen ANY branches; satisfied leaves contribute nothing."""
    if expr is None:
        return set()
    if isinstance(expr, str):
        return set() if state.satisfied(expr) else {expr}
    if "all" in expr:
        out: set[str] = set()
        for c in expr["all"]:
            out |= _needed_under(c, state, choice, course, counter)
        return out
    key = (course, counter[0])
    counter[0] += 1
    chosen = expr["any"][choice[key]]
    if not isinstance(chosen, str) and "any" in chosen:  # cannot happen at depth <= 2
        raise AssertionError("any inside any")
    return _needed_under(chosen, state, choice, course, counter)


def shortest_path(catalog: dict, cert: dict, state: LearnerState) -> tuple[list[str], int]:
    """G8: the fewest additional courses whose passing completes the certificate with every
    prerequisite satisfied, searched exactly over all ANY-branch choices in the upstream cone;
    ties broken by lexicographic comparison of the sorted course lists. Returned in topological
    order (G4 tiebreak). Also returns the number of branch combinations examined."""
    courses = {c["code"]: c for c in catalog["courses"]}
    # upstream cone of the certificate (all leaves, all branches)
    cone: set[str] = set()
    frontier = [c for c in cert["courses"] if c in courses]
    while frontier:
        c = frontier.pop()
        if c in cone:
            continue
        cone.add(c)
        frontier += [l for l in expr_leaves(courses[c].get("prereq")) if l in courses]
    groups: list[tuple[str, int, list]] = []
    for code in sorted(cone):
        _any_groups(courses[code].get("prereq"), code, groups)
    keys = [(g[0], g[1]) for g in groups]
    sizes = [len(g[2]) for g in groups]
    best: list[str] | None = None
    combos = 0
    total = 1
    for n in sizes:
        total *= n
    assert total <= 4096, f"{cert['code']}: {total} branch combinations; shrink the cone or revisit D-18"
    for pick in product(*[range(n) for n in sizes]) if sizes else [()]:
        combos += 1
        choice = dict(zip(keys, pick))
        needed = {c for c in cert["courses"] if not state.satisfied(c)}
        todo = list(needed)
        while todo:
            c = todo.pop()
            counter = [0]
            more = _needed_under(courses[c].get("prereq"), state, choice, c, counter)
            for m in more:
                if m not in needed:
                    needed.add(m)
                    todo.append(m)
        cand = sorted(needed)
        if best is None or (len(cand), cand) < (len(best), best):
            best = cand
    assert best is not None
    sub = {c: [w for w in prereq_edges(courses)[c] if w in best] for c in best}
    return topo_order(sub), combos


# ---------------------------------------------------------------- retroactive block report (G9)

def retroactive_report(old_cat: dict, new_cat: dict, enrollments: list[dict], states: dict[str, LearnerState]) -> list[dict]:
    """G9: learners IN_PROGRESS in a course who are eligible under the old catalog and
    BLOCKED under the new one. Reported as GRANDFATHERED, never blocked. Sorted learner, course."""
    old = {c["code"]: c for c in old_cat["courses"]}
    new = {c["code"]: c for c in new_cat["courses"]}
    out = []
    for e in sorted(enrollments, key=lambda e: (e["learner"], e["course"])):
        if e["status"] != "IN_PROGRESS" or e["course"] not in new or e["course"] not in old:
            continue
        st = states[e["learner"]]
        s_old, _ = eligibility(old[e["course"]], st)
        s_new, miss = eligibility(new[e["course"]], st)
        if s_old == "ELIGIBLE" and s_new == "BLOCKED":
            out.append({"learner": e["learner"], "course": e["course"], "cohort": e["cohort"],
                        "flag": "GRANDFATHERED", "missing": "+".join(miss)})
    return out


# ---------------------------------------------------------------- drip release (R1–R3)

def release_day(cohort: dict, item_code: str) -> str:
    item = next(i for i in cohort["items"] if i["code"] == item_code)
    return add_days(cohort["start_day"], item["offset_days"])


def check_item_completion(ev: dict, cohorts: dict[str, dict], enrolled: set[tuple[str, str]]) -> str:
    """R2/R3 -> 'ACCEPT' | 'REJECT:NOT_ENROLLED' | 'REJECT:UNKNOWN_ITEM' | 'REJECT:NOT_RELEASED'."""
    cohort = cohorts.get(ev["cohort"])
    if cohort is None or (ev["learner"], ev["cohort"]) not in enrolled:
        return "REJECT:NOT_ENROLLED"
    if not any(i["code"] == ev["item"] for i in cohort["items"]):
        return "REJECT:UNKNOWN_ITEM"
    if days_from_civil(ev["day"]) < days_from_civil(release_day(cohort, ev["item"])):
        return "REJECT:NOT_RELEASED"
    return "ACCEPT"


# ---------------------------------------------------------------- gradebook (S1–S9)

def validate_scheme(scheme: dict) -> dict:
    """S1 publish check -> {"result": "ACCEPT" | "REJECT:<code>", "errors": [...]}."""
    errors: list[tuple[str, str]] = []
    total = sum(c["weight_bp"] for c in scheme["categories"])
    if total != 10000:
        errors.append(("WEIGHTS_SUM", f"weights sum to {total}, not 10000"))
    codes = [c["code"] for c in scheme["categories"]]
    if len(set(codes)) != len(codes):
        errors.append(("CATEGORY_DUP", "duplicate category code"))
    for c in scheme["categories"]:
        if c["weight_bp"] <= 0:
            errors.append(("WEIGHT_NONPOSITIVE", c["code"]))
        if c["drop_lowest"] < 0:
            errors.append(("DROP_NEGATIVE", c["code"]))
    bands = scheme["bands"]
    if not bands or bands[-1]["min_hp"] != 0:
        errors.append(("BANDS_FLOOR", "last band must start at 0"))
    for a, b in zip(bands, bands[1:]):
        if a["min_hp"] <= b["min_hp"]:
            errors.append(("BANDS_ORDER", f"{a['letter']} <= {b['letter']}"))
    if not 0 <= scheme["pass_threshold_hp"] <= 10000:
        errors.append(("PASS_RANGE", str(scheme["pass_threshold_hp"])))
    if scheme["missing"] not in ("ZERO", "EXCLUDE"):
        errors.append(("MISSING_FLAG", scheme["missing"]))
    errors.sort()
    return {"result": "ACCEPT" if not errors else "REJECT:" + errors[0][0], "errors": errors}


def late_adjusted_hp(score_hp: int, due_day: str, submitted_day: str, late: dict) -> tuple[int, int]:
    """S3: penalty = min(days_late, max_days) * per_day_hp, subtracted from the score,
    floored at 0. Returns (adjusted_hp, days_late). No penalty when on or before due."""
    days_late = days_from_civil(submitted_day) - days_from_civil(due_day)
    if days_late <= 0:
        return score_hp, 0
    penalty = min(days_late, late["max_days"]) * late["per_day_hp"]
    return max(0, score_hp - penalty), days_late


def round_half_up(x: Fraction) -> int:
    """S8: round a non-negative rational to the nearest integer, halves up."""
    assert x >= 0
    return (x.numerator * 2 + x.denominator) // (2 * x.denominator)


def letter_for(final_hp: int, bands: list[dict]) -> str:
    for b in bands:
        if final_hp >= b["min_hp"]:
            return b["letter"]
    return bands[-1]["letter"]


def grade_learner(scheme: dict, assignments: list[dict], submissions: dict[str, dict]) -> dict:
    """S2–S9. assignments: [{code, category, points_possible, due_day, extra_credit}];
    submissions: assignment code -> {score_hp, submitted_day} (absent = missing).
    Returns final_hp, letter, passed, flags, per-category detail, and the exact rational as a string."""
    flags: list[str] = []
    by_cat: dict[str, list[dict]] = {c["code"]: [] for c in scheme["categories"]}
    for a in sorted(assignments, key=lambda a: a["code"]):
        if a["category"] not in by_cat:
            raise ValueError(f"assignment {a['code']} in unknown category {a['category']}")
        sub = submissions.get(a["code"])
        if sub is None:
            if a["extra_credit"] or scheme["missing"] == "EXCLUDE":
                continue  # S4: excluded; missing extra credit is never a zero
            adj, days_late = 0, 0
            flags.append(f"MISSING_ZERO:{a['code']}")
        else:
            adj, days_late = late_adjusted_hp(sub["score_hp"], a["due_day"], sub["submitted_day"], scheme["late"])
            if days_late > 0:
                flags.append(f"LATE:{a['code']}:{days_late}d")
                if adj == 0 and sub["score_hp"] > 0:
                    flags.append(f"PENALTY_FLOORED:{a['code']}")
        by_cat[a["category"]].append({"code": a["code"], "possible": a["points_possible"], "adj_hp": adj,
                                      "extra_credit": a["extra_credit"]})

    def category_ratio(rows: list[dict], drop_n: int, with_ec: bool) -> tuple[Fraction, list[str]] | None:
        regular = [r for r in rows if not r["extra_credit"]]
        # S5: drop the N lowest adjusted scores among regular work; ties -> lexically smaller code dropped first
        regular.sort(key=lambda r: (r["adj_hp"], r["code"]))
        dropped = [r["code"] for r in regular[:drop_n]]
        kept = regular[drop_n:]
        if not kept:
            return None  # S6: empty category
        possible = sum(r["possible"] for r in kept)
        earned = sum(Fraction(r["possible"] * r["adj_hp"], 10000) for r in kept)
        if with_ec:
            earned += sum(Fraction(r["possible"] * r["adj_hp"], 10000) for r in rows if r["extra_credit"])
        return Fraction(earned, possible), dropped

    def final(with_ec: bool) -> tuple[Fraction, dict]:
        detail = {}
        num = Fraction(0)
        den = 0
        for c in scheme["categories"]:
            r = category_ratio(by_cat[c["code"]], c["drop_lowest"], with_ec)
            if r is None:
                detail[c["code"]] = None
                continue
            ratio, dropped = r
            detail[c["code"]] = {"ratio": ratio, "dropped": dropped}
            num += c["weight_bp"] * ratio
            den += c["weight_bp"]
        if den == 0:
            return Fraction(0), detail
        return num * Fraction(10000, den), detail  # S6: redistribute over non-empty categories

    base, detail = final(False)
    with_ec, _ = final(True)
    exact = min(with_ec, base + scheme["extra_credit_cap_hp"])  # S7
    if with_ec > base + scheme["extra_credit_cap_hp"]:
        flags.append("EC_CAPPED")
    exact = min(exact, Fraction(10000))
    for code, d in detail.items():
        if d is None:
            flags.append(f"EMPTY_CATEGORY:{code}")
        elif d["dropped"]:
            flags.append(f"DROPPED:{code}:{'+'.join(d['dropped'])}")
    if all(d is None for d in detail.values()):
        flags.append("NO_GRADED_WORK")
    final_hp = round_half_up(exact)
    return {"final_hp": final_hp, "letter": letter_for(final_hp, scheme["bands"]),
            "passed": final_hp >= scheme["pass_threshold_hp"], "flags": sorted(flags),
            "exact": f"{exact.numerator}/{exact.denominator}",
            "categories": {k: (None if v is None else f"{v['ratio'].numerator}/{v['ratio'].denominator}") for k, v in detail.items()}}
