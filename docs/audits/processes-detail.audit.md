# processes/[id] — detail page parity audit

- **Module:** `production/processes` (Техпроцесс) detail/edit page
  (`apps/web/src/app/(app)/production/processes/[id]/page.tsx`)
- **Date:** 2026-06-03 (session 2026-06-03f — Cohort C: Production-config)
- **Protocol:** Cohort batch audit (`scripts/wf-cohort-detail-audit.js`, run `wf_9c1c1462-736`, 24-agent:
  premise → diff → completeness critic → blind refute-default verify). **Operator (Opus) re-verified every confirmed
  delta against code + backend + i18n before applying.**
- **Reference:** ⚠️ **NO moysklad gold capture for the production module.** Sibling-parity vs `production/stages/[id]`
  + `production/boms/[id]` (shared EditForm scaffold) + intrinsic critic. The positions / next-stage DAG body is
  process-unique and was checked intrinsically, not diffed.

## Verdict

processes is a config entity owning 1–100 ordered positions, each referencing a standalone Этап with a
multi-successor `nextPositions` DAG (toggle pills). Shared scaffold (name/code/externalCode/description/shared +
archive + DocTabs) matches the siblings; the DAG editing, somToTiyin/tiyinToSom round-trip, and `shared` flag are all
correctly wired. Real findings: **validation messages that throw display LABELS / hardcoded-uz instead of real error
sentences — all FIXED on both `[id]` and `/new`.**

## A. Structural / field deltas

None. processes legitimately differs from its siblings in body (positions + DAG vs components vs cost/performers); the
shared scaffold fields (name/code/externalCode/description/shared) use the same keys and `useEditFormLabels()`. Money
fields are editable so'm inputs round-tripped via `somToTiyin`/`tiyinToSom` (no minor/major coercion bug). No silently
dropped backend field (name/code/externalCode/description/shared + stages[] all sent).

## B. Interactive deltas

| # | Element | moysklad/expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| P1a | empty-positions validator (saveMut L192, createMut /new L125) | a real "add at least one stage" message | `throw new Error(t('positions_count', { count: 1 }))` → the error banner literally read **"Этапов: 1"** (a count *label*, reused as a section description at L333) | delta | med | **FIXED** → `t('err_no_positions')` (ru «Добавьте хотя бы один этап»); added to ru+uz. |
| P1b | per-row validators (L194-195 / new L127-128) | real "pick a stage" / "enter a stage name" messages | `throw new Error(t('pick_stage'))` / `t('stage_name')` — both are button/placeholder **labels** ("Выбрать этап" / "Название этапа") thrown as the error banner | delta | med | **FIXED** → `t('err_pick_stage')` / `t('err_stage_name')` (added ru+uz). The label keys `pick_stage`/`stage_name` stay — still used as button/placeholder text. |
| P1c | required-name concat (L191 / new L124) | parameterized required message | `` `${tFields('name')} majburiy` `` (translated label + hardcoded uz "majburiy" → "Название majburiy" on RU) | delta | low | **FIXED** → `tCommon('field_required', { field: tFields('name') })` (shared `common.field_required`). |

## Confirmed mirrors (correct processes specifics — NOT deltas)

- Positions DAG (next-stage toggle pills), `shared` checkbox, inline-new-stage vs existing-stage mode toggle,
  `stageLabel` prefilled from the joined `p.processingStage.name` (the backend includes it — correct hydration).
- Row-remove `aria-label` already uses `{tCommon('delete')}` (L356) — the localized pattern (boms/stages diverged; fixed
  there). CatalogPicker auto-closes via `onClose` (the "missing setPickerUid(null)" critic guess was refuted).
- No counterparty/org/currency/totals/print/doc-number — correct for a config entity.

## Deferred (documented for follow-up)

- **processes writes NO audit log** (`processing-process.service.ts` has no `auditLog.create`) → History tab vacuously
  empty; `auditEntity="processingprocess"` harmless. Adding catalog change-history = **feature**, deferred.

**Gates:** web tc 0 · api tc 0 · biome 0 (changed) · web Vitest 1262 pass/1 skip · api Vitest 2590 pass/2 skip ·
i18n key-existence ru+uz (+3 keys: `pages.processes.err_no_positions`/`err_pick_stage`/`err_stage_name`) + no-hardcoded
(route now registry-guarded). **HONEST: Phase-1 — NOT browser-smoked.** A live "submit empty/invalid process → localised
error banner" smoke is Phase-2 QA.
