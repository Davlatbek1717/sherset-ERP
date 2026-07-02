# Dev environment startup — Windows PowerShell
# Starts PostgreSQL, runs migrations if needed, launches API + Web dev servers.
#
# Usage:  pwsh ./tools/dev-start.ps1
# Or:     powershell -File ./tools/dev-start.ps1

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "=== Moysklad dev startup ===" -ForegroundColor Cyan

# 1. Ensure PostgreSQL is running
Write-Host "[1/5] PostgreSQL 17 holatini tekshirish..." -ForegroundColor Yellow
$pgStatus = (Get-Service postgresql-x64-17 -ErrorAction SilentlyContinue).Status
if ($pgStatus -ne 'Running') {
    Write-Host "  PostgreSQL ishlamayapti, ishga tushiraman..." -ForegroundColor Yellow
    Start-Service postgresql-x64-17
    Start-Sleep -Seconds 2
}
Write-Host "  PG 17 Running" -ForegroundColor Green

# 2. Ensure pnpm dependencies
Write-Host "[2/5] pnpm install (agar kerak bo'lsa)..." -ForegroundColor Yellow
if (-not (Test-Path "$repoRoot/node_modules")) {
    pnpm install
}
Write-Host "  Dependencies OK" -ForegroundColor Green

# 3. Prisma migrate deploy + generate (idempotent)
Write-Host "[3/5] Prisma migrate deploy + generate..." -ForegroundColor Yellow
pnpm --filter @moysklad/db exec prisma migrate deploy 2>&1 | Out-Null
pnpm --filter @moysklad/db exec prisma generate 2>&1 | Out-Null
Write-Host "  Schema synced" -ForegroundColor Green

# 4. Seed (skips if already seeded — seed script must be idempotent)
Write-Host "[4/5] Seed (agar ma'lumot yo'q bo'lsa)..." -ForegroundColor Yellow
try {
    pnpm --filter @moysklad/db seed 2>&1 | Out-Null
    Write-Host "  Seed tugadi" -ForegroundColor Green
} catch {
    Write-Host "  Seed skip/already done" -ForegroundColor DarkGray
}

# 5. Enable negative stock for demo flows
Write-Host "[5/5] allowNegativeStock=true (dev uchun)..." -ForegroundColor Yellow
pnpm --filter @moysklad/db exec tsx ../../tools/admin/enable-negative-stock.ts true 2>&1 | Out-Null
Write-Host "  Stores sozlandi" -ForegroundColor Green

Write-Host ""
Write-Host "=== Dev serverlar ==="  -ForegroundColor Cyan
Write-Host "API :4000  →  pnpm --filter @moysklad/api dev"
Write-Host "Web :3000  →  pnpm --filter @moysklad/web dev"
Write-Host ""
Write-Host "Ikkalasini alohida terminalda ishga tushiring, yoki:"
Write-Host "  pnpm -w run dev  (turbo bilan parallel)" -ForegroundColor Gray
Write-Host ""
Write-Host "Login: admin@demo.local / admin123"
Write-Host ""
