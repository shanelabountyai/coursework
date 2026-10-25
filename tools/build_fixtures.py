"""Coursework — fixture builder (test oracle, never product code).

python3 tools/build_fixtures.py --seed 20261025 [--out fixtures]

Writes, deterministically from the seed:
  catalog.json          catalog version cat-v1: 40 courses with prerequisite expressions, equivalencies, certificates
  draft_edits.json      15 draft edits against cat-v1 (11 are invalid: cycles, self-reference, unknown, draft prereq, depth, empty)
  schemes.json          3 grade schemes (one invalid: weights sum 9900)
  learners.csv          300 synthetic learners with a target certificate
  waivers.csv           learner-level prerequisite waivers with reason codes
  completions.csv       course-level PASS/FAIL events (history), tagged with the catalog version
  cohorts.json          16 cohorts: course, start day, drip items with offsets, scheme, enrolled learners
  item_completions.csv  content-item completion events, ~6% before release on purpose, 12 from non-enrolled learners
  assignments.csv       gradebook assignments for the 4 graded cohorts (one cohort has an empty category)
  submissions.csv       scores in hundredths of a percent; ~10% missing; ~18% late
  MANIFEST.json         seed, counts, sha256 of every file

Names are from fixed lists; emails are on example.* domains. Nothing here is a real person.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from courselib import (LearnerState, add_days, canonical, catalog_hash, eligibility,  # noqa: E402
                       expr_leaves, validate_catalog)

# ------------------------------------------------------------------------------ catalog

def ALL(*xs):  # noqa: N802
    return {"all": list(xs)}


def ANY(*xs):  # noqa: N802
    return {"any": list(xs)}


COURSES = [
    # code, title, status, prereq
    ("ACC-100", "Intro to Numbers (legacy)", "RETIRED", None),
    ("ACC-101", "Bookkeeping Basics", "PUBLISHED", None),
    ("ACC-102", "Spreadsheets for Finance", "PUBLISHED", None),
    ("ACC-201", "Financial Statements", "PUBLISHED", ALL("ACC-101", "ACC-102")),
    ("ACC-202", "Payroll Fundamentals", "PUBLISHED", "ACC-101"),
    ("ACC-301", "Managerial Accounting", "PUBLISHED", "ACC-201"),
    ("ACC-302", "Audit Fundamentals", "PUBLISHED", ALL("ACC-201", ANY("ACC-202", "MGT-201"))),
    ("ACC-303", "Tax Basics", "DRAFT", "ACC-201"),
    ("ACC-401", "Controller Track", "PUBLISHED", ALL("ACC-301", "ACC-302")),
    ("DAT-101", "Data Literacy", "PUBLISHED", None),
    ("DAT-102", "SQL Basics", "PUBLISHED", None),
    ("DAT-201", "Data Cleaning", "PUBLISHED", ANY("DAT-101", "ACC-102")),
    ("DAT-202", "Dashboards", "PUBLISHED", ALL("DAT-102", ANY("DAT-101", "DAT-201"))),
    ("DAT-301", "Statistics for Analysts", "PUBLISHED", "DAT-201"),
    ("DAT-302", "Forecasting", "PUBLISHED", ALL("DAT-301", ANY("ACC-201", "MGT-202"))),
    ("DAT-303", "Machine Learning Intro", "DRAFT", "DAT-301"),
    ("DAT-401", "Analytics Capstone", "PUBLISHED", ALL("DAT-202", "DAT-302")),
    ("MGT-101", "Supervising People", "PUBLISHED", None),
    ("MGT-201", "Team Leadership", "PUBLISHED", "MGT-101"),
    ("MGT-202", "Budgeting for Managers", "PUBLISHED", ALL("MGT-101", ANY("ACC-101", "ACC-102"))),
    ("MGT-301", "Operations Management", "PUBLISHED", ANY("MGT-201", "MGT-202")),
    ("MGT-302", "Change Management", "PUBLISHED", "MGT-201"),
    ("MGT-401", "Strategic Planning", "PUBLISHED", ALL("MGT-301", "MGT-302")),
    ("PRJ-101", "Project Fundamentals", "PUBLISHED", None),
    ("PRJ-201", "Scheduling", "PUBLISHED", "PRJ-101"),
    ("PRJ-202", "Risk Management", "PUBLISHED", "PRJ-101"),
    ("PRJ-301", "Agile Delivery", "PUBLISHED", ANY("PRJ-201", "PRJ-202", "MGT-201")),
    ("PRJ-302", "Stakeholder Management", "PUBLISHED", ALL("PRJ-201", ANY("MGT-101", "WRT-101"))),
    ("PRJ-401", "Program Management", "PUBLISHED", ALL("PRJ-301", "PRJ-302")),
    ("SEC-100", "Legacy Security Awareness", "RETIRED", None),
    ("SEC-101", "Security Awareness", "PUBLISHED", None),
    ("SEC-201", "Network Basics", "PUBLISHED", "SEC-101"),
    ("SEC-202", "Identity and Access", "PUBLISHED", "SEC-101"),
    ("SEC-301", "Incident Response", "PUBLISHED", ALL("SEC-201", "SEC-202")),
    ("SEC-302", "Cloud Security", "PUBLISHED", ALL("SEC-201", ANY("DAT-102", "PRJ-101"))),
    ("SEC-401", "Security Leadership", "PUBLISHED", ALL("SEC-301", ANY("MGT-201", "PRJ-301"))),
    ("WRT-101", "Business Writing", "PUBLISHED", None),
    ("WRT-201", "Technical Writing", "PUBLISHED", "WRT-101"),
    ("WRT-202", "Report Writing", "PUBLISHED", ANY("WRT-101", "DAT-101")),
    ("WRT-301", "Documentation Systems", "PUBLISHED", ALL("WRT-201", "WRT-202")),
]

EQUIVALENCIES = [
    {"satisfies": "ACC-101", "by": "ACC-100", "reason": "EQUIVALENT_COURSE"},
    {"satisfies": "SEC-101", "by": "SEC-100", "reason": "EQUIVALENT_COURSE"},
]

CERTIFICATES = [
    {"code": "CERT-BOOK", "title": "Bookkeeping Certificate", "courses": ["ACC-101", "ACC-102", "ACC-201", "ACC-202"]},
    {"code": "CERT-ANALYST", "title": "Data Analyst Certificate", "courses": ["DAT-101", "DAT-102", "DAT-201", "DAT-202", "DAT-301"]},
    {"code": "CERT-DATA-ADV", "title": "Advanced Analytics Certificate", "courses": ["DAT-401"]},
    {"code": "CERT-LEAD", "title": "Leadership Certificate", "courses": ["MGT-101", "MGT-201", "MGT-202", "MGT-301"]},
    {"code": "CERT-PM", "title": "Project Management Certificate", "courses": ["PRJ-101", "PRJ-201", "PRJ-202", "PRJ-301", "PRJ-302"]},
    {"code": "CERT-SEC", "title": "Security Operations Certificate", "courses": ["SEC-101", "SEC-201", "SEC-202", "SEC-301"]},
    {"code": "CERT-WRITE", "title": "Professional Writing Certificate", "courses": ["WRT-101", "WRT-201", "WRT-202", "WRT-301"]},
]

WAIVER_REASONS = ["TRANSFER_CREDIT", "PLACEMENT_TEST", "INSTRUCTOR_WAIVER", "PRIOR_LEARNING"]

# Draft edits against cat-v1. `expect` is documentation only; the reference computes the real answer.
DRAFT_EDITS = [
    {"id": "E-01", "note": "2-cycle: ACC-101 would require ACC-201", "ops": [{"op": "set_prereq", "course": "ACC-101", "prereq": "ACC-201"}]},
    {"id": "E-02", "note": "3-cycle through an ANY branch: MGT-101 -> MGT-201 -> MGT-301 -> MGT-101", "ops": [{"op": "set_prereq", "course": "MGT-101", "prereq": ANY("MGT-301", "WRT-101")}]},
    {"id": "E-03", "note": "self-reference", "ops": [{"op": "set_prereq", "course": "SEC-202", "prereq": "SEC-202"}]},
    {"id": "E-04", "note": "WRT-202 tightened from ANY to ALL; retroactively blocks in-progress learners (report only)", "ops": [{"op": "set_prereq", "course": "WRT-202", "prereq": ALL("WRT-101", "DAT-101")}]},
    {"id": "E-05", "note": "published course requiring a DRAFT course", "ops": [{"op": "set_prereq", "course": "DAT-401", "prereq": ALL("DAT-202", "DAT-302", "DAT-303")}]},
    {"id": "E-06", "note": "OR branch that is itself a cycle: ACC-301 any(ACC-201, ACC-401) while ACC-401 requires ACC-301", "ops": [{"op": "set_prereq", "course": "ACC-301", "prereq": ANY("ACC-201", "ACC-401")}]},
    {"id": "E-07", "note": "publish DAT-303 (valid)", "ops": [{"op": "set_status", "course": "DAT-303", "status": "PUBLISHED"}]},
    {"id": "E-08", "note": "unknown course code in a prerequisite", "ops": [{"op": "set_prereq", "course": "PRJ-301", "prereq": ANY("PRJ-201", "PRJ-202", "MGT-201", "PRJ-999")}]},
    {"id": "E-09", "note": "nesting depth 3", "ops": [{"op": "set_prereq", "course": "SEC-301", "prereq": ALL("SEC-201", ANY("SEC-202", ALL("SEC-101", "SEC-201")))}]},
    {"id": "E-10", "note": "empty ANY group", "ops": [{"op": "set_prereq", "course": "MGT-202", "prereq": ALL("MGT-101", {"any": []})}]},
    {"id": "E-11", "note": "ACC-202 gains ACC-102 (valid; grandfather report for in-progress learners)", "ops": [{"op": "set_prereq", "course": "ACC-202", "prereq": ALL("ACC-101", "ACC-102")}]},
    {"id": "E-12", "note": "retire WRT-101 while published WRT-201 requires it", "ops": [{"op": "set_status", "course": "WRT-101", "status": "RETIRED"}]},
    {"id": "E-13", "note": "diamond closed into a 2-cycle: DAT-201 any(..., DAT-202) while DAT-202 needs DAT-201", "ops": [{"op": "set_prereq", "course": "DAT-201", "prereq": ANY("DAT-101", "ACC-102", "DAT-202")}]},
    {"id": "E-14", "note": "two independent cycles in one edit", "ops": [{"op": "set_prereq", "course": "ACC-101", "prereq": "ACC-202"}, {"op": "set_prereq", "course": "WRT-101", "prereq": "WRT-201"}]},
    {"id": "E-15", "note": "add ACC-203 Accounts Receivable requiring ACC-101 (valid)", "ops": [{"op": "add_course", "course": "ACC-203", "title": "Accounts Receivable", "status": "PUBLISHED", "prereq": "ACC-101"}]},
]

# ------------------------------------------------------------------------------ grade schemes

BANDS = [{"min_hp": 9000, "letter": "A"}, {"min_hp": 8000, "letter": "B"}, {"min_hp": 7000, "letter": "C"},
         {"min_hp": 6000, "letter": "D"}, {"min_hp": 0, "letter": "F"}]

SCHEMES = [
    {"id": "SCH-STD", "title": "Standard weighted", "status": "PUBLISHED",
     "categories": [{"code": "HW", "name": "Homework", "weight_bp": 3000, "drop_lowest": 1},
                    {"code": "QZ", "name": "Quizzes", "weight_bp": 2000, "drop_lowest": 1},
                    {"code": "PRJ", "name": "Project", "weight_bp": 2000, "drop_lowest": 0},
                    {"code": "FIN", "name": "Final Exam", "weight_bp": 3000, "drop_lowest": 0}],
     "late": {"per_day_hp": 1000, "max_days": 5}, "extra_credit_cap_hp": 300, "pass_threshold_hp": 7000,
     "missing": "ZERO", "bands": BANDS},
    {"id": "SCH-LITE", "title": "Participation-light", "status": "PUBLISHED",
     "categories": [{"code": "PART", "name": "Participation", "weight_bp": 1000, "drop_lowest": 0},
                    {"code": "ASG", "name": "Assignments", "weight_bp": 5000, "drop_lowest": 2},
                    {"code": "FIN", "name": "Final Exam", "weight_bp": 4000, "drop_lowest": 0}],
     "late": {"per_day_hp": 500, "max_days": 10}, "extra_credit_cap_hp": 500, "pass_threshold_hp": 6500,
     "missing": "EXCLUDE", "bands": BANDS},
    {"id": "SCH-BAD", "title": "Draft with weights summing to 9900", "status": "DRAFT",
     "categories": [{"code": "HW", "name": "Homework", "weight_bp": 4000, "drop_lowest": 0},
                    {"code": "FIN", "name": "Final Exam", "weight_bp": 5900, "drop_lowest": 0}],
     "late": {"per_day_hp": 1000, "max_days": 5}, "extra_credit_cap_hp": 0, "pass_threshold_hp": 7000,
     "missing": "ZERO", "bands": BANDS},
]

# ------------------------------------------------------------------------------ cohorts

DRIP_ITEMS = [("L01", "Welcome and syllabus", 0), ("L02", "Module 1 lesson", 0), ("A01", "Module 1 exercise", 3),
              ("L03", "Module 2 lesson", 7), ("A02", "Module 2 exercise", 10), ("L04", "Module 3 lesson", 14),
              ("A03", "Module 3 exercise", 17), ("L05", "Module 4 lesson", 21), ("A04", "Capstone brief", 28)]

# (cohort id, course, start day, scheme or None, max enrolled)
COHORTS = [
    ("C-ACC101-F26", "ACC-101", "2026-08-31", "SCH-STD", 28),
    ("C-ACC102-F26", "ACC-102", "2026-09-07", None, 24),
    ("C-ACC202-F26", "ACC-202", "2026-09-14", None, 22),
    ("C-DAT101-F26", "DAT-101", "2026-08-31", None, 26),
    ("C-DAT102-F26", "DAT-102", "2026-09-07", "SCH-STD", 26),
    ("C-DAT201-F26", "DAT-201", "2026-09-21", None, 20),
    ("C-DAT202-F26", "DAT-202", "2026-09-28", None, 18),
    ("C-MGT101-F26", "MGT-101", "2026-09-01", "SCH-STD", 26),
    ("C-MGT201-F26", "MGT-201", "2026-09-15", None, 20),
    ("C-PRJ101-F26", "PRJ-101", "2026-09-08", None, 26),
    ("C-PRJ301-F26", "PRJ-301", "2026-10-05", None, 18),
    ("C-SEC101-F26", "SEC-101", "2026-09-01", None, 26),
    ("C-SEC301-F26", "SEC-301", "2026-10-12", None, 16),
    ("C-WRT101-F26", "WRT-101", "2026-09-08", "SCH-LITE", 26),
    ("C-WRT202-F26", "WRT-202", "2026-09-22", None, 22),
    ("C-WRT301-F26", "WRT-301", "2026-10-13", None, 14),
]

FIRST = ["Aisha", "Ben", "Carla", "Dev", "Elena", "Femi", "Grace", "Hiro", "Ines", "Jonas", "Kai", "Lena", "Marco",
         "Nadia", "Omar", "Priya", "Quinn", "Rosa", "Sven", "Tara", "Uma", "Viktor", "Wen", "Ximena", "Yusuf", "Zoe",
         "Amara", "Bruno", "Chloe", "Dmitri"]
LAST = ["Adams", "Baker", "Chen", "Diaz", "Evans", "Fischer", "Garcia", "Haddad", "Ivanova", "Jensen", "Kim", "Lopez",
        "Mensah", "Novak", "Okafor", "Patel", "Quist", "Rossi", "Singh", "Tanaka", "Ueda", "Varga", "Walsh", "Xu",
        "Young", "Zhang", "Alvarez", "Brown", "Costa", "Dubois"]


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def write_text(path: str, text: str) -> str:
    data = text.encode("utf-8")
    with open(path, "wb") as f:
        f.write(data)
    return sha256_bytes(data)


def write_json(path: str, obj) -> str:
    return write_text(path, json.dumps(obj, indent=2, sort_keys=False, ensure_ascii=False) + "\n")


def write_csv(path: str, rows: list[dict], cols: list[str]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow({k: r.get(k, "") for k in cols})
    return write_text(path, buf.getvalue())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fixtures"))
    args = ap.parse_args()
    R = random.Random(args.seed)
    os.makedirs(args.out, exist_ok=True)
    hashes: dict[str, str] = {}

    catalog = {"version": "cat-v1",
               "courses": [{"code": c, "title": t, "status": s, "prereq": p} for c, t, s, p in sorted(COURSES)],
               "equivalencies": EQUIVALENCIES, "certificates": CERTIFICATES}
    check = validate_catalog(catalog)
    assert check["result"] == "ACCEPT", check
    catalog["hash"] = catalog_hash(catalog)
    courses = {c["code"]: c for c in catalog["courses"]}
    published = [c for c in sorted(courses) if courses[c]["status"] == "PUBLISHED"]
    cert_by_code = {c["code"]: c for c in CERTIFICATES}

    # ---- learners
    learners: list[dict] = []
    used = set()
    for i in range(1, 301):
        while True:
            name = f"{R.choice(FIRST)} {R.choice(LAST)}"
            if name not in used:
                used.add(name)
                break
        cert = R.choice(CERTIFICATES)["code"]
        learners.append({"learner_id": f"L-{i:04d}", "name": name,
                         "email": f"{name.lower().replace(' ', '.')}{i}@example.org",
                         "target_certificate": cert, "enrolled_catalog_version": "cat-v1"})

    # ---- waivers: 24 learners get one waiver on a 100-level course
    waivers: list[dict] = []
    waiver_map: dict[str, dict[str, str]] = {}
    level100 = [c for c in published if c.endswith("101") or c.endswith("102")]
    for lid in R.sample([l["learner_id"] for l in learners], 24):
        code = R.choice(level100)
        reason = R.choice(WAIVER_REASONS)
        waivers.append({"learner_id": lid, "course": code, "reason": reason, "granted_day": "2025-12-15", "granted_by": "registrar"})
        waiver_map.setdefault(lid, {})[code] = reason
    waivers.sort(key=lambda w: (w["learner_id"], w["course"]))

    # ---- completion history: a prerequisite-respecting walk per learner
    completions: list[dict] = []
    passed_by: dict[str, set[str]] = {}
    for l in learners:
        lid = l["learner_id"]
        passed: set[str] = set()
        # 14 of the learners took the retired ACC-100 before 2025 (equivalency trap)
        if R.random() < 0.05:
            passed.add("ACC-100")
            completions.append({"learner_id": lid, "course": "ACC-100", "kind": "PASS", "day": "2024-0" + str(R.randint(1, 9)) + "-15",
                                "catalog_version": "cat-v1"})
        if R.random() < 0.03:
            passed.add("SEC-100")
            completions.append({"learner_id": lid, "course": "SEC-100", "kind": "PASS", "day": "2024-11-15", "catalog_version": "cat-v1"})
        cone: set[str] = set()
        frontier = list(cert_by_code[l["target_certificate"]]["courses"])
        while frontier:
            c = frontier.pop()
            if c in cone:
                continue
            cone.add(c)
            frontier += expr_leaves(courses[c].get("prereq"))
        attempts = R.choice([0, 0, 1, 2, 2, 3, 3, 4, 4, 5, 6, 7, 8, 10, 12])
        day = 20094 + R.randint(0, 120)  # 2025-01-07 .. 2025-05-07 as day numbers
        for _ in range(attempts):
            state = LearnerState(passed, waiver_map.get(lid, {}), EQUIVALENCIES)
            elig = [c for c in published if eligibility(courses[c], state)[0] == "ELIGIBLE"]
            if not elig:
                break
            pool = [c for c in elig if c in cone] if R.random() < 0.8 else elig
            if not pool:
                pool = elig
            c = R.choice(pool)
            day += R.randint(14, 45)
            if day > 20696:  # stop before 2026-09-01: cohorts start then
                break
            kind = "PASS" if R.random() < 0.85 else "FAIL"
            completions.append({"learner_id": lid, "course": c, "kind": kind, "day": add_days("1970-01-01", day), "catalog_version": "cat-v1"})
            if kind == "PASS":
                passed.add(c)
        passed_by[lid] = passed
    completions.sort(key=lambda r: (r["learner_id"], r["day"], r["course"]))

    # ---- cohorts and enrollments
    cohorts: list[dict] = []
    enrolled_in: dict[str, set[str]] = {l["learner_id"]: set() for l in learners}
    for cid, course, start, scheme, cap in COHORTS:
        cands = []
        for l in learners:
            lid = l["learner_id"]
            state = LearnerState(passed_by[lid], waiver_map.get(lid, {}), EQUIVALENCIES)
            if eligibility(courses[course], state)[0] == "ELIGIBLE" and len(enrolled_in[lid]) < 2:
                cands.append(lid)
        chosen = sorted(R.sample(cands, min(cap, len(cands))))
        for lid in chosen:
            enrolled_in[lid].add(cid)
        cohorts.append({"id": cid, "course": course, "start_day": start, "scheme": scheme, "catalog_version": "cat-v1",
                        "items": [{"code": code, "title": title, "offset_days": off} for code, title, off in DRIP_ITEMS],
                        "enrolled": [{"learner_id": lid, "status": "IN_PROGRESS"} for lid in chosen]})

    # ---- item completions (drip trap: ~6% before release; 12 from non-enrolled learners)
    item_events: list[dict] = []
    n = 0
    for co in cohorts:
        for e in co["enrolled"]:
            for it in co["items"]:
                rel = add_days(co["start_day"], it["offset_days"])
                roll = R.random()
                if roll < 0.62:
                    day = add_days(rel, R.randint(0, 9))
                elif roll < 0.68:
                    day = add_days(rel, -R.randint(1, 6))
                else:
                    continue
                n += 1
                item_events.append({"event_id": f"IE-{n:05d}", "learner_id": e["learner_id"], "cohort": co["id"], "item": it["code"], "day": day})
    for _ in range(12):
        co = R.choice(cohorts)
        enrolled_ids = {e["learner_id"] for e in co["enrolled"]}
        lid = R.choice([l["learner_id"] for l in learners if l["learner_id"] not in enrolled_ids])
        it = R.choice(co["items"])
        n += 1
        item_events.append({"event_id": f"IE-{n:05d}", "learner_id": lid, "cohort": co["id"], "item": it["code"],
                            "day": add_days(co["start_day"], it["offset_days"] + R.randint(0, 5))})
    item_events.sort(key=lambda r: r["event_id"])

    # ---- gradebook for the 4 graded cohorts
    assignments: list[dict] = []
    submissions: list[dict] = []
    for co in cohorts:
        if not co["scheme"]:
            continue
        start = co["start_day"]
        if co["scheme"] == "SCH-STD":
            spec = [("HW1", "HW", 20, 7, False), ("HW2", "HW", 20, 14, False), ("HW3", "HW", 25, 21, False), ("HW4", "HW", 25, 28, False),
                    ("QZ1", "QZ", 10, 10, False), ("QZ2", "QZ", 10, 17, False), ("QZ3", "QZ", 10, 24, False),
                    ("FIN", "FIN", 100, 35, False)]
            if co["course"] != "DAT-102":
                spec.append(("PRJ1", "PRJ", 50, 30, False))  # DAT-102 has no project: empty category (S6)
            if co["course"] == "ACC-101":
                spec.append(("HWX", "HW", 10, 26, True))  # extra credit
        else:
            spec = [("PART", "PART", 10, 35, False), ("A1", "ASG", 10, 7, False), ("A2", "ASG", 10, 12, False), ("A3", "ASG", 10, 17, False),
                    ("A4", "ASG", 15, 22, False), ("A5", "ASG", 15, 27, False), ("FIN", "FIN", 100, 35, False), ("AX", "ASG", 5, 30, True)]
        for code, cat, pts, off, ec in spec:
            assignments.append({"cohort": co["id"], "assignment": code, "category": cat, "points_possible": pts,
                                "due_day": add_days(start, off), "extra_credit": "true" if ec else "false"})
            for e in co["enrolled"]:
                if ec and R.random() < 0.7:
                    continue
                if not ec and R.random() < 0.10:
                    continue  # missing
                ability = ((int(e["learner_id"][2:]) * 7919) % 40) / 100  # per-learner offset, deterministic
                score = min(10000, max(0, int(R.gauss(6000 + ability * 10000, 1200))))
                score -= score % 25  # quarter-point granularity
                late = 0
                r = R.random()
                if r < 0.12:
                    late = R.randint(1, 3)
                elif r < 0.18:
                    late = R.randint(4, 9)
                submissions.append({"cohort": co["id"], "learner_id": e["learner_id"], "assignment": code,
                                    "score_hp": score, "submitted_day": add_days(add_days(start, off), late - (0 if late else R.randint(0, 2)))})
    # forced traps in C-ACC101-F26: (a) three learners hand in HW3 at 35.00% six days late -> penalty 50.00 floors to 0 (S3);
    # (b) one learner has HW1 and HW3 tied at 70.00% with different points -> drop-lowest tie (S5) drops HW1, the smaller code
    acc = next(c for c in cohorts if c["id"] == "C-ACC101-F26")
    acc_ids = [e["learner_id"] for e in acc["enrolled"]]
    due = {a["assignment"]: a["due_day"] for a in assignments if a["cohort"] == acc["id"]}
    subs_idx = {(r["cohort"], r["learner_id"], r["assignment"]): r for r in submissions}

    def force(lid: str, code: str, score: int, late: int) -> None:
        key = (acc["id"], lid, code)
        row = subs_idx.get(key)
        if row is None:
            row = {"cohort": acc["id"], "learner_id": lid, "assignment": code}
            submissions.append(row)
            subs_idx[key] = row
        row["score_hp"] = score
        row["submitted_day"] = add_days(due[code], late)

    for lid in acc_ids[:3]:
        force(lid, "HW3", 3500, 6)
    force(acc_ids[3], "HW1", 7000, 0)
    force(acc_ids[3], "HW3", 7000, 0)
    force(acc_ids[3], "HW2", 8000, 0)
    force(acc_ids[3], "HW4", 9000, 0)
    submissions.sort(key=lambda r: (r["cohort"], r["learner_id"], r["assignment"]))

    # ---- write
    hashes["catalog.json"] = write_json(os.path.join(args.out, "catalog.json"), catalog)
    hashes["draft_edits.json"] = write_json(os.path.join(args.out, "draft_edits.json"), {"base_version": "cat-v1", "edits": DRAFT_EDITS})
    hashes["schemes.json"] = write_json(os.path.join(args.out, "schemes.json"), {"schemes": SCHEMES})
    hashes["learners.csv"] = write_csv(os.path.join(args.out, "learners.csv"), learners, list(learners[0].keys()))
    hashes["waivers.csv"] = write_csv(os.path.join(args.out, "waivers.csv"), waivers, list(waivers[0].keys()))
    hashes["completions.csv"] = write_csv(os.path.join(args.out, "completions.csv"), completions, list(completions[0].keys()))
    hashes["cohorts.json"] = write_json(os.path.join(args.out, "cohorts.json"), {"cohorts": cohorts})
    hashes["item_completions.csv"] = write_csv(os.path.join(args.out, "item_completions.csv"), item_events, list(item_events[0].keys()))
    hashes["assignments.csv"] = write_csv(os.path.join(args.out, "assignments.csv"), assignments, list(assignments[0].keys()))
    hashes["submissions.csv"] = write_csv(os.path.join(args.out, "submissions.csv"), submissions, list(submissions[0].keys()))

    manifest = {
        "seed": args.seed,
        "catalog_version": "cat-v1",
        "catalog_hash": catalog["hash"],
        "counts": {
            "courses": len(COURSES), "published": len(published), "draft": sum(1 for c in COURSES if c[2] == "DRAFT"),
            "retired": sum(1 for c in COURSES if c[2] == "RETIRED"), "certificates": len(CERTIFICATES),
            "learners": len(learners), "waivers": len(waivers), "completions": len(completions),
            "completions_pass": sum(1 for c in completions if c["kind"] == "PASS"),
            "cohorts": len(cohorts), "enrollments": sum(len(c["enrolled"]) for c in cohorts),
            "item_completions": len(item_events), "assignments": len(assignments), "submissions": len(submissions),
            "draft_edits": len(DRAFT_EDITS), "schemes": len(SCHEMES),
        },
        "sha256": hashes,
    }
    with open(os.path.join(args.out, "MANIFEST.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
        f.write("\n")
    for k, v in sorted(hashes.items()):
        print(f"{v}  {k}")
    print(canonical(manifest["counts"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
