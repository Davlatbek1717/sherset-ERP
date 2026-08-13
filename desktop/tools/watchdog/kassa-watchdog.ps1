# Sherset Kassa — watchdog (K12).
#
# NEGA KERAK: Electron jarayoni butunlay yiqilsa (OOM, drayver, Windows
# yangilanishi) kassani hech kim ko'tarmaydi — do'kon ochiq, kassa o'lik.
# `setLoginItemSettings` faqat KIRISHDA ishlaydi, yiqilishda emas.
#
# Task Scheduler har 2 daqiqada yugurtiradi (install-watchdog.ps1 ni qarang).
# Jarayon tirik bo'lsa hech narsa qilmaydi.

$ErrorActionPreference = 'Stop'
$AppName = 'Sherset Kassa'
$LogFile = Join-Path $env:APPDATA 'sherset-kassa-watchdog.log'

function Write-Log([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format 'o'), $Message
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

$proc = Get-Process -Name 'Sherset Kassa' -ErrorAction SilentlyContinue
if ($proc) { exit 0 }

# Per-user o'rnatma (F1 dan keyin) — `%LOCALAPPDATA%\Programs`.
# 🔴 Bu yo'l TAXMIN: per-user NSIS o'rnatma papkasi F8 da qurilmada o'lchanadi
# va kerak bo'lsa shu yerda tuzatiladi.
$exe = Join-Path $env:LOCALAPPDATA 'Programs\sherset-kassa\Sherset Kassa.exe'
if (-not (Test-Path $exe)) {
  Write-Log "exe topilmadi: $exe"
  exit 1
}

Write-Log "jarayon yo'q — ishga tushirilmoqda"
Start-Process -FilePath $exe
