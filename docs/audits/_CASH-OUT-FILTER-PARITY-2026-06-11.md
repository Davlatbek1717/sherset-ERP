# Cash-out list «Фильтр» parity + «Статья расходов» made live — 2026-06-11n

**Status: Phase-2 (runtime-verified) for the BE + write-path** — live API smoke
12/12 (incl. the buildListWhere merge proof AND the dead-column→live proof via a
real `POST /cash-out`) + full gate. **Browser render not live-pixel-verified
this session** (Playwright MCP was not connected); the FE controls/labels are
source-locked (guard), i18n-resolved, and §4 capture-grounded.

Commit: (see NEXT.md). Sibling of payments-out (11m) — but a CASH document (РКО),
so it **deliberately diverges** on one field. `davom et`, local Opus, ultracode.

## Premise check (grep the write-path; don't trust "mirror it" blindly)

11m handed off cash-out as "money-doc sibling with the IDENTICAL dead «Статья
расходов» control → mirror this make-live fix". Grounding **confirmed the dead
column** but also surfaced a **real divergence**:

- `CashOut.expenseItem` is a free-text `VarChar(100)` column, and it was **never
  written** — no `expenseItem` field in `CreateCashOutSchema`; no `expenseItem:`
  write in `create()` / `update()` / `clone()`. The `CashOutFilterSchema`
  ALREADY had the `expenseItem` filter param (and `buildListWhere` already
  applied it), and the FE list ALREADY shipped a free-text «Статья расходов»
  control (`filter-expense-item`) wired to that dead column → matched nothing
  for every user. A pre-existing **11h dead control**. Confirmed → make live.
- **Divergence:** the unified moysklad money filter lists «Счёт организации»
  (`organizationAccountId`), and payments-out (11m) surfaced it — but **CashOut
  has NO `organizationAccountId` column**. A cash order uses a **cash desk**
  («Касса», `cashDeskId`), not a bank account. Surfacing «Счёт организации»
  would be a dead 11h filter, so it is **deliberately omitted** (and the web
  guard asserts its absence so a future "just mirror payments-out" edit can't
  reintroduce it). This matches the existing `cash-out.schema.ts` NOTE.

## §4 grounding (capture: 07-module/cashout/dom/00-clean-default.html)

The moysklad cash-out list renders the same unified money-document filter panel.
DOM-grounded field labels (`<div class="gwt-Label" title="…">`), ordered:

```
… Проект · Контрагент · Группа контрагента · Договор · Владелец контрагента ·
Организация · Счет организации · Тип документа · Статус · Проведено · Напечатано ·
Отправлено · Канал продаж · Без закрывающих документов · Владелец-сотрудник ·
Владелец-отдел · Общий доступ · Кто изменил
```

- **«Владелец контрагента»** sits between «Договор» and «Организация» — that is
  exactly where the new control was inserted in the FE panel.
- **«Статья расходов»** is ALSO grounded as a **document-form field** (a separate
  capture hit rendered it inside `validationLabelRequired` — i.e. moysklad's РКО
  edit form carries it, even as a required field). This is stronger doc-form
  grounding than payments-out had (whose doc-form captures were «Корзина»-
  contaminated). We keep it **optional** (`nullish`) to mirror PaymentOut and not
  break existing drafts/clones.
- §4 near-miss caught: the capture spells it **«Счет организации»** (plain е), not
  «Счёт» (ё) — an initial grep with ё returned a false 0-count. The field IS in
  the panel; it's excluded on a **backing-column** basis (no column), not a
  spelling artifact.

## What shipped

### 1. «Статья расходов» (`expenseItem`) — dead column → LIVE end-to-end (the distinguishing fix)
- BE: added `expenseItem` to `CreateCashOutSchema` (`z.string().max(100)
  .nullish()`); persisted in `create()`, `update()` (key-present guard, mirrors
  `paymentPurpose`), and `clone()` (Скопировать preserves it).
- FE document forms (`/new` + `/[id]`): a «Статья расходов» picker
  (`field-expense-item`) from `/expense-items` (the dictionary), storing the
  selected name into the free-text column. Editable on a draft.
- The pre-existing list filter (`expenseItem` contains, FE control unchanged) is
  now honest: documents can carry an expense item, so the filter narrows.
