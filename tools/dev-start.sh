#!/usr/bin/env bash
# Dev environment startup — bash (Git Bash on Windows or Linux/macOS)
# Usage:  bash tools/dev-start.sh

set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== Moysklad dev startup ==="

# 1. PostgreSQL (Windows: service; Linux/macOS: assume systemd or user-managed)
echo "[1/5] PostgreSQL holatini tekshirish..."
if command -v sc.exe >/dev/null 2>&1; then
  # Windows via Git Bash
  if ! sc.exe query postgresql-x64-17 | grep -q RUNNING; then
    echo "  PG ishlamayapti. Administrator rejimida ishga tushiring:"
    echo "  net start postgresql-x64-17"
    exit 1
  fi
  echo "  PG 17 Running"
else
  # Linux/macOS
  if ! pg_isready -p 5433 >/dev/null 2>&1; then
    echo "  PG :5433 da javob bermayapti. Ishga tushiring va qayta urinib ko'ring."
    exit 1
  fi
  echo "  PG responding on :5433"
fi

# 2. Dependencies
echo "[2/5] pnpm install (agar kerak bo'lsa)..."
if [ ! -d node_modules ]; then
  pnpm install
fi

# 3. Prisma
echo "[3/5] Prisma migrate + generate..."
pnpm --filter @moysklad/db exec prisma migrate deploy >/dev/null
pnpm --filter @moysklad/db exec prisma generate >/dev/null

# 4. Seed (idempotent)
echo "[4/5] Seed..."
pnpm --filter @moysklad/db seed >/dev/null 2>&1 || echo "  seed skipped (already done)"

# 5. allowNegativeStock for demo
echo "[5/5] allowNegativeStock=true..."
pnpm --filter @moysklad/db exec tsx ../../tools/admin/enable-negative-stock.ts true >/dev/null

echo ""
echo "=== Dev serverlar ==="
echo "API :4000  →  pnpm --filter @moysklad/api dev"
echo "Web :3000  →  pnpm --filter @moysklad/web dev"
echo ""
echo "Login: admin@demo.local / admin123"
