@echo off
title Sherset Print Agent
cd /d "%~dp0"
echo Sherset Print Agent ishga tushmoqda...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sherset-print-agent.ps1"
echo.
echo Agent to'xtadi. Yopish uchun istalgan tugmani bosing.
pause >nul
