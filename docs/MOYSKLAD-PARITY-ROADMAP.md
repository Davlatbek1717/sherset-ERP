# Moysklad Parity Roadmap

**Maqsad**: moysklad.uz bilan 1:1 parity, 56+ sahifa bo'yicha. Har sahifa
`docs/MOYSKLAD-PARITY-AUDIT-PROTOCOL.md` (v2.2) bo'yicha audit qilinadi:
- Phase 0: Reference capture
- Phase 1: Structural delta
- Phase 2a: **Silent no-op audit** (yangi v2.2)
- Phase 2b: Interactive (sort, resize, dropdown items)
- Phase 3: Stateful (S1-S13)
- Phase 4: Reference side-by-side
- One-sweep fix → commit

**Per-page time budget**: 3-4 soat (list page) yoki 4-6 soat (detail+edit ham bor bo'limlar).

**Total estimated**: ~120-150 soat / 3-4 hafta full-time.

---

## Detail-page inline state dropdown (2026-05-22 topilgan blocker)

moysklad har document detail title'ida clickable «Новый ▾» state dropdown
ko'rsatadi. `DetailHeader` shared component'ga `stateMenuItems` /
`onStateChange` / `stateBusy` props qo'shildi (backwards-compatible —
prop berilmasa read-only Badge qoladi). **customer-orders[id]** wired
(commit 1cbaa0ae) chunki uning transition endpoint'i **state-slug**
qabul qiladi.

**Blocker — boshqa FSM document'lar**: purchase-orders / demands /
supplies / invoices-* / returns / moves / losses / enters / inventories
transition endpoint'lari **verb-based** (`post`/`unpost`/`confirm`/
`unconfirm`), state-slug emas. Inline dropdown'ni ularga wire qilish
state→verb mapping talab qiladi (lossy va xavfli — masalan draft→cancelled
qaysi verb?).

**Yechim (backend project, alohida)**: barcha FSM service'larga
state-slug transition support qo'shish (`POST /<doc>/<id>/transitions/<stateSlug>`),
keyin har detail page'ga `stateMenuItems` wire qilish (mexanik). To'liq
1:1 inline state dropdown shu birxillashtirilgandan keyin barcha 15 ta
FSM detail page'da yoqiladi.

---

## Holatlar

| Holat | Belgi |
|-------|-------|
| Done | ✅ |
| In progress | 🚧 |
| Next up | ⏭ |
| Pending | ⏳ |

---

## Phase A — Sales pipeline (PRIORITY 1) — ~16 soat

Eng yuqori user traffic. Purchase-orders bilan **shared component'lar 80% bir xil** — shu uchun keyingi ish tezroq ketadi.

| # | Sahifa | List | Detail | New | Holat |
|---|--------|------|--------|-----|-------|
| A1 | **customer-orders** (Заказы покупателей) | ⏭ | ⏳ | ⏳ | Next up |
| A2 | **demands** (Отгрузки) | ⏳ | ⏳ | ⏳ | |
| A3 | **invoices-out** (Счета покупателям) | ⏳ | ⏳ | ⏳ | |
| A4 | **sales-returns** (Возвраты покупателей) | ⏳ | ⏳ | ⏳ | |

**Shared yutiqlari**: customer-orders dan keyin demands/invoices-out/sales-returns audit 50% tez ketadi (shared filter/toolbar/table).

---

## Phase B — Money flow (PRIORITY 2) — ~16 soat

Moliyaviy aniqlik kritik. Multi-currency va validation muhim.

| # | Sahifa | List | Detail | New | Holat |
|---|--------|------|--------|-----|-------|
| B1 | **payments-in** (Входящие платежи) | ⏳ | ⏳ | ⏳ | |
| B2 | **payments-out** (Исходящие платежи) | ⏳ | ⏳ | ⏳ | |
| B3 | **cash-in** (Приходные ордера) | ⏳ | ⏳ | ⏳ | |
| B4 | **cash-out** (Расходные ордера) | ⏳ | ⏳ | ⏳ | |
| B5 | **bank-import** (Банк-импорт) | ⏳ | ⏳ | - | |
| B6 | **counterparty-adjustments** (Корректировки) | ⏳ | ⏳ | ⏳ | |
| B7 | **prepayments** (Авансы) | ⏳ | ⏳ | ⏳ | |

---

## Phase C — Purchase pipeline (PRIORITY 3) — ~12 soat

purchase-orders DONE. Qolgan 4 ta — shared bilan tezroq.

