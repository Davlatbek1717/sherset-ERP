# =============================================================================
# list-audit-loop.ps1 — LOCAL autonomous "davom et" loop for the LIST-audit conveyor.
#
# WHY LOCAL (not the remote cron): the remote routine is blocked by
# github_repo_access_denied (Claude GitHub App lacks repo access to the
# Biznesjon-Official/moysklad private repo). Local git push WORKS, so this
# script drives the conveyor from your machine instead.
#
# WHAT IT DOES: each iteration spawns a FRESH headless `claude` session
# (clean context — no bloat) that reads NEXT.md, audits ONE list-cohort with
# the list-dvigatel, ground-truths labels (§4), fixes, runs gates, makes a
# Phase-1 commit, and `git push origin main`. Loops until all L1–L12 are done
# (sentinel: docs/audits/_LIST-CONVEYOR-COMPLETE.md) or MaxIterations is hit.
#
# RUN:   pwsh -File scripts/list-audit-loop.ps1
#   (or right-click → Run with PowerShell; or `./scripts/list-audit-loop.ps1`)
#
# STOP:  Ctrl+C, or it stops itself when the conveyor is complete.
#
# ⚠️ SECURITY: uses --dangerously-skip-permissions so the headless session runs
#    unattended without permission prompts. It only runs on YOUR machine against
#    YOUR repo, and the prompt is constrained to the audit task with mandatory
#    quality gates (no commit unless typecheck/biome/i18n/vitest all pass) and
#    the honesty hook. Still: it can run arbitrary commands unattended — only run
#    it when you intend an unattended autonomous session.
# =============================================================================

param(
  [int]$MaxIterations = 15,          # runaway guard (12 cohorts + slack)
  [string]$Model = 'opus',           # 'opus' = best quality for §4 ground-truth
  [int]$PauseSeconds = 15            # breather between iterations
)

# NOTE: 'Continue' (not 'Stop') — `claude` writes warnings to stderr (e.g. the
# stdin-wait notice); under 'Stop' PowerShell 5.1 wraps a native stderr line as a
# terminating NativeCommandError and would kill the loop. 'Continue' keeps it alive.
$ErrorActionPreference = 'Continue'
$RepoRoot = Split-Path -Parent $PSScriptRoot   # scripts/.. = repo root
Set-Location $RepoRoot

$LogDir = Join-Path $RepoRoot 'scripts/.loop-logs'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

$DonePath = Join-Path $RepoRoot 'docs/audits/_LIST-CONVEYOR-COMPLETE.md'

# The self-contained "davom et" prompt run by each fresh headless session.
# Repo-relative paths (cwd = repo root). Single-quoted here-string = literal.
$Prompt = @'
Autonomous Phase-1 STRUCTURAL list-parity audit of the moysklad 1:1 clone (cwd = repo root, use relative paths). Do EXACTLY ONE list-cohort this run, then commit+push and finish.

