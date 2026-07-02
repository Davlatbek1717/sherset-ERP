# pipelines/[id] — detail page parity audit

- **Module:** `pipelines` (Воронки / sales-funnel config — ordered stage list) detail page
  (`apps/web/src/app/(app)/pipelines/[id]/page.tsx` + `/new`, shared `components/pipeline-editor.tsx`)
- **Date:** 2026-06-04 (Cohort G — CRM)
- **Protocol:** Cohort batch audit (`wf_85fba5eb-9ba`). Premise classified pipelines as a CONFIG entity (no
  counterparty/money/positions/DocumentTabs) and demoted every document + opportunities as references — it is a
  stage-list editor only. Operator ground-truthed each delta.
- **Reference:** config-list editor shell only (no money/agent/audit). `03-module/sales-funnel` = stage-label source.

## Verdict

pipelines is a correctly-scoped funnel-config editor (name + isDefault + inline stage list via `PipelineEditor`). No
money/counterparty/History — correct for a config entity. Real issues, FIXED: hardcoded Latin-uz throws + header +
the shared editor's placeholder/aria labels; plus a missing blank-stage-name guard on the detail page; plus the default
sales-funnel stage names were hardcoded Latin-uz.

## A. Structural / field deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| P1 | thrown validation + header (`[id]`+`/new`) | i18n via t() | `'Nom majburiy'`, `'Bir bosqich majburiy'`, `"Bosqich nomi bo'sh bo'lmasin"`, `titlePrefix="Voronka"`, `stateLabel="Yangi"`, `customTitle="Yangi voronka"` | delta | high | **FIXED** → `tCommon('field_required',{field:t('name')})`, new `t('err_min_one_stage')`/`t('err_stage_name')`, `titlePrefix=""`, `tCommon('new_state')`, `t('new_title')`. |
| P2 | `PipelineEditor` (shared) placeholder + aria | i18n via t() | placeholder `"Yangi"`, aria `"Up"`/`"Down"`/`"Remove"` | delta | medium | **FIXED** → `t('stage_name_placeholder')`, `tCommon('move_up')`/`tCommon('move_down')`/`tCommon('delete_row')`. |
| P3 | default sales-funnel stage names (new page seed) | localized (RU/UZ) | hardcoded Latin-uz `Yangi/Aloqa/Taklif/Muzokara/Yutuq/Yo'qotish` | delta | medium | **FIXED** → seed split to `{type,probability,color}` + `nameKey`; names computed in-component via `t('default_stage_*')` (6 keys ru+uz). |

## B. Interactive deltas

| # | Element | expected | ours (before) | Status | Sev | Disposition |
|---|---|---|---|---|---|---|
| P4 | detail-page save validation | reject a blank stage name (as `/new` does) | `[id]` guarded only name + stages.length; a blank stage name hit the backend | delta | low | **FIXED** → added `if (stages.some(s=>!s.name.trim())) throw new Error(t('err_stage_name'))` (mirrors `/new`). |

## Confirmed mirrors (correct config-entity specifics — NOT deltas)

- No counterparty / money / positions / DocumentTabs-History / org-account — correct for an ordered stage-list config
  (`createMenuItems={[]}`, no audit entity-string to mismatch).

## Deferred

- 🟢 None.

**Gates:** web tc 0 · biome 0 · web Vitest no-regress · i18n key-existence ru+uz + no-hardcoded (pipelines route
registered). **HONEST: Phase-1 — NOT browser-smoked.** Live smokes owed: RU locale → editor placeholder/aria + default
stages render Russian; save a blank stage name → localized rejection.
