# production/boms — LIST parity audit (Cohort L5)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Engine:** `wf-cohort-list-audit.js` (`wf_68a1e798-7d2`, 41 agents, 25 confirmed).
**Ground-truth (§4):** CLEAN screenshot + DOM `10-module/processingplan/dom/00-clean-default.html` («Техкарты»). moysklad default grid header row (DOM-role): `☑ · Наименование · Оплата труда · Затраты на производство · Комментарий · ⚙`. TEMPLATE catalog — archived inline filter only; doc-toolbar/period/sum/store absences legitimate.

## A. Structural / column deltas

- No column/label deltas FIXED this pass. The cost-column decomposition («Оплата труда» + «Затраты на производство») and «Комментарий» column are a BE-include feature-gap — see DEFER. Our single `standard_cost` was **not** renamed (it does not cleanly map to «Затраты на производство»).

## B. Interactive / toolbar deltas (FIXED — catalog-sibling parity)

- 🟠 **Toolbar refresh button absent** — `refetch` wired only to `onRetry`, never `onRefresh`; the title-adjacent ↻ never rendered. **Fix:** `onRefresh={() => refetch()}` (matches catalog siblings `processes`/`stages`).
- 🟢 **Create button placement** — `createPosition` omitted → defaulted to `'end'`. **Fix:** `createPosition="start"` (right of title), matching `processes`/`stages`.

## DEFER (Phase-2 / BE feature — documented, not fixed)

- 🟡 **Column-set decomposition** — moysklad splits cost into **two** columns: «Оплата труда» (labor) + «Затраты на производство» (production costs), plus «Комментарий». Our single `standard_cost` («Плановая себестоимость») is an aggregate; it does **not** cleanly map to «Затраты на производство» (so it was NOT renamed — engine correctly declined the rename). Adding the labor/comment columns + the cost split = BE feature-gap (`Bom` row has only `standardCostMinor`, no labor/description split).
- 🟢 **Extra columns «Выходной товар» / «Компоненты» (count) / «Статус» (archived)** — not in moysklad default; kept as useful extras.
- 🟡 **Row selection + «Изменить» (mass-edit)** — moysklad Техкарты shows ☑ + «Изменить»; our list has none. BE exposes `bulk-archive`/`bulk-restore` but no mass-edit → Phase-2/BE.

## Gates
typecheck 0 · biome 0/0 (staged) · i18n key-existence ru+uz ✓ · no-hardcoded ✓ · label-grounding ✓ (`Наименование/Оплата труда/Затраты на производство/Комментарий` grounded) · web Vitest 1331 pass/1 skip (no regress).
