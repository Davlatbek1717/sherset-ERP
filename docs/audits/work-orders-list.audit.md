# production/work-orders — LIST parity audit (Cohort L5)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_68a1e798-7d2`, 41 agents, 25 confirmed).
**Ground-truth (§4):** CLEAN screenshot + DOM `10-module/productiontask/dom/00-clean-default.html` («Производственные задания»). moysklad default grid header row (DOM-role THEAD, NOT the Tasks/Files side-panel `<th>`):
`☑ · № · Время · Организация · Начало производства · Завершение производства · Запланировано · Произведено · Отправлено · Напечатано · Комментарий · ⚙`.

## B. Interactive / data deltas — date format (FIXED)

- 🟢 **`planned_start_at` cell used raw `new Date(...).toLocaleDateString('uz-UZ')`** → produces `04/06/2025` (slashes). Replaced with the shared `formatDateOnly` (`04.06.2025`, dot separators — the moysklad-parity formatter every other production list uses). Same applied to the new end-date column.

## A. Structural / column deltas (FIXED — data-present adds)

- **+«Время» column (createdAt)** added after «№» — moysklad's 2nd column and the default-sort column. `createdAt` is already in the BE list payload (`serialize` spreads `...r`); added `createdAt` to the FE interface + a `formatDate` (date+time) cell. (default sort was already `createdAt` desc but had no visible column.)
- **+«Завершение производства» column (plannedEndAt)** added after «Начало производства» — FE type already declared `plannedEndAt`, BE returns it; `formatDateOnly` cell.
- **+«Комментарий» column (description)** added (trailing) — `description` in the BE payload (added to the FE interface); `tFields('description')` header.

## DEFER (Phase-2 / BE feature — documented, not fixed)

- 🟡 **«Организация» column** — moysklad shows it; `WorkOrder` list row has no `organization` relation (BE-include gap).
- 🟡 **Trailing «Отправлено» · «Напечатано» columns** — no `published`/`printed` scalars in the row (BE-include gap).
- 🟢 **Extra columns «Техкарта» / «Склад» / «Статус» / «Владелец»** — not in moysklad's default grid; kept as useful extras (removal = behavior change).
- 🟢 **«Начало/Завершение производства» = planned vs actual** — moysklad's columns are the production start/end; our cells render `plannedStartAt`/`plannedEndAt` (planned). Labels kept as «Плановая дата начала/завершения» (internal planned/planned consistency); the planned-vs-actual semantic alignment is a Phase-2 data-model decision.
- 🟢 **`planned_qty` label «Плановое количество» vs moysklad «Запланировано»** — marginal; `planned_qty` is shared with the detail form. Kept.

## Gates
typecheck 0 · biome 0/0 (staged) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (`Время/Начало производства/Завершение производства/Запланировано/Произведено/Комментарий` grounded + formatDate/no-toLocaleDateString wiring-lock) · web Vitest 1331 pass/1 skip (no regress).