| # | Sahifa | List | Detail | New | Holat |
|---|--------|------|--------|-----|-------|
| C1 | **purchase-orders** | ✅ | ✅ | ✅ | **Done (Tour 5)** |
| C2 | **supplies** (Приёмки) | ⏳ | ⏳ | ⏳ | |
| C3 | **invoices-in** (Счета поставщиков) | ⏳ | ⏳ | ⏳ | |
| C4 | **purchase-returns** (Возвраты поставщикам) | ⏳ | ⏳ | ⏳ | |
| C5 | **factures-in** (Счета-фактуры полученные) | ⏳ | ⏳ | ⏳ | |
| C6 | **factures-out** (Счета-фактуры выданные) | ⏳ | ⏳ | ⏳ | |

---

## Phase D — Master data (PRIORITY 4) — ~14 soat

Lookup'lar — barcha document sahifalarida ishlatiladi (picker'lar).

| # | Sahifa | List | Detail | New | Holat |
|---|--------|------|--------|-----|-------|
| D1 | **counterparties** (Контрагенты) | ⏳ | ⏳ | ⏳ | |
| D2 | **products** (Товары) | ⏳ | ⏳ | ⏳ | |
| D3 | **product-folders** (Группы товаров) | ⏳ | ⏳ | ⏳ | |
| D4 | **services** (Услуги) | ⏳ | ⏳ | ⏳ | |
| D5 | **bundles** (Комплекты) | ⏳ | ⏳ | ⏳ | |
| D6 | **variants** (Модификации) | ⏳ | ⏳ | ⏳ | |

---

## Phase E — Warehouse ops (PRIORITY 5) — ~14 soat

Stok harakati. Document sahifalarini avval batchladim (Phase A-C).

| # | Sahifa | List | Detail | New | Holat |
|---|--------|------|--------|-----|-------|
| E1 | **moves** (Перемещения) | ⏳ | ⏳ | ⏳ | |
| E2 | **losses** (Списания) | ⏳ | ⏳ | ⏳ | |
| E3 | **enters** (Оприходования) | ⏳ | ⏳ | ⏳ | |
| E4 | **inventory** (Инвентаризации) | ⏳ | ⏳ | ⏳ | |
| E5 | **internal-orders** (Внутренние заказы) | ⏳ | ⏳ | ⏳ | |
| E6 | **price-lists** (Прайс-листы) | ⏳ | ⏳ | ⏳ | |

---

## Phase F — CRM (PRIORITY 6) — ~14 soat

| # | Sahifa | List | Detail | New | Holat |
|---|--------|------|--------|-----|-------|
| F1 | **pipelines** (Воронки продаж) | ⏳ | ⏳ | ⏳ | |
| F2 | **opportunities** (Сделки) | ⏳ | ⏳ | ⏳ | |
| F3 | **calls** (Звонки) | ⏳ | ⏳ | ⏳ | |
| F4 | **tasks** (Задачи) — TaskType allaqachon yaratilgan | ⏳ | ⏳ | ⏳ | |
| F5 | **contact-persons** (Контактные лица) | ⏳ | ⏳ | ⏳ | |
| F6 | **contracts** (Договоры) | ⏳ | ⏳ | ⏳ | |
| F7 | **projects** (Проекты) | ⏳ | ⏳ | ⏳ | |

---

## Phase G — Retail / Online (PRIORITY 7) — ~10 soat

| # | Sahifa | List | Detail | New | Holat |
|---|--------|------|--------|-----|-------|
| G1 | **retail-sales** (Розничная торговля) | ⏳ | ⏳ | ⏳ | |
| G2 | **cashier-sessions** (Смены) | ⏳ | ⏳ | - | |
| G3 | **online-orders** (Онлайн-заказы) | ⏳ | ⏳ | ⏳ | |

---

## Phase H — Production (PRIORITY 8) — ~12 soat

| # | Sahifa | List | Detail | New | Holat |
|---|--------|------|--------|-----|-------|
| H1 | **bom** (Технические карты) | ⏳ | ⏳ | ⏳ | |
| H2 | **work-orders** (Заказы на производство) | ⏳ | ⏳ | ⏳ | |
| H3 | **processing-orders** | ⏳ | ⏳ | ⏳ | |
| H4 | **processings** | ⏳ | ⏳ | ⏳ | |

---

## Phase I — Settings (PRIORITY 9) — ~24 soat (15 ta sub-page)

Sozlamalar — soddroq, bittasiga ~1.5 soat.

