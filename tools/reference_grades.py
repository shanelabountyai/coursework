"""Coursework — reference gradebook evaluation (test oracle, never product code).

Reads schemes.json, cohorts.json, assignments.csv and submissions.csv from a fixtures
directory, validates every scheme (S1), grades every enrolled learner of every graded cohort
(S2–S9) with exact rationals, and prints the §8 gradebook table. With --write-expected it
writes expected_schemes.csv and expected_grades.csv (final_hp, letter, pass, exact rational,
flags) which `npm run course:eval` must reproduce byte for byte.

Usage: python3 tools/reference_grades.py [--fixtures DIR] [--write-expected]
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import Counter, defaultdict
from fractions import Fraction

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from courselib import grade_learner, validate_scheme  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_csv(path: str) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path: str, rows: list[dict], cols: list[str]) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in cols})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixtures", default=os.path.join(ROOT, "fixtures"))
    ap.add_argument("--write-expected", action="store_true")
    args = ap.parse_args()
    fx = args.fixtures

    schemes = {s["id"]: s for s in json.load(open(os.path.join(fx, "schemes.json"), encoding="utf-8"))["schemes"]}
    cohorts = json.load(open(os.path.join(fx, "cohorts.json"), encoding="utf-8"))["cohorts"]
    assignments = read_csv(os.path.join(fx, "assignments.csv"))
    submissions = read_csv(os.path.join(fx, "submissions.csv"))

    print("== Grade schemes (S1 publish check)")
    scheme_rows = []
    for sid in sorted(schemes):
        v = validate_scheme(schemes[sid])
        total = sum(c["weight_bp"] for c in schemes[sid]["categories"])
        print(f"{sid:9} weights {total:5}  {v['result']}" + (f"  {v['errors']}" if v["errors"] else ""))
        scheme_rows.append({"scheme": sid, "weights_bp": total, "result": v["result"], "errors": ";".join(f"{c}:{d}" for c, d in v["errors"])})

    by_cohort_asg: dict[str, list[dict]] = defaultdict(list)
    for a in assignments:
        by_cohort_asg[a["cohort"]].append({"code": a["assignment"], "category": a["category"], "points_possible": int(a["points_possible"]),
                                           "due_day": a["due_day"], "extra_credit": a["extra_credit"] == "true"})
    subs: dict[tuple[str, str], dict[str, dict]] = defaultdict(dict)
    for s in submissions:
        subs[(s["cohort"], s["learner_id"])][s["assignment"]] = {"score_hp": int(s["score_hp"]), "submitted_day": s["submitted_day"]}

    print("\n== Gradebook per graded cohort (scores in hundredths of a percent; rounded once, half-up, at the final grade)")
    print(f"{'cohort':14} {'scheme':9} {'n':>3} {'mean_hp':>8} {'pass':>5} {'fail':>5}  letters                flags")
    grade_rows = []
    near = 0
    for co in cohorts:
        if not co["scheme"]:
            continue
        scheme = schemes[co["scheme"]]
        assert validate_scheme(scheme)["result"] == "ACCEPT"
        letters: Counter = Counter()
        flags: Counter = Counter()
        finals = []
        for e in co["enrolled"]:
            g = grade_learner(scheme, by_cohort_asg[co["id"]], subs[(co["id"], e["learner_id"])])
            finals.append(g["final_hp"])
            letters[g["letter"]] += 1
            for f in g["flags"]:
                flags[f.split(":")[0]] += 1
            num, den = (int(x) for x in g["exact"].split("/"))
            if abs(Fraction(num, den) - scheme["pass_threshold_hp"]) < Fraction(1, 2):
                near += 1
            grade_rows.append({"cohort": co["id"], "learner_id": e["learner_id"], "scheme": scheme["id"], "final_hp": g["final_hp"],
                               "letter": g["letter"], "passed": "true" if g["passed"] else "false", "exact": g["exact"],
                               "categories": ";".join(f"{k}={v if v is not None else 'EMPTY'}" for k, v in g["categories"].items()),
                               "flags": ";".join(g["flags"])})
        n = len(finals)
        passed = sum(1 for r in grade_rows if r["cohort"] == co["id"] and r["passed"] == "true")
        lt = " ".join(f"{k}:{letters[k]}" for k in "ABCDF")
        fl = " ".join(f"{k}:{flags[k]}" for k in sorted(flags))
        print(f"{co['id']:14} {scheme['id']:9} {n:3} {sum(finals) // n:8} {passed:5} {n - passed:5}  {lt:22} {fl}")
    print(f"learners graded {len(grade_rows)}; unrounded grade within 0.5 hp of the pass threshold (rounding decides): {near}")

    if args.write_expected:
        write_csv(os.path.join(fx, "expected_schemes.csv"), scheme_rows, list(scheme_rows[0].keys()))
        write_csv(os.path.join(fx, "expected_grades.csv"), grade_rows, list(grade_rows[0].keys()))
        print("\nwrote expected_schemes.csv, expected_grades.csv")
    return 0


if __name__ == "__main__":
    sys.exit(main())
