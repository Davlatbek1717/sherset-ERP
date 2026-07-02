# «Деньги» → 6-tab navbar + unified «Платежи» list — build spec (approved 2026-06-25)

> User: «navbar sub-bo'limlarni to'liq moyskladdek qil + Платежи ham» (approved this scope).
> Grounded from `moysklad/01-list-full.png` (the «Платежи» tab) + `create-menus-ground.json` (`dengiTabs`).
> Status discipline: **Phase-1 structural** — gates (tc·biome·i18n) + browser-smoke; NOT "done/100%" until live cert.

## 1. Navbar — `moneySubNav` 10 → 6 (layout.tsx:235, namespace `subnav.money`)
| # | tab label (ru) | href | state |
|---|---|---|---|
| 1 | Платежи | `/payments` | NEW page (this spec) |
| 2 | Движение денежных средств | `/reports/cash-flow` | exists |
| 3 | Прибыли и убытки | `/reports/pnl` | exists |
| 4 | Взаиморасчеты | `/reports/counterparty-balance` | exists |
| 5 | Начисления зарплаты | `/payrolls` | exists |
| 6 | Корректировки | `/counterparty-adjustments` | exists |

Old per-type routes (`/payments-in`, `/cash-in`, `/money`, `/prepayments`, …) stay reachable by URL +
via the «Платежи» create-menus; they just leave the menu. i18n: 6 new keys in `subnav.money` (ru+uz).

## 2. Unified «Платежи» list — new `/payments` (grounded columns + toolbar)
**Columns (moysklad order, `01-list-full.png`):** Тип документа · № (blue link, routes by kind) · Время ·
Организация · Счёт организации · Контрагент · Счёт контрагента · **Приход** (+Валюта) · **Расход** (+Валюта) ·
Назначение платежа · Отправлено · Напечатано · Комментарий · ⚙. Default-visible: Тип·№·Время·Организация·
Счёт организации·Контрагент·Приход·Расход·Назначение платежа (rest via ⚙).

**Тип документа labels + №-routing:**
- `paymentin` → «Входящий платеж» → `/payments-in/[id]` (income column)
- `cashin`    → «Приходный ордер» → `/cash-in/[id]`     (income column)
- `paymentout`→ «Исходящий платеж» → `/payments-out/[id]` (expense column)
- `cashout`   → «Расходный ордер»  → `/cash-out/[id]`    (expense column)

**Toolbar (grounded):** «+ Приход ▾» (Входящий платёж → `/payments-in/new` · Приходный ордер → `/cash-in/new`) ·
«+ Расход ▾» (Исходящий платёж → `/payments-out/new` · Расходный ордер → `/cash-out/new`) · «+ Перемещение»
(money-transfer doc — **we don't have it → disabled, toast «в разработке»**, NOT guessed) · Фильтр · search
(Номер, назначение, комментарий) · Изменить ▾ (defer — cross-type bulk is risky) · Печать ▾ (defer) ·
bottom «Показать итоги» (Σ Приход / Σ Расход).

**Filter (v1, focused — full parity deferred):** Период · Тип документа · Организация · Контрагент · Статус.

## 3. BE — new `payments` module, `GET /payments`
- `payments.service.ts` `list(accountId, query)` → `{ items, total, page, pageSize, totals: { incomeMinor, expenseMinor } }`.
- `$queryRawUnsafe` UNION ALL of `payments_in`/`payments_out`/`cash_in`/`cash_out` (table names per @@map; mirror
  `cash-flow.service.ts`). Each branch: `account_id = $1::uuid AND deleted_at IS NULL` (+ period push-down).
  Normalized cols: kind, id, name, moment, organization_id, org_account_id, cash_desk_id, agent_id,
  agent_account_id, income_minor, expense_minor, currency, payment_purpose, comment(=description), printed,
  state, applicable. income for paymentin/cashin = sum_minor; expense for paymentout/cashout = sum_minor.
- Outer: search (ILIKE name/purpose/comment) · org · agent · state · kind · ORDER BY moment DESC, id DESC · LIMIT/OFFSET.
- Separate COUNT + SUM(income),SUM(expense) over the same filtered union.
- Names resolved via batch findMany (organization, counterparty, organizationAccount, cashDesk, counterpartyAccount).
- **BigInt → string** in JSON. Permission `{ entity: 'paymentin', action: 'view' }` (Деньги-money guard).
- **NO migration** (read-only union; parallel session is migrating — stay self-contained).
- Register module in `app.module.ts`.

## 4. Gate + honest status
tc (api+web) 0 · biome 0 · i18n key-exist ru+uz + no-hardcoded · browser-smoke (list renders mixed-kind rows,
№-links route per kind, create-menus open + route, 0 console-err). Mark **«Phase-1 structural, browser-smoke»**;
no «done/100%». Known-deferred (honest): «+ Перемещение» doc (unbuilt), full filter parity, Изменить/Печать
cross-type bulk, union perf optimization (sort over full union — fine at current scale, optimize later),
the moysklad default «Входящие платежи» sub-filter (we show all kinds).
