# /invoices-in/new — moysklad 1:1 GAP-LIST (2026-06-25)

Live-grounded `tools/capture/ms-invoicein-editor-ground.mjs`
(screens `moysklad/10-editor-full.png`, `11-editor-meta.png`, `30-click-kontragent.png`).

## Live moysklad «Счет поставщика» editor — DEFINITIVE layout

**Toolbar (saved doc):** `Сохранить` · `Закрыть` · `1 из N` ‹›  · `Изменить ▾` · `Создать документ ▾` ·
`Печать ▾` · `Отправить ▾` · far-right `<Owner>/Основной` + `Изменения: <user> <date>` + avatar.
*(On /new the record-nav + create-doc/печать/отправить are absent — only Сохранить · Закрыть.)*

**Title row:** `Счет поставщика № <num> от 📅<date>` · `Статус ▾` · `(?)` · `☑ Проведено`. **NO «Ожидание».**

**Meta — row-paired (LEFT ↔ RIGHT):**
| LEFT | RIGHT |
|------|-------|
| `* Организация` ✕▾ ✎  (subRow `Сум` = org account) | `Склад` ✕▾ ✎ |
| `* Контрагент` ✕▾ ✎  (helper `Баланс (мы должны): … сум (… доллар)`) | `Договор` ▾ `+` |
| `План. дата оплаты` 📅 | `Проект` ▾ `+` |
| `Входящий номер` [__] `от` [📅__] | — |
| `* Валюта документа` ✕▾ ✎  `1 USD = 12 300 UZS` ✎ | — |

**Ref fields are INLINE** type-to-search (click → dropdown anchored below the field;
`30-click-kontragent.png` shows a supplier-name + phone suggestion row). **NOT a modal.**

**Positions:** ☐ · `Наименование ▾` · `Кол-во` (шт) · `Доступно` · `Цена ▾` · `НДС` · `Скидка` · `Сумма ⚙`.
**Tabs:** `Главная` · `Связанные документы`.

## Gaps (current /invoices-in/new → fix)

| # | Aspect | Current | moysklad | Action |
|---|--------|---------|----------|--------|
| 1 | **Ref fields** | MODAL (`onPick` only) | INLINE dropdown | add `inlineFetcher`+`onInlineSelect` to ALL (user complaint) |
| 2 | metaPanel | INSIDE «main» tab | ABOVE tabs, row-paired | move above tabs (PO pattern, `fixedWidth`) |
| 3 | org account | separate «bankAccount» row | `Сум` subRow under Организация | `subRow` |
| 4 | Контрагент balance | none | `Баланс (мы должны)…` | `CounterpartyBalanceInline` |
| 5 | План. дата | `type=date` mm/dd | `План. дата оплаты` 📅 dd.mm | `DatePicker` → `paymentPlannedMoment` |
| 6 | Входящий номер | plain row | `[__] от [📅__]` inline pair | combined control (Input + `от` + DatePicker) |
| 7 | «Заказ поставщику» | present | **absent** | REMOVE from meta |
| 8 | «Счёт контрагента» | present | **absent** | REMOVE from meta |
| 9 | «Внешний код» | always-visible row | hidden link under comment | expandable link (PO pattern) |
| 10 | Owner (top-right) | static text | interactive popover | `OwnerAccessPopover` + **BE persist** |
| 11 | Positions | fixed cols, no menus | `Наименование▾·Цена▾·Скидка▾·Сумма⚙` | rich positions (PO pattern) |
| 12 | «Связанные документы» | empty text | relations diagram | `RelatedDocsTab kind=invoice-in` |
| 13 | «Ожидание» | present | **absent** | REMOVE waiting |
| 14 | Currency FX | ✎ inline edit | `1 USD = N UZS` ✎ | keep |
| 15 | Status | draft default | `Статус` (custom) | status='' default → «Статус» pill (PO) |

**BE:** `CreateInvoiceInSchema` += `ownerId`/`groupId`/`shared`; `create()` validates (mass-edit guard +
group-in-tenant) and persists, falling back to creator. Mirror `purchase-order.service.ts:512-532`.

**Проведено default on /new** = UNVERIFIED (script hung before capturing the blank create form);
keep existing `applicable=false` (no regression), flag in handoff.

Status: **Phase-1 structural** (browser-smoke at cert, runtime payment/stock NOT exercised).
