# Payments-in list «Фильтр» parity — 2026-06-11l

**Status: Phase-2 (runtime-verified).** Live API smoke 9/9 (incl. the buildListWhere
merge proof) + browser RU render (both new labels match the capture) + full gate.

Commit: (see NEXT.md). Mirrors the products (11j) / counterparties (11k) filter-parity
pattern. `davom et`, local Opus, ultracode.

## Premise correction (§1 — don't trust one grep)

The 11g coverage map flagged payments-in as the **biggest** gap (`14 → 25`). Grounding
it revealed the gap is **mostly dead fields**, not a build backlog:

- The payments-in FE filter was already rich (14 controls, "mirrors the invoice-out
  gold standard").
- A naive `grep "tFilters('"` undercounts sibling pages (supplies/invoices-in use
  page-local `t('filter_*')` labels, not `tFilters`) — they too are ~18 fields. So the
  premise "these entities are thin" was **false**; all doc/money entities are 14-20
  fields already.
- The honest remaining gap on payments-in is **2 genuinely-live, §4-grounded fields**;
  the other 11 moysklad filter fields are dead / computed / N/A on an inbound payment
  and are **deferred with evidence** (the 11h dead-column discipline — wiring them
  would create dead "accepted-but-unapplied" controls).

## §4 grounding (capture: payments-in/states/02-filter-applied.png)

The rendered moysklad «Входящие платежи» filter panel has **25 fields**. Enumerated
DOM-grounded (row by row):

```
Row1: Период · Статья расходов · Сумма платежа(от/до) · Распределён · Точка продаж
Row2: Проект · Контрагент · Группа контрагента · Договор · Владелец контрагента · Организация
Row3: Счёт организации · Тип документа · Статус · Проведено · Напечатано · Отправлено
Row4: Канал продаж · Без закрывающих документов · Владелец-сотрудник · Владелец-отдел · Общий доступ · Когда изменен
Row5: Кто изменил · Дата начисления
```

Of these 25, we covered **12** before this session, **14** after (FE controls 14→16,
since «Сумма платежа» is two от/до controls and «Назначение платежа» is our extra —
moysklad searches purpose via the search box, not a filter field).

## What shipped (2 §4-grounded, write-path-LIVE fields)

1. **«Владелец контрагента»** → `agentOwnerId` (filters `agent.ownerId` — the EMPLOYEE
   who owns the counterparty, distinct from «Владелец-сотрудник» = the payment's own
   owner). LIVE: `Counterparty.ownerId` is written on create (`counterparty.service`
   sets `ownerId: userId`). New BE param + a **merged** `agent: {}` clause (see below)
   + FE field + employees picker. Note: even the gold-standard demands lacks this — it
   is genuinely in the moysklad capture, so wired here (demands could adopt it later).

2. **«Счёт организации»** → `organizationAccountId`. LIVE: written on create + update
   (`payment-in.service`). The BE schema + `buildListWhere` **already accepted** this
   param — only the FE control was missing, so this was a latent "BE-supported but
   un-surfaced" gap (pure-FE add). Mirrors the demands pattern exactly: picker disabled
   until an org is chosen, fetches `/organization-accounts?organizationId=`.

### buildListWhere merge (bug prevented + runtime-proven)

`agentGroupId` and `agentOwnerId` both narrow the same `agent` relation. Two separate
`...(x ? { agent: {…} } : {})` spreads would put `agent` in the object literal twice →
**the last key wins, silently dropping the other predicate** (the classic spread-
overwrite). Merged into one clause:

```ts
...(filter.agentGroupId || filter.agentOwnerId
  ? { agent: {
      ...(filter.agentGroupId ? { groupId: filter.agentGroupId } : {}),
      ...(filter.agentOwnerId ? { ownerId: filter.agentOwnerId } : {}),
    } }
  : {}),
```

Smoke check 3 proves it: a counterparty owned by employee A but in a *different* group
is **excluded** when `agentGroupId=G & agentOwnerId=A` (size 1 = only the G∩A row; a
size-2 result incl. the other-group row would mean the overwrite bug regressed).

## DEFERRED — the other 11 moysklad filter fields (11h evidence, NOT blindly wired)

Each was checked for a real column + an app write-path. None is a build oversight; each
would be a dead control today.

| moysklad field | reason deferred | evidence |
|---|---|---|
| Статья расходов | no column on PaymentIn (inbound payment has no expense item) | `expenseItem*` exists only on CashOut/PaymentOut; schema comment lines 114-118 |
| Канал продаж | `salesChannelId` column exists but is **never written by payment-in** | `salesChannelId:` written only in customer-order/demand/invoice-out/sales-return services; absent from `payment-in.service` create/update/clone |
| Напечатано | `printed` column exists but **never written** (no mark-printed endpoint) | `payment-in.controller` has no mark-printed route; no `printed:` write in the service |
| Общий доступ | `shared` column exists but **never written** by app code | no `shared:` in `payment-in.service` create/update |
| Отправлено | no "sent" column (only `published`, a different concept) | PaymentIn model has no sent/delivery column |
| Кто изменил | no `updatedById` column (only `ownerId`) | PaymentIn model; schema comment lines 114-118 |
| Дата начисления | no accrual-date column (`incomingDate` = «Дата входящего», different) | PaymentIn model |
| Точка продаж | no retail-point column | PaymentIn model has `salesChannelId` (= «Канал продаж») only |
| Распределён | computed (sum allocated across `operations` vs `sumMinor`) — not a column | would need a derived predicate; product decision |
| Без закрывающих документов | computed (whether a linked closing doc exists) — not a column | derived predicate; product decision |
| Тип документа | single-type page — moysklad's «Тип документа: Все» belongs to the unified «Платежи» ledger, not the dedicated «Входящие платежи» list | our page is payments-in only |

## Verification

- **api tc0 · web tc0 · biome0** (changed files; smoke script keeps the standard CLI
  `noConsoleLog` warnings).
- **api Vitest 2877 (+1, 0 regress)** — `payment-in.schema.test` (agentOwnerId accepted
  + distinct-from-ownerId).
- **web Vitest 2127 (+9, 0 regress)** — `payments-in-filter-fields.test` (render +
  forwarding anchored on the `paramsRecord.X = extFilter.X` assignment, non-vacuous +
  picker routes + i18n keys).
- **Runtime smoke 9/9** — `tools/scripts/verify-payment-in-filter-smoke.mjs` (live API +
  self-reverting DB): agentOwnerId narrows (ga,oa) · agentGroupId narrows (ga,gb) ·
  **merge → only ga** · organizationAccountId → only the acct row · AND across the two
  new filters → none.
- **Browser RU** — `htmlLang=ru`, both controls present (`filter-agent-owner`,
  `filter-org-account`), both capture-grounded labels render («Владелец контрагента»,
  «Счёт организации»); placement matches the capture (agent-owner by the agent filters,
  org-account after Организация). UZ variants absent (confirmed RU).

**Honest caveat:** the org-account picker's *fetch* (the `/organization-accounts` call
after selecting an org) was not exercised in the browser this session — the smoke proves
the BE narrowing with a real account id, and demands uses the identical picker. No
per-applied-filter pixel sweep (the battery + render cover behavior + labels).

## Next (filter-parity backlog A — same pattern)

- **payments-out** (sibling) — same 2 fields PLUS «Статья расходов» (LIVE there:
  PaymentOut has `expenseItemId`). The natural +1 mirror.
- **cash-in / cash-out** — money-doc siblings; cash-out also has expenseItem.
- Each capture-grounded `<entity>/states/02-filter-applied.png`, mirror this pattern,
  grep write-paths FIRST (most of the coverage-map gap is dead fields).
