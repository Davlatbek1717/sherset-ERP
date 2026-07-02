# B5 — products/[id] RIGHT tabbed widget (2026-06-13)

> **`davom et` (lokal Opus, ultracode).** Phase-1 structural + **browser-certified**
> (Playwright :3100). The second of the master plan's two genuinely-open in-scope
> HIGH refactors (§3.1) — symmetric with the B6 CRM widget (§3.2).

## What

moysklad's product card shows a RIGHT tabbed widget. The clone stacked a flat
`AttachmentsSection` + a 2-tab audit `DocumentTabs`. This builds the real widget.

**§4 DOM-grounded tab set** (`_B5-B6-DESIGN-GROUNDING-2026-06-13.md:24`, captured
from the live product card): **Цены · Модификации · Аналоги · Упаковка · Остатки ·
История · Файлы**. Each backable tab wired to an EXISTING endpoint (grounded by
the 2026-06-13 grounding workflow):

| Tab | Source |
|---|---|
| **Цены** | product entity buyPrice/minPrice/salePrices (already loaded) + /price-types for type names |
| **Модификации** | `GET /variants?productId=<id>` (name/code/barcode/buyPrice, row → /variants/[id]) |
| **Остатки** | `GET /reports/stock-balance?productId=<id>` — per-store rows (Склад/Остаток/Резерв/Ожидание/Доступно) |
| **История** | AuditLog feed (`useDocumentHistory('Product')`) — the prior DocumentTabs convention |
| **Файлы** | `AttachmentsSection entity="Product"` (reused) |
| **Аналоги** / **Упаковка** | no backend module yet → honest empty placeholders (named, not hidden) |

Money BigInt minor (`formatMoney(BigInt(...))`); variant rows keyboard-accessible;
all queries accountId-scoped by the backend.

## Honest deferral

**Аналоги** (analogs) + **Упаковка** (packaging) have no backend module — they
render an honest empty state, not fake content. moysklad's История on the product
card is a Закупки+Продажи doc-lineitem breakdown; ours shows the product's audit
change feed (the existing clone convention for «История»). Both are later backend
slices, named not hidden.

## Gate + runtime

- web tc0 · biome0 (widget clean; the 1 pre-existing warning is in the page's
  unrelated money helper) · web Vitest product-detail-widget 4/4 (new guard) ·
  button-conventions 94/94 · i18n `product_detail_widget` namespace ru+uz complete.
- **Browser-certified (Playwright :3100, RU):** all 7 tabs render
  (Цены[selected] · Модификации · Аналоги · Упаковка · Остатки · История · Файлы).
  Цены renders «Закупочная цена 10 000,00 сум» + «Минимальная цена 0,00 сум»
  (money correct). Остатки renders the per-store table «Asosiy ombor / 0 / 0 / 0
  / 0». **ZERO console errors**.

## Honest status

**Browser-certified** for render + the wired tabs (real data). The Аналоги/Упаковка
modules + the purchase/sale История breakdown remain backend slices (deferred,
named). With B6 (§3.2), this closes the master plan's two genuinely-open in-scope
HIGH refactors.
