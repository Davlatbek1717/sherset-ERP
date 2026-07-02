# print-templates — LIST parity audit (Cohort L12 · Settings-org)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_9bba0f00-850`) — diff flagged archive dead-end + empty-copy mismatch + create-gap. Opus verified the BE supports restore/archived-filter/create.
**Ground-truth (§4):** NO moysklad capture; partially-bespoke settings list. Sibling = label-templates (the wired template-admin pattern). No label churn.
**DEDUP:** no detail page. Full audit on the LIST axis.

## A. Structural / columns + i18n — 1 fix (empty-state honesty)
- Columns name(+default badge)/format/page/enabled; headers via `t()` — no hardcoded leak. Entity-group filter pills wired; sort threaded.
- **Empty-state fix:** `empty_description` said «Нажмите кнопку ниже, чтобы создать шаблон» but there is no create button on this page → reworded to «Для этого типа документа шаблоны печати ещё не созданы» (no longer references a non-existent button).

## B. Interactive chrome — 🔴 FIX (archive one-way dead-end)
- **Bug:** the row archive button archived a template, but the page had **no Active/Archived filter and no restore action**, while the BE list defaults to `archived:false` — so an archived template vanished from the UI with no way back (the BE has both `@Post(:id/restore)` and an `archived` list filter).
- **Fix (mirror label-templates):** `showArchived` state + `...(showArchived ? { archived: 'true' } : {})` in params/queryKey; a "Показать/Скрыть архивные" toggle (`extraActionsLeft`); a `restoreMut` (`useApiMutation`) and a per-row restore button shown when `row.archived` (in place of the archive button). New keys: `restore`, `show_archived`, `hide_archived`.

## DEFER / Phase-2
- **Create/edit editor = feature gap (DEFER):** the BE supports `@Post`/`@Patch`, but there is no `/new`+`/[id]` editor route or modal on the FE. A print-template body/format editor is a substantial feature, out of list-audit scope → Track 3 / feature backlog.
- Browser-smoke: archive → toggle "Показать архивные" → restore round-trip (runtime-unverified).

## Gates
typecheck 0 (web+api) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 106 · web Vitest 1374 (+13, 0 regress) · api Vitest 2607 (+2, 0 regress).
