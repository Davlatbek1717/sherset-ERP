# PO detail — full element-by-element parity audit (started 2026-06-25)

> Goal: PO `/purchase-orders/[id]` 100% 1:1 with live moysklad, element by element +
> every menu/modal. Data comes from OUR DB (CRUD in-app) — compare STRUCTURE/UI/behaviour,
> NOT data values. Reference = user-supplied live moysklad screenshots + read-only captures.
> Method: per region/menu → ground moysklad → compare to ours → fix → gate + live cert + commit.
> Status keys: ✅ done(certed) · 🔧 partial · ❌ gap(todo) · ⏳ needs grounding.

## Toolbar
- ✅ **«Изменить» menu** — Удалить · Копировать (was Копировать·Открыть в API·Удалить).
  `1847da66`: DetailToolbar reordered Удалить-first; PO `hideOpenApi`. CERTED.
- ✅ **«Создать документ» menu** — Счёт поставщика · Приёмка · Исходящий платёж · Расходный ордер
  (was wrong order, missing Расходный ордер). `1847da66`: reorder + new РКО route
  `POST :id/create-cash-out` (createCashOutFor) + FE mut. CERTED (menu); РКО create e2e not clicked.
- ✅ **«Печать» menu** — `bf124397`: detail toolbar now lists the account's own forms BY NAME
  (GET /purchase-orders/print-forms), the standard «Заказ поставщику», «Комплект…» (KitPrintModal →
  kit-print) and «Настроить…» — same dynamic menu as the list page. DetailToolbar got an opt-in
  `printMenuItems` override (testId detail-toolbar-print-<id>); the page owns every handler.
  Live cert :3217 (seeded template «Climart Приход») 11/11 0-err: form listed by name · kit modal
  opens both forms + «Распечатать». +2 toolbar guard tests. NOTE: «Запросить форму» promo block
  (moysklad bottom of menu) NOT added (low-value promo) — minor remaining cosmetic.
- ✅ **«Отправить» menu** — `2bb84bb0`: lists the same account forms; picking one renders the doc
  through that form, stores the PDF (BE `POST :id/print-attachment` → AttachmentService.createFromBuffer)
  and opens the email composer with the PDF attached (SendEmailDialog `initialAttachments` chips →
  /email/send `attachmentIds`). DetailToolbar opt-in `sendMenuItems`. Live cert 8/8 0-err: real 10300B
  PDF attachment · /email/send accepts it (only SMTP-unconfigured blocks the actual send) · composer
  shows the chip. NOTE: «Комплект…»-to-email + deeper SMTP adversarial QA deferred.
- ✅ **«1 из N ‹ ›» record-nav** — `f89e857d`: server-backed. BE `GET /purchase-orders/:id/position`
  ({current,total,prevId,nextId}) over the EXACT default list order; FE passes `{server:true}` to
  useDetailNavigation (mirror CO `90b38da3`). Live cert 10/10 0-err: position==list index+1 (idx
  0/1/25/49), total=2084 REAL, prev/next chain, «11 из 2084» on DIRECT URL, › walks, first ‹ disabled.

## Header / meta — LIVE-GROUNDED 2026-06-25 (`tools/capture/ms-po-detail-full-ground.mjs`, real USD order)
- ✅ owner «<name> Основной» + «Изменения: <name> <date>» + avatar.
- ✅ «Статус ▾» (admin custom), «Проведено», «Ожидание».
- ✅ **«Валюта документа» FX-rate helper «1 USD = 12 200 UZS» + ✎** — `2ecbee9f`: options from
  GET /currencies (real names), helper when non-base, ✎→/settings/currencies, save snapshots rateValue
  (BE already supported). Live cert 8/8 0-err, matches moysklad ground-truth `11-meta.png` exactly.
- ✅ «Баланс (мы должны)/(нам должны)» qualifier — CounterpartyBalanceInline already renders per-currency
  rows with the directional label (moysklad shows «12 236 600 сум (1 003 доллар)» — dual-currency covered).
- 🔧 Org 2nd-line account shows «Сум» in moysklad (ours empty when org has no account) · Контрагент ✎
  vs our ✎+«+» — cosmetic, low-value. Field set/order otherwise 1:1 (grounded `10-full.png`).

## Positions / totals — LIVE-GROUNDED 2026-06-25 (`10-full.png`)
- ✅ VAT-conditional «НДС»/«Сумма НДС» cols + «Цена включает НДС» (hidden when НДС off) — /[id] & /new.
- ✅ «Импорт CSV» removed (moysklad has none).
- ✅ columns default Принято/Доступно (user-confirmed). moysklad-this-account showed Ожидание/Вес/Объём —
  but those are ⚙-CONFIGURABLE per account, NOT a structural gap (table + customizer + «Цена ▾»/«Сумма ⚙»
  header all match the grounded shot). Active-row «⋮» + «Добавить из справочника» + «Проверить
  комплектацию» + bottom totals band all present 1:1.
- (cosmetic) exact px widths / sort-arrow styling — diminishing-returns polish, not a functional gap.

## Modals / panels
- ✅ «История изменений» — right slide-over (Drawer), avatar+name+«,action date», Поле/Было/Стало,
  pager, version hidden + ISO dates formatted. CERTED (`7a6ce829` + content fix).
- ✅ **«Владелец» owner-popover** — LIVE-GROUNDED `20-owner-popover.png`: titled «Владелец» + Сотрудник /
  Отдел / «Общий доступ». Ours had the 3 fields but no title → added (`ea77a676`, cert 4/4 0-err). Now 1:1.
- ⏳ «Статус» config modal · «Создать документ» targets' forms — not yet grounded (create-doc opens a NEW
  doc → can't ground read-only without writing; needs careful approach).

## Behaviour
- ✅ posted («Проведено») order stays editable (lock only cancelled / received).
- 🔧 «Проверить комплектацию» + «Добавить из справочника» — already BUILT in our app (rich CatalogPicker +
  availability check, certed in earlier sessions). Grounding the moysklad versions for pixel-diff is
  diminishing-returns; `:text-is` locator missed the buttons (owner-popover overlay) — re-ground later if needed.
- ✅ «Связанные документы» tab populated (`71a16281`, BE findRelated).

## NEXT chunk
Done this session (all live-certed 0-err): ✅ «Печать» (`bf124397`) · ✅ «1 из N ‹ ›» record-nav
(`f89e857d`) · ✅ «Отправить» forms→email (`2bb84bb0`) · ✅ header «Валюта» FX-rate helper (`2ecbee9f`).
**🔑 SOLVED live grounding:** `tools/capture/ms-po-detail-full-ground.mjs` opens the editor by reading the
first `a[href*="purchaseorder/edit"]`'s href and `goto`-ing that hash DIRECTLY (clicking the row was the
thing that landed on the list); do NOT press Escape (closes the editor). The TOOLBAR + HEADER are now
moysklad 1:1; positions are structurally 1:1 (visible cols are ⚙-config).

Remaining — diminishing-returns polish + un-grounded modals (now groundable with the script above):
1. **Modals deep-dive** — owner-popover · «Статус» config · «Создать документ» target forms · Проверить
   комплектацию · «Добавить из справочника» picker — ground each (open read-only) then diff vs ours.
2. **Cosmetic** — org 2nd-line account default · Контрагент ✎-vs-«+» · exact position px widths/sort-arrows.
3. Then roll the FX-rate helper + toolbar (printMenuItems/sendMenuItems/record-nav) onto the OTHER ~20
   doc-detail pages (CO/supply/invoices/…) for app-wide parity.
