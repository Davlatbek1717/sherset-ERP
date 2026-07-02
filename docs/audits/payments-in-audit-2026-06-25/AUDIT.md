# /payments-in (Входящий платёж) — live-grounded 1:1 audit vs moysklad.uz

> **Date:** 2026-06-25 · **Method:** live READ-ONLY grounding of `online.moysklad.uz`
> (`tools/capture/ms-paymentin-detail-ground.mjs`) → element-by-element vs our code.
> **Ground truth:** `moysklad/10-editor-full.png` (editor), `moysklad/01-list-full.png` (list),
> `moysklad/20-dd-izmenit.png` (Изменить menu). Reference screenshot set under
> `docs/moysklad-reference/.../paymentin/screenshots/` is CONTAMINATED (all frames show a stuck
> «Корзина» + save-dialog) — do NOT trust it; the DOM html there is usable but GWT-template-noisy.
> **Verdict: NOT 1:1.** Mature foundation (~70%) but predates the perfected PO/CO shell and is missing
> moysklad's customer-order allocation model, the rich «Оплаченные документы» grid, and several
> toolbar/header/meta elements. Status: **Phase-1 structural audit, runtime gaps listed; NOT done.**

## What MATCHES (fair credit)
- **List:** title «Входящие платежи», core columns (№/Время/Организация/Контрагент/Приход/Назначение),
  13-field inline filter, mass-edit, bulk delete/transition, saved-filter pills, search, column ⚙.
- **Editor meta (partial):** 2-col layout; Организация · Контрагент · Сумма · Договор · Проект ·
  Назначение платежа · Входящий номер present. Tabs named «Оплаченные документы» + «Связанные документы».
- **BE:** FSM draft→posted→cancelled; post applies balance delta + invoiceOut.applyPayment('apply');
  unpost/cancel REVERSE atomically; optimistic-lock version; clone; mass-edit; audit-log; tenant accountId.

## GAPS (confirmed against the live screenshot)

### A. Functional — "works like moysklad" (highest priority)
1. **Allocation to Customer Order DIRECTLY.** Live row = «Заказ покупателя 02586». Our operations only
   support `targetKind:'invoiceout'`. moysklad pays Заказ покупателя (and others) directly.
   `customerOrder.applyPayment` exists in BE but is not wired into operations. *(prompt §2.4 flag — CONFIRMED live.)*
2. **«Оплаченные документы» grid is RICH** — columns: Тип документа · № · Пров. · Дата · Организация ·
   Контрагент · Статус · К оплате · Не оплачено · Оплачено из этого платежа · ⚙. Ours = bare
   picker + amount + remove. Totals row: «Привязано N» / «Не привязано: N» (we show Allocated/Remainder).
3. **«Привязать платеж» / «Перераспределить сумму платежа»** buttons drive allocation (we use a plain
   «+ Добавить счёт»). Different interaction model.
4. **Record-nav not server-backed** — detail uses `useDetailNavigation('payments-in', id)` without
   `{server:true}`; no `GET /payments-in/:id/position` endpoint (PO/CO got this).
5. **No `GET /payments-in/:id/related`** + `findRelated` — «Связанные документы» tab is a placeholder.
6. **`update()` does not persist owner/group/shared; `findById` does not include `group`.** (PO/CO do.)

### B. Toolbar / header
7. **Toolbar dropdowns missing:** «Изменить ▾» (= Удалить · Копировать), «Создать документ ▾»,
   «Печать ▾», «Отправить ▾». Detail toolbar has none; `/new` passes them as empty `[]`.
8. **«Статус ▾» custom-status dropdown** in header (admin-defined statuses, like PO got). We render an
   FSM state pill only — no custom «Статус» control.
9. **«Изменения: МойСклад <дата>» history link** top-right + owner «Имя / Роль» block. We have an
   authorSlot owner block but not moysklad's inline «Изменения» link styling.
10. **«?» help icon before «Проведено»** — verify our DetailHeader renders it (likely missing).

### C. Meta fields (editor)
11. **«Канал продаж» (sales channel)** — present in moysklad editor; missing in ours.
12. **«Включая НДС» (including VAT)** — present (0,00); missing in ours.
13. **«Входящая дата»** — inline «от 📅 <date>» after Входящий номер; missing (BE has `incomingDate`,
    FE never surfaces it).
14. **«Валюта документа»** select + ✎ — present («сум (UZS)»); detail page has NO currency control
    (BE has currency/rateValue).
15. **«Баланс : N сум»** counterparty balance line under Контрагент — missing.
16. **Org account = sub-dropdown directly under Организация** (account name «Сум»); we render a separate
    labeled «Счёт организации» row. Layout differs.
17. **«+» quick-create** on Договор / Проект / Канал продаж — missing (we only have create on Контрагент).
18. **✎ inline-edit pencil** on Организация / Контрагент — missing.
19. We render «Внешний код» in meta; moysklad editor does NOT show it there (ours is extra — verify).

### D. List
20. **Create buttons** «+ Приход ▾» · «+ Расход ▾» · «+ Перемещение» (moysklad unified money toolbar)
    vs our single «Создать» → /new. (Architecture: our money docs are split routes.)
21. **List columns** moysklad offers: Тип документа · Счет организации · Счёт контрагента · Валюта ·
    Расход · Отправлено · Напечатано · Комментарий — several not backed by our list (TODO noted in code).
22. **«Статус ▾» bulk button + «Показать итоги»** (totals toggle) — verify presence in our list.

## Recommended fix order (each a focused session)
1. **Flagship A — the allocation core** (functional heart): wire customer-order direct allocation +
   rebuild «Оплаченные документы» as the rich grid + «Привязать платеж»/«Перераспределить» + BE
   `:id/related` + `:id/position` + owner/group persist. This is what makes it *work* like moysklad.
2. **Flagship B — toolbar/header shell** to PO/CO parity: Изменить/Создать-документ/Печать/Отправить
   menus + «Статус ▾» custom status + «Изменения» link + «?»-before-Проведено + record-nav server-backed.
3. **Flagship C — meta fields:** Канал продаж · Включая НДС · Входящая дата · Валюта документа · Баланс
   · org-account sub-dropdown · «+»/✎ affordances.
4. **Flagship D — list:** columns (Тип документа/Счета/Валюта/Расход/Отправлено/Напечатано/Комментарий)
   + Приход/Расход/Перемещение create model + Статус bulk + Показать итоги.

> Then mirror the perfected payment-in onto the sibling money docs (payments-out, cash-in, cash-out, …).
