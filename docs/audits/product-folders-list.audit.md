# product-folders — LIST parity audit (Cohort L6)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_cabc94da-b58`, 46 agents, 27 confirmed).
**Ground-truth (§4):** NO clean catalog capture (all 04-module captures CONTAMINATED). product-folders is a recursive **«Группы товаров» TREE editor** (inline create/edit/delete rows), not a flat ListView — its lack of pagination / bulk-bar / sortable headers / search box is LEGITIMATE (moysklad's folder UI is also a tree) and was NOT flagged. The fixes here are all the gate-blind **hardcoded Latin-uz i18n leak** bug-class (no-hardcoded gate is Cyrillic-only AND skips list pages → double-blind).

## A. Structural / label (i18n) deltas — FIXED (whole-page sweep, ru+uz keys added under `pages.product_folders`)
- chevron `aria-label` `'Yopish'`/`'Ochish'` → `t('toggle_collapse')`/`t('toggle_expand')` («Свернуть»/«Развернуть»).
- VAT cell fallback `'NDSsiz'` → `t('vat_disabled')` («Без НДС»); parent-inherit annotation `'(otadan)'` → `t('vat_inherited')` («(от родителя)»).
- row-action button titles: `"Sub-guruh qo'shish"` → `t('add_subfolder')` («Добавить подгруппу»); `"Tahrirlash"` → `tCommon('edit')`; `"O'chirish"` → `tCommon('delete')`.
- delete-confirm dialog: title `"…guruhini o'chirishni tasdiqlaysizmi?"` → `t('delete_confirm_title',{name})`; description → `t('delete_blocked')` (has-content) / `tCommon('action_irreversible')` (empty). (Re-introduced the exact leak the shared `useDestructiveMutation` was localized to prevent — the caller overrode the localized defaults with raw Latin-uz.)
- form validation `setFormError('Nomi majburiy')` → `tCommon('field_required',{field:tFields('name')})`.
- malformed inherit-VAT `<Label>` `{tFields('vat')} ←` (rendered «НДС ←», a dangling arrow) → `t('use_parent_vat')` («Наследовать НДС от родительской группы») — a descriptive control label (new key, not an invented catalog term — §4-safe).
- Wiring: `FolderRow` is a real JSX-rendered component, so `useTranslations` is called inside it directly (no prop-threading).

## B. Interactive / data deltas — FIXED
- **VAT free-text guard** (mirrors products' F4-class regex-before-Number): `submit()` now rejects non-integer VAT (`!/^\d+$/`) with `t('number_invalid')` before `saveMut.mutate()`. Previously `vat ? Number(vat) : null` could send `NaN` → raw backend 400.

## DEFER / non-issues
- 🟢 Tree has no pagination / bulk-action bar / sortable headers / search box — LEGITIMATE for a «Группы товаров» tree (NOT a flagged delta).
- 🟢 folder_picker_title/folder_placeholder («Выбор папки»/«Выберите папку») in the detail FORM say «папка» — detail-form scope, out of L6 list axis. Phase-2 detail polish.

## Gates
typecheck 0 (web+api) · biome 0/0 (changed files) · i18n key-existence ru+uz ✓ (9 new keys) · no-hardcoded ✓ · label-grounding ✓ (product-folders no-Latin-uz wiring-lock) · web Vitest 1338 pass/1 skip (no regress).
