# «Деньги» → moysklad 6-tab restructure — phased plan (decision: TRUE 1:1)

> User decision 2026-06-25: restructure the «Деньги» section to be 1:1 with moysklad — 6 tabs,
> one unified «Платежи» list, reports back under «Деньги». This is a MULTI-SESSION program; each
> phase is a focused flagship (ground → build → gate → live-cert → commit → handoff). Honest status
> per phase; no "done/1:1" until the live cert proves it.

## Target (grounded 2026-06-25, `moysklad/01-list-full.png` + `dengiTabs`)
moysklad «Деньги» = 6 tabs, in order:
1. **Платежи** — ONE list of ALL payment docs; create via «+ Приход ▾» / «+ Расход ▾» / «+ Перемещение».
2. **Движение денежных средств** — cash-flow report.
3. **Прибыли и убытки** — P&L report.
4. **Взаиморасчеты** — mutual-settlements report.
5. **Начисления зарплаты** — payroll accruals.
6. **Корректировки** — corrections.

## Guardrails
- **Additive + reversible:** keep the existing per-doc editors (`/payments-in/[id]`, `/cash-in/[id]`, …)
  and routes. Build the unified list as a NEW surface; the menu flip is the LAST step of Phase 1 so no
  page is orphaned mid-way.
- **Shared-file caution:** `layout.tsx` (nav) + `messages/ru|uz.json` are shared with any parallel session.
  Touch them only when needed, commit path-limited, stage only own i18n hunks.
- **Money discipline:** BigInt minor units; per-doc currency/rateValue; tenant accountId on every query.

## Phases

### Phase 1 — Unified «Платежи» list + menu flip  *(the foundation; biggest)*
- **BE:** new `payments` read-model endpoint `GET /payments` returning a NORMALIZED union of
  PaymentIn · PaymentOut · CashIn · CashOut (one row per document): `{ kind (Тип документа), id, name(№),
  moment(Время), organization, organizationAccount(Счет организации), agent(Контрагент),
  agentAccount(Счёт контрагента), incomeMinor(Приход), expenseMinor(Расход), currency, paymentPurpose,
  sent(Отправлено), printed(Напечатано), comment(Комментарий), state, applicable }`. Server-side
  pagination/sort/filter + totals (Σ Приход / Σ Расход).
  - **Design choice (decide at build):** (a) a Postgres VIEW `payment_document` UNION-ing the 4 tables,
    mapped as a read-only Prisma model (clean queries, one migration); or (b) `$queryRaw` UNION. Prefer (a).
- **FE:** new `/payments` list page — moysklad columns in order, blue №-links routing to the right
  per-kind editor by `kind`, the 3 create buttons («+ Приход ▾» → Входящий платёж / Приходный ордер;
  «+ Расход ▾» → Исходящий платёж / Расходный ордер; «+ Перемещение» → money transfer) routing to the
  existing `/new` editors, filter panel, «Показать итоги» totals.
- **Menu flip (end of Phase 1):** `moneySubNav` → the 6 moysklad tabs. «Платежи» → `/payments`;
  Движение ДС → `/reports/cash-flow`; Прибыли и убытки → `/reports/pnl`; Взаиморасчеты →
  `/reports/counterparty-balance`; Начисления зарплаты → `/payrolls`; Корректировки →
  `/counterparty-adjustments`. i18n ru+uz. Old per-type items leave the menu but routes stay reachable
  via the «Платежи» create-menus + direct URLs.
- **Cert:** API — `/payments` returns mixed-kind rows with correct Приход/Расход + totals; browser —
  list renders, create-menus open + route correctly, 0 console errors.
- **Ground first:** «+ Приход ▾» / «+ Расход ▾» exact items + the «Перемещение» editor (run the
  create-menus capture; GWT div-buttons need a better selector than `button:has-text`).

### Phase 2 — «Перемещение» (money transfer) document  *(if missing — verify first)*
Account→account / cash-desk transfer doc (BE model + endpoints + FE editor). moysklad has it under
«+ Перемещение». We have no money-transfer doc today (only stock `/moves`). May be deferred if low-priority.

### Phase 3 — payments-in editor internal 1:1  *(the AUDIT.md gaps)*
Customer-order direct allocation + rich «Оплаченные документы» grid + «Привязать платеж»/«Перераспределить»
+ toolbar menus (Изменить/Создать-документ/Печать/Отправить) + «Статус ▾» + «Изменения» link +
«?»-before-Проведено + record-nav server-backed + BE `:id/related` + `:id/position` + owner/group persist
+ meta fields (Канал продаж · Включая НДС · Входящая дата · Валюта документа · Баланс). See `AUDIT.md`.

### Phase 4 — mirror onto siblings
Roll the perfected editor shell onto payments-out · cash-in · cash-out (each its own focused session,
own specifics: expense-item, cash-desk vs bank, allocation target).

### Phase 5 — prepayments / returns folding + cleanup
Decide moysklad placement of Предоплаты / Возвраты предоплат (doc types within «Платежи», not menu tabs);
fold or keep-reachable. Remove the `/money` feed from the menu (not a moysklad «Деньги» tab) or re-home.

## Recommended execution order
Phase 1 (foundation, makes the menu visibly 1:1) → Phase 3 (the editor that everything mirrors) →
Phase 4 (siblings) → Phase 2 (Перемещение) → Phase 5 (cleanup). One focused session each.
