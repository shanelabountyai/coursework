"""Coursework — fixture freeze check (test oracle, never product code).

Regenerates the fixtures with the pinned seed into a temporary directory and compares
every sha256 with fixtures/MANIFEST.json. If the fixtures directory holds expected_*.csv
(written by reference_graph.py / reference_grades.py --write-expected), those are
regenerated too and must match byte for byte. Then re-runs golden_answers.py.
Prints OK or names the first file whose bytes moved. Used by `npm run fixtures:check`.
"""
from __future__ import annotations

import glob
import hashlib
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def sha(path: str) -> str:
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-I", *args], capture_output=True, text=True)


def main() -> int:
    fixtures = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "fixtures")
    manifest_path = os.path.join(fixtures, "MANIFEST.json")
    if not os.path.exists(manifest_path):
        print(f"no MANIFEST.json in {fixtures}; run tools/build_fixtures.py first")
        return 1
    manifest = json.load(open(manifest_path, encoding="utf-8"))
    seed = manifest["seed"]
    bad = 0
    with tempfile.TemporaryDirectory() as tmp:
        r = run([os.path.join(HERE, "build_fixtures.py"), "--seed", str(seed), "--out", tmp])
        if r.returncode != 0:
            print(r.stderr)
            return 1
        fresh = json.load(open(os.path.join(tmp, "MANIFEST.json"), encoding="utf-8"))
        expected_present = sorted(os.path.basename(p) for p in glob.glob(os.path.join(fixtures, "expected_*.csv")))
        if expected_present:
            for script in ("reference_graph.py", "reference_grades.py"):
                r = run([os.path.join(HERE, script), "--fixtures", tmp, "--write-expected"])
                if r.returncode != 0:
                    print(r.stderr)
                    return 1
            for name in expected_present:
                manifest["sha256"][name] = sha(os.path.join(fixtures, name))
                fresh["sha256"][name] = sha(os.path.join(tmp, name))
        for name, h in sorted(manifest["sha256"].items()):
            got = fresh["sha256"].get(name)
            if got != h:
                bad += 1
                print(f"MOVED {name}: manifest {h[:12]}… regenerated {str(got)[:12]}…")
            else:
                print(f"ok    {name} {h[:12]}…")
        if manifest.get("catalog_hash") != fresh.get("catalog_hash"):
            bad += 1
            print("MOVED catalog_hash")
    r = run([os.path.join(HERE, "golden_answers.py")])
    if r.returncode != 0 or not r.stdout.rstrip().endswith("OK"):
        bad += 1
        print("golden_answers.py did not end with OK")
        print(r.stdout[-2000:])
    if bad:
        print(f"FAIL: {bad}")
        return 1
    print(f"OK seed={seed} catalog_hash={manifest.get('catalog_hash')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
