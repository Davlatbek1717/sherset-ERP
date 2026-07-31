#!/usr/bin/env bash
#
# Sherset smart deploy — only rebuild what actually changed.
#
# Why: `apps/api` runs via tsx (source-direct, NO build step — see
# deploy/ecosystem.sherset.config.cjs), so a backend-only change deploys in
# SECONDS (just `pm2 restart sherset-api`). The expensive part is the frontend
# `next build` (~318 routes → 10-20 min). The old flow ran that build on EVERY
# deploy, even for backend-only changes — that is the "30 minutes" problem.
#
# This script inspects the pulled diff and runs ONLY the steps the change needs:
#   - pnpm install          → only if pnpm-lock.yaml changed
#   - prisma migrate deploy → ALWAYS (idempotent; see §2 for why not diff-gated)
#   - money + web build     → only if the frontend changed (keeps .next/cache = incremental)
#   - restart $PM2_WEB      → only if the frontend was rebuilt
#   - restart $PM2_API      → only if the backend changed (no build)
#
# Multi-tenant box: touches ONLY the configured APP_DIR and its two PM2 apps.
# Never touches biznesjon / erp / akademiya / servis.
#
# TWO DEPLOYMENTS live on this box and they need DIFFERENT targets. Until
# 2026-07-31 everything below was hardcoded to the OLD one, so erp.sherset.uz
# could not be deployed with this script at all — it was deployed by hand with
# a one-liner that had NO `prisma migrate deploy` and NO API restart. That is
# exactly what took production down on 2026-07-31 (GET /demands/:id → 500:
# code shipped with `demand_positions.cell_id`, the column was never added).
#
# Usage:
#   sherset.biznesjon.uz (default, unchanged):
#     bash /var/www/sherset/deploy/deploy-smart.sh
#   erp.sherset.uz:
#     DS_TARGET=v2 bash /var/www/sherset-v2/deploy/deploy-smart.sh
#   or override individually: DS_APP_DIR / DS_BRANCH / DS_PM2_WEB / DS_PM2_API
set -euo pipefail

# Self-copy guard: this script lives in the repo it resets, and the
# `git reset --hard` below rewrites tracked files (including THIS file) mid-run.
# Re-exec from a temp copy so the running instance is immune to the reset.
if [ "${DS_REEXEC:-}" != "1" ]; then
  cp "$0" /tmp/sherset-deploy-run.sh
  exec env DS_REEXEC=1 bash /tmp/sherset-deploy-run.sh "$@"
fi

# ── Target selection ────────────────────────────────────────────────────────
# `DS_TARGET=v2` picks erp.sherset.uz; anything else keeps the historical
# sherset.biznesjon.uz defaults, so existing callers behave exactly as before.
if [ "${DS_TARGET:-}" = "v2" ]; then
  : "${DS_APP_DIR:=/var/www/sherset-v2}"
  : "${DS_BRANCH:=climart-adoption}"
  : "${DS_PM2_WEB:=sherset-v2-web}"
  : "${DS_PM2_API:=sherset-v2-api}"
fi
APP_DIR="${DS_APP_DIR:-/var/www/sherset}"
BRANCH="${DS_BRANCH:-main}"
PM2_WEB="${DS_PM2_WEB:-sherset-web}"
PM2_API="${DS_PM2_API:-sherset-api}"

cd "$APP_DIR"

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

# Restarting a name that does not exist would exit 0 on some pm2 versions and
# leave the OLD process serving — a silent no-op deploy. Fail loudly instead.
assert_pm2() {
  pm2 describe "$1" >/dev/null 2>&1 || {
    echo "FATAL: pm2 app '$1' not found. Wrong DS_TARGET? Run 'pm2 list'." >&2
    exit 1
  }
}
assert_pm2 "$PM2_WEB"
assert_pm2 "$PM2_API"

step "Target: $APP_DIR @ $BRANCH → $PM2_WEB / $PM2_API"

BEFORE=$(git rev-parse HEAD)
step "fetch + reset --hard origin/$BRANCH (was $BEFORE)"
# The local repo is a SHALLOW clone (deep history not portable — 2026-07-20
# migration), so each push to origin (Davlatbek1717/wareflow-erp) is a fresh
# snapshot with UNRELATED history — `git pull` (merge) cannot fast-forward across
# that. fetch + reset --hard moves the working tree to the new snapshot instead.
# `git diff BEFORE AFTER` below still works: it compares TREES, not ancestry, so
# the file-diff (and the build-skip decision) stays correct.
git fetch origin "$BRANCH"
git reset --hard FETCH_HEAD
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  echo "No new commits — nothing to deploy."
  exit 0
fi

CHANGED=$(git diff --name-only "$BEFORE" "$AFTER")
step "Changed files ($(echo "$CHANGED" | wc -l)):"
echo "$CHANGED" | sed 's/^/    /'

has() { echo "$CHANGED" | grep -qE "$1"; }

DID_SOMETHING=0

# 1. Dependencies — only when the lockfile moved.
if has '(^|/)pnpm-lock\.yaml$'; then
  step "pnpm-lock.yaml changed → pnpm install --frozen-lockfile"
  pnpm install --frozen-lockfile
fi

# 1.5 Prisma client — it is gitignored (NOT shipped: saves ~35MB of generated
# code + binary engines per deploy). It survives `git reset` (untracked), so
# regenerate only when the DB package changed OR the client is missing (first
# deploy after untracking). MUST run before the web build and the API restart —
# both import @moysklad/db. `prisma generate` produces the correct Linux engine
# here (the old committed Windows engine was dead weight on this box).
if has '^packages/db/' || [ ! -f packages/db/src/generated/index.js ]; then
  step "Regenerate Prisma client (gitignored → generated on deploy)"
  pnpm --filter @moysklad/db generate
fi

# 2. DB — ALWAYS. `migrate deploy` is idempotent and takes ~1s with nothing
#    pending, so the old "only when the diff adds a migration" optimisation
#    bought nothing and could not be trusted: if a migration shipped in an
#    EARLIER commit that this box never applied (hand-deploy, failed run,
#    restored DB), the diff is empty and the drift silently survives. That is
#    the 2026-07-31 outage — code with `demand_positions.cell_id` running
#    against a DB without the column, every GET /demands/:id a 500.
#    Running it unconditionally makes the schema a precondition of the deploy.
step "prisma migrate deploy (always — schema must match the code being served)"
npx prisma migrate deploy

# 3. Frontend — the ONLY step that needs the slow build. money builds first
#    (web imports it). .next/cache is preserved → incremental, not cold.
if has '^apps/web/|^packages/(design-system|money|ui|workflows)/'; then
  step "Frontend changed → build @moysklad/money then web (incremental)"
  pnpm --filter @moysklad/money build
  pnpm build:web
  step "restart $PM2_WEB"
  pm2 restart "$PM2_WEB" --update-env
  DID_SOMETHING=1
fi

# 4. Backend — tsx source-direct, NO build. Just restart. (packages/db too:
#    the API imports the generated client, which tsx resolves at runtime.)
if has '^apps/api/|^packages/db/'; then
  step "Backend changed → restart $PM2_API (tsx, no build)"
  pm2 restart "$PM2_API" --update-env
  DID_SOMETHING=1
fi

if [ "$DID_SOMETHING" = 0 ]; then
  echo "Note: only docs/config changed — no service rebuilt or restarted."
fi

step "Deploy done: $BEFORE → $AFTER"