1. Read NEXT.md -> section "FAOL KONVEYER = LIST-AUDIT" -> the LIST-cohort navbati. Pick the FIRST cohort NOT marked "TUGADI" (the one marked "KEYINGISI", else the next un-done one). L1 (money-docs) is already done.
2. Run the list-dvigatel: call the Workflow tool with scriptPath "scripts/wf-cohort-list-audit.js" and args = {family, directionFacts, pages:[{page,titleRu,entity,reference,capturePaths?}]} for that cohort. page = route slug (e.g. "customer-orders"); the engine reads ${page}/page.tsx. Write a THOROUGH directionFacts: sibling references, money must use formatMoney (NOT Number(minor)/100+suffix), CLAUDE.md section 4 column-label grounding, Latin-uz i18n is gate-blind (no-hardcoded gate is Cyrillic-only), and the legitimate absences for read-only/settings/catalog lists (so false-deltas are refuted). Wait for the workflow to finish; read its result file.
3. Take the CONFIRMED findings. GROUND-TRUTH every confirmed column/label claim YOURSELF against the moysklad capture list-grid <th> header row under docs/moysklad-reference/visual-captures/*/dom-default.html — read the DOM element-role, NOT the engine say-so, NOT a grep-count (CLAUDE.md section 4). If a capture is missing/contaminated or a label is uncertain -> DEFER + document it, do NOT guess.
4. Apply ONLY verified fixes: column labels via existing tFields/detail_titles keys (add keys to BOTH apps/web/src/messages/ru.json + uz.json if needed, keeping key-sets in parity); route hardcoded-uz toolbar menus through the shared hooks in apps/web/src/components/money/document-toolbar-menus.tsx; i18n any Cyrillic/Latin-uz leak via t(). DEFER backend gaps (document in the audit doc; do not fake).
5. Gates — ALL green or NO commit: `pnpm --filter @moysklad/web typecheck` (0 errors); `npx biome check <changed paths>` then `npx biome check --fix --unsafe <paths>` and re-check (0 errors AND 0 warnings); `pnpm --filter @moysklad/web exec vitest run src/__tests__/i18n-key-existence.test.ts src/__tests__/i18n-no-hardcoded.test.ts src/__tests__/label-grounding.test.ts`; then `pnpm --filter @moysklad/web test` (no regression).
6. Write one docs/audits/<page>-list.audit.md per list page — it MUST contain a "## A. Structural" heading AND a "## B. Interactive" heading or progress will not count it. Then run `pnpm -s progress`.
7. Update NEXT.md: mark this cohort "TUGADI" with the commit hash + workflow id, and move the "KEYINGISI" marker to the next cohort.
8. CLEAN stray scratch files: run `git status`; the audit sub-agents sometimes drop scratch .txt in capture dirs or apps/web/src/messages — `git rm` any such junk. Stage ONLY intended files (do NOT blindly `git add -A` when junk is present).
9. Commit (Conventional Commits: type fix(list) or feat(list), lowercase subject after the type, ALL body lines <=100 chars). The commit-msg honesty hook BLOCKS the words done/verified/tugadi/production-ready — phrase results as "Phase-1 structural; browser-smoke YO'Q". Then `git push origin main`.
10. HONESTY: label every unit "Phase-1, browser-smoke YO'Q". Never claim runtime/browser verification — this run is structural only (no DB, no dev server, no browser).

If ALL list cohorts L1–L12 are already "TUGADI": write docs/audits/_LIST-CONVEYOR-COMPLETE.md (consolidation report), update NEXT.md, commit+push. Do ONE cohort per run. Be thorough and self-vetting per CLAUDE.md sections 1 and 4.
'@

Write-Host "=== LIST-AUDIT LOCAL LOOP ===" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot | Model: $Model | MaxIterations: $MaxIterations"

for ($i = 1; $i -le $MaxIterations; $i++) {
  if (Test-Path $DonePath) {
    Write-Host "[$i] Conveyor complete (found _LIST-CONVEYOR-COMPLETE.md). Stopping." -ForegroundColor Green
    break
  }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $log = Join-Path $LogDir "iter-$i-$stamp.log"
  Write-Host "[$i/$MaxIterations] $(Get-Date -Format 'HH:mm:ss')  spawning headless claude -> $log" -ForegroundColor Yellow

  $headBefore = (git rev-parse HEAD).Trim()

  # Fresh headless session, one cohort. Feed EMPTY stdin ($null |) so `claude`
  # doesn't wait for piped input; do NOT use `2>&1` (PS 5.1 wraps native stderr
  # into terminating ErrorRecords). stdout -> log + console; stderr -> console.
  $null | claude -p $Prompt --dangerously-skip-permissions --model $Model --verbose | Tee-Object -FilePath $log

  $headAfter = (git rev-parse HEAD).Trim()
  if ($headBefore -eq $headAfter) {
    Write-Host "[$i] No new commit this iteration (gates failed, nothing to do, or a hang). See $log" -ForegroundColor Red
    # Don't spin forever on a stuck cohort: stop so a human can inspect.
    Write-Host "Stopping to avoid a no-progress spin. Inspect the log, then re-run." -ForegroundColor Red
    break
  }
  Write-Host "[$i] Progress: $headBefore -> $headAfter" -ForegroundColor Green
  Start-Sleep -Seconds $PauseSeconds
}

Write-Host "=== loop ended ===" -ForegroundColor Cyan
