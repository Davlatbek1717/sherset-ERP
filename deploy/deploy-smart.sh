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
#   - pnpm install         → only if pnpm-lock.yaml changed
#   - prisma migrate deploy → only if a migration was added
#   - money + web build     → only if the frontend changed (keeps .next/cache = incremental)
#   - restart sherset-web   → only if the frontend was rebuilt
#   - restart sherset-api   → only if the backend changed (no build)
#
# Multi-tenant box: touches ONLY /var/www/sherset and the sherset-api /
# sherset-web PM2 apps. Never touches biznesjon / erp / akademiya / servis.
#
# Usage:  bash /var/www/sherset/deploy/deploy-smart.sh
set -euo pipefail

# Self-copy guard: this script lives in the repo it resets, and the
# `git reset --hard` below rewrites tracked files (including THIS file) mid-run.
# Re-exec from a temp copy so the running instance is immune to the reset.
if [ "${DS_REEXEC:-}" != "1" ]; then
  cp "$0" /tmp/sherset-deploy-run.sh
  exec env DS_REEXEC=1 bash /tmp/sherset-deploy-run.sh "$@"
fi

APP_DIR=/var/www/sherset
cd "$APP_DIR"

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

BEFORE=$(git rev-parse HEAD)
step "fetch + reset --hard origin/main (was $BEFORE)"
# The local repo is a SHALLOW clone (deep history not portable — 2026-07-20
# migration), so each push to origin (Davlatbek1717/wareflow-erp) is a fresh
# snapshot with UNRELATED history — `git pull` (merge) cannot fast-forward across
# that. fetch + reset --hard moves the working tree to the new snapshot instead.
# `git diff BEFORE AFTER` below still works: it compares TREES, not ancestry, so
# the file-diff (and the build-skip decision) stays correct.
git fetch origin main
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

# 2. DB — only when a migration was added.
if has '^packages/db/prisma/migrations/'; then
  step "New migration → prisma migrate deploy"
  npx prisma migrate deploy
fi

# 3. Frontend — the ONLY step that needs the slow build. money builds first
#    (web imports it). .next/cache is preserved → incremental, not cold.
if has '^apps/web/|^packages/(design-system|money|ui|workflows)/'; then
  step "Frontend changed → build @moysklad/money then web (incremental)"
  pnpm --filter @moysklad/money build
  pnpm build:web
  step "restart sherset-web"
  pm2 restart sherset-web --update-env
  DID_SOMETHING=1
fi

# 4. Backend — tsx source-direct, NO build. Just restart. (packages/db too:
#    the API imports the generated client, which tsx resolves at runtime.)
if has '^apps/api/|^packages/db/'; then
  step "Backend changed → restart sherset-api (tsx, no build)"
  pm2 restart sherset-api --update-env
  DID_SOMETHING=1
fi

if [ "$DID_SOMETHING" = 0 ]; then
  echo "Note: only docs/config changed — no service rebuilt or restarted."
fi

step "Deploy done: $BEFORE → $AFTER"
