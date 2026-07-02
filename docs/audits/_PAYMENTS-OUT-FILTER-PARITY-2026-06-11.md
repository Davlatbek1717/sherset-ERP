# Payments-out list «Фильтр» parity + «Статья расходов» made live — 2026-06-11m

**Status: Phase-2 (runtime-verified) for the BE + write-path** — live API smoke
12/12 (incl. the buildListWhere merge proof AND the dead-column→live proof via a
real `POST /payments-out`) + full gate. **Browser render not live-pixel-verified
this session** (Playwright MCP was not connected); the FE controls/labels are
source-locked (guard), i18n-resolved, and §4 capture-grounded.

Commit: (see NEXT.md). Sibling of payments-in (11l) — same 2 filter fields PLUS
the distinguishing payments-out fix. `davom et`, local Opus, ultracode.

## Premise correction (the handoff was wrong about «Статья расходов»)

11l handed off payments-out as "the natural +1 mirror" adding «Статья расходов»
"(LIVE there: PaymentOut has expenseItemId)". **Grounding showed that premise was
false:**

- `PaymentOut.expenseItem` is a free-text `VarChar(100)` column (not an FK /
  `expenseItemId`). There IS an `ExpenseItem` dictionary model + an
  `expense-items` CRUD module, but the doc column is a free-form name string
  matching that master list (schema.prisma comment, lines ~1868-1872).
- **The column was NEVER written.** No `expenseItem` field in
  `CreatePaymentOutSchema`; no `expenseItem:` write in `create()` / `update()` /
  `clone()`. The only `expenseItem.*` writes anywhere are to the dictionary
  table, not the doc column.
- Yet the payments-out FE filter **already shipped** a free-text «Статья
  расходов» control (`filter-expense-item`) wired to that dead column → it
  matched nothing for every user. A pre-existing **11h dead control** (a user
  filters and silently gets zero rows). Worse than absent.

So the honest situation: payments-out was NOT missing «Статья расходов» — it had a
**broken** one. The fix toward parity is to make the column **live**, not to
delete the moysklad field.

## §4 grounding (capture: payments-out/states/02-filter-applied.png)

The moysklad «Исходящие платежи» filter panel is the same unified 25-field
«Платежи» panel as «Входящие платежи» (in/out share it). DOM-grounded, row by row:

```
Row1: Период · Статья расходов · Сумма платежа(от/до) · Распределён · Точка продаж
Row2: Проект · Контрагент · Группа контрагента · Договор · Владелец контрагента · Организация
Row3: Счёт организации · Тип документа · Статус · Проведено · Напечатано · Отправлено
Row4: Канал продаж · Без закрывающих документов · Владелец-сотрудник · Владелец-отдел · Общий доступ · Когда изменен
Row5: Кто изменил · Дата начисления
```

The two genuinely-live filter fields the FE was missing are the SAME as
payments-in: **Владелец контрагента** (row 2) and **Счёт организации** (row 3).
«Статья расходов» (row 1) was present-but-dead.

## What shipped

### 1. «Статья расходов» (`expenseItem`) — dead column → LIVE end-to-end (the distinguishing fix)
- BE: added `expenseItem` to `CreatePaymentOutSchema` (`z.string().max(100)
  .nullish()`); persisted in `create()`, `update()` (key-present guard, mirrors
  `paymentPurpose`), and `clone()` (Скопировать preserves it).
- FE document forms (`/new` + `/[id]`): a «Статья расходов» picker
  (`field-expense-item`) from `/expense-items` (the dictionary), storing the
  selected name into the free-text column. Editable on a draft.
- The pre-existing list filter (`expenseItem` contains, FE control unchanged) is
  now honest: documents can carry an expense item, so the filter narrows.
- **Proof (smoke checks 5–6):** a row created via the REAL `POST /payments-out`
  with `expenseItem` re-GETs with that value (write-path live, was dropped), and
  `?expenseItem=arenda` narrows to exactly it.

