# prepayments — LIST parity audit (Cohort L1)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Reference:** structural twin prepayment-returns + the money-doc list shell (cash/payments). capture `07-module/prepayment`.

## A. Structural / column deltas

- **FIXED — date column «Дата» → «Время»** (`tFields('moment')` → `tFields('time')`, page.tsx:235).
- **FIXED — customerOrder column carried a form-field `(optional)` suffix** (`t('customer_order')` = `pages.prepayment.customer_order` «Заказ (optional)») → `tFields('customer_order')` = «Заказ» (bare column term).
- Signed-sum prefix (`-${formatMoney}`) + the «Заказ покупателя» source-link column are correct domain columns (confirmed_mirrors, not deltas).

## B. Interactive deltas

- **FIXED (HIGH, gate-blind) — local `editMenuItems`/`printMenuItems` hardcoded Latin-uz** ("Arxivga ko'chirish", "O'chirish", "Tanlangan elementlarni o'chirish?", `N ta element o'chiriladi`, "Hujjat blankasi") → routed `editMenu` through the shared i18n-clean `useDocEditMenuItems` (the same hook the 4 cash/payment lists use); print item → `tPrintMenu('document_blank')` (new key «Бланк документа»/«Hujjat blankasi»). Removes duplication (CLAUDE.md "ikki xillik bo'lmasin").
- **FIXED (MED) — dead/unwired bulk-archive stub** (`{ id:'archive', onSelect:()=>{}, disabled:true }`) removed (the shared hook has no archive item; no bulk-archive endpoint).
- **FIXED (LOW) — mass-edit was unreachable** (MassEditModal wired only via BulkActionBar; toolbar editMenu had no mass-edit entry) → shared hook exposes «Массовое редактирование» via `onMassEdit: openMassEdit`; `onMassEditClick` extracted to the shared `openMassEdit`.
- `useConfirm` page-binding removed (now handled inside the shared hook).

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ (+document_blank key) · web Vitest 1306 green (no regress).
