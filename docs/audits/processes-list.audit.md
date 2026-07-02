# production/processes — LIST parity audit (Cohort L5)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_68a1e798-7d2`, 41 agents, 25 confirmed).
**Ground-truth (§4):** CLEAN screenshot + DOM `10-module/processingprocess/dom/00-clean-default.html` («Техпроцессы»). moysklad default grid header row (DOM-role): `☑ · Наименование (▲) · Описание · ⚙`. This is a TEMPLATE catalog — archived inline filter, no period/sum/store/FSM/bulk — those absences are legitimate (immunised in the engine premise).

## A. Structural / column deltas (FIXED — data-present add)

- **+«Описание» column** added after «Наименование» (**new** key `t('col_description')` = «Описание»/«Tavsif»). `ProcessRow.description` is already returned by the BE list and the FE type already declares it — moysklad shows «Описание» as the only other default column; data-present add. (Engine did not raise this; added from my screenshot ground-truth, like the buyPrice precedent — `fields.description` = «Комментарий» would have been wrong, so a distinct «Описание» key was added.)

## B. Interactive / data deltas

- No interactive / data-cell deltas this pass (catalog list — no money cell, no doc-date, no FSM). Selection + «Изменить» = DEFER (BE).

## DEFER (Phase-2 / behavior — documented, not fixed)

- 🟢 **Extra columns «Код» / «Этапы» (positions count) / «Статус» (archived)** — not in moysklad's default 2-column grid; kept (removal = behavior change). Noted.
- 🟡 **Row selection + «Изменить» (mass-edit)** — the moysklad Техпроцессы grid shows a ☑ checkbox + «Изменить» dropdown; our list has none, and the BE exposes only archive/restore (no `/processing-processes/bulk-*` or mass-edit). Catalog bulk = BE endpoint + behavior change → Phase-2/BE.

## Gates
typecheck 0 · biome 0/0 (staged) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (`Наименование/Описание` grounded + col_description value-lock + wiring-lock) · web Vitest 1331 pass/1 skip (no regress).
