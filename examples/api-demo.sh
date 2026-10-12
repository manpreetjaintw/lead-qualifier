#!/usr/bin/env bash
# Qualify the sample dataset through the HTTP API (no UI). Requires the app running on :3000.
# Usage: ./examples/api-demo.sh [base-url]
set -euo pipefail
BASE="${1:-http://localhost:3000}"
python3 - "$BASE" <<'PY'
import csv, json, sys, urllib.request
base = sys.argv[1]
rows = list(csv.DictReader(open("public/sample-leads.csv")))
req = urllib.request.Request(f"{base}/api/qualify", data=json.dumps({"rows": rows, "preset": "eta", "demo": True}).encode(),
                             headers={"content-type": "application/json"})
res = json.load(urllib.request.urlopen(req))
print("stats:", json.dumps(res["stats"], indent=2))
print(f"\nTop 5 acquisition targets ({res['ms']} ms):")
for l in res["leads"][:5]:
    print(f"  {l['score']:>3}  {l['company']:<32} {l['reasons'][0]['label']}")
PY