- **Proof (smoke checks 4–5):** a row created via the REAL `POST /cash-out` with
  `expenseItem` re-GETs with that value (write-path live, was dropped), and
  `?expenseItem=arenda` narrows to exactly it.

### 2. «Владелец контрагента» → `agentOwnerId` (new live filter field)
- Filters `agent.ownerId` — the employee who owns the counterparty, distinct from
  «Владелец-сотрудник» (`ownerId`, the cash order's own owner). LIVE:
  `Counterparty.ownerId` is written on counterparty create.
- New BE filter param + a **merged** `agent: {}` clause + FE employees picker.

### buildListWhere merge (bug prevented + runtime-proven)
`agentGroupId` and `agentOwnerId` both narrow the same `agent` relation. Two
separate `...(x ? { agent: {…} } : {})` spreads would put `agent` in the object
literal twice → **last key wins, silently dropping the other predicate**. Merged
into one clause (mirror of the 11l/11m fix). Smoke check 3 proves it: a
counterparty owned by employee A but in a *different* group is **excluded** when
`agentGroupId=G & agentOwnerId=A` (size 1 = only the G∩A row).

## DEFERRED — the other moysklad filter fields (11h evidence, NOT blindly wired)

Same disciplined deferral as payments-out 11m; each is dead / computed / N/A on a
cash order (write-path grep first):

| moysklad field | reason deferred |
|---|---|
| **Счёт организации** (`organizationAccountId`) | **no backing column on CashOut** — cash docs use «Касса» (cashDeskId), not a bank account. The DIVERGENCE from payments-out. Surfacing it = dead filter. |
| Канал продаж (`salesChannelId`) | column exists, **never written by cash-out** (only CO/demand/invoice-out/sales-return write it) |
| Напечатано (`printed`) | column exists, no mark-printed endpoint writes it |
| Общий доступ (`shared`) | column exists, never written by app code |
| Отправлено · Кто изменил · Дата начисления · Точка продаж | no backing column on CashOut |
| Распределён · Без закрывающих документов | `noClosingDocs` column exists but is a flag, not a list-filter; Распределён is computed (allocation completeness) |
| Тип документа | single-type page (moysklad's belongs to the unified «Платежи» ledger) |

Optional minor (deferred, same as 11m): upgrade the «Статья расходов» list filter
from free-text to a dictionary `<select>` (moysklad renders one); free-text
contains is a superset that already works for the picked exact names.

## Verification

- **api tc0 · web tc0 · biome0** (changed files; the smoke script keeps the
  standard CLI `noConsoleLog` warnings).
- **api Vitest 2884 (+4, 0 regress)** — `cash-out.schema.test` (create
  expenseItem accept + max-100 reject + agentOwnerId distinct-from-ownerId +
  reject non-uuid agentOwnerId).
- **web Vitest 2149 (+10, 0 regress)** — `cash-out-filter-fields.test` (render +
  forwarding anchored on `paramsRecord.X = extFilter.X` assignment + picker route
  + i18n key + **the «Счёт организации» absence lock** + the doc-form
  expense-item write-path: create payload spread, PATCH payload, hydrate,
  dirty-snapshot — non-vacuous).
- **Runtime smoke 12/12** — `tools/scripts/verify-cash-out-filter-smoke.mjs`
  (live API + self-reverting DB): agentOwnerId narrows · agentGroupId narrows ·
  **merge → only the intersection** · **expenseItem persisted via real POST +
  filter narrows** · AND across the two new filters → none.

**Honest caveat:** Browser render was NOT live-pixel-verified this session
(Playwright MCP unavailable). The new filter control + the doc-form expense-item
picker are source-locked (guard), their i18n keys resolve to the §4-grounded RU
strings («Владелец контрагента» / «Статья расходов»), and the BE narrowing is
runtime-proven. No per-applied-filter pixel sweep.

## Next (filter-parity backlog A — same pattern)

- **supplies / invoices** filter-parity (~18 → 24/25), capture-grounded
  `<entity>/states/02-filter-applied.png`, grep write-paths FIRST.
- The cash-in sibling has **no** «Статья расходов» (приходный ордер carries no
  expense item) — its «Владелец контрагента» gap, if present, is the only mirror
  there (check the cashin capture).
- Deferred backlog items unchanged: «Тип» open-dropdown capture · «Ожидание»
  in-transit · vestigial `stock_minor` DROP · box (2/3) grounding · Phase-3
  master-plan.
