"""Coursework — reference prerequisite graph + progress + drip evaluation (test oracle, never product code).

Reads a fixtures directory from build_fixtures.py and prints the §8 eval table:
catalog cycle report and topological order, the verdict on every draft edit, per-learner
eligibility counts, certificate progress and shortest paths, drip-release verdicts and
derived course progress. `npm run course:eval` must print the same numbers and must match
the per-row files this script writes with --write-expected:
  expected_edits.csv, expected_eligibility.csv, expected_progress.csv, expected_drip.csv,
  expected_enrollment_progress.csv

Usage: python3 tools/reference_graph.py [--fixtures DIR] [--write-expected]
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from courselib import (LearnerState, apply_edit, catalog_hash, check_item_completion, eligibility,  # noqa: E402
                       expr_leaves, prereq_edges, retroactive_report, shortest_path, topo_order,
                       validate_catalog)

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

    catalog = json.load(open(os.path.join(fx, "catalog.json"), encoding="utf-8"))
    edits = json.load(open(os.path.join(fx, "draft_edits.json"), encoding="utf-8"))["edits"]
    cohorts = json.load(open(os.path.join(fx, "cohorts.json"), encoding="utf-8"))["cohorts"]
    learners = read_csv(os.path.join(fx, "learners.csv"))
    waivers = read_csv(os.path.join(fx, "waivers.csv"))
    completions = read_csv(os.path.join(fx, "completions.csv"))
    item_events = read_csv(os.path.join(fx, "item_completions.csv"))

    courses = {c["code"]: c for c in catalog["courses"]}
    published = [c for c in sorted(courses) if courses[c]["status"] == "PUBLISHED"]
    certs = {c["code"]: c for c in catalog["certificates"]}

    # ---------------------------------------------------------------- 1. catalog
    print(f"== Catalog {catalog['version']}  hash {catalog_hash(catalog)}")
    assert catalog_hash(catalog) == catalog["hash"], "catalog hash field does not match content"
    chk = validate_catalog(catalog)
    print(f"courses {len(courses)} (published {len(published)}, draft {sum(1 for c in courses.values() if c['status'] == 'DRAFT')}, "
          f"retired {sum(1 for c in courses.values() if c['status'] == 'RETIRED')}); edges "
          f"{sum(len(expr_leaves(c.get('prereq'))) for c in courses.values())}; publish check {chk['result']}; cycles {len(chk['cycles'])}")
    order = topo_order(prereq_edges(courses))
    print("topological order (G4): " + " ".join(order))

    # ---------------------------------------------------------------- 2. learner states
    waiver_map: dict[str, dict[str, str]] = defaultdict(dict)
    for w in waivers:
        waiver_map[w["learner_id"]][w["course"]] = w["reason"]
    passed: dict[str, set[str]] = defaultdict(set)
    for c in completions:
        if c["kind"] == "PASS":
            passed[c["learner_id"]].add(c["course"])
    states = {l["learner_id"]: LearnerState(passed[l["learner_id"]], waiver_map[l["learner_id"]], catalog["equivalencies"]) for l in learners}
    enrollments = [{"learner": e["learner_id"], "course": co["course"], "cohort": co["id"], "status": e["status"]}
                   for co in cohorts for e in co["enrolled"]]

    # ---------------------------------------------------------------- 3. draft edits
    print("\n== Draft edits against cat-v1")
    print(f"{'edit':6} {'result':26} detail")
    edit_rows = []
    for e in edits:
        new = apply_edit(catalog, e)
        v = validate_catalog(new)
        detail = "; ".join(f"{code}: {d}" for code, d in v["errors"])
        grand = []
        if v["result"] == "ACCEPT":
            grand = retroactive_report(catalog, new, enrollments, states)
            detail = f"grandfathered {len(grand)}" + (f" ({'+'.join(sorted({g['course'] for g in grand}))})" if grand else "")
            if len(new["courses"]) != len(catalog["courses"]):
                detail += f"; courses {len(catalog['courses'])} -> {len(new['courses'])}"
        print(f"{e['id']:6} {v['result']:26} {detail}")
        edit_rows.append({"edit_id": e["id"], "result": v["result"], "cycles": ";".join(" -> ".join(c) for c in v["cycles"]),
                          "errors": ";".join(f"{c}:{d}" for c, d in v["errors"]), "grandfathered": len(grand),
                          "grandfathered_learners": "+".join(f"{g['learner']}@{g['course']}" for g in grand)})
    print(f"accepted {sum(1 for r in edit_rows if r['result'] == 'ACCEPT')}, rejected {sum(1 for r in edit_rows if r['result'] != 'ACCEPT')}, "
          f"cycle rejections {sum(1 for r in edit_rows if r['result'] == 'REJECT:CYCLE')}")

    # ---------------------------------------------------------------- 4. eligibility
    print("\n== Eligibility of 300 learners over the published courses")
    elig_rows = []
    status_tot: Counter = Counter()
    reasons: Counter = Counter()
    missing_sizes: Counter = Counter()
    for l in learners:
        lid = l["learner_id"]
        st = states[lid]
        for code in published:
            s, miss = eligibility(courses[code], st)
            status_tot[s] += 1
            if s == "BLOCKED":
                missing_sizes[len(miss)] += 1
            sat = []
            for leaf in expr_leaves(courses[code].get("prereq")):
                r = st.satisfied(leaf)
                if r and r != "PASSED":
                    sat.append(f"{leaf}={r}")
            for x in sat:
                reasons[x.split("=")[1].split(":")[0]] += 1
            elig_rows.append({"learner_id": lid, "course": code, "status": s, "missing": "+".join(miss), "non_pass_satisfactions": "+".join(sat)})
    print("status counts: " + ", ".join(f"{k} {status_tot[k]}" for k in ("COMPLETED", "ELIGIBLE", "BLOCKED", "UNAVAILABLE")) +
          f" (total {sum(status_tot.values())} = 300 x {len(published)})")
    print("blocked by missing-set size: " + ", ".join(f"{k}: {missing_sizes[k]}" for k in sorted(missing_sizes)))
    print(f"leaf satisfactions not by PASS (G6): EQUIVALENT {reasons['EQUIVALENT']}, WAIVER {reasons['WAIVER']}")
    per_learner_elig = Counter()
    for r in elig_rows:
        if r["status"] == "ELIGIBLE":
            per_learner_elig[r["learner_id"]] += 1
    dist = Counter(per_learner_elig[l["learner_id"]] for l in learners)
    print("eligible-course count per learner: " + ", ".join(f"{k}: {dist[k]}" for k in sorted(dist)))

    # ---------------------------------------------------------------- 5. certificate progress + shortest path
    print("\n== Certificate progress (derived) and shortest path to the target certificate (G8)")
    prog_rows = []
    buckets: Counter = Counter()
    path_lens: Counter = Counter()
    combos_max = 0
    for l in learners:
        lid = l["learner_id"]
        cert = certs[l["target_certificate"]]
        st = states[lid]
        done = [c for c in cert["courses"] if st.satisfied(c)]
        bp = (len(done) * 10000) // len(cert["courses"])
        path, combos = shortest_path(catalog, cert, st)
        combos_max = max(combos_max, combos)
        buckets[min(bp // 2500, 3) if bp < 10000 else 4] += 1
        path_lens[len(path)] += 1
        prog_rows.append({"learner_id": lid, "certificate": cert["code"], "required": len(cert["courses"]), "satisfied": len(done),
                          "progress_bp": bp, "path_len": len(path), "path": "+".join(path), "next": path[0] if path else ""})
    print("progress buckets: " + ", ".join(f"{lab} {buckets[i]}" for i, lab in enumerate(["0-24%", "25-49%", "50-74%", "75-99%", "100%"])))
    print("shortest-path length: " + ", ".join(f"{k}: {path_lens[k]}" for k in sorted(path_lens)) + f"; max branch combinations examined {combos_max}")
    by_cert: dict[str, list[int]] = defaultdict(list)
    for r in prog_rows:
        by_cert[r["certificate"]].append(r["progress_bp"])
    for code in sorted(by_cert):
        v = by_cert[code]
        print(f"  {code:14} learners {len(v):3}  complete {sum(1 for x in v if x == 10000):3}  mean progress_bp {sum(v) // len(v)}")

    # ---------------------------------------------------------------- 6. drip + enrollment progress
    print("\n== Drip release (R1-R3) and derived course progress")
    cohort_by_id = {c["id"]: c for c in cohorts}
    enrolled = {(e["learner_id"], c["id"]) for c in cohorts for e in c["enrolled"]}
    drip_rows = []
    verdicts: Counter = Counter()
    done_items: Counter = Counter()
    for ev in item_events:
        v = check_item_completion({"learner": ev["learner_id"], "cohort": ev["cohort"], "item": ev["item"], "day": ev["day"]}, cohort_by_id, enrolled)
        verdicts[v] += 1
        if v == "ACCEPT":
            done_items[(ev["cohort"], ev["learner_id"], ev["item"])] += 1
        drip_rows.append({"event_id": ev["event_id"], "verdict": v})
    print(f"item completion events {len(item_events)}: " + ", ".join(f"{k} {verdicts[k]}" for k in sorted(verdicts)))
    enr_rows = []
    prog_hist: Counter = Counter()
    for co in cohorts:
        n_items = len(co["items"])
        for e in co["enrolled"]:
            n_done = sum(1 for it in co["items"] if done_items[(co["id"], e["learner_id"], it["code"])])
            bp = (n_done * 10000) // n_items
            prog_hist[bp // 2500 if bp < 10000 else 4] += 1
            enr_rows.append({"cohort": co["id"], "learner_id": e["learner_id"], "items_total": n_items, "items_done": n_done, "progress_bp": bp})
    print(f"enrollments {len(enr_rows)}; course progress buckets: " +
          ", ".join(f"{lab} {prog_hist[i]}" for i, lab in enumerate(["0-24%", "25-49%", "50-74%", "75-99%", "100%"])))

    if args.write_expected:
        write_csv(os.path.join(fx, "expected_edits.csv"), edit_rows, list(edit_rows[0].keys()))
        write_csv(os.path.join(fx, "expected_eligibility.csv"), elig_rows, list(elig_rows[0].keys()))
        write_csv(os.path.join(fx, "expected_progress.csv"), prog_rows, list(prog_rows[0].keys()))
        write_csv(os.path.join(fx, "expected_drip.csv"), drip_rows, list(drip_rows[0].keys()))
        write_csv(os.path.join(fx, "expected_enrollment_progress.csv"), enr_rows, list(enr_rows[0].keys()))
        print("\nwrote expected_edits.csv, expected_eligibility.csv, expected_progress.csv, expected_drip.csv, expected_enrollment_progress.csv")
    return 0


if __name__ == "__main__":
    sys.exit(main())
