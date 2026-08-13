# Watchdog'ni Task Scheduler'ga yozadi. Qurilmada BIR MARTA, admin bilan.
#
#   powershell -ExecutionPolicy Bypass -File install-watchdog.ps1
#
# O'chirish:  Unregister-ScheduledTask -TaskName 'ShersetKassaWatchdog' -Confirm:$false

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'kassa-watchdog.ps1'
if (-not (Test-Path $script)) { throw "kassa-watchdog.ps1 topilmadi: $script" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 2)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName 'ShersetKassaWatchdog' -Action $action `
  -Trigger $trigger -Settings $settings -Force -RunLevel Limited

Write-Host "Watchdog o'rnatildi. Sinov: jarayonni Task Manager'dan yopib, 2 daqiqa kuting."
