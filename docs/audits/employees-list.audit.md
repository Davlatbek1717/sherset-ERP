# hr/employees — LIST parity audit (Cohort L9 · HR)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_7d22c330-542`). Premise EXCELLENT (9 bias-immunizations + 7 extra-checks, all aligned with the §4 ground-truth); diff returned **0 findings / 15 confirmed mirrors**.
**Ground-truth (§4):** moysklad «Сотрудники» = `00-module/employee` capture. The clean **screenshot** `screenshots/00-clean-default.png` was read directly (the `dom/00-clean-default.html` `<title>Сотрудники` is right but the body carries hidden contamination markers Контрагент/Адрес доставки — trusted the screenshot, not a DOM grep). moysklad columns: Вход · Фамилия · Имя · Отчество · E-mail · Телефон · Логин · Описание; toolbar «+Сотрудник» · «Фильтр» · search「ФИО」· «Как настроить права доступа»; pager «1-6 из 6».

## A. Structural / columns + i18n — CLEAN (intentional richer redesign)
- Our list **intentionally** renders a richer HR column set — checkbox · Name+avatar (email/phone subline) · Roles · Telegram · Department · Actions — DELIBERATELY differing from the moysklad catalog columns. This is a documented product decision (`page.tsx:1-12` + `docs/moysklad-reference/employees/FINDING.md`), NOT a parity delta. The moysklad capture is parity-source ONLY for the bulk/state surface; the column set is demoted to feature-source. → no column add/remove/rename/reorder churn.
- **No money column** (employee is not a money entity — correct). **No date column** (no «Создано»/«Время» cell → no locale-format risk).
- **i18n fully keyed, no leak:** `page.tsx` + `_components/{bulk-actions-dropdown,employee-modal,set-password-modal}` route every string through `t('pages.hrEmployees.*')` / `tCommon` / `tBulk` / `t('bulk_actions.*')`. Emoji row-buttons (🔑✏️❌↩️) all carry `title`/`aria-label`. No hardcoded Cyrillic OR Latin-uz (both gate-blind axes verified by hand).
- **Bulk surface = moysklad-grounded & thin:** «Изменить ▾» = {Удалить · Поместить в архив · Извлечь из архива} only (no Копировать/Массовое редактирование/Переместить/Цены) — matches the capture metadata exactly (`bulk-actions-dropdown.tsx:3-21`). «Состояние» active/archived view gates archive vs restore.

## B. Interactive / wiring + pagination — CLEAN (no silent failure)
- **Pagination is CORRECT (not the L6/L8 dead-pagination bug-class):** BE `hr-employee.service.ts:56-79` runs `$transaction([findMany({skip:(page-1)*limit, take:limit}), count({where})])` and returns a **real `total`** → pages beyond 50 rows are reachable and the count is truthful. FE wires `page`/`limit=50` + real `totalPages` (`page.tsx:128-129`).
- **Bulk + per-row mutations all wired with error surface:** `bulkDelete/bulkArchive/bulkRestore` via `useApiMutation` + `runBulk` + a partial-result toast that surfaces the FK-restrict reason (`bulk-actions-dropdown.tsx:56-91`); per-row `deleteMut`/`restoreMut` have `onError → toast.error` (`page.tsx:87-106`). No dead button, no silent failure.
- Selection is scoped to visible rows and cleared on any filter/page/status change (`page.tsx:133-162`) — a bulk action can never hit a hidden row.

## DEFER / Phase-2
- Default sort is BE-owned (no client sort control on this catalog list) — confirm the BE default ordering vs moysklad in browser QA.
- Browser-smoke of create/edit/set-password/bulk round-trips = Phase-2.

## Gates
typecheck 0 (web) · biome 0 · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding 87 · web Vitest 1355 pass/1 skip (0 regress). **No code change on this page (audit-only — page is clean/mature).**