### 2. «Владелец контрагента» → `agentOwnerId` (new live filter field)
- Filters `agent.ownerId` — the employee who owns the counterparty, distinct from
  «Владелец-сотрудник» (`ownerId`, the payment's own owner). LIVE:
  `Counterparty.ownerId` is written on counterparty create.
- New BE filter param + a **merged** `agent: {}` clause + FE employees picker.

### 3. «Счёт организации» → `organizationAccountId` (FE-only surface)
- BE schema + `buildListWhere` already accepted it; only the FE control was
  missing (latent "BE-supported but un-surfaced" gap). Mirrors the demands /
  payments-in picker: disabled until an org is chosen, fetches
  `/organization-accounts?organizationId=`.

### buildListWhere merge (bug prevented + runtime-proven)
`agentGroupId` and `agentOwnerId` both narrow the same `agent` relation. Two
separate `...(x ? { agent: {…} } : {})` spreads would put `agent` in the object
literal twice → **last key wins, silently dropping the other predicate**. Merged
into one clause (mirror of the 11l payments-in fix). Smoke check 3 proves it:
a counterparty owned by employee A but in a *different* group is **excluded** when
`agentGroupId=G & agentOwnerId=A` (size 1 = only the G∩A row).

## DEFERRED — the other moysklad filter fields (11h evidence, NOT blindly wired)

Same disciplined deferral as payments-in 11l; each is dead / computed / N/A on an
outbound payment (write-path grep first):

| moysklad field | reason deferred |
|---|---|
| Канал продаж (`salesChannelId`) | column exists, **never written by payment-out** (only CO/demand/invoice-out/sales-return write it) — surfacing the FE control would be a dead filter (the BE filter clause is latent/dormant, not surfaced) |
| Напечатано (`printed`) | column exists, no mark-printed endpoint writes it |
| Общий доступ (`shared`) | column exists, never written by app code |
| Отправлено · Кто изменил · Дата начисления · Точка продаж | no backing column on PaymentOut |
| Распределён · Без закрывающих документов | computed (allocation completeness) — not a column |
| Тип документа | single-type page (moysklad's belongs to the unified «Платежи» ledger) |

## Verification

- **api tc0 · web tc0 · biome0** (changed files; the smoke script keeps the
  standard CLI `noConsoleLog` warnings).
- **api Vitest 2880 (+3, 0 regress)** — `payment-out.schema.test` (agentOwnerId
  distinct-from-ownerId + create expenseItem accept + max-100 reject).
- **web Vitest 2139 (+12, 0 regress)** — `payments-out-filter-fields.test`
  (render + forwarding anchored on `paramsRecord.X = extFilter.X` assignment +
  picker routes + i18n keys + the doc-form expense-item write-path: create
  payload spread, PATCH payload, hydrate, dirty-snapshot — non-vacuous).
- **Runtime smoke 12/12** — `tools/scripts/verify-payment-out-filter-smoke.mjs`
  (live API + self-reverting DB): agentOwnerId narrows · agentGroupId narrows ·
  **merge → only the intersection** · organizationAccountId → only the acct row ·
  **expenseItem persisted via real POST + filter narrows** · AND across the two
  new filters → none.

**Honest caveat:** Browser render was NOT live-pixel-verified this session
(Playwright MCP unavailable). The new filter controls + the doc-form expense-item
picker are source-locked (guard), their i18n keys resolve to the §4-grounded RU
strings («Владелец контрагента» / «Счёт организации» / «Статья расходов»), and the
BE narrowing is runtime-proven. No per-applied-filter pixel sweep.

## Next (filter-parity backlog A — same pattern)

- **cash-in / cash-out** — money-doc siblings; **cash-out has the identical dead
  «Статья расходов» control** (its `expenseItem` column is never written either) —
  apply the same make-live fix there. cash-in has no expense item.
- Each capture-grounded `<entity>/states/02-filter-applied.png`, grep write-paths
  FIRST (most of the coverage-map gap is dead fields).
- Optional minor: upgrade the «Статья расходов» list filter from free-text to a
  dictionary dropdown (moysklad renders a `<select>`); free-text contains is a
  superset that already works for the picked exact names.
