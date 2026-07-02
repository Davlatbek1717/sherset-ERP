# Windows dev environment setup (Docker yo'q)
# Requires: PowerShell 5+, winget, admin for installs

$ErrorActionPreference = 'Stop'

Write-Host "== Moysklad Clone — Dev environment setup (Windows) ==" -ForegroundColor Cyan

# ── Node.js (via nvm-windows or winget) ───────────────────────
$requiredNode = "20.11.0"
$currentNode = node --version 2>$null
if ($LASTEXITCODE -ne 0 -or $currentNode -notmatch "^v$requiredNode") {
    Write-Host "Installing Node.js $requiredNode..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS --version $requiredNode --accept-source-agreements --accept-package-agreements
} else {
    Write-Host "[OK] Node.js $currentNode" -ForegroundColor Green
}

# ── pnpm (via corepack) ───────────────────────────────────────
corepack enable
corepack prepare pnpm@9.15.0 --activate
Write-Host "[OK] pnpm $(pnpm --version)" -ForegroundColor Green

# ── PostgreSQL 16 ─────────────────────────────────────────────
$pgVersion = & psql --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing PostgreSQL 16..." -ForegroundColor Yellow
    winget install PostgreSQL.PostgreSQL.16 --accept-source-agreements --accept-package-agreements
    Write-Host ""
    Write-Host "!! MANUAL STEP: set PATH to include PostgreSQL bin and restart shell" -ForegroundColor Yellow
    Write-Host "   Example: C:\Program Files\PostgreSQL\16\bin" -ForegroundColor Yellow
} else {
    Write-Host "[OK] $pgVersion" -ForegroundColor Green
}

# ── Memurai (Redis-compatible for Windows) ────────────────────
$memurai = Get-Service -Name "Memurai" -ErrorAction SilentlyContinue
if (-not $memurai) {
    Write-Host "Installing Memurai (Redis for Windows)..." -ForegroundColor Yellow
    winget install Memurai.MemuraiDeveloper --accept-source-agreements --accept-package-agreements
} else {
    Write-Host "[OK] Memurai service" -ForegroundColor Green
}

# ── MinIO ─────────────────────────────────────────────────────
$minioPath = ".\bin\minio.exe"
if (-not (Test-Path $minioPath)) {
    Write-Host "Downloading MinIO..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path ".\bin" | Out-Null
    Invoke-WebRequest "https://dl.min.io/server/minio/release/windows-amd64/minio.exe" -OutFile $minioPath
} else {
    Write-Host "[OK] MinIO at $minioPath" -ForegroundColor Green
}

# ── Mailhog ───────────────────────────────────────────────────
$mailhogPath = ".\bin\mailhog.exe"
if (-not (Test-Path $mailhogPath)) {
    Write-Host "Downloading Mailhog..." -ForegroundColor Yellow
    Invoke-WebRequest "https://github.com/mailhog/MailHog/releases/download/v1.0.1/MailHog_windows_amd64.exe" -OutFile $mailhogPath
} else {
    Write-Host "[OK] Mailhog at $mailhogPath" -ForegroundColor Green
}

# ── .env from template ────────────────────────────────────────
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "[OK] Created .env — edit with your values" -ForegroundColor Green
} else {
    Write-Host "[OK] .env already exists" -ForegroundColor Green
}

# ── Create dev database ───────────────────────────────────────
Write-Host ""
Write-Host "== Next manual steps ==" -ForegroundColor Cyan
Write-Host "1. Start PostgreSQL service (should auto-start after install)"
Write-Host "2. Create dev database:"
Write-Host "   psql -U postgres -c `"CREATE DATABASE moysklad_dev;`""
Write-Host "3. Start Memurai service (auto-starts)"
Write-Host "4. Start MinIO in a separate terminal:"
Write-Host "   .\bin\minio.exe server .\data\minio --console-address ':9001'"
Write-Host "5. Start Mailhog in a separate terminal:"
Write-Host "   .\bin\mailhog.exe"
Write-Host "6. pnpm install"
Write-Host "7. pnpm db:migrate"
Write-Host "8. pnpm db:seed"
Write-Host "9. pnpm dev"
Write-Host ""
Write-Host "[DONE]" -ForegroundColor Green
