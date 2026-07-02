# RESUME — Claude Code Session Entry Point

> ⚠️ **DEPRECATED (2026-05-29)** — Bu fayl eski sprint state'lar tarixi.
>
> **Yangi sessiya entry point: [NEXT.md](NEXT.md)** (8 qator qoidalar, qisqa).
>
> Foydalanuvchi `davom et` desa Claude avtomat `NEXT.md` ni o'qiydi.
> Bu fayl faqat tarixiy ma'lumot uchun saqlanadi.

**[Eski mazmun pastda — sprint 1-12 hujjati]**

> Bu fayl sessiya o'zgargan yoki boshqa hisobdan kirganda Claude'ning loyihani
> tiklashi uchun yagona entry point. Keyin boshqa fayllarga havola qiladi.

---

## 30 soniya orientatsiya

**Loyiha**: moysklad.uz ERP'ning 1:1 klonini O'zbekiston bozori uchun qurish.
**Foydalanuvchi**: Ozodbek (solo developer, Windows 11, D: drive).
**Til**: Uzbek (uz-latin) uchun suhbat, kod/kommitlar inglizcha.
**Sifat qoidasi**: `sifat > tezlik`. Hech qachon skip qilmaslik.
**SCOPE QOIDASI (2026-04-24)**: **MVP degan narsa YO'Q**. Loyiha to'liq,
moysklad.uz bilan 99% parity darajasiga yetkaziladi. Har hujjat turi, har
pattern, har UZ integratsiya — to'liq. "Keyinroq" yoki "oddiyroq" yo'q.

**Ayni damda**: Sprint 3 + 4 + 5.1–5.5a + i18n (uz+ru) yakunlangan:
- Sales 5/5 · Purchase 5/5 · Returns 2/2 · Warehouse 4/4 (Move/Loss/Enter/Inventory)
- Sprint 5.4: Detail + new sahifalar 6 ta modul uchun (12 sahifa), Warehouse subnav,
  "+Возврат" tugmalar Demand/Supply detail'da, uz/ru i18n yangilandi
- Sprint 5.5a: **Bulk actions UI parity** — 15 list sahifada checkbox kolonna +
  BulkActionBar (count + action buttons + clear). API: bulk-delete +
  bulk-transition 16 ta controller'da (runBulk helper, partial-success aware).
  useBulkDocumentActions hook 3 qatorda ulaydi.
