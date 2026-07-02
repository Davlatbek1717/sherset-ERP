#!/usr/bin/env bash
# Live smoke test for mass-edit endpoints.
#
# Usage:
#   pnpm smoke <module>          — test one module (e.g. cash-in)
#   pnpm smoke --all             — test every registered module
#
# Pre-condition: API must be running (`pnpm --filter @moysklad/api dev`).
# Requires admin@demo.local seed user.
#
# Per-module test sequence:
#   1. POST /<module>/mass-edit { ids:[first2docs], description:"smk-<ts>" }
#   2. Assert HTTP 200/201 with succeeded.length = N, failed.length = 0
#   3. GET /<module>/<id> → assert description matches new value
#
# Adversarial cases (always run on first non-empty module):
#   - empty patch → 400
#   - invalid UUID → 400
#   - missing UUID → succeeded:0 failed:1 (no crash)
#
# Exit codes:
#   0 — all pass
#   1 — at least one FAIL (skip is OK — module has empty seed)
#   2 — API unreachable / auth fail

set -u
shopt -s nullglob

API="${API_URL:-http://localhost:4000}"
EMAIL="${SMOKE_EMAIL:-admin@demo.local}"
PASSWORD="${SMOKE_PASSWORD:-admin123}"

# 23 modules that expose /mass-edit (from grep of @Post.*'mass-edit')
ALL_MODULES=(
  cash-in cash-out
  payments-in payments-out
  invoices-in invoices-out
  customer-orders demands supplies
  sales-returns purchase-orders purchase-returns
  counterparty-adjustments internal-orders
  payrolls prepayments prepayment-returns price-lists
  processings processing-orders projects
  service-requests work-orders
)

if [ "$#" -eq 0 ]; then
  echo "Usage: pnpm smoke <module>|--all" >&2
  echo "Modules: ${ALL_MODULES[*]}" >&2
  exit 2
fi

MODULES=()
if [ "$1" = "--all" ]; then
  MODULES=("${ALL_MODULES[@]}")
else
  MODULES=("$@")
fi

TOKEN=$(curl -s -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | python -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "FAIL: auth — API at $API unreachable or credentials invalid" >&2
  exit 2
fi
echo "✓ auth ($API as $EMAIL)"

STAMP=$(date +%s)
PASS=0; FAIL=0; SKIP=0; ADV_PASS=0; ADV_FAIL=0
ADVERSARIAL_DONE=0

smoke() {
  local route="$1"

  # Fetch up to 2 doc ids
  IDS=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$API/api/v1/$route?limit=2" \
    | python -c "import sys,json; d=json.load(sys.stdin); print(','.join([i['id'] for i in d.get('items',[])[:2]]))" 2>/dev/null)
  if [ -z "$IDS" ]; then
    echo "⊘ $route: empty seed (SKIP)"
    SKIP=$((SKIP+1))
    return
  fi

  IFS=',' read -ra ID_ARR <<< "$IDS"
  N=${#ID_ARR[@]}

  NEW_DESC="smk-$route-$STAMP"
  IDS_JSON=$(printf '"%s",' "${ID_ARR[@]}" | sed 's/,$//')

  RESP=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "$API/api/v1/$route/mass-edit" \
    -d "{\"ids\":[$IDS_JSON],\"description\":\"$NEW_DESC\"}")
  HTTP=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')

  if [ "$HTTP" != "200" ] && [ "$HTTP" != "201" ]; then
    echo "✗ $route: HTTP $HTTP — $(echo "$BODY" | head -c 200)"
    FAIL=$((FAIL+1))
    return
  fi

  SUC=$(echo "$BODY" | python -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('succeeded',[])))" 2>/dev/null || echo 0)
  FCNT=$(echo "$BODY" | python -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('failed',[])))" 2>/dev/null || echo "?")

  if [ "$SUC" != "$N" ] || [ "$FCNT" != "0" ]; then
    echo "✗ $route: succeeded=$SUC failed=$FCNT (expected $N)"
    FAIL=$((FAIL+1))
    return
  fi

  # Verify GET shows new description
  GOT=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$API/api/v1/$route/${ID_ARR[0]}" \
    | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('description',''))" 2>/dev/null)
  if [ "$GOT" != "$NEW_DESC" ]; then
    echo "✗ $route: GET shows description='$GOT' expected='$NEW_DESC'"
    FAIL=$((FAIL+1))
    return
  fi

  echo "✓ $route: $N docs patched + DB-verified"
  PASS=$((PASS+1))

  # Run adversarial pack once on the first module with seed data
  if [ "$ADVERSARIAL_DONE" = "0" ]; then
    ADVERSARIAL_DONE=1
    echo "  → adversarial pack on $route:"

    # empty patch
    R=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      "$API/api/v1/$route/mass-edit" \
      -d "{\"ids\":[\"${ID_ARR[0]}\"]}")
    if [ "$R" = "400" ]; then echo "    ✓ empty patch → 400"; ADV_PASS=$((ADV_PASS+1)); else echo "    ✗ empty patch → $R"; ADV_FAIL=$((ADV_FAIL+1)); fi

    # invalid UUID
    R=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      "$API/api/v1/$route/mass-edit" \
      -d '{"ids":["not-a-uuid"],"description":"x"}')
    if [ "$R" = "400" ]; then echo "    ✓ invalid UUID → 400"; ADV_PASS=$((ADV_PASS+1)); else echo "    ✗ invalid UUID → $R"; ADV_FAIL=$((ADV_FAIL+1)); fi

    # missing UUID
    RESP=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      "$API/api/v1/$route/mass-edit" \
      -d '{"ids":["ffffffff-ffff-ffff-ffff-ffffffffffff"],"description":"adv"}')
    SUC=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('succeeded',[])))" 2>/dev/null || echo "?")
    FCNT=$(echo "$RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('failed',[])))" 2>/dev/null || echo "?")
    if [ "$SUC" = "0" ] && [ "$FCNT" = "1" ]; then echo "    ✓ missing UUID → failed list"; ADV_PASS=$((ADV_PASS+1)); else echo "    ✗ missing UUID: succeeded=$SUC failed=$FCNT"; ADV_FAIL=$((ADV_FAIL+1)); fi
  fi
}

for m in "${MODULES[@]}"; do
  smoke "$m"
done

echo ""
echo "============================================================"
echo "Smoke      PASS=$PASS  FAIL=$FAIL  SKIP=$SKIP / ${#MODULES[@]}"
echo "Adversarial PASS=$ADV_PASS  FAIL=$ADV_FAIL / 3"

if [ "$FAIL" -eq 0 ] && [ "$ADV_FAIL" -eq 0 ]; then
  echo "ALL GREEN"
  exit 0
else
  echo "FAILED"
  exit 1
fi
