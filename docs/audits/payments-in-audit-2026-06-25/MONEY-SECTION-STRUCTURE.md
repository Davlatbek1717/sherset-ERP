# «Деньги» section structure — ours vs moysklad.uz (live-grounded 2026-06-25)

> Ground truth: live `online.moysklad.uz` top sub-tab bar under «Деньги»
> (`moysklad/01-list-full.png`, `moysklad/10-editor-full.png`). Ours: `apps/web/src/app/(app)/layout.tsx`
> `moneySubNav` + `reportsSubNav`.

## Counts
- **moysklad «Деньги» = 6 sub-tabs.**
- **Ours «Деньги» = 10 sub-nav items.**

## moysklad «Деньги» (6 tabs, in order)
1. **Платежи** — ONE combined list of ALL payment docs. Create via «+ Приход ▾» (Входящий платёж,
   Приходный ордер) · «+ Расход ▾» (Исходящий платёж, Расходный ордер) · «+ Перемещение» (money transfer).
   «Загрузить выписку» (bank import) is an action here, not a separate tab.
2. **Движение денежных средств** — cash-flow report.
3. **Прибыли и убытки** — P&L report.
4. **Взаиморасчеты** — mutual-settlements report.
5. **Начисления зарплаты** — payroll accruals.
6. **Корректировки** — corrections.

## Ours «Деньги» (10 items — `moneySubNav`)
1. Денежные операции (`/money`) — money feed/lenta
2. Входящие платежи (`/payments-in`)
3. Исходящие платежи (`/payments-out`)
4. Приходные ордера (`/cash-in`)
5. Расходные ордера (`/cash-out`)
6. Банк. выписка (`/bank-import`)
7. Предоплаты (`/prepayments`)
8. Возвраты предоплат (`/prepayment-returns`)
9. Корректировка взаиморасчётов (`/counterparty-adjustments`)
10. Зарплата (`/payrolls`)

## Why they differ (the reason)
**Different organizing principle.**
- **moysklad organizes «Деньги» by VIEW/REPORT:** one unified «Платежи» list holds every payment
  document; the other 5 tabs are analytical/specialized reports.
- **We organize «Деньги» by DOCUMENT TYPE:** a separate menu page per document type, and we moved the
  analytical reports OUT of «Деньги» into «Отчёты» (Reports).

### Mapping (where each moysklad «Деньги» tab lives in our app)
| moysklad «Деньги» tab | our location | parity note |
|---|---|---|
| Платежи (combined) | split into `/payments-in`, `/payments-out`, `/cash-in`, `/cash-out` (+ `/bank-import`) | **menu mismatch** — moysklad shows ONE list w/ Приход/Расход/Перемещение create; we show 4–5 pages |
| Движение денежных средств | `Отчёты → Денежный поток` (`/reports/cash-flow`) | exists, but under **Reports**, not Деньги |
| Прибыли и убытки | `Отчёты → Прибыли и убытки` (`/reports/pnl`) | exists, but under **Reports** |
| Взаиморасчеты | `Отчёты → Взаиморасчёты` (`/reports/counterparty-balance`) | exists, but under **Reports** |
| Начисления зарплаты | `Деньги → Зарплата` (`/payrolls`) | present (label differs: «Зарплата» vs «Начисления зарплаты») |
| Корректировки | `Деньги → Корректировка взаиморасчётов` (`/counterparty-adjustments`) | present (narrower scope/label) |
| — (not a moysklad Деньги tab) | `/money` feed, `/prepayments`, `/prepayment-returns` | ours treats these as menu items; moysklad treats prepayments as doc types inside «Платежи» |

## Implication for 1:1
The **«Деньги» menu itself is not 1:1** (6 vs 10, different items + order + grouping). Two ways to converge:
- **Option 1 — restructure to moysklad (true 1:1):** make our «Деньги» menu show the 6 moysklad tabs; merge
  the 4 payment pages into one «Платежи» list with Приход/Расход/Перемещение create; pull cash-flow / P&L /
  взаиморасчёты back under «Деньги». Big architectural change.
- **Option 2 — keep per-document pages (current campaign plan):** leave the by-type menu, perfect each page
  internally to 1:1. Faster, lower risk, but the top «Деньги» menu stays non-identical.

Most underlying document TYPES already exist in our app; the gap is primarily **navigation organization**,
plus the per-page internal gaps documented in `AUDIT.md` (payments-in).