| # | Sahifa | Holat |
|---|--------|-------|
| I1 | settings/organizations | ⏳ |
| I2 | settings/stores | ⏳ |
| I3 | settings/cash-desks | ⏳ |
| I4 | settings/bank-accounts | ⏳ |
| I5 | settings/users | ⏳ |
| I6 | settings/audit-log | ⏳ |
| I7 | settings/price-types | ⏳ |
| I8 | settings/exchange-rates | ⏳ |
| I9 | settings/currencies | ⏳ |
| I10 | settings/mxik | ⏳ |
| I11 | settings/attributes | ⏳ |
| I12 | settings/print-templates | ⏳ |
| I13 | settings/uoms | ⏳ |
| I14 | settings/tax-rates | ⏳ |
| I15 | settings/expense-items | ⏳ |
| I16 | settings/custom-entities | ⏳ |
| I17 | settings/regions | ⏳ |
| I18 | settings/email | ⏳ |
| I19 | settings/webhooks | ⏳ |
| I20 | settings/task-types ✅ (DONE — TaskType audit) | ✅ |

---

## Phase J — Reports (PRIORITY 10) — ~16 soat

Statistik sahifalar. Barchasi soddroq layout, lekin filter/grouping.

| # | Sahifa | Holat |
|---|--------|-------|
| J1 | reports/dashboard | ⏳ |
| J2 | reports/profitability | ⏳ |
| J3 | reports/turnover | ⏳ |
| J4 | reports/cash-flow | ⏳ |
| J5 | reports/abc-analysis | ⏳ |
| J6 | reports/sales-by-channel | ⏳ |
| J7 | reports/sales-by-hour | ⏳ |
| J8 | reports/average-basket | ⏳ |
| J9 | reports/aging | ⏳ |
| J10 | reports/inventory-variance | ⏳ |
| J11 | reports/slow-movers | ⏳ |
| J12 | reports/returns-ratio | ⏳ |
| J13 | reports/counterparty-balance | ⏳ |
| J14 | reports/purchase-management | ⏳ |

---

## Phase K — Tahlil sahifalar va boshqa moduller — ~16 soat

| Sahifa | Holat |
|--------|-------|
| `/loyalty` (Bonus dasturlari) | ⏳ |
| `/tracking-codes` (Markirovka) | ⏳ |
| `/publications` (E-commerce yuklash) | ⏳ |
| `/discounts` (Skidkalar) | ⏳ |
| `/payrolls` (Maoshlar) | ⏳ |
| `/notifications` (Bildirishnomalar) | ⏳ |
| `/help` (Yordam) | ⏳ |
| `/api-integrations` (API ulanishlar) | ⏳ |

---

## Yagona-source shared component refinements

Har audit'da shared component'lar yangilanadi → barcha sahifalarga avtomat ta'sir:

| Component | Refinements (planned) |
|-----------|----------------------|
| `InlineFilterPanel` | Filter settings popover (gear → filter visibility) |
| `PeriodPicker` | Calendar widget (currently native date input) |
| `CatalogPickerField` | Recently-used items, keyboard nav |
| `DataTable` | Multi-sort, column groups, freeze first col |
| `ListView` | Bulk-action bar inline, virtual scrolling for 1k+ rows |
| `Modal` | Stacked modals, smooth focus restoration |
| `Toast` | Action button in toast |
| `BulkActionDropdown` | Confirmation step inline |
| `ColumnCustomizer` | Row count selector (25/50/100) ichida |

---

## Reference library targets

Har Phase boshlanishidan oldin `pnpm capture-moysklad <module> --check` yashil bo'lishi shart:

| Module batch | Reference URLs |
|--------------|----------------|
| Sales | `#customerorder`, `#demand`, `#invoiceout`, `#salesreturn` |
| Money | `#paymentin`, `#paymentout`, `#cashin`, `#cashout` |
| Purchase | `#supply`, `#invoicein`, `#purchasereturn` |
| Master | `#company`, `#good`, `#service` |
| ... | ... |

**Capture script** (`scripts/capture-moysklad-references.ts`):
- `--all` — barcha module'lar
- `<module>` — bitta module
- `--check` — fresh ekanligini tekshir
- `--refresh` — qayta capture

---

## Per-page deliverable

Har sahifa audit yakunida:
1. `docs/audit-<module>.md` — delta list + screenshots
2. Commit(lar) — shared component + per-page o'zgarishlar
3. `po-tour-<module>-final.png` — visual final state
4. Gates yashil: typecheck 0, tests green, biome 0

---

## Boshlash tartibi (recommendation)

1. **A1 (customer-orders)** — boshlaymiz. Purchase-orders bilan shared 80% match → yangi component'lar minimum.
2. A2 (demands) — A1'dan keyin 50% tez (shared bilan).
3. A3 (invoices-out) — A1/A2'dan tez.
4. A4 (sales-returns) — A1/A2/A3'dan tez.

Phase A tugagandan keyin Phase B (Money) — bu sahifalar'da multi-currency va validation kritik.

---

*Updated: 2026-05-20. Roadmap v1.0. Total 56+ sahifa, ~120-150 soat work.*
