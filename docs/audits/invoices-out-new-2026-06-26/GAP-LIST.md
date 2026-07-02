# /invoices-out/new — moysklad 1:1 GAP-LIST (2026-06-26)

Live-grounded `tools/capture/ms-invoiceout-editor-ground.mjs` +
`ms-invoiceout-new-clips.mjs` (screens `moysklad/40-new-editor-full.png`,
`clip-totals.png`, `clip-poshdr.png`, state `clips-state.json`).

## Live moysklad «Счет покупателю» CREATE form — DEFINITIVE layout

**Toolbar:** `Сохранить` · `Закрыть` · `Изменить ▾` · `Создать документ ▾` · `Печать ▾` ·
`Отправить ▾` · far-right `<Owner>/Основной`.
**Title row:** `Счет покупателю № <auto> от 📅<date>` · `Статус ▾` · `(?)` · `☑ Проведено` (**CHECKED** — `clips-state.json`).

**Meta — row-paired (LEFT ↔ RIGHT):**
| LEFT | RIGHT |
|------|-------|
| `* Организация` ✕▾ ✎  (subRow `Сум` = org account) | `Склад` ✕▾ ✎ |
| `* Контрагент` ✕▾ ✎ `+`  (helper `Баланс : … сум`) | `Договор` ▾ `+` |
| `План. дата оплаты` 📅 | `Проект` ▾ `+` |
| `Канал продаж` ▾ | — |
| `* Валюта документа` ✕▾ ✎ `1 USD = N UZS` ✎ | — |

**Ref fields are INLINE** type-to-search (sibling parity with invoice-in, GWT same framework). **NOT modals.**
**Positions:** ☐ · `Наименование ▾` · `Кол-во` (шт) · `Доступно` · `Цена ▾` · `НДС` · `Скидка` · `Сумма ⚙`.
**Totals:** `☑ НДС` + `☑ Цена включает НДС` (**BOTH CHECKED** — `clips-state.json`).
**Tabs:** `Главная` · `Связанные документы`.
**NO** «Счёт контрагента», **NO** «Внешний код», **NO** «Входящий номер» (invoice-in-only).

## Gaps closed (old /invoices-out/new → moysklad)

| # | Aspect | Old | moysklad | Action |
|---|--------|-----|----------|--------|
| 1 | Ref fields | MODAL (`onPick`) | INLINE dropdown | `inlineFetcher`+`onInlineSelect` on ALL |
| 2 | metaPanel | INSIDE «main» tab | ABOVE tabs, row-paired | move above tabs (`fixedWidth`) |
| 3 | org account | separate «bankAccount» row | `Сум` subRow under Организация | `subRow` + auto-fill effect |
| 4 | Контрагент balance | none | `Баланс : … сум` | `CounterpartyBalanceInline` |
| 5 | План. дата | `type=date` mm/dd | `План. дата оплаты` 📅 dd.mm | `DatePicker` |
| 6 | field order | Контрагент↔Склад first | Организация↔Склад first | re-ordered to live capture |
| 7 | «Счёт контрагента» | present | **absent** | REMOVED from meta |
| 8 | «Внешний код» | always-visible row | **absent** | REMOVED from meta |
| 9 | Owner (top-right) | static user text | interactive popover | `OwnerAccessPopover` + **BE persist** |
| 10 | Positions | fixed cols, no menus | `Наим▾·Цена▾·Скидка▾·Сумма⚙` | rich positions (column customizer) |
| 11 | «Связанные документы» | empty text | relations diagram | `RelatedDocsTab kind=invoice-out` |
| 12 | Currency FX | helper-below | inline `1 USD = N UZS` ✎ | inline rate widget |
| 13 | Status | `draft` default | `Статус` pill | status='' default |
| 14 | «Проведено» | unchecked default | **CHECKED** | `applicable=true` default → **BE posts on create** |
| 15 | «Цена включает НДС» | unchecked default | **CHECKED** | `vatIncluded=true` default |
| 16 | line price | (already SALE price) | SALE price | kept; `resolveDefaultSalePriceOrZero` + price-type reprice/save |

**BE** (`invoice-out.schema.ts` + `invoice-out.service.ts`): `CreateInvoiceOutSchema` += `ownerId`/`groupId`/
`shared`/`applicable`; `create()` validates owner refs in-tenant (mass-edit guard + group-in-tenant) and
persists, falling back to the creator; when `applicable=true` it POSTS the freshly created draft by reusing
the tested `post()` cascade (state→posted, counterparty balance += sum, CO.invoicedSum). `createFromCustomerOrder`
stays a draft.

## Cert (browser-smoke LIVE, localhost 2026-06-26)

- Layout pixel-1:1 vs `40-new-editor-full.png` (meta rows, positions, totals, owner popover, balance, FX).
- Defaults: ☑ Проведено + ☑ НДС + ☑ Цена включает НДС all checked.
- Inline product dropdown (avail badges, «Yana N tovar», create-product) → pick → unit/Доступно/НДС prefill.
- Narx 100 000 → VAT-included math: Промежуточный 89 285,71 + НДС 10 714,29 = Итого 100 000,00.
- **Save → post-on-create**: doc `СЧ-2026-00052` created POSTED + locked; counterparty «Усто Нодир» balance
  **0,00 → «bizga qarz 100 000,00 сум»** (balance cascade verified); appears in list. 0 console errors from the page.

## Known caveats (honest)

- **post-on-create is NOT a single atomic txn** (create txn, then post txn). If `post()` failed after create,
  a draft orphan + error would result. Low probability (a sales invoice's post = balance upsert + optional CO).
- `/invoices-out/[id]` still uses the OLD shell (modal pickers, agentAccount/externalCode, no owner/balance/relations).
  Converging it onto this shell is the NEXT session (the campaign rhythm — invoice-in did /new then /[id] separately).
- «Канал продаж» has no `+` create (no `/sales-channels/new` route exists) — minor, flagged.

Status: **Phase-1 structural + browser-smoke** (create+post + balance verified live; concurrency/timeout adversarial QA = Phase-2).
