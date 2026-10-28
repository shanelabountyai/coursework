"""Coursework — kickoff golden cases (test oracle, never product code).

Re-derives every worked example in docs/domain-brief.md §7 (GG-01..GG-20 graph, drip,
hash) and §7 (GS-01..GS-15 gradebook) from tools/courselib.py and checks each against
the value worked by hand in the brief. Prints one line per case and ends with OK, or
exits 1 naming the first mismatch.

The EXPECTED values below were derived by hand. If courselib disagrees, the brief and
courselib are out of step: fix them deliberately, never this file's expected value.
The TypeScript tests copy these cases verbatim (same inputs, same expected values).
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_fixtures import BANDS, CERTIFICATES, COURSES, DRAFT_EDITS, EQUIVALENCIES, SCHEMES  # noqa: E402
from courselib import (LearnerState, add_days, apply_edit, catalog_hash, check_item_completion,  # noqa: E402
                       eligibility, grade_learner, letter_for, prereq_edges, retroactive_report, shortest_path,
                       topo_order, validate_catalog, validate_scheme)

CATALOG = {"version": "cat-v1", "courses": [{"code": c, "title": t, "status": s, "prereq": p} for c, t, s, p in sorted(COURSES)],
           "equivalencies": EQUIVALENCIES, "certificates": CERTIFICATES}
COURSE = {c["code"]: c for c in CATALOG["courses"]}
CERT = {c["code"]: c for c in CERTIFICATES}
EDIT = {e["id"]: e for e in DRAFT_EDITS}
SCHEME = {s["id"]: s for s in SCHEMES}
# SCH-G: SCH-STD with no drops, for cases where a drop would hide the rule under test
SCH_G = dict(SCHEME["SCH-STD"], id="SCH-G", categories=[dict(c, drop_lowest=0) for c in SCHEME["SCH-STD"]["categories"]])

CAT_V1_HASH = "32978f4b386ea7ce1fdf1018f67633def259d08808c501cdedea84c849197e8d"
TOPO_V1 = ("ACC-100 ACC-101 ACC-102 ACC-201 ACC-202 ACC-301 ACC-303 DAT-101 DAT-102 DAT-201 DAT-202 DAT-301 DAT-303 "
           "MGT-101 MGT-201 ACC-302 ACC-401 MGT-202 DAT-302 DAT-401 MGT-301 MGT-302 MGT-401 PRJ-101 PRJ-201 PRJ-202 PRJ-301 "
           "SEC-100 SEC-101 SEC-201 SEC-202 SEC-301 SEC-302 SEC-401 WRT-101 PRJ-302 PRJ-401 WRT-201 WRT-202 WRT-301")

fails = 0


def check(cid: str, what: str, got, expected) -> None:
    global fails
    ok = got == expected
    print(f"{'ok  ' if ok else 'FAIL'} {cid} {what}: {got!r}" + ("" if ok else f"  expected {expected!r}"))
    if not ok:
        fails += 1


def state(passed=(), waivers=None) -> LearnerState:
    return LearnerState(set(passed), waivers or {}, EQUIVALENCIES)


def edit_result(eid: str) -> dict:
    return validate_catalog(apply_edit(CATALOG, EDIT[eid]))


def cycles(eid: str) -> list[str]:
    return [" -> ".join(c) for c in edit_result(eid)["cycles"]]


# ------------------------------------------------------------------ GG: graph, drip, hash
check("GG-01", "cat-v1 publish check", validate_catalog(CATALOG)["result"], "ACCEPT")
check("GG-01", "topological order G4", " ".join(topo_order(prereq_edges(COURSE))), TOPO_V1)
check("GG-02", "E-01 2-cycle", (edit_result("E-01")["result"], cycles("E-01")), ("REJECT:CYCLE", ["ACC-101 -> ACC-201 -> ACC-101"]))
check("GG-03", "E-02 3-cycle through an ANY branch", cycles("E-02"), ["MGT-101 -> MGT-201 -> MGT-301 -> MGT-101"])
check("GG-04", "E-03 self-reference is a 1-cycle", (edit_result("E-03")["result"], cycles("E-03")), ("REJECT:CYCLE", ["SEC-202 -> SEC-202"]))
check("GG-05", "E-06 OR branch that closes a cycle is still a cycle", cycles("E-06"), ["ACC-301 -> ACC-401 -> ACC-301"])
check("GG-06", "E-14 two cycles, reported smallest-member first", cycles("E-14"), ["ACC-101 -> ACC-202 -> ACC-101", "WRT-101 -> WRT-201 -> WRT-101"])
check("GG-07", "E-13 diamond closed into a cycle", cycles("E-13"), ["DAT-201 -> DAT-202 -> DAT-201"])
check("GG-08", "E-05 published course requiring a DRAFT", edit_result("E-05")["result"], "REJECT:PREREQ_UNPUBLISHED")
check("GG-08", "E-12 retiring WRT-101 names every dependent", [d for _, d in edit_result("E-12")["errors"]],
      ["PRJ-302 requires WRT-101 (RETIRED)", "WRT-201 requires WRT-101 (RETIRED)", "WRT-202 requires WRT-101 (RETIRED)"])
check("GG-09", "E-08 unknown / E-09 depth / E-10 empty group", [edit_result(e)["result"] for e in ("E-08", "E-09", "E-10")],
      ["REJECT:PREREQ_UNKNOWN", "REJECT:PREREQ_DEPTH", "REJECT:PREREQ_EMPTY_GROUP"])
check("GG-09", "E-07 / E-11 / E-15 accepted", [edit_result(e)["result"] for e in ("E-07", "E-11", "E-15")], ["ACCEPT"] * 3)

s = state(["DAT-102"], {"DAT-101": "PLACEMENT_TEST"})
check("GG-10", "waiver satisfies one ANY branch; other branch not reported", eligibility(COURSE["DAT-202"], s), ("ELIGIBLE", []))
check("GG-10", "satisfaction reason", s.satisfied("DAT-101"), "WAIVER:PLACEMENT_TEST")
check("GG-11", "nothing passed: DAT-202 minimal missing (ANY tie -> lexical)", eligibility(COURSE["DAT-202"], state()), ("BLOCKED", ["DAT-101", "DAT-102"]))
check("GG-12", "ACC-302 with ACC-201 + MGT-201", eligibility(COURSE["ACC-302"], state(["ACC-201", "MGT-201"])), ("ELIGIBLE", []))
check("GG-12", "ACC-302 with ACC-201 only: smallest branch, tie -> ACC-202", eligibility(COURSE["ACC-302"], state(["ACC-201"])), ("BLOCKED", ["ACC-202"]))
check("GG-13", "missing is leaf-level: DAT-302 with DAT-301 + MGT-101 still reports the lexically first branch", eligibility(COURSE["DAT-302"], state(["DAT-301", "MGT-101"])), ("BLOCKED", ["ACC-201"]))
check("GG-13", "ALL unions the missing: DAT-401 with nothing", eligibility(COURSE["DAT-401"], state()), ("BLOCKED", ["DAT-202", "DAT-302"]))
s = state(["ACC-100"])
check("GG-14", "retired ACC-100 satisfies ACC-101 by equivalency", (eligibility(COURSE["ACC-202"], s), s.satisfied("ACC-101")), (("ELIGIBLE", []), "EQUIVALENT:ACC-100"))
check("GG-14", "but not ACC-102", eligibility(COURSE["ACC-201"], s), ("BLOCKED", ["ACC-102"]))
check("GG-15", "COMPLETED outranks ELIGIBLE", eligibility(COURSE["ACC-101"], state(["ACC-101"])), ("COMPLETED", []))
check("GG-15", "DRAFT course is UNAVAILABLE even when its prerequisite is met", eligibility(COURSE["DAT-303"], state(["DAT-301"])), ("UNAVAILABLE", []))
check("GG-16", "shortest path to CERT-BOOK from nothing", shortest_path(CATALOG, CERT["CERT-BOOK"], state())[0], ["ACC-101", "ACC-102", "ACC-201", "ACC-202"])
check("GG-17", "CERT-DATA-ADV from nothing: 9 courses, ACC branch wins the 9-vs-9 tie lexically",
      shortest_path(CATALOG, CERT["CERT-DATA-ADV"], state())[0],
      ["ACC-101", "ACC-102", "ACC-201", "DAT-102", "DAT-201", "DAT-202", "DAT-301", "DAT-302", "DAT-401"])
check("GG-17", "CERT-DATA-ADV with MGT-101 + MGT-202 passed: MGT branch now shorter",
      shortest_path(CATALOG, CERT["CERT-DATA-ADV"], state(["MGT-101", "MGT-202"]))[0],
      ["ACC-102", "DAT-102", "DAT-201", "DAT-202", "DAT-301", "DAT-302", "DAT-401"])
check("GG-18", "CERT-ANALYST with DAT-101 + DAT-102", shortest_path(CATALOG, CERT["CERT-ANALYST"], state(["DAT-101", "DAT-102"]))[0], ["DAT-201", "DAT-202", "DAT-301"])
enr = [{"learner": "L-A", "course": "WRT-202", "cohort": "C-WRT202-F26", "status": "IN_PROGRESS"},
       {"learner": "L-B", "course": "WRT-202", "cohort": "C-WRT202-F26", "status": "IN_PROGRESS"},
       {"learner": "L-C", "course": "WRT-202", "cohort": "C-WRT202-F26", "status": "COMPLETED"}]
states = {"L-A": state(["WRT-101"]), "L-B": state(["WRT-101", "DAT-101"]), "L-C": state(["WRT-101", "WRT-202"])}
check("GG-19", "E-04 grandfather report: only the in-progress learner who loses eligibility",
      retroactive_report(CATALOG, apply_edit(CATALOG, EDIT["E-04"]), enr, states),
      [{"learner": "L-A", "course": "WRT-202", "cohort": "C-WRT202-F26", "flag": "GRANDFATHERED", "missing": "DAT-101"}])
cohort = {"id": "C-X", "start_day": "2026-08-31", "items": [{"code": "A01", "offset_days": 3}]}
cohorts = {"C-X": cohort}
enrolled = {("L-A", "C-X")}
ev = lambda learner, day: {"learner": learner, "cohort": "C-X", "item": "A01", "day": day}  # noqa: E731
check("GG-20", "drip: day before release", check_item_completion(ev("L-A", "2026-09-02"), cohorts, enrolled), "REJECT:NOT_RELEASED")
check("GG-20", "drip: release day", check_item_completion(ev("L-A", "2026-09-03"), cohorts, enrolled), "ACCEPT")
check("GG-20", "drip: not enrolled", check_item_completion(ev("L-Z", "2026-09-03"), cohorts, enrolled), "REJECT:NOT_ENROLLED")
check("GG-20", "calendar arithmetic across month, year, leap day",
      [add_days("2026-09-28", 3), add_days("2026-12-30", 3), add_days("2028-02-28", 1), add_days("2026-03-08", 1)],
      ["2026-10-01", "2027-01-02", "2028-02-29", "2026-03-09"])
check("GG-20", "catalog content hash", catalog_hash(CATALOG), CAT_V1_HASH)
check("GG-20", "hash changes with E-15", catalog_hash(apply_edit(CATALOG, EDIT["E-15"])) != CAT_V1_HASH, True)

# ------------------------------------------------------------------ GS: gradebook
A = [  # the golden assignment set; days are 2026
    {"code": "HW1", "category": "HW", "points_possible": 20, "due_day": "2026-09-07", "extra_credit": False},
    {"code": "HW2", "category": "HW", "points_possible": 20, "due_day": "2026-09-14", "extra_credit": False},
    {"code": "HW3", "category": "HW", "points_possible": 25, "due_day": "2026-09-21", "extra_credit": False},
    {"code": "QZ1", "category": "QZ", "points_possible": 10, "due_day": "2026-09-10", "extra_credit": False},
    {"code": "QZ2", "category": "QZ", "points_possible": 10, "due_day": "2026-09-17", "extra_credit": False},
    {"code": "PRJ1", "category": "PRJ", "points_possible": 50, "due_day": "2026-09-30", "extra_credit": False},
    {"code": "FIN", "category": "FIN", "points_possible": 100, "due_day": "2026-10-05", "extra_credit": False},
    {"code": "HWX", "category": "HW", "points_possible": 10, "due_day": "2026-09-26", "extra_credit": True},
]
DUE = {a["code"]: a["due_day"] for a in A}


def subs(scores: dict[str, int], late: dict[str, int] | None = None) -> dict[str, dict]:
    late = late or {}
    return {k: {"score_hp": v, "submitted_day": add_days(DUE[k], late.get(k, 0))} for k, v in scores.items()}


def g(scheme, assignments, s):
    r = grade_learner(scheme, assignments, s)
    return r["final_hp"], r["letter"], r["passed"], r["exact"], r["flags"]


ALL8 = lambda v: {k: v for k in ("HW1", "HW2", "HW3", "QZ1", "QZ2", "PRJ1", "FIN")}  # noqa: E731
STD = SCHEME["SCH-STD"]
check("GS-01", "all 100.00 on time", g(STD, A, subs(ALL8(10000))), (10000, "A", True, "10000/1", ["DROPPED:HW:HW1", "DROPPED:QZ:QZ1"]))
check("GS-02", "all 80.00: drop ties -> smallest code dropped", g(STD, A, subs(ALL8(8000))), (8000, "B", True, "8000/1", ["DROPPED:HW:HW1", "DROPPED:QZ:QZ1"]))
check("GS-03", "drop-lowest tie with different points: HW1 20pt vs HW3 25pt at 70.00 -> HW1 dropped (9233, not 9250)",
      g(STD, A, subs({**ALL8(10000), "HW1": 7000, "HW2": 8000, "HW3": 7000})), (9233, "A", True, "27700/3", ["DROPPED:HW:HW1", "DROPPED:QZ:QZ1"]))
check("GS-04", "late: 2d and 3d at 10.00/day", g(STD, A, subs({**ALL8(10000), "HW1": 9000, "HW2": 9000, "HW3": 9000}, {"HW1": 2, "HW2": 3})),
      (9433, "A", True, "28300/3", ["DROPPED:HW:HW2", "DROPPED:QZ:QZ1", "LATE:HW1:2d", "LATE:HW2:3d"]))
check("GS-05", "late beyond max_days: 9d capped at 5d = 50.00 (SCH-G, no drops)", g(SCH_G, A, subs({**ALL8(10000), "HW1": 9000}, {"HW1": 9})),
      (9446, "A", True, "122800/13", ["LATE:HW1:9d"]))
check("GS-06", "penalty would go negative: 35.00 - 50.00 floors at 0", g(SCH_G, A, subs({**ALL8(10000), "HW1": 3500}, {"HW1": 6})),
      (9077, "A", True, "118000/13", ["LATE:HW1:6d", "PENALTY_FLOORED:HW1"]))
check("GS-07", "missing = ZERO: HW1 and both quizzes missing", g(STD, A, subs({"HW2": 8000, "HW3": 8000, "PRJ1": 8000, "FIN": 8000})),
      (6400, "D", False, "6400/1", ["DROPPED:HW:HW1", "DROPPED:QZ:QZ1", "MISSING_ZERO:HW1", "MISSING_ZERO:QZ1", "MISSING_ZERO:QZ2"]))
LITE = SCHEME["SCH-LITE"]
AL = [{"code": "PART", "category": "PART", "points_possible": 10, "due_day": "2026-10-13", "extra_credit": False},
      {"code": "A1", "category": "ASG", "points_possible": 10, "due_day": "2026-09-15", "extra_credit": False},
      {"code": "A2", "category": "ASG", "points_possible": 10, "due_day": "2026-09-20", "extra_credit": False},
      {"code": "A3", "category": "ASG", "points_possible": 10, "due_day": "2026-09-25", "extra_credit": False},
      {"code": "A4", "category": "ASG", "points_possible": 15, "due_day": "2026-09-30", "extra_credit": False},
      {"code": "A5", "category": "ASG", "points_possible": 15, "due_day": "2026-10-05", "extra_credit": False},
      {"code": "FIN", "category": "FIN", "points_possible": 100, "due_day": "2026-10-13", "extra_credit": False}]
sl = {k: {"score_hp": v, "submitted_day": next(a["due_day"] for a in AL if a["code"] == k)}
      for k, v in {"A1": 6000, "A2": 7000, "A3": 8000, "A4": 9000, "A5": 10000, "FIN": 7500}.items()}
check("GS-08", "missing = EXCLUDE: PART missing empties its category; weight redistributed over ASG+FIN", g(LITE, AL, sl),
      (8403, "B", True, "75625/9", ["DROPPED:ASG:A1+A2", "EMPTY_CATEGORY:PART"]))
check("GS-09", "category with no assignments: PRJ weight redistributed (9000, not 7200)",
      g(STD, [a for a in A if a["category"] != "PRJ"], subs({k: 9000 for k in ("HW1", "HW2", "HW3", "QZ1", "QZ2", "FIN")})),
      (9000, "A", True, "9000/1", ["DROPPED:HW:HW1", "DROPPED:QZ:QZ1", "EMPTY_CATEGORY:PRJ"]))
check("GS-10", "extra credit under the cap: +1.33 of a 3.00 cap", g(STD, A, subs({**ALL8(9000), "HWX": 2000})),
      (9133, "A", True, "27400/3", ["DROPPED:HW:HW1", "DROPPED:QZ:QZ1"]))
check("GS-11", "extra credit capped: 9666.67 uncapped -> 9300", g(STD, A, subs({**ALL8(9000), "HWX": 10000})),
      (9300, "A", True, "9300/1", ["DROPPED:HW:HW1", "DROPPED:QZ:QZ1", "EC_CAPPED"]))
check("GS-12", "missing extra credit is never a zero", g(STD, A, subs(ALL8(9000))), (9000, "A", True, "9000/1", ["DROPPED:HW:HW1", "DROPPED:QZ:QZ1"]))
check("GS-13", "exact 6999.5 rounds half-up to 7000 -> PASS, C", g(SCH_G, A, subs({**ALL8(7000), "PRJ1": 7005, "FIN": 6995})),
      (7000, "C", True, "13999/2", []))
check("GS-14", "exact 6999.2 rounds to 6999 -> FAIL, D", g(SCH_G, A, subs({**ALL8(7000), "PRJ1": 7005, "FIN": 6994})),
      (6999, "D", False, "34996/5", []))
check("GS-15", "scheme publish: weights 9900", validate_scheme(SCHEME["SCH-BAD"])["result"], "REJECT:WEIGHTS_SUM")
check("GS-15", "letter bands at the boundaries", [letter_for(x, BANDS) for x in (8999, 9000, 7000, 6999, 6000, 5999, 0)], ["B", "A", "C", "D", "D", "F", "F"])

if fails:
    print(f"FAIL: {fails} mismatch(es)")
    sys.exit(1)
print("OK")
