# counterparty card «Показатели» tab — moysklad GROUND-SPEC (2026-06-26)

Live-grounded (`scripts/ground-cp-metrics-tab-live.mjs`, cp «Устасизлар Азизбек»).
Screenshot `01-metrics-tab.png`, raw labels `01-metrics.json`. Our current tab is a tiny
subset (single «Продажи» total + per-currency balance table) — moysklad is a full analytics panel.

## moysklad layout (right panel)
**Toolbar:** `Создать корректировку` · `Создать акт сверки` (two buttons).

**LEFT column — «Баланс:»**
- Bold total (e.g. `0,00 сум`), then a per-CASH-ACCOUNT / per-organization breakdown:
  - `+ 6 576 567,72 – Админ` · `+ 28 812 378,17 – Азизбек касса` · `– 31 176 977,00 – Камолиддин Касса`
    · `– 904 162,50 – Кассир Молиячи` · `– 2 159 187,08 – Сейф` · `– 1 148 619,31 – Фаррухбек Касса`
  - green for `+`, red for `–`. (NOT per-currency like ours — per organization/cash-account.)

**RIGHT column — «Продажи:»**
- Общая сумма: 2 471 911 170,14 сум
- Количество: 2892
- Средний чек: 854 741,07 сум   (= Общая сумма ÷ Количество)
- Сумма скидок: 9 282 828,22 сум
- Первая: 04.06.2025 09:36       (first sale datetime)
- Последняя: 26.06.2026 11:38    (last sale datetime)
- **Прибыль: 565 127 430,96 сум** (bold — sales revenue − cost-of-goods)

**«Возвраты:»**
- Общая сумма: 86 450 456,83 сум
- Количество: 222

## Build plan (FLAGSHIP — fresh session; money-sensitive)
1. **BE** `GET /counterparties/:id/metrics` → `{ balanceByOrg:[{orgName,amountMinor}], sales:{totalMinor,
   count,avgCheckMinor,discountMinor,firstAt,lastAt,profitMinor}, returns:{totalMinor,count} }`.
   - sales = demands (Отгрузки) for this agent: sum sum, count, min/max moment, sum discounts.
   - **profit = Σ(line revenue − line cost)** — needs per-line cost (buyPrice/себестоимость). ADVERSARIAL:
     Decimal not Float; currency-guard; cost snapshot. Mirror any existing profit report logic if present
     (`reportPnl`/profit report) rather than re-deriving.
   - returns = sales-returns for this agent: sum + count.
   - balanceByOrg = the cash-account/organization breakdown (how the counterparty balance splits per org).
2. **FE** (counterparty-activity-widget «metrics» TabsContent): replace the current sales+balance block
   with the 2-column Баланс / Продажи+Возвраты layout + the two create buttons. Reuse formatMoney.
3. Gate + live cert (numbers match a hand-computed sample) + commit.

⚠️ Profit + balance-by-org are the hard, correctness-critical bits — do NOT guess the formula; ground
the existing profit/balance reports first. Our current `salesAmount`+`balances` props already feed a
simpler version — extend, don't rip out, the existing wiring.