- Sprint 5.5b: **Related docs + History tab** — yangi `audit-log` API moduli
  (GET /audit-logs), HistoryTimeline + RelatedDocsPanel komponentlar,
  `DocumentTabs` wrapper 15 ta detail sahifada (Bog'liq | Tarix). Audit i18n
  50+ kalit uz/ru.
- Sprint 5.5c: **Column customization** — ColumnCustomizer popover (show/hide
  checkbox list + Reset), useColumnVisibility localStorage hook, DataTable +
  ListView'da `visibleColumnKeys` prop. 15 ta list sahifada ulangan.
- Sprint 5.5d: **CSV export** — buildCsv (RFC 4180) + downloadCsv (UTF-8
  BOM) + ExportButton komponenti. DataTableColumn'ga `cellText`/`headerText`
  qo'shildi. 15 list sahifasida eksport tugmasi, `visibleColumnKeys`'ni
  hurmat qiladi. 7 yangi csv.test.ts unit test.
- Sprint 6.1: **Money foundation** — 3 yangi model (OrganizationAccount,
  CashDesk, MoneyOperation) + Prisma migration. `MoneyService.applyDeltas`
  (tenant guard, currency match, overdraft check, deadlock-safe ordering).
  `/organization-accounts` + `/cash-desks` reference endpoints. 8 ta yangi
  money.service.test.ts.
- Sprint 6.2a: **CashIn + CashOut backend** — ПКО/РКО hujjatlari,
  FSM draft→posted→cancelled, MoneyService cascade (+/−sumMinor on cashDesk)
  + InvoiceOut/InvoiceIn allocation cascade. Bulk endpoints. 17 yangi
  schema test (181 total).
- Sprint 6.2b: **Cash UI** — `/cash-in` va `/cash-out` uchun list + detail +
  new sahifalar (moysklad 1:1 pattern). Agent + organization + cashDesk
  pickerlari, multi-allocation invoice picker, bulk + CSV + column
  customizer. Money subnav avvaldan ulangan. i18n: uz/ru to'ldirildi.
- Sprint 6.3a: **CounterpartyBalance** — yangi model + migration. Service
  `applyDelta(tx, cpId, currency, delta)` atomic upsert. 6 ta service
  cascade'iga ulangan (InvoiceOut/In, PaymentIn/Out, CashIn/Out) — moysklad
  sign convention'iga mos (+ bizga qarzdor, − biz qarzdormiz). Counterparty
  detail sahifasida "Balans" jadvali (valyuta × summa, rang tonaliga qarab).
- Sprint 6.3b: **Bank statement CSV import** — BankStatement + Row
  modellar, tolerant `csv-parser.ts` (BOM, RFC 4180, uz/ru/en headers,
  sign-inferred direction, dd.mm.yyyy, comma-decimal). Upload → auto-match
  (STIR/hisob) → preview → commit PaymentIn/Out draftlar. Web:
  /bank-import sahifasi (file+paste, preview table, manual override picker,
  commit count button, history). Money subnav'ga "Bank vypiska" qo'shildi.
  9 ta yangi csv-parser.test.ts.

Sprint 6 YAKUNLANDI (244 test).
- Sprint 7.1: **PriceType** — `price_types` jadval (accountId, name unique,
  currency, isDefault + guard, position, archived). Service avtomatik
  Default yaratadi (ensureDefault) + standartni o'chirib/arxivlashga yo'l
  qo'ymaydi. REST CRUD + bulk-delete. Web /price-types sahifasi: inline
  CRUD moysklad "Типы цен" kabi. 7 ta yangi schema test.

- Sprint 7.2: **Services** — Product.kind='service' allaqachon mavjud.
  /services list sahifasi (kind filter) + /services/new formasi (stok
  maydonlarisiz). Moysklad'ning unified Assortment pattern. i18n tayyor.

- Sprint 7.3: **Variants (Modifikatsiyalar)** — Variant jadvali (productId
  FK, characteristics Json, salePrices Json, barcode unique). Service:
  auto-name ("{parent} / {char1} / {char2}"), CRUD + archive/restore.
  Web: /variants list + /variants/new (parent picker + dynamic
  characteristics editor). 9 yangi schema test.

- Sprint 7.4: **Bundles (Komplektlar)** — BundleComponent jadvali
  (bundle → components, quantity, polymorphic product/variant).
  BundleService.setComponents full-list replace. Self-reference + nested
  bundle tekshiruvi. Web /bundles list + /bundles/new (component picker +
  dynamic list). api-client'ga PUT helper qo'shildi. 8 yangi schema test.

- Sprint 7.5: **Product Images** — ProductImage jadvali (bytea content,
  isMain auto-promote, position). ImageService: upload (base64 JSON,
  4 MB cap), set-main, delete (next promoted), reorder, getRaw.
  Endpointlar: /products/:id/images CRUD + /images/:id/raw (binary).
  Web ImageGallery komponenti: thumbnail grid + hover actions + file
  picker. Product detail sahifasiga ulandi. 10 yangi schema test.

Sprint 7 YAKUNLANDI (5/5 slice, 278 test).
- Sprint 8.1a: **ContactPerson** — kontragent ostida ko'p kontakt shaxs.
  CRUD + archive/restore + bulk-delete. Web /contact-persons list (tel:/
  mailto: linklar) + /new (counterparty prefill via ?counterpartyId=).
  12 yangi schema test (241 API total).
- Sprint 8.1b: **CallsSection / ContactPersonsSection** — counterparty
  detail sahifaga inline jadval (kontaktlar va qo'ng'iroqlar) qo'shildi.
- Sprint 8.2: **Call log (Журнал звонков)** — Call jadvali (counterparty
  / contactPerson / owner barchasi nullable, SetNull cascade), 4 channel
  + 4 status enum, dateRange + multi-filter list. Web /calls list +
  /calls/new form (datetime-local, counterparty→contactPerson dependent
  picker) + CallsSection inline counterparty-detail block. 20 yangi
  schema test (261 API total).
- Sprint 8.3: **Sales funnel (Воронка / Сделки / Канбан)** —
  Pipeline + PipelineStage + Opportunity uchta yangi model. Auto-number
  СД-YYYY-NNNNN. PipelineService getOrCreateDefault — birinchi murojaatda
  6 ta standart bosqich seedlanadi. OpportunityService transition —
  bosqich tipi ('open'/'won'/'lost') status va closedAt'ga avto
  ko'chiriladi. Web: /opportunities list (status filter pillalari),
  /opportunities/new (pipeline→stage cascading), /opportunities/board
  (HTML5 drag-and-drop Kanban), /pipelines admin sahifa + PipelineEditor
  komponent (rang tanlovchi + reorder). Subnav CRM 3 yangi entry. 40
  yangi schema test (301 API total).
- Sprint 9.1: **Attachments (Fayllar / Файлы)** — polymorphic
  `Attachment` model (`entity` + `entityId` discriminator), bytea inline
  10 MB cap, 19 ta host entity uchun whitelist. AttachmentService:
  upload + list + getRaw (streaming binary endpoint) + delete.
  AttachmentsSection komponent — HTML5 drag-and-drop zone, mime-aware
  emoji ikonalar, click-through inline preview (PDF/rasm) yoki download.
  18 ta detail sahifaga inline qo'shildi. 13 yangi schema test (314 API).
- Sprint 9.2: **Print/PDF templates** — `app/print/*` route group
  (sidebar yo'q, A4 print-page card). PrintShell + PrintDoc + PrintReceipt
  komponentlar. 5 ta print sahifa: invoice-out, demand, customer-order,
  supply, payment-in. Detail sahifalarda "Печать" tugmasi popup ochadi
  (auto=1 bilan auto-print). `@moysklad/money/position` — BigInt-based
  position math (qty × price × discount × VAT) — server va client bir
  xil natija beradi. 11 yangi test (45 money total).
- Sprint 9.3: **Email send (SMTP per-account)** — EmailConfig +
  EmailLog modellari, AES-256-GCM bilan parol shifrlash
  (EMAIL_ENCRYPTION_KEY env). nodemailer orqali yuborish + test-
  connection. /settings/email konfiguratsiya sahifasi (provider
  preset: Gmail/Yandex/Mail.ru/custom). SendEmailDialog komponent —
  Radix dialog, to/cc/subject/body inputlari, attachmentIds[] orqali
  /attachments fayllar biriktirish. 3 ta detail sahifa (invoices-out,
  demands, customer-orders) Print + Email tugmalari bilan jihozlandi.
  29 yangi test (343 API total).
- Sprint 10.1: **Sales report (Sotuvlar hisoboti)** — ReportService
  10 ta groupBy rejim: none/day/week/month/quarter/year/counterparty/
  organization/store/product. Date-bucket'lar uchun `$queryRaw +
  date_trunc`, FK group'lar uchun Prisma groupBy, product uchun
  position-table JOIN. Web: yangi "Hisobotlar" tab (📈), /reports
  landing + /reports/sales sahifa filter bar + 9 ustunli jadval
  + totals row + CSV eksport. 13 yangi test (356 API total).
- Sprint 10.2: **Cash flow report (Pul oqimi hisoboti)** —
  CashFlowService 4 ta jadval (CashIn/CashOut/PaymentIn/PaymentOut)
  bo'yicha UNION ALL bilan birlashtirilgan. 9 ta groupBy + channel
  filter (cash_in / cash_out / payment_in / payment_out). Web
  /reports/cash-flow sahifa (rangli net oqim — yashil/qizil) + CSV
  eksport. Multi-currency hozircha UZS sifatida yig'iladi. 11 yangi
  test (367 API). QA bilan BUG#6 topildi va tuzatildi (table
  nomlari `cash_in`/`cash_out` singular).
- Sprint 8.3 polish: **/opportunities/[id] detail sahifa** — to'liq
  Bosqich + Summa + Kontragent + Fayllar + Meta sektsiyalari.
  Stage transition tugmalari (← Prev, Next →, "Yutuq deb belgilash",
  "Yo'qotish deb belgilash" inline lostReason input bilan).
  Vaznlangan summa ko'rsatiladi (amount × probability/100).
- Sprint 10.3: **Stock balance report (Qoldiqlar hisoboti)** —
  StockBalanceService 2 rejim: per-store flat list yoki product
  roll-up (qty barcha omborlar bo'yicha jami). Polymorphic
  assortmentKind (product/variant/bundle) bo'yicha qidirish — Stock
  jadvalida Prisma relation yo'q, name'lar ikkinchi batched query'da
  o'qiladi. Web /reports/stock-balance: 5 summary card (SKU/Qoldiq/
  Rezerv/Yo'lda/Mavjud) + 8 ustunli jadval + hideEmpty checkbox +
  CSV. 12 yangi test (379 API).
- Sprint 10.4: **Counterparty balance (Kontragent qarzlari)** —
  CounterpartyBalanceService Sprint 6'dan beri materialized
  `counterparty_balances` jadvalini o'qiydi (PaymentIn/Out, CashIn/
  Out, Demand cascade'lari avtomat yangilab boradi). Sign:
  >0 → bizga qarzdor (debtor), <0 → biz qarzdor (creditor).
  Filter: signFilter (all/nonzero/debtors/creditors), currency,
  search, includeArchived, groupBy ('none' yoki 'counterparty' —
  multi-valyuta 'MIX' deb belgilanadi). Web /reports/counterparty-
  balance: 5 summary card · color-coded balance ustun · side
  Badge · MIX tooltip · CSV. 14 yangi test (393 API).

- Sprint 10.5: **P&L (Foyda va zarar)** — PnlService 4 jadval
  agregatsiyasi: Demand (revenue) + SalesReturn (-) + PaymentOut +
  CashOut (expenses). 6 standart metrika: Revenue · COGS · Gross
  profit · Expenses · Net profit · Margin %. Web /reports/pnl
  sahifa 7 ustunli jadval bilan, color-coded foyda ustuni (yashil/
  qizil), formula caveat ostida. 11 yangi test (404 API).

Hisobotlar moduli **5 ta to'liq report**: 📈 Sales · 💸 Cash flow ·
💰 P&L · 📦 Stock balance · 🤝 Counterparty balance. Reports
module ~65% to'liq.

- Sprint 10.6: **Sales by Manager** (owner groupBy qo'shildi
  /reports/sales endpointiga, yangi endpoint emas).
- Sprint 11: **Settings UI** — 4 ta yangi /admin/* CRUD backend
  moduli (Organization, Store, CashDesk, OrganizationAccount) +
  14 ta web sahifa (/settings landing + 4 ta CRUD set: list/new/
  edit). Sozlamalar tab ⚙️ + 6-entry subnav. 76 ta yangi i18n key
  uz+ru. Sonnet subagent dispatch'i orqali (CLAUDE.md rule)
  mechanical CRUD scaffolding qilindi, trust-but-verify bilan
  inline tekshirildi.

SMB-ready core ~95% to'liq. Production module/Retail/E-com hali
boshlanmagan (taxminan 40% qolgan).

Keyingi: **Sprint 11.6 Price types CRUD UI** (backend allaqachon
bor, faqat UI kerak), yoki **Sprint 11.7 Users + roles assignment**,
yoki **Sprint 12 Production module** (yangi domain).

### To'liq ishlaydigan oqimlar
- **Sales E2E**: `CO → Supply → Demand → Invoice → Payment → closed` ✅
- **Purchase E2E**: `PO → Supply → InvoiceIn → PaymentOut → closed` ✅
- **Returns**: `Demand → SalesReturn → CO shipped revert` ✅ ·
  `Supply → PurchaseReturn → PO received revert` ✅
- **Warehouse**: Move (two-leg stock ops) · Loss (reason-tagged writeoff) ·
  Enter (cost-basis inflow) · Inventory (variance-based recount) ✅

**Foundation debt yopildi**: i18n (next-intl, cookie-based, uz/ru) — har
sahifada `useTranslations` hook, 360+ tarjima kalit har til uchun.

### Sessiya 2026-05-16/17 — cross-stack maydon pariteti + Sprint 10 UI

Har biri alohida commit, har bosqichda darvozalar yashil (api+web
typecheck 0, biome 0/0, **98 fayl / 1339 test** yashil — regressiyasiz):

- **Договор/Проект cross-stack 1:1** — Sales (demand, invoice-out,
  sales-return) · Purchase (invoice-in, supply, purchase-return) ·
  Stock (move, loss, enter, inventory, internal-order — faqat
  `projectId`, ichki hujjat) · Money (prepayment, prepayment-return,
  counterparty-adjustment) · Production (processing, processing-order).
  Har modul: Prisma+migration+API schema+service (create/update/
  findById[+clone])+FE [id]+new (picker + dirty-guard snapshot)+i18n.
- **Demand «Другие поля»** (commit `66b3e733`) — §8.1 jonli moysklad
  etalon asosida 11 shipping/logistika maydoni: consignor/consignee/
  carrier (Counterparty FK) + cargoName/shipperInstructions/
  transportFacility/carNumber/placesCount/shippingDocNo/shippingDocDate/
  stateContractId. Prisma `add_demand_shipping_block` + FE collapsible.
- **Sprint 10 to'ldirildi** (commit `eb05efb5`) — 5 ta backend-tayyor
  hisobot (slow-movers, sales-by-channel, inventory-variance,
  sales-by-hour, average-basket) UI'siz edi → 5 FE sahifa (aging
  pattern), 5 landing card, i18n (5 namespace + 10 card key uz/ru).
- **`docs/PARITY-AUDIT.md §9`** (commit `2d887188`) — bajarilgan ish +
  HALOL xulosa: shipping bloki demand'ga xos (invoice-out=to'lov
  hujjati, ko'chirish=fabrikatsiya); oson-auditlanadigan modellar
  to'liq; chuqurroq per-doc fidelity jonli moysklad capture talab
  qiladi (§8.3) — taxmin=fabrikatsiya (qoida #1).

**MCP bloki (hujjatlangan)**: Claude-in-Chrome MCP tab moysklad
sessiyasidan izolyatsiya; Claude parol kirita olmaydi (o'zgarmas
xavfsizlik qoidasi). Per-doc «Другие поля» pariteti uchun yo'l:
foydalanuvchi o'z tabidan forma skreenshotini beradi → Claude
cross-stack implement qiladi. Aks holda reference-siz greenfield
(Sprint 10 kabi) davom etadi.

### §8.3 jonli-capture BLOKERI YECHILDI (2026-05-17)

**Ishlaydigan usul (muhim — keyingi sessiyaga):** (1) `computer-use`
MCP'da `request_access(["Google Chrome"])` → "read" tier (ekranni
ko'rish); (2) foydalanuvchi O'Z Chrome profilida moysklad'ga kiradi;
(3) `Claude-in-Chrome` MCP `tabs_context_mcp(createIfEmpty)` → yangi
MCP-tab **xuddi shu profil cookie'sini ulashadi** → moysklad'ga
**login bo'lib ochiladi** (avval login-page'ga sakrayotgan edi, chunki
profil hali login bo'lmagandi); (4) `find` + `left_click` + `read_page`
(accessibility-tree) bilan forma to'liq o'qiladi. Parol kiritilmadi.
⚠️ **moysklad ulanish-limiti**: MCP-tab foydalanuvchi seat'ini band
qiladi → «Превышен лимит подключений» chiqishi mumkin. Capture
tugashi bilan `tabs_close_mcp` bilan tab yopiladi (seat bo'shaydi).

**§8.3 per-doc bajarildi (cross-stack 1:1, gate yashil):**
- **invoice-out** (`e65b5290`) — §10: `storeId` (Склад) +
  `organizationAccountId`+`agentAccountId`+`externalCode`. DB ustunlari
  bor edi → migration KERAK EMAS. `clone()` lossy edi (contract/
  project/salesChannel/CO ham tushib qolardi) → to'liq tuzatildi.
- **sales-return** (`21831bca`) — §11: store/contract/project allaqachon
  bor; `orgAccount`+`agentAccount`+`externalCode` qo'shildi; clone fix.
- **supply** (`e693e781`) — §12: orgAccount+agentAccount+externalCode;
  clone fix (incoming ham). **HALOL DEFER**: «Накладные расходы»
  (overhead) DB ustunlari bor, lekin supply.service'da distribution
  logikasi YO'Q — input qilib qo'yish=rule#1 buzilishi. Demand'da ham.
  Kelajak alohida pul-feature (kvantlangan TODO §12).
- **purchase-return** (`bf5cb385`) — §13: orgAccount+agentAccount+
  externalCode; clone fix (supply+reason ham).
- **Tasdiq:** invoice-out/sales-return/supply/purchase-return'da
  «Другие поля» shipping bloki YO'Q — **demand'ga xos** (§9.3 qayta
  tasdiq). Har `/new`'da `bankAccount→organizationAccountId` mashinasi
  oldindan bor → dublikat qilinmadi (no-two-approaches, har safar
  diff+gate+endpoint mavjudligi mustaqil tekshirildi).

### §8.3 SALES/PURCHASE FSM GURUHI — 8 HUJJAT 1:1 YAKUNLANDI (2026-05-17)

Jonli moysklad capture (Claude-in-Chrome accessibility-tree, parolsiz)
→ gap kvant → schema+service+FE → gate (api+web tc 0, biome 0/0, 98
fayl/1339 test) → subagent mustaqil tekshirildi → commit → MCP-tab
yopildi. **Umumiy topilma:** barcha ustunlar DB modelida bor edi —
**migration kerak emas**; gap = API/FE exposure. `clone()` HAR joyda
lossy edi (header ref tushardi) → hammasi tuzatildi.

| Doc | Commit | §  | Gap |
|-----|--------|----|-----|
| demand | 66b3e733 | 9.2 | 11 shipping (Другие поля) |
| invoice-out | e65b5290 | 10 | store+orgAcct+agentAcct+extCode |
| sales-return | 21831bca | 11 | orgAcct+agentAcct+extCode |
| supply | e693e781 | 12 | orgAcct+agentAcct+extCode (overhead DEFER) |
| purchase-return | bf5cb385 | 13 | orgAcct+agentAcct+extCode |
| purchase-order | 98198fbf | 14 | contract+project+orgAcct+agentAcct+extCode |
| customer-order | 3f781445 | 15 | orgAcct+agentAcct |
| invoice-in | 267db738 | 16 | store+orgAcct+agentAcct+extCode |

`C:` disk blokeri (100% to'la edi) — foydalanuvchi bo'shatdi (~1.7G);
git→D: hamisha xavfsiz edi, hech narsa yo'qolmadi.

### HUJJAT-MAYDON PARITET TASHABBUSI — TO'LIQ YAKUNLANDI ✅ (2026-05-17)

8 arxetip jonli-tasdiqlandi; qolganlar dalil bilan kvantlandi (model
ustun = moysklad-parity dizayn + 8× universal naqsh) — hammasi
bajarildi, fabrikatsiyasiz, har bosqich gate yashil, modul-modul commit:

- **Stock (5)+cash (2)** — «Внешний код» exposure ✅ (`594d7997`).
  Ichki/kassa: hisob YO'Q (model dalil). internal-order extCode bor edi.
- **payment-in/out (2)** — extCode + org/agent hisob ✅ (`ba4c34b`).
- **prepayment/prepayment-return (2)** — org/agent hisob ✅ (`61bbd255`).
- **processing/processing-order/counterparty-adjustment (3)** — extCode
  allaqachon expose, account ustun yo'q (moysklad dizayni) → **gap yo'q,
  COMPLETE** (dalil bilan tasdiqlandi).

`PARITY-AUDIT.md §20` — yakuniy xulosa. Universal topilma: kerakli
ustunlar DB'da allaqachon bor edi → **migration hech qayerda kerak
emas**; gap = API/FE exposure. `clone()` deyarli hammada lossy edi →
to'liq tuzatildi (moysklad «Скопировать» parity). Yagona ochiq DEFER:
«Накладные расходы» overhead distribution (supply/demand — DB ustun
bor, service logikasi yo'q; alohida pul-matematik feature, §12).

**Keyingi sessiya uchun keyingi (reference-siz mumkin)**:
dashboard/Показатели UI · landing-card to'ldirish · Sprint 11 POS ·
Sprint 15 Production chuqurlashtirish · «Накладные расходы» distribution
feature (overhead — adversarial QA bilan, §12 DEFER).

**Keyingi (reference-siz mumkin)**: dashboard/Показатели UI tekshiruvi ·
profitability/purchase-management/unit-economics landing-card yo'qligi ·
Sprint 11 POS · Sprint 15 Production. **Keyingi (§8.3 davomi)**: qolgan
FSM hujjatlar — har biri: jonli capture → gap kvant → schema+service+FE
+(migration faqat ustun yo'q bo'lsa) → gate → commit, modul-modul.

---

### AVTONOM SESSIYA 2026-05-17 — 6 commit, 1344→1375 test, gate yashil

Ketma-ket avtonom (foydalanuvchi: "hech qaysi qolib ketmasin… avtonomda
ishlab"). Hammasi gated + mustaqil tekshirilgan + commit, fabrikatsiyasiz:

1. `5ce57a0f` — Tier-2 adversarial QA verdict (/files + /getting-started
   sog'lom, kod o'zgarishi shart emas — halol audit-only)
2. `42eb0858` — **§12 Supply «Накладные расходы»** to'liq cross-stack:
   pure largest-remainder helper (16 adversarial test, Σ=total isbot,
   post↔unpost zero-sum, overhead=0 no-op) + service + FE + i18n
3. `b35e1b94` — RetailSale «Внешний код» (§17-sinf, model-isbotli)
4. `15132d0e` — CashierSession extCode + tashlab yuborilgan description
   tuzatildi (lossy-create §8.3 pattern)
5. `ec7995cc` — Demand «Внешний код» cross-stack (FE [id] disabled→
   editable; clone in-scope extCode)

`PARITY-AUDIT.md §21–§25` — to'liq audit izi.

**KEYINGI KETMA-KETLIK (dalil-aniq, reference-siz, §25):** universal
externalCode-gap — 9 modul qoldi, har biri alohida birlik (schema +
service create/update + clone agar bor + findById tekshir + FE detail/
editor + schema test + biome/typecheck/full-suite gate + commit):
**Organization · PriceType · ProductFolder · SalesChannel** (katalog —
soddaroq, clone/FSM yo'q) → **Consignment · FactureOut · FactureIn ·
CommissionReportOut · CommissionReportIn** (hujjat — clone/FSM tekshir).
Har birida: model'da `external_code` bor (migration KERAK EMAS), schema
0 expose. §25 commitidagi demand naqshini ko'chir.

**HALOL DEFER (jonli moysklad reference shart — fabrikatsiya yo'q):**
- `demand.clone()` kengroq lossless emas (contract/project/salesChannel/
  shipping block/customerOrderId — CO fulfillment-cascade ta'siri) §25
- Demand/Move/Enter «Накладные расходы» — moysklad Отгрузка'da overhead
  input semantikasi tasdiqlanmagan (faqat Приёмка aniq) §22
- CashierSession `close()` description (concurrency-guarded write path) §24
- Sprint 11 POS / Sprint 15 Production kengroq maydon-pariteti §23

---

## Birinchi buyruqlar (har doim)

```bash
cd D:/projects/moysklad

# 1. So'nggi commitlarni ko'rish
git log --oneline -20

# 2. Ishchi daraxt toza ekanini tekshirish
git status --short

# 3. Quality gates yashilmi?
pnpm --filter @moysklad/api exec tsc --noEmit       # 0 xato bo'lsin
pnpm --filter @moysklad/web exec tsc --noEmit       # 0 xato bo'lsin
pnpm --filter @moysklad/api test --silent           # 241 ta yashil
pnpm --filter @moysklad/ui test --silent            # 7 ta yashil
pnpm --filter @moysklad/money test --silent         # 34 ta yashil
pnpm --filter @moysklad/workflows test --silent     # 8 ta yashil
pnpm validate:all                                    # 115/115 bo'lsin

# 4. i18n smoke (uz + ru bundles parse bo'ladimi?)
node -e "JSON.parse(require('fs').readFileSync('apps/web/src/messages/uz.json'))"
node -e "JSON.parse(require('fs').readFileSync('apps/web/src/messages/ru.json'))"
```

Barchasi yashil bo'lsa, davom eting. Qizil bo'lsa — **avval tuzating**.

---

## Fayllar ierarxiyasi (nima qayerda)

| Fayl | Maqsad |
|------|--------|
| `RESUME.md` | **SIZ HOZIR SHU YERDA** — sessiya kirish nuqtasi |
| `docs/HANDOFF.md` | To'liq loyiha holati, barcha Sprint'lar, arxitektura |
| `docs/PROJECT-PLAN.md` | Master plan (katta rasm) |
| `docs/DISCOVERY-PLAN-C.md` | 8-haftalik discovery roadmap (tugallangan) |
| `docs/adr/*.md` | 6 ta arxitektura qarori (**IMMUTABLE, qayta muhokama qilinmaydi**) |
| `docs/glossary.md` | Entity va terminlar lug'ati |
| `docs/moysklad-reference/workflows/*.json` | 36 ta FSM spec — har hujjat state machine'ni belgilaydi |
| `docs/moysklad-reference/data-model/entity-schemas/*.json` | 79 ta entity schema |
| `packages/db/prisma/schema.prisma` | Haqiqiy DB schema (asosiy haqiqat manbai) |
| `tools/visual-check/check-*.ts` | Playwright E2E skriptlar — Sprint'larda fidelity dalili |
| `tools/admin/enable-negative-stock.ts` | Store.allowNegativeStock ni yoqish (dev helper) |

---

## Eng so'nggi holat (2026-04-20 — SPRINT 3 COMPLETE)

### Quaylangan modullar (19 backend, 21 web route)
Product · ProductFolder · Counterparty · **CustomerOrder** · **Demand** ·
**InvoiceOut** · **Supply** · **PaymentIn** · **PurchaseOrder** ·
**InvoiceIn** · **PaymentOut** · **SalesReturn** · **PurchaseReturn** ·
**Move** · **Loss** · **Enter** · **Inventory** · Stock · Reference

### i18n (Sprint 4.3.5)
- next-intl 4.x · cookie-based (`NEXT_LOCALE`, no URL prefix)
- Default `uz` (uz-latin), `ru` ham mavjud (English deferred)
- Har sahifada `useTranslations('pages.<entity>')` + shared `common`/`fields`/
  `states`/`transitions`/`form` scope'lari
- LocaleSwitcher AppShell'ning `topRightExtras` slot'ida

### Ishlaydigan FSM kaskad
```
CO: draft → confirmed → fully_shipped → paid → closed
           (Demand.post)     (Payment.post via Invoice)
```

### Statistika
- **188 ta test** yashil (146 API + 34 money + 8 workflows)
- **115/115 JSON schema** valid (36 FSM + 79 entity/document)
- **6 ta typecheck** paket yashil (api + web + db + money + ui + workflows)
- **30+ vizual screenshot** tasdiqlangan (6 ta Sprint flow)
- **uz + ru** to'liq tarjimalar (400+ kalit har til)
- **14 FSM'd hujjat turlari** — har birida to'liq state machine

### Keyingi Sprint'lar (joriy ustuvorlik tartibida)
1. **Sprint 4.4 — KRITIK**: Full Purchase E2E + Supply.purchaseOrderId back-link →
   `PO.receivedSum` aggregate + `partially_received`/`fully_received`/`closed`
   avto-tranzitsiya. PO `closed` faqat shu sprint'dan keyin haqiqatda ishlaydi.
2. **Sprint 4.3.6 (RBAC enforcement)**: barcha controller'larga
   `@RequireScope('action@entity')` dekorator. Infra Sprint 2.5'da, endpoint
   darajada to'liq enforce qilinmagan.
3. **Sprint 4.3.7 (Fayl upload)**: S3/local storage adapter, Files modeli,
   Product/Counterparty/InvoiceIn/etc'ga rasm va PDF biriktirish.
4. **Sprint 3.4c (backlog)**: FIFO cost consumption on Demand.post —
   `SupplyPosition.remainingQty` dekrement + `DemandPosition.costMinor` to'ldirish
5. **Sprint 4.5**: PurchaseReturn (Возврат поставщику) + SalesReturn (Возврат
   покупателя) — return doclar
6. **Sprint 5+** (master plan §4): Move/Inventory/Loss, Money ledger
   (OrganizationAccount), Retail/Shift, Fiscal (VCR UZ), UZ Tier-1
   integratsiyalar (Soliq.uz, ASL Belgisi, Payme, Click, Eskiz, CBRU)

---

## Muhitni ishga tushirish (fresh clone bo'lsa)

Agar yangi mashinada bo'lsangiz yoki servis o'chgan bo'lsa:

```bash
# 1. PostgreSQL 17 (port 5433, parol=1234, database=moysklad_dev)
# Windows: Start-Service postgresql-x64-17 (admin)
net start postgresql-x64-17

# 2. Dependencylarni o'rnatish
cd D:/projects/moysklad
pnpm install

# 3. DB migratsiya + seed
pnpm --filter @moysklad/db exec prisma migrate deploy
pnpm --filter @moysklad/db seed
pnpm --filter @moysklad/db exec tsx ../../tools/admin/enable-negative-stock.ts true

# 4. Dev serverlar (2 ta terminal)
# Terminal 1 — API :4000
pnpm --filter @moysklad/api dev
# Terminal 2 — Web :3000
pnpm --filter @moysklad/web dev
```

**Credentialar**: `admin@demo.local` / `admin123`

Servislar:
- PostgreSQL: `localhost:5433` (db: `moysklad_dev`, user: `postgres`, pass: `1234`)
- API: `http://localhost:4000` (NestJS + Fastify)
- Web: `http://localhost:3000` (Next.js 15 App Router)

---

## Sprint 3 vizual dalil

Har Sprint uchun E2E Playwright:
```bash
# CustomerOrder flow (Sprint 3.1)
pnpm --filter @moysklad/api exec tsx ../../tools/visual-check/check-orders-full.ts

# Demand flow (Sprint 3.2)
pnpm --filter @moysklad/api exec tsx ../../tools/visual-check/check-demands.ts

# InvoiceOut flow (Sprint 3.3)
pnpm --filter @moysklad/api exec tsx ../../tools/visual-check/check-invoices-out.ts

# PaymentIn flow (Sprint 3.4b)
pnpm --filter @moysklad/api exec tsx ../../tools/visual-check/check-payments-in.ts

# FULL Sales flow E2E (Sprint 3.5) — eng muhim
pnpm --filter @moysklad/api exec tsx ../../tools/visual-check/check-full-sales-flow.ts

# InvoiceIn flow (Sprint 4.2) — PO → Faktura → PO.invoicedSum kaskad
pnpm --filter @moysklad/api exec tsx ../../tools/visual-check/check-invoices-in.ts

# PaymentOut flow (Sprint 4.3) — PO→Faktura→To'lov→paid + PO.payedSum cascade
pnpm --filter @moysklad/api exec tsx ../../tools/visual-check/check-payments-out.ts
```

Screenshot'lar `.screenshots/` (gitignored) ga yoziladi.

---

## Muhim arxitektura qoidalari (buzmang)

1. **Single-writer rule**: Har bir service bitta aggregate'ga egalik qiladi.
   - `StockService` → `Stock` + `StockOperation`
   - `CustomerOrderService` → CO `shippedSum`/`invoicedSum`/`payedSum`/`state`
   - `InvoiceOutService` → `payedSumMinor` + InvoiceOut state
   - Cross-aggregate yozuvlar `applyX(tx, ...)` metodlari orqali.

2. **Money = BigInt tiyin**, **Qty = Decimal(20,6)**. Hech qachon aralashtirmang.

3. **Posting pessimistik lock**: `$transaction({ isolationLevel: 'Serializable' })` + `SELECT ... FOR UPDATE` on Stock rows, assortmentId ASC tartibda — deadlock oldini olish.

4. **FSM workflows JSON spec'lariga mos bo'lishi shart**. Har yangi hujjat turi `docs/moysklad-reference/workflows/<slug>.json` dan keladi.

5. **`.js` extension imports** TypeScriptda (NodeNext ESM). Hech qachon `.ts` ishlatmang apps/api ichida.

6. **Commitlar Conventional Commits** + Co-Author:
   ```
   GIT_AUTHOR_NAME="Ozodbek" GIT_AUTHOR_EMAIL="ozodbekmirgasimov1@gmail.com" \
   GIT_COMMITTER_NAME="Ozodbek" GIT_COMMITTER_EMAIL="ozodbekmirgasimov1@gmail.com" \
   git commit -m "..."
   ```
   (Global git config yo'q — identity har kommit uchun env orqali beriladi.)

---

## ADR'lar (qaytib muhokama qilinmaydi)

- ADR-0001: **TypeScript + NestJS + Prisma + Postgres + Next.js** (Kotlin rad etildi)
- ADR-0002: **Docker yo'q** (native Windows dev, PM2+Nginx prod)
- ADR-0003: **Bridge multi-tenancy** (accountId + RLS)
- ADR-0004: **Money = BigInt minor-units** (tiyin)
- ADR-0005: **Hybrid audit** (reference = audit_log, stock/money = append-only ledger)
- ADR-0006: **Vertical slice development** (schema + api + ui + test per feature)

---

## Foydalanuvchi bilan muloqot uslubi

- **Til**: O'zbek (uz-latin). Kod/commit/log — inglizcha.
- **Uslub**: To'g'ridan-to'g'ri, professional. Variantlar emas, tavsiya bering.
- **Sabrlilik**: Yuqori, lekin **"keyinroq tuzataman"** degan rad etiladi.
- **Triggerlar**: `Kotlin/Docker/MVP` ni qayta muhokama qilish, scope kamaytirish,
  ortiqcha savollar.
- **Iltimos**: Ishni **har bir Sprint yakunida commit** qiling.

---

## Agar kontekst tugayotgan bo'lsa

1. **Darhol commit** qiling — ishni yo'qotmang.
2. `docs/HANDOFF.md` + shu `RESUME.md` ni o'rgangan narsalaringiz bilan yangilang.
3. `C:/Users/user/.claude/projects/D--projects-moysklad/memory/project-state.md`
   faylini yangilang.
4. Foydalanuvchiga ayting: "Kontekst tugayapti, yangi suhbatda RESUME.md'dan
   boshlab davom etamiz."

---

## Boshqa akkaunt / boshqa mashinadan kirish

### Stsenariy A: Aynan shu Windows mashina, boshqa Claude hisob
Barcha fayllar `D:\projects\moysklad` da. Claude Code'ni shu papkada oching.
**Hech qanday qo'shimcha sozlash kerak emas** — RESUME.md'ni o'qisa bo'ldi.

Memory fayllar `C:/Users/user/.claude/projects/...` da — agar shu Windows user
ostida kirilsa, avtomatik mavjud. Yo'q bo'lsa, `docs/HANDOFF.md` + `RESUME.md`
yetarli.

### Stsenariy B: Boshqa mashina
1. Git'dan clone qiling (pastda "Git remote" bo'limiga qarang).
2. Yuqoridagi **Muhitni ishga tushirish** bo'limini bajaring.
3. `RESUME.md`'dan davom eting.

---

## Git remote (backup uchun muhim)

Agar hali push qilinmagan bo'lsa, GitHub'ga push qiling:

```bash
# Github'da shaxsiy private repo yarating: moysklad-clone
cd D:/projects/moysklad
git remote add origin https://github.com/YOUR_USERNAME/moysklad-clone.git
git push -u origin main
```

Bu sessiyaning barcha commit'lari (Sprint 3 butunligi) saqlanadi.

---

**Keyingi amal**: `docs/HANDOFF.md` ni o'qing, so'ng `git log --oneline -20`,
keyin foydalanuvchidan so'rang: *"Sprint 4 (Purchase side) boshlaymizmi, yoki
boshqa yo'nalishmi?"*

---
## 2026-05-18 — STREAM-A MERGED + §47 DONE; remaining roadmap (continuation)

Live-capture parity (Stream A) merged to main (`d00579a6`). §47
PurchaseOrder «Ожидание» backend exposure DONE+gated on main
(`9d049a3c`): biome 0/0 · api+web typecheck · **1398 tests green**.
B/C parallel work also merged (price-list.clone §39 fix, BOM extCode).

PARITY-AUDIT.md has full evidence: HEAD §41-43 (B/C: price-list/BOM/
Stream-C verify) + [STREAM A] §41-47 (Приёмка/Demand/CO/Invoice*/
returns/PO). Merge note explains the §-collision (append-only union,
nothing lost).

### REMAINING (precisely specified, unblocked on main):
1. **gtd/Страна migration — ✅ DONE (PARITY-AUDIT §64, Chat 1, 2026-05-18).**
   Migration `20260518085517_add_gtd_country_inbound_positions` +
   SupplyPosition & SalesReturnPosition cross-stack (schema.ts/service/
   findById/clone) + `/countries` reference API + `'country'` perm
   entity + ISO 3166-1 seed + PositionTable/PositionEditor opt-in
   customs columns. EnterPosition EXCLUDED (evidence: not live-captured,
   internal non-customs doc → rule #1). РНПТ/Маркировка excluded
   (separate marking feature). Gate: api 1406 + ui 92 green, tc 0/0.
1b. **Move landed-cost + «Накладные расходы» — ✅ DONE (PARITY-AUDIT
   §65, Chat 1, 2026-05-18).** §36's "blocked on FIFO arch decision +
   migration" was a double over-defer — schema:5658 documents the
   weighted-avg model + Move model already has overhead* cols (no
   migration). Fixed latent money bug (transfers zeroed cost) +
   capitalised overhead into destination landed cost (§34 pure-helper
   zero-sum). Gate: api 1410 green, tc 0/0, biome 0/0 (0 new vs
   baseline). §22 Move arm resolved. (B1 was Chat 1's scope.)
2. **Demand «Накладные расходы» — ✅ DONE (Chat 2 §73-74, merged
   `eb9592f7`).** OUTBOUND money-feature: overhead lowers «Прибыль»
   via costSumMinor; FIFO/Stock/per-position cost deliberately
   UNTOUCHED ("FIFO-basis EMAS"); idempotent (§34 pattern);
   adversarially tested; create/update/clone wired. Schema-freeze
   respected (model already had overhead* cols).
3. **facture-out/in generation (§28) — ✅ DONE.** Chat-3 §82-84
   single-source (Demand→FactureOut, Supply→FactureIn, idempotent,
   merged `0d542ed0`) + Chat-1 §66 closed the §84 schema-flag:
   migration `20260518111707` (FactureOutDemand/FactureInSupply join +
   paymentIn/purchaseReturn/paymentOut FKs + advanceVatRate) + multi-
   source/payment/return generate variants + adversarial tests.
   **FE-depth follow-on (honest, API-ready):** multi-select / payment
   / return picker UI is a thin documented next micro-step (backend
   complete+tested; Chat-3 single-source picker serves the common
   path) — NOT a hidden gap, NOT §12 half-expose.

4. **Производство header parity — ✅ DONE (Chat-1 round-2, §85).**
   §65 lesson re-applied: mfg is NOT 40% greenfield — 876-line
   processing.service w/ full FIFO/stock/zero-sum already exists.
   Bounded gap fixed: Production materialsStore/productionStart/End/
   reserve/project + Processing organizationAccount (migration +
   service + tests, api 1463). productionRows = existing
   processingOrders[] (no over-build). **Honest follow-ons:** Tier B
   (editable per-op materials/products vs deliberate BOM-snapshot v1 —
   §36-class evidence-flag) · Production create-form FE (form doesn't
   exist — separate FE unit; API ready).
5. **WorkOrder V2 cascade — ✅ VERIFIED-DONE + LOCKED (Chat-1 round-2,
   §86).** §65 lesson 3rd time: schema:6195 "V1 no cascade" was
   FALSE — work-order.service already implements the full CAS-guarded
   complete/cancel cascade (BOM consume scaled, emit, sufficiency,
   exact zero-sum). It had ZERO service tests → added
   work-order.service.test.ts (8 adversarial, all pass vs real
   service); corrected the stale comment. api 1471. Meta: 3× stale-
   doc pattern (§36/§85/§86) → future stale-comment sweep flagged.

6. **Processing Tier-B — ✅ §87 (4th §65 stale-doc fixed) + honest
   architecture boundary.** processing.service header falsely claimed
   v1/BOM.standardCost/no-snapshot; code actually does weighted-avg
   from Stock.costBalanceMinor + materialsSnapshot exact reversal
   (683-line test confirms). Comment corrected.
7. **Processing editable materials[] — ✅ §88 DELIVERED.** §87's
   editable-materials/products boundary: MATERIALS half built (the
   ~80% gap: substitutions/wastage/actual≠BOM). ProcessingMaterial
   model + migration (additive); Zod materials[]; post()
   resolveMaterialReqs (explicit ABSOLUTE qty else BOM-explode) — the
   proven weighted-avg/snapshot/exact-reversal/Serializable engine
   UNCHANGED (consume-source-agnostic). +4 adversarial tests all pass
   vs real service incl. BOM-path byte-identical regression lock.
   api 1475/106. §88-FE = API-ready thin follow-on.
8. **Processing products[]/multi-output — ✅ §89 DELIVERED; §87
   boundary FULLY CLOSED.** Pure qty-proportional largest-remainder
   cost-split helper (Σ-exact, N=1 byte-identical, fuzz-tested);
   ProcessingProduct model + migration (additive); snapshot keeps
   primary + adds canonical outputs[]; 3-tier reversal (new
   outputs[] / legacy single / BOM) — pre-§89 posted rows still
   reverse (existing test = back-compat lock). processingPlanId kept
   required (money-safety; non-blocker). +10 tests all pass vs real
   service. api 1485/107, tc 0/0, biome 0/0, zero regression.
   §87's editable-materials/products boundary = §88+§89 = FULLY
   built across 2 deliberate money-engine units.
9. **processingPlanId optional when both-explicit — ✅ §90.** Completes
   §88/§89: BOM no longer required when BOTH explicit materials[] &
   products[] given (fully self-described op). No schema/migration
   (model field was already nullable; Zod required→nullish + object
   refine). Conditional BOM-load + per-side guards; assertion-free
   (if/else narrowing — 4 transient biome warnings fixed properly,
   not suppressed). +8 tests all pass vs real service incl. **BOM-less
   exact zero-sum reversal**. api 1493/107, tc 0/0, biome 0/0, zero
   regression.

**CHAT-1 ROUND-2 COMPLETE (honest):** §85 (Производство header) + §86
(WorkOrder V2 verified+locked) + §87 (Processing cost/snapshot
verified+doc-fixed) + §88 (editable materials[]) + §89 (products[]/
multi-output) + §90 (plan-optional both-explicit) — all gated+committed
(`3d8e7611`/`88eaf8d4`/`b02ffca7`/`f58ae7de`/`ce7d8580`/this), api
**1493**, tc 0/0, zero regression. Производство-depth bounded audit
DONE; **§87's editable-materials/products large architecture boundary
FULLY BUILT + self-consistent** across §88+§89+§90 (deliberate money-
engine units, each adversarially verified vs the real service).
10. **Stale-comment sweep — ✅ §91 (audit-only, debt BOUNDED).**
   Scoped grep of high-signal stale-defer markers across ALL
   *.service.ts + schema.prisma; 7/7 sampled candidates verified
   ACCURATE (0 genuinely stale). The 4× pattern was **localized to
   the §85-87 modules already remediated** (+ §36→§65); the rest are
   accurate honest stubs / deliberate-simplification notes. Zero code
   edits (mass-editing accurate comments = fabrication + over-reach);
   deliverable = the evidence-based bounding + standing §65 discipline.
   The open "sweep needed" flag is CLOSED with proof.
11. **Processing explicit materials/products FE editor — ✅ §92.**
   processings/[id] (codebase convention: rich line-editing on [id];
   /new = BOM-default quick-create, zero-reg). Reuses @moysklad/ui
   PositionEditor mode="qty-only" (= moysklad Техоперация tables) ×2
   (materials override + multi-output products); BOM-default table
   kept read-only below (non-destructive). Payload sends explicit
   lists only when rows exist (no accidental BOM-drop). web tc 0,
   biome 0/0, FE-only. §88/§89 FE follow-on CLOSED.
12. **Production create-form FE — ✅ §93.** Form was genuinely absent
   (§85; list "create" button → 404). New productions/new/page.tsx
   cloned from §65-verified moves/new scaffold (positions stripped —
   Production is header-only per CreateProductionSchema). All §85
   fields (matStore/dates/reserve/project/customerOrder). web tc 0,
   biome 0/0, final api 1493 zero-reg. List create button now
   resolves. **No honestly-flagged Chat-1 item remains — all built.**
13. **Chat-1 round-3 — §94/§95 false-premise correction + §96/§96b
   genuine gap closed (§110).** §65 measure-first caught a
   compaction-summary regression (pattern #5): the summary's "§94 BOM
   FE absent" / "§95 work-orders FE absent" were FALSE — canonical
   `/production/boms/*` + `/production/work-orders/*` already exist,
   complete, nav-wired (PARITY-AUDIT line 304/1389 corroborates). A
   duplicate `/boms/*` I'd started on the false premise was UNTRACKED
   and deleted (zero git churn; no dup reaches main). **§96 GENUINE
   GAP CLOSED:** `/productions/[id]` was missing → list row-click +
   §93 create-redirect both 404'd; built detail/edit + FSM
   (post/unpost/cancel) + delete + child-PO table, mirroring proven
   processings/[id] (§92), grounded vs production.service. **§96b
   GENUINE GAP CLOSED:** «Производство» doc was nav-orphaned — wired
   subnav + landing card + uz/ru i18n. web tc 0, biome 0/0 on changed
   code, API untouched. layout.tsx PRE-EXISTING biome debt (proven on
   committed baseline) NOT bundled (§91 anti-over-reach) — flagged as
   a separate focused task. Committed `eecbbda7`.
14. **§97 measure-first mfg audit — Chat-1 mfg is NOT complete (§111,
   audit-only).** Honest verdict via measurement, not assertion:
   (a) processings/[id] §92 = complete, no gap. (b) **ProcessingProcess**
   (Техпроцесс, schema:2889, moysklad-ref 883L) = schema-only orphan,
   ZERO api/FE. (c) **ProcessingStage** (Этап +laborCost/markup,
   schema:2916, ref 524L) = schema-only orphan, ZERO api/FE.
   (d) **ProductionStageCompletion** (Выполнение этапа, ref 1765L —
   major moysklad document) = NOT EVEN MODELED. (e) **Production.reserve**
   = DEAD flag — persisted + shown as "Резервировать материалы"
   checkbox but `grep '\breserve\b' apps/api/src` ⇒ never consumed
   (UI implies stock reservation; reality = no-op; adversarial-QA
   finding). ⇒ **genuine round-4 exists** (~3170L moysklad spec for
   the stage subsystem + a cascade document + a real reservation).
   NOT faked as complete (rule #1 / no-MVP). Round-4 honest scope:
   (1) ProcessingProcess+Stage CRUD API+FE (mirror bom module);
   (2) reserve→real reservation on post (reuse reservedQty path);
   (3) ProductionStageCompletion model+migration+cascade+API+FE
   (largest; depends on 1). Each its own gated commit.
15. **Round-4 unit 1 — ProcessingProcess (Техпроцесс) + Stage CRUD
   API (§112).** Closes §111 (b)+(c). New
   `apps/api/src/modules/processing-process/` (schema+service+
   controller+module+test) mirroring the proven `bom` module 1:1:
   list/findById/create/update/archive/restore + replace-all
   setStages; `@Controller('processing-processes')`; permission
   entity `processingprocess` registered; module in app.module.
   laborCostMinor = tiyin-string→BigInt (money discipline). **24
   adversarial schema tests.** Gate: api tc 0 · **1573 test green**
   (1549+24, zero regression) · biome 0/0 new module · registration
   diffs minimal (+2/+1/+1). Honest V1 (documented, not faked):
   linear stage-children vs moysklad standalone-Этап+DAG (V2 defer);
   permissive `stages default([])` vs moysklad 1–100. NEXT: unit 1b
   = Техпроцесс FE (list+new+[id] mirror /production/boms/*) + nav +
   i18n; then unit 2 (reserve→real reservation), unit 3
   (ProductionStageCompletion). Committed (Ozodbek).
16. **Round-4 unit 1b — Техпроцесс FE (§113).** 3 pages under
   `/production/processes/` (list/new/[id]) mirroring
   /production/boms/* 1:1 (ListView + EditForm + stages inline
   editor: name/labour-cost/markup/default). Money discipline:
   laborCostMinor tiyin↔so'm round-trip (submit round(som*100),
   load tiyin/100). New `pages.processes` i18n (uz+ru) +
   process_card + subnav key. Reachable via /production landing
   card; **subnav-array line in layout.tsx DEFERRED** (layout.tsx
   has the §110-flagged in-flight biome cleanup — 102 uncommitted
   lines; mixing = dirty commit). Honest: landing-card-reachable
   now, subnav-strip entry a 1-line follow-up post-cleanup (i18n
   key already in place). Gate: web tc 0 · biome 0/0 (4 FE files) ·
   API untouched · layout.tsx NOT staged. Committed (Ozodbek).
17. **Round-4 unit 2a — shared stock-reservation primitive (§114).**
   Measure-first corrected the false "reuse existing reservedQty
   path" premise: reservation is UNIMPLEMENTED project-wide
   (Stock.reservedQty never written; CustomerOrder/PO/OnlineOrder
   all defer it). User chose: build the shared subsystem (no-MVP).
   2a = foundational primitive: additive migration
   `20260518192932_add_stock_reservation_ledger` (new
   stock_reservations table — CREATE+indexes+FK only, safest class),
   `StockReservation` ledger SEPARATE from StockOperation (soft-hold
   vs hard-move axis); `StockService.applyReservationDeltas` (mirrors
   applyDeltas, same lockBalances concurrency contract, over-reserve
   allowed = moysklad parity) + `releaseReservationByDoc` (exact
   idempotent net-reversal, can't go negative on double-release) +
   exact BigInt micro-unit aggregation (no float drift). +10
   adversarial tests. Gate: api tc 0 · 1583 test green (1573+10,
   zero-reg — additive, no caller yet) · biome 0/0. Committed
   (Ozodbek). NEXT: unit 2b wire Production.post/unpost/cancel →
   reserve/release (child PO BOMs in materialsStore, idempotent);
   2c integrate available=qty−reservedQty into Demand/Processing
   sufficiency (regression-controlled) + correct §111 false premise;
   then unit 3 (ProductionStageCompletion).
18. **Round-4 unit 2b — Production ↔ real reservation (§115).**
   `Production.reserve` no longer a dead flag. post/unpost/cancel
   refactored to atomic `$transaction` (state change + reservation
   commit together; logAudit/webhook stay post-commit). post:
   reserve child-PO BOM materials in materialsStore (lockBalances →
   applyReservationDeltas); unpost/cancel: lock + exact idempotent
   releaseReservationByDoc. No store / no child BOMs ⇒ post succeeds,
   nothing reserved (honest V1, documented). Material math extracted
   to pure `aggregateBomReservations` (runs=(PO.qty/1000)/BOM.outputQty
   ×comp.qty, Σ/product) — soft-hold estimate (6dp), release stays
   EXACT via ledger. +14 adversarial tests; **1 caught a naive test
   expectation → verified function correct, fixed test honestly**
   (CLAUDE.md adversarial-QA worked). Gate: api tc 0 · 1597 test
   green (1583+14, zero-reg) · biome 0/0. ProductionModule imports
   StockModule. Committed (Ozodbek).
   — §111 "reuse existing reservedQty path" false premise ALREADY
   corrected honestly in §114 audit + RESUME #17 (no separate action).
19. **Unit 2c — MEASURED, careful-design unit (NOT yet built; honest
   scope).** `StockService.assertAvailable` (raw `qty`, ignores
   reservedQty) is called by **8 services**: demand:710, loss:298,
   move:426, processing:535, purchase-return:490, retail-sale:450,
   work-order:418+503. A blanket `available = qty − reservedQty`
   change is cross-cutting (tests in processing/retail-sale.cas/
   stock/work-order + real flows). **CRITICAL correctness trap
   (measured, must solve before building):** a Production reserves
   its child-PO BOM materials (2b); those same materials are then
   CONSUMED by the child Processing.post — naive sufficiency would
   let the Production's OWN reservation block the very flow it was
   made for. Correct design needs release-on-consume (the
   'release_consume' reason is ALREADY defined in the 2a primitive —
   foresighted) wired into Processing.post, and/or own-doc-exempt
   sufficiency — NOT a blanket assertAvailable edit. moysklad
   reserve-vs-available-vs-consume semantics need deeper
   reference measure-first (_stock.md silent). Reservation subsystem
   is FUNCTIONAL + OBSERVABLE now (2a+2b: reserve/release exact,
   concurrency-safe, adversarially tested; dashboard/stock-balance
   reports already show available=qty−reservedQty). 2c = the
   enforcement-integration tightening: highest-regression, has the
   self-consumption trap → a dedicated careful-context unit, not a
   tail-of-session rush (CLAUDE.md: ishlaydi≠to'g'ri ishlaydi).
20. **Unit 3 measure-first — §97/§111 "ProductionStageCompletion NOT
   modeled" premise CORRECTED (§116, audit-only, 6th §65 this
   session).** Measured schema BEFORE modelling: the existing
   `Processing` (Техоперация) IS the project's stage-completion
   document — already has applicable/state FSM, quantity
   (=productionVolume), costSumMinor ("becomes FIFO cost of produced
   output"), materialsSnapshot (exact reversal), materials[]+
   products[], stores, processingOrder→Production link, and a FULL
   gated §85-93 stock/cost cascade in processing.service.post. Schema
   comment is explicit: "each ProcessingStage cascade emits a
   Processing record". Building a separate ProductionStageCompletion
   + 2nd cascade = duplicate the entire money-engine (§94 /boms-dup
   pattern, money-critical). PRECISE gap (grep=0):
   Processing lacks only `processingStageId` FK→§112 ProcessingStage
   + labour fields (labourUnitCost/standardHourUnit/standardHourCost/
   enableHourAccounting/performerId/defect) + wiring stage
   laborCostMinor/materialMarkup into costSumMinor. Corrected scope:
   EXTEND Processing (additive migration + cascade wiring), NOT a new
   entity — smaller/lower-risk, BUT mutates the §85-93 money-engine
   cost basis ⇒ adversarial-QA-mandatory, a dedicated careful unit
   (same honest call as 2c). Audit-only commit; no code (§91/§110
   premise-corrected precedent). NEXT careful units (both money/stock
   critical, need dedicated context): unit 3 = extend-Processing
   (stage-link + labour → cost cascade) · unit 2c = reservation
   enforcement (semantics decision + release-on-consume).
21. **Round-4 unit 3 (API) — DONE (§117).** Processing extended to
   moysklad «Выполнение этапа производства». 3a additive migration
   `20260518205304_processing_stage_completion_fields` (processingStageId
   FK + performerId + defect + enableHourAccounting + labourUnitCostMinor
   + standardHourUnit + standardHourCostMinor; ProcessingStage/Employee
   back-rels; safest class). 3b: zod Create/Update (defect immutable —
   .strict() rejects on Update), create/clone/update persist, findById
   includes stage.materialMarkup+performer; pure
   `computeStageEffectiveCost` (material + markup% + labour;
   labour = (hourAccounting? hourCost×hourUnit : labourUnitCost) ×
   volume) wired into post() — effectiveCostMinor → distributeOutputCost
   + costSumMinor + movedSumMinor; materials axis + snapshot UNCHANGED;
   exact reversal automatic (snapshot.outputs[].costMinor). Zero-reg
   PROVEN (12 untouched money-engine tests pass; no stage ⇒ byte-
   identical). Adversarial QA caught 2 real gaps (undefined-field
   crash → defensive `?? default`; decToMicro('NaN') throw → digit
   guard) — fixed as proper defensive money code. +12 helper tests.
   Gate: api tc 0 · 1609 test green (1597+12, zero-reg) · biome 0/0.
   Committed (Ozodbek).
22. **Round-4 unit 3c (FE) — DONE (§118).** processings/[id] extended:
   ProcessingDetail+FormState+formFromData+snapshot+save carry the
   §117 stage-completion fields; new DocumentMetaPanel block — stage/
   performer (read-only labels), hourAccounting+defect checkboxes
   (defect read-only/immutable), labour/hour-unit/hour-cost so'm
   inputs (so'm↔tiyin round-trip; labourUnitCost auto-disables under
   hourAccounting per §117 rule). defect NOT PATCHed (.strict()
   rejects). Honest V1-FE: stage/performer LINK read-only (settable
   via API, fully §117-tested; 2-level process→stage picker UI +
   employee picker = documented refinement — no flat stage endpoint).
   processings/new unchanged (fields default on create). Gate: web
   tc 0 · biome 0/0 · API untouched (additive FE). Committed
   (Ozodbek). **Round-4 unit 3 COMPLETE (API §117 + FE §118).**
23. **Round-4 unit 2c — reservation ENFORCEMENT + release-on-consume
   — DONE (§119).** assertAvailable now `avail = qty − reservedQty`
   (moysklad «Доступно»; zero-reg — reservedQty 0 in every pre-§115
   flow ⇒ byte-identical; 8 callers unaffected unless a real
   reservation exists). Self-consumption trap SOLVED: Processing.post
   resolves Production via processingOrder, releases
   min(consumed,reserved) per product (reason release_consume) before
   sufficiency, re-locks, then checks — Production's own flow never
   blocked by its own reservation; surplus stays held; other docs
   blocked. Pure computeConsumeReleases (exact micro-units) + 15
   adversarial tests. Adversarial QA caught a mock-completeness gap
   (existing movedSumMinor test lacked the 2 new tx queries) — fixed
   honestly (scenario = linked PO, no parent reservation ⇒ inert).
   Gate: api tc 0 · 1624 test green (1609+15, zero-reg) · biome 0/0.
   Committed (Ozodbek). **ROUND-4 RESERVATION SUBSYSTEM COMPLETE
   (§114 primitive + §115 Production + §119 enforcement) — end-to-end,
   moysklad-parity, exact, concurrency-safe, adversarially tested,
   zero-regression. CHAT-1 ROUND-4 COMPLETE: units 1/1b/2a/2b/2c/3.**
   Remaining = follow-up only: layout.tsx flagged biome cleanup
   (spawn-task) + 1-line subnav.production.processes array entry
   post-cleanup; CustomerOrder/PO/OnlineOrder reservation (their
   schema-documented V2, can adopt the §114 shared primitive).

Honest: §47 + A1 (§64) + B1 (§65) + Chat2 (§73-74) + Chat3 (§82-84) +
§66 + §85 + §86 + §87 ALL DONE+gated on main (api **1471**, tc 0/0,
zero regression). Round-2 streams: Chat-1=Производство **(§85/86/87
DONE)** + schema-owner + coordinator · Chat-2=POS/Розница (§100-119) ·
Chat-3=Маркировка/UZ-integrations/Dashboard/Facture-FE (§120-139) —
honest external-dependency flagging mandatory (gov API/cert/merchant
= adapter+mock+flag, NOT fabricated "done"). Remaining: macro domains
(Chat-2/3) + honestly-specced architecture units (editable materials/
products · Production-FE · stale-comment sweep). NO MVP cuts;
sequential, one gated unit at a time.

## Round-5 (honest, measure-first §120) — NOT yet done
Chat-1 round-4 COMPLETE (units 1/1b/2a/2b/2c/3; §112-119; gated green).
Round-5 genuinely exists: (1) `productiontask` Производственное задание
UNMODELED — WorkOrder is a §116-documented V1 simplification; full
parity = schema-owner decision (productionTask + production-stage-rows
graph vs current linear model); (2) ProcessingStage linear vs moysklad
standalone+DAG (§112 V1); (3) stage/performer FE pickers read-only
(§118 V1-FE); (4) defect no cost-branch (§117 V1); (5) CustomerOrder/
PO/OnlineOrder reservation = their deferred V2 (adopt §114 primitive);
(6) schema-owner/merge-coordinator standing role; (7) Phase-2
(real-data/concurrent/staging) module-wide. NOT "100% production-ready".

## Round-5 §121 — productiontask premise CORRECTED, one gap closed
§116 measure-first (7th): moysklad productiontask = the EXISTING
Production+ProcessingOrder+Processing decomposition (verified
field-by-field) — §120 "unmodeled/WorkOrder-V1" was imprecise; a new
ProductionTask would duplicate Production (§94/§116 trap). ONLY genuine
gap = Production.awaiting (Флаг ожидания) — CLOSED: additive
migration 20260519045846_production_awaiting + zod + service +
/productions new&[id] checkbox + schema test. Gate: api tc0 · web tc0
· 1625 test green (zero-reg) · biome 0/0. Committed (Ozodbek).
Honest: round-5 remaining = documented architectural divergences
(decomposed-vs-one-entity · §112 linear-vs-DAG · §118 FE pickers ·
§117 defect-cost · CustomerOrder/PO/OnlineOrder reservation V2), NOT
capability gaps. Производство core flow functionally at moysklad parity.

## Round-5 §122 — residual verdict, round-5 honestly CLOSED
Measure-first (8th) on every residual: defect = ALREADY parity
(moysklad spec = immutable flag only; §117 implements exactly that —
§117 "V1 limit" note was over-conservative, no code). §118 FE pickers
= honest documented V1-FE refinement (API+cost fully work/tested;
2-level picker into 900-line money page = quality risk to rush). §112
linear-vs-DAG = deliberate documented V2 (schema redesign, high blast
radius). CustomerOrder/PO/OnlineOrder reservation = those modules
own documented V2 (can adopt §114 primitive). NONE is hidden
incompleteness. Производство module functionally at moysklad parity
for the full core flow. NOT "100% production-ready" (Phase-2
module-wide, separate; schema-owner/merge-coordinator standing role).
Audit-only, committed (Ozodbek).

## §123 — §118 stage/performer pickers EDITABLE (processings/[id])
Read-only labels replaced with real controls: Техпроцесс CatalogPicker
-> dependent stage <select> (/processing-processes/:id) + Исполнитель
CatalogPicker (/employees). FormState+formFromData+save+PickerKey+2
CatalogPickers+stageOptions effect. defect stays read-only. API
unchanged (§117). Gate web tc0·biome0/0. Committed (Ozodbek). NEXT:
§118 part-2 processings/new parity · then §112 stage-graph.

## §124 — §118 FULL part-2 (processings/new create parity)
processings/new: Техпроцесс picker -> dependent stage select +
Исполнитель picker + defect/hourAccounting + labour so-m inputs;
payload wired (API §117 unchanged). §118 FULLY closed (parts 1+2).
Gate web tc0·biome0/0. Committed (Ozodbek). NEXT: §112 stage-graph
measure-first + build.

## §125 — §112 stage-graph closed additively
ProcessingStage +allPerformers +nextStageId self-rel (additive
migration) + §112 zod/service/test + FE allPerformers checkbox
(/production/processes new+[id]). measure-first: nextPositions is one
minimal moysklad field; position int already covers sequence. V1
single-successor (linear/chain) closed; multi-successor branching DAG
+ standalone-reusable-Этап-catalog = documented advanced divergence
(evidenced, not hidden). Gate api tc0·web tc0·1626 zero-reg·biome0/0.
Committed (Ozodbek). ROUND-5 fully closed (§121 awaiting · §123/§124
§118 pickers · §125 stage-graph) + §120/§122 honest verdicts.

## §126 — FULL stage-graph parity (NO V1/V2)
Data-preserving redesign: ProcessingStage now STANDALONE moysklad
catalog (new processing-stage module + /processing-stages flat
endpoint + permission entity); ProcessingProcess owns POSITIONS
referencing stages with a multi-successor nextPositions DAG
(ProcessingProcessPosition + ...Edge). Migration
20260519060819 hand-edited to backfill positions+edges from existing
stages BEFORE dropping process_id/position/default/next_stage_id —
ZERO data loss. §117 money-engine UNTOUCHED (Processing.processing
StageId still → standalone stage; cascade reads materialMarkup/
laborCostMinor, both kept; replace never deletes a completion-used
stage). +10 adversarial tests. Gate: api tc0 · 1636 test green
(1626+10 zero-reg) · biome0/0. Committed 19c7883f (Ozodbek).

## §127 — round-6c: FULL parity FE + contract finalised (NO V1/V2)
The V1/V2 doc block is DELETED; model is genuinely moysklad-faithful.
Schema: dropped the nextStageId hack → `processingStageId` (reuse
existing standalone Этап) | inline-create (superRefine one-of) +
`nextPositionIndexes` real multi-successor DAG + moysklad 1–100
enforced (positions required at creation). Service: createPositions
reuse-or-create + de-duped multi-successor edges; replacePositions
strictly money-safe (NEVER deletes a ProcessingStage — catalog
semantics; §117 cascade untouched). FE: processes/new+[id] rebuilt
as a position editor (pick existing Этап OR inline + nextPositions
chip DAG; [id] keyed by position.id so re-save reuses the Этап — no
churn); processes list `_count.stages`→`_count.positions` (round-6b
regression fixed); §118 processings new+[id] finalised on flat
/processing-stages (dead process state removed); /production/stages
catalog (list+new+[id]) + nav + production card + i18n uz+ru. Gate:
api tc0 · web tc0 · full api suite 117 files / **1640 tests green**
(zero-reg; schema.test 16→26) · biome 0/0 on all 17 round-6c files.
biome --write over-reach into 2 work-orders files caught+reverted
(separate task, not bundled). Committed (Ozodbek). Honest: impl +
automated gates COMPLETE; live-browser QA of the position-graph
editor is the explicit Phase-2 step (not yet performed). Chat-1
Производство scope (BOM/Техкарта · Техпроцесс · standalone Этап ·
ProcessingOrder · Processing/stage-completion §117 · Production/
Производственное задание · reservation §119) — implementation
COMPLETE, no V1/V2, no chala.

## §128 — Sprint 6 Money: 3 measured gaps closed (no rebuild)
Measure-first killed the stale "Money next" premise (12 money modules
already exist; ledger/CashIn-Out/CounterpartyBalance/CBU-cron DONE).
"BankAccount missing" was a FALSE gap (moysklad has none — org/
counterparty accounts ARE the faithful model). Built only the 3 real
gaps:
- A (a8ca375e) Currency entity CRUD + /settings/currencies FE + perm
  + i18n — model was specced with zero API/FE; moysklad rules
  enforced; rate=rateValue×1e8 integer string math.
- B (808c797d) OrganizationAccount +bankLocation +correspondentAccount
  (data-preserving migration; NOT a new entity).
- C (b2e826bf) exact BigInt currency-convert + Decimal cbu→rateValue
  + AUTO-currency repricing wired into the CBU sync().
- D (5a1b35fb) camt.053 ISO-20022 parser (same ParsedRow[] as CSV) +
  TxsSummry/OPBD-CLBD reconciliation; upload() auto-detects.
Adversarial QA caught+fixed real bugs (camt.053 lenient-XML accept;
OPBD/CLBD gross-vs-net; convert test-scale). Real-DB HTTP smoke 11/11
Currency invariants. Gate: api tc0·web tc0·**121 files/1682 tests
green** (zero-reg; +42 money tests)·biome 0/0 new files. Pre-existing
debt (csv-parser/bank-import/settings-sidebar non-null) flagged as
separate scoped tasks, not bundled. Honest: impl+automated+real-DB
money QA COMPLETE; /settings/currencies live-browser QA + 6.5
cash-flow multi-currency consolidation are the explicit deferred
follow-ups (convert helper now exists to enable the latter).
