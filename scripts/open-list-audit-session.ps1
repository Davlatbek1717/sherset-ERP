# =============================================================================
# open-list-audit-session.ps1 — open a NEW Claude Code chat IN VS CODE with the
# next-cohort "davom et" prompt PRE-FILLED, so you can WATCH it work in VS Code.
#
# HOW IT WORKS: launches the Claude Code VS Code extension URI handler
#   vscode://anthropic.claude-code/open?prompt=<encoded>
# which opens a fresh chat with the prompt pre-filled.
#
# ⚠️ The extension PRE-FILLS the prompt but does NOT auto-submit, and it still
#    asks for permission on tool use. So this is VISIBLE + SEMI-MANUAL:
#    you press Enter to run it, and approve actions as it works. It is NOT
#    unattended. For fully-unattended (no watching), use list-audit-loop.ps1
#    (headless claude -p) instead.
#
# RUN:  powershell -File scripts/open-list-audit-session.ps1
#       (re-run once per cohort; each run opens one new session)
#
# If VS Code does not respond to the URI, the exact handler may differ on your
# install — tell Claude and we'll verify the correct vscode:// URI / command.
# =============================================================================

# Short prompt — the FULL contract lives in the repo (NEXT.md + the plan doc),
# so the URI stays short and reliable. The session reads them itself.
$prompt = @'
davom et — LIST-audit konveyeri. FAQAT BITTA keyingi cohortni bajar, NEXT.md "FAOL KONVEYER = LIST-AUDIT" bolimi + docs/audits/_NEXT-PHASE-PLAN.md (1a) boyicha:
1) NEXT.md dan keyingi ("KEYINGISI") list-cohortni top.
2) Workflow tool bilan scripts/wf-cohort-list-audit.js ni osha cohort pages bilan ishga tushir (puxta directionFacts: sibling refs, money=formatMoney, CLAUDE.md 4-bolim column-label grounding, Latin-uz gate-blind). Tugashini kut.
3) Confirmed topilmalarni capture list-grid <th> (docs/moysklad-reference/visual-captures/*/dom-default.html) bilan OZING DOM-rol bilan ground-truth qil (4-bolim) - grep-count emas. Noaniq bolsa DEFER.
4) Fix -> gate: pnpm --filter @moysklad/web typecheck; npx biome check --fix --unsafe <paths> + re-check (0/0); vitest i18n-key-existence + i18n-no-hardcoded + label-grounding; pnpm --filter @moysklad/web test (no regress).
5) Har sahifa uchun docs/audits/<page>-list.audit.md ("## A. Structural" + "## B. Interactive"). pnpm -s progress.
6) NEXT.md: cohortni TUGADI belgila, KEYINGISI ni keyingisiga kochir.
7) Stray scratch .txt larni git rm; faqat kerakli fayllarni stage (git add -A EMAS).
8) Conventional commit (lowercase subject; body <=100; done/verified/tugadi sozlari YOQ - honesty hook) -> git push origin main.
Har birlik "Phase-1, browser-smoke YOQ". Bitta cohort, keyin toxta.
'@

$encoded = [uri]::EscapeDataString($prompt)
$uri = "vscode://anthropic.claude-code/open?prompt=$encoded"

Write-Host "Opening a new Claude Code session in VS Code (prompt pre-filled)..." -ForegroundColor Cyan
Write-Host "Press Enter in the chat to run it; approve actions as it works." -ForegroundColor Yellow
Start-Process $uri
