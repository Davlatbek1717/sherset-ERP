# Master Plan — 100% 1:1 moysklad.uz Clone

**Yaratilgan**: 2026-04-29
**Oxirgi yangilanish**: 2026-04-30 (Sprint 17.1-17.7 + Sprint 18 8/200 yakunlandi)
**Maqsad**: 100% sof 1:1 parity, hech qanday "v1/v2" emas, hech qanday "demo/stub" emas — barcha integratsiyalar real ishlasin.
**Solo dev**: Ozodbek (Windows + native install + PG 17 + no Docker)
**Estimate**: 28-36 oy (real integratsiyalar credentials/sandbox sotib olinishi/olinishiga bog'liq)

## Joriy progress

**Sprint 17 — Foundation fixes (yakunlandi 2026-04-30)**:
- ✅ 17.1 Webhook persistent queue (commit `2fc0f70`) — 5-attempt backoff,
  WebhookDelivery model, batch payloads, DLQ, Stock-specific subscription module.
- ✅ 17.2 FIFO cost consumption on Demand.post (commit `c9817da`) — exact COGS
  via DemandPositionCostConsumption ledger, SELECT FOR UPDATE locks.
- ✅ 17.3 RBAC endpoint enforcement (commit `4af6a2a`) — 299 endpoints decorated
  via auto-script across 42 controllers.
- ✅ 17.4 Email retry queue + DLQ (commit `bfce8be`) — async send via cron,
  4-attempt backoff, /settings/email/log admin UI.
- ✅ 17.5 InvoiceOut sent transition + Overdue cron (commit `f26dc96`).
- ✅ 17.6 Audit Log admin viewer + i18n (commit `9ffd14f`) — Sprint 11.8 backend
  verified, settings card translations confirmed.
- ✅ 17.7 Store advanced settings (commit `9ffd14f`) — externalCode, addressFull,
  AttributeMetadata wiring.

**Sprint 18 — Reports library** (8/200+ yakunlandi):
- ✅ 18a (commit `891fb79` ish davomi → `_4af6a2a`-line) — ABC analysis +
  Receivables/payables Aging + Returns ratio.
- ✅ 18b (commit `c76a5a5`) — Slow Movers (dead-stock detection).
- ✅ 18c (commit `04ada63`) — Sales by Channel + Inventory Variance.
- ✅ 18d (commit just now) — Sales by Hour + Average Basket.

**Test holat**: 803 API test yashil (avval 677 + 126 yangi). Typecheck 0 xato.

---

## 0. Hozirgi holat (2026-04-29 oxirida)

### Bajarilgan (~60% UI parity, ~30% deep functionality)

| Sprint | Mavzu | Status |
|---|---|---|
| 1 | Product CRUD | ✅ |
| 1.5 | Design System tokens | ✅ |
| 2.1 | JWT Auth | ✅ |
| 2.2 | ProductFolder | ✅ |
| 2.3 | Counterparty + STIR | ✅ |
| 2.4 | CatalogPicker pattern | ✅ |
| 2.5 | RBAC infra (decorator yo'q) | ⚠️ partial |
| 3.1 | CustomerOrder FSM | ✅ |
| 3.2 | Demand + Stock ledger | ✅ |
| 3.3 | InvoiceOut FSM | ✅ |
| 3.4a | Supply (FIFO remainingQty) | ✅ |
| 3.4b | PaymentIn polymorphic | ✅ |
| 3.4c | **FIFO cost on Demand.post** | ❌ deferred |
| 4.1-3 | Purchase E2E (PO, InvoiceIn, PaymentOut) | ✅ |
| 4.3.5 | i18n (uz/ru) | ✅ |
| 5.1-5 | Returns + Warehouse (SR, PR, Move, Loss, Enter, Inv) | ✅ |
| 5.4 | Detail+new pages 12 docs | ✅ |
| 5.5a-d | Bulk · History · Columns · CSV | ✅ |
| 6.1-3 | Money (OrgAccount, CashDesk, CashIn/Out, CPB, Bank import) | ✅ |
| 7.1-5 | Catalog (PriceType, Services, Variants, Bundles, Images) | ✅ |
| 8.1-3 | CRM (Contacts, Calls, Pipelines+Kanban) | ✅ |
| 9.1-3 | Print + Email + Attachments | ⚠️ Email no retry |
| 10.1-5 | 5 reports | ⚠️ 5/200+ |
| 11 | Settings UI (4 admin CRUD) | ⚠️ partial |
| 15A | FilterDrawer | ✅ |
| 15B | Money editable detail | ✅ |
| 16 | Custom Attributes (foundation+wiring) | ✅ |
| 17 | **Webhook (in-memory!)** | ❌ rework needed |

### Statistika
- 53 backend module · 694 API test · ~75 web sahifa · 16/36 FSM doc · 5/200+ report

---

## 1. moysklad-native fixes (must — Sprint 17.1 → 17.7)

Bu sprintlar **mavjud kodning yetishmovchiliklarini tuzatish**. Hech biri yangi domain emas — **moysklad'da bor lekin bizda yetishmayotgan** logika.

### Sprint 17.1 — Webhook to'liq sof persistent queue
**Muammo**: Hozir in-memory retry, process restart bo'lsa yo'qoladi.
**Yetkazish**:
- `WebhookDelivery` Prisma model + migration (status, attempt, nextRetryAt, httpStatus, responseBody)
- moysklad backoff: **5 attempt 1m → 5m → 30m → 1h → 6h**
- NestJS `@Cron('*/30 * * * * *')` worker — pending'larni POST qiladi
- **Batch payload**: events[] up to 100 per delivery (moysklad spec)
- Dead Letter Queue — 5 fail bo'lgan delivery alohida
- Admin UI: `/settings/webhooks/:id/deliveries` — har webhook tarixi
- **WebhookStock** ham qo'shiladi (Prisma model bor, module yo'q) — stock-specific webhook

### Sprint 17.2 — FIFO cost consumption (Demand.post)
**Muammo**: `costDeltaMinor: null // FIFO deferred` — Demand'ning haqiqiy cost'i hisoblanmaydi → P&L hisoboti noto'g'ri.
**Yetkazish**:
- `SupplyPosition.remainingQty` dekrement (FIFO order: oldest supply birinchi)
- `DemandPosition.costMinor` to'ldirish (consumed supply'lar narxidan)
- Reverse on unpost — FIFO consumption guard (consume bo'lgan supply'lar reverse qilib bo'lmaydi)
- Test: 3 ta supply (har xil narxda) + 1 ta demand → cost FIFO bo'yicha hisoblanadi

### Sprint 17.3 — RBAC endpoint enforcement
**Muammo**: `@RequireScope('action@entity')` decorator yozilgan, lekin har endpoint'da yo'q.
**Yetkazish**:
- 53 module × ~5 endpoint = ~265 endpoint'ga decorator qo'yish
- `view@product`, `create@customerorder`, `transition@invoice-out` ko'rinishida
- Test: ReadOnly user → POST /customer-orders → 403 Forbidden

### Sprint 17.4 — Email retry queue + DLQ
**Muammo**: Email send 1 attempt — fail bo'lsa yo'qoladi.
**Yetkazish**:
- `EmailDelivery` queue jadval (status, attempt, nextRetryAt)
- Worker (NestJS @Cron) pending email'larni qayta yuboradi
- Backoff: 1m → 5m → 15m → 1h
- Admin UI: `/settings/email/log` — failed/sent log
- DLQ — 4 fail bo'lganlar alohida

### Sprint 17.5 — InvoiceOut "sent" transition + Overdue cron
**Yetkazish**:
- InvoiceOut FSM: `posted → sent` (manual yoki email-orqali avtomat)
- Overdue cron (har 1 soatda) — `InvoiceOut.dueDate < now() AND state IN ('sent','partially_paid') → state = 'overdue'`
- Notification yuborish (email + in-app)

### Sprint 17.6 — Audit Log admin viewer
**Mavjud**: HistoryTimeline (per-doc).
**Kerak**: Global `/audit-log` admin sahifa.
**Yetkazish**:
- Filter: foydalanuvchi, entity tipi, action, sana
- TX_id grouping — bir transaction'ning barcha audit yozuvlari birga
- Search: entityId, fieldChanges
- Export CSV

### Sprint 17.7 — Store advanced settings
**Mavjud**: Sprint 11 — Store CRUD.
**Kerak**: moysklad'ning to'liq Store sozlamalari.
**Yetkazish**:
- `allowNegativeStock` toggle (mavjud, lekin UI'da yo'q)
- Default settings (organization, project, contract)
- Allowed shifts (qaysi vaqtda dukon ochiq)
- Integration settings per store
- Stock transfer rules

---

## 2. moysklad-native yangi modullar (Sprint 18-25)

### Sprint 18 — Reports library full (200+)
moysklad'da 200+ hisobot bor. Hozir 5 ta. Quyidagi 30+ kategoriyalar:

**Sotuv hisobotlari**: Sotuvlar period · Manager bo'yicha · Kanal bo'yicha · Dukon bo'yicha · Tovar guruhi bo'yicha · ABC tahlili · Mijoz bo'yicha · Region bo'yicha · Soat bo'yicha · Promo akciya · Buyurtma vs sotuv

**Xarid hisobotlari**: Xaridlar period · Ta'minlovchi bo'yicha · Tovar guruhi · Negotsiator · Yetib kelish vaqti · Brak

**Pul hisobotlari**: Cash flow · P&L (full income statement) · Balance sheet · Aging · Forecast · Multi-currency · Per-account

**Ombor hisobotlari**: Stok qoldiqlar · Movement · Loss/Enter ratio · Inventory variance · Slow movers · ABC stok · Eski mahsulotlar (batch expiry)

**CRM hisobotlari**: Voronka konversiyasi · Lead source · Activity · NPS · Customer lifetime value

**Production hisobotlari**: Plan vs fakt · Brak ratio · Stage time · Resource utilization

**Retail hisobotlari**: Smena · Kassir · Chek · Avg basket · Refund ratio

**Finansoviy hisobotlar**: Currency exposure · Receivable aging · Payable aging

Har biri ~3-5 kun ishlash. **Jami 60-80 sprint kuni** = 3-4 oy.

### Sprint 19 — Production module
- ProductionOrder (Производственный заказ) full FSM
- ProcessingPlan (Тех карта) — multi-stage
- ProcessingStage (Этап производства)
- WorkOrder (Наряд) bilan ulash
- BOM (Bill of Materials)
- Production task scheduling
- Material requirements planning (MRP)

### Sprint 20 — Service Desk (Заявки)
moysklad'da ServiceDesk (request tracking) bor:
- Заявка (Request) entity
- Status FSM: new → in_progress → resolved → closed
- Assigned to · SLA · Priority
- Customer-facing portal
- Email notifications

### Sprint 21 — Print template editor (WYSIWYG)
Hozir hardcoded shablonlar.
- Visual editor (drag-drop blocks)
- Variable picker ({{order.number}}, {{customer.name}}, ...)
- Conditional blocks (`{{#if vat}} ... {{/if}}`)
- Table positions (auto-iterate)
- Export to PDF (Puppeteer)
- Per-doc-type templates (CO, Demand, InvoiceOut, ...)

### Sprint 22 — Help drawer + tooltips + shortcuts
- Right-side help drawer (har sahifaga kontekstli yordam)
- Search help articles
- Tooltips on every field (hover → tushuntirish)
- Keyboard shortcuts (Cmd+K palette, Cmd+/ help, Cmd+S save, ...)
- Onboarding tour (1-marta)

### Sprint 23 — Onboarding wizard
Birinchi marta kirgan foydalanuvchi uchun:
- Step 1: Organization yaratish
- Step 2: Currency tanlash
- Step 3: Store yaratish
- Step 4: Birinchi mahsulot qo'shish
- Step 5: Birinchi kontragent
- Step 6: Birinchi sotuv
- Skip option

### Sprint 24 — Loyalty + Tasks + Notifications
**Loyalty Program**:
- BonusProgram entity (qoidalar)
- BonusTransaction (har sotuvda hisoblash)
- Customer balance
- Redemption at POS

**Tasks** (full):
- Task assignment (xodimga)
- Deadline + reminder
- Subtasks
- Calendar view
- Per-doc task linking

**Notifications** (in-app):
- Real-time websocket
- Notification center (drawer)
- Email digest (daily/weekly)
- Scheduled alerts (low stock, overdue invoice, ...)

### Sprint 25 — moysklad-compat router (76 slug)
Hozir 8/76 implementation.
moysklad clientlar (1C, partner integratsiyalar) `https://api.moysklad.ru/api/remap/1.2/...` formatda chaqirishadi.
Bizning `/api/remap/1.2/...` ham huddi shu shaklda javob berishi kerak.

---

## 3. Real external integratsiyalar (Sprint 26-33)

**Muhim**: Har biri uchun **real test/sandbox credentials** kerak. Foydalanuvchi (Ozodbek) credentials taqdim qilishi kerak.

### Sprint 26 — Simple integrations (CBRU + MXIK + Eskiz SMS)
- **CBRU**: Markaziy Bank kursi — public API, credentials kerak emas
  - `GET https://cbu.uz/oz/arkhiv-kursov-valyut/json/`
  - Daily cron — `ExchangeRate` jadvalini yangilash
- **MXIK katalog**: Soliq.uz public catalog
  - REST API — sync har kuni
  - Soliq.uz portal'dan API key olish kerak (ozod kirish)
- **Eskiz SMS**: UZ SMS provider
  - REST API + token auth
  - Eskiz portal'da test akkaunt + token (~$5/oy test)
  - **Credentials kerak**: Eskiz API token

### Sprint 27 — Soliq.uz EDO (E-Hujjat / E-Faktura)
- EDO SOAP/REST protokoli (Soliq.uz didox.uz orqali)
- ECP (Elektron Raqamli Imzo) — qonuniy talab
- EHF format (XML) — har faktura uchun
- Status tracking: draft → signed → sent → received → confirmed
- **Credentials kerak**: Soliq.uz portal akkaunt + ECP fayli

### Sprint 28 — ASL Belgisi (markirovka)
UZ markirovka — har tovar uchun unique GS1 kod.
- API: `https://aslbelgisi.uz/api/v1/...`
- Use cases: import qilingan tovar markirovkasini olish, sotuvda kod skanerlash
- Tax tovar tipi (alkohol, sigareta, dori) majburiy
- **Credentials kerak**: ASL Belgisi merchant akkaunt

### Sprint 29 — Payme + Click payment gateways
**Payme**:
- Merchant API (paycom protocol)
- Test merchant ID + key
- Subscription / one-time payment
- Webhook qaytishi (callback)
- Refund
- **Credentials kerak**: Payme test merchant

**Click**:
- Same: merchant API + test creds
- **Credentials kerak**: Click test merchant

### Sprint 30 — Bank statement integratsiyalari
**Plan**:
- camt.053 ISO 20022 standard parsing (mavjud — bank-import sprint)
- UZ banklar har xil format yuboradi (har biri uchun adapter):
  - **NBU** (NBU.uz API)
  - **Asaka** (asakabank.uz)
  - **Anor**
  - **Kapital**
  - **TBC**
  - **Trustbank**
  - **Hamkorbank**
- Har biri uchun: `BankAdapter` interfeysi · auth · daily fetch · transaction parsing · payment matching
- **Credentials kerak**: har bank uchun korporativ akkaunt + API key (har biri ~ 6-12 oylik test)

### Sprint 31 — 1C sync
1C — Russia/UZ ko'p ishlatadigan accounting software.
- 1C XML protocol (CommerceML 2.x format)
- Two-way sync: 1C → moysklad clone (mahsulot, kontragent) · clone → 1C (sotuv, faktura)
- Conflict resolution
- Manual + scheduled sync
- **Credentials/Tools kerak**: 1C 8.3 demo licence + COM/web API

### Sprint 32 — Marketplaces (Uzum/Yandex/WB/Ozon)
**Uzum Market** (UZ asosiy marketplace):
- API token
- Catalog upload/sync
- Order pull
- Stock push (real-time)
- Status updates

**Yandex Market UZ**, **Wildberries**, **Ozon** — har biri uchun adapter.

**Credentials kerak**: har marketplace seller akkaunt

### Sprint 33 — Telegram bot
- Telegram Bot API (BotFather'da bot yaratish — bepul)
- Use cases:
  - Yangi buyurtma haqida xabar
  - Customer support chat
  - Stock alert
  - Daily digest
- Webhook → bizning API
- **Credentials kerak**: Telegram bot token (BotFather'dan bepul)

---

## 4. Marketing + SEO (Sprint 34)
- Separate Next.js 15 SSG app (`apps/marketing`)
- Static pages: home, features, pricing, blog
- moysklad.uz dizayni piksel-level
- SEO: sitemap, OG, structured data
- 23+ sanoat landing pages (apteka, restaurant, retail, ...)

---

## 5. Phase 2 — Adversarial QA (1 oy)
- **Concurrency**: 100 parallel user simulating
- **Real data**: 50K mahsulot, 100K kontragent, 1M tranzaksiya
- **Edge cases**: null/empty/unicode/overflow har inputda
- **Auth boundaries**: cross-tenant data leak testi
- **Race conditions**: stock posting + payment + transition parallel
- **Migration safety**: PG load + rollback testi
- **Load testing**: k6 stress testing — RPS limit topish
- **Security audit**: OWASP Top 10 (injection, XSS, CSRF, broken auth, ...)
- **Data integrity**: BigInt money + Decimal qty + Float drift testi
- **Backup + DR**: PG backup → restore drill

## 6. Phase 3 — Staging (2 hafta)
- Production-like server (VPS + PG + Nginx + PM2)
- Real DNS + SSL
- Monitoring (Pino → Loki → Grafana)
- Error tracking (Sentry)
- Real beta company (1-2)
- 2 hafta soak

## 7. Phase 4 — Gradual rollout (1-2 oy)
- 5 → 10 → 20 beta kompaniya
- Feature flags
- Progressive rollout
- Bug fixing rituallari
- Documentation polish

---

## Priority qarori

### Eng birinchi (must-fix bugs)
1. Sprint 17.1 — Webhook persistent queue (hozirgi noto'g'ri)
2. Sprint 17.2 — FIFO cost (P&L noto'g'ri ishlayapti)
3. Sprint 17.3 — RBAC enforcement (security hole)

### O'rtacha (function gap)
4. Sprint 17.4-7 (Email retry, sent transition, audit viewer, store advanced)
5. Sprint 18 (Reports — eng katta domain)
6. Sprint 19 (Production)
7. Sprint 20-25 (qolgan moysklad-native)

### Real integratsiyalar (credentials kerak)
8. Sprint 26 (CBRU + MXIK + Eskiz — kichik, simple)
9. Sprint 27-32 (katta integratsiyalar — har biri 2-4 hafta)

### Final
10. Sprint 33-34 (Telegram + Marketing site)
11. Phase 2-4 (QA + Staging + Rollout)

---

## Time estimate (solo, 8 soat/kun)

| Bo'lim | Sprint kuni |
|---|---|
| Sprint 17.1-7 (must-fix) | 30-45 kun |
| Sprint 18 (Reports 200+) | 60-80 kun |
| Sprint 19-25 (moysklad-native) | 100-120 kun |
| Sprint 26-32 (real integratsiya) | 80-120 kun + credentials wait |
| Sprint 33-34 | 15-20 kun |
| Phase 2-4 (QA + rollout) | 60-90 kun |
| **JAMI** | **~350-475 kun = 18-24 oy aktiv ish** |

Real-time (haftada 5 kun ish + integration credential wait + bayramlar) = **~28-36 oy**.

---

## Hozirgi keyingi qadam

**Sprint 17.1** — Webhook persistent queue. Hozir boshlayman.

---

## Appendix — Credentials / sandboxes (sprint tartibi bo'yicha)

> Bu ro'yxat eng oxirida — har **real integratsiya sprint** boshlanishidan oldin
> mos credentials tayyor bo'lishi kerak. Sprint kelganda navbat bo'yicha tayyorlanadi,
> hammasini bir vaqtda tayyorlashga shoshilish kerak emas.

### Sprint 26 — CBRU + MXIK + Eskiz SMS
- ✅ **CBRU API** — public, hech narsa kerak emas
- ✅ **MXIK katalog** — soliq.uz portal'da bepul ro'yxat (yuridik shaxs sifatida)
- ⏳ **Eskiz SMS** — test akkaunt (~$5/oy test rejim) · API token

### Sprint 27 — Soliq.uz EDO
- ⏳ **Soliq.uz portal akkaunt** (yuridik shaxs)
- ⏳ **ECP fayl** (Elektron Raqamli Imzo — qonuniy talab)
- ⏳ Didox.uz yoki E-DOCS akkaunt (alternativa)

### Sprint 28 — ASL Belgisi (markirovka)
- ⏳ **ASL Belgisi merchant akkaunt** (aslbelgisi.uz portal)
- ⏳ ECP (Soliq bilan bir xil)

### Sprint 29 — Payme + Click
- ⏳ **Payme test merchant** (paycom.uz orqali)
- ⏳ **Click test merchant** (click.uz orqali)
- ⏳ **Uzcard / Humo sandbox** (alohida ariza)

### Sprint 30 — Bank statement integratsiyalari
- ⏳ **NBU** korporativ akkaunt + API key
- ⏳ **Asaka** korporativ akkaunt
- ⏳ **Anor / Kapital / TBC / Trustbank / Hamkorbank** — har biri uchun
- ⏳ Har biri ~6-12 oylik test rejimi (banklar uzoq response qilishadi)

### Sprint 31 — 1C sync
- ⏳ **1C 8.3 demo licence** (~$100/oy yoki RU bepul demo akkaunt)
- ⏳ COM/web API tools

### Sprint 32 — Marketplaces
- ⏳ **Uzum Market seller akkaunt** (uzum.uz)
- ⏳ **Yandex Market UZ seller akkaunt**
- ⏳ **Wildberries seller akkaunt**
- ⏳ **Ozon seller akkaunt**

### Sprint 33 — Telegram bot
- ✅ **BotFather'dan bepul bot token** (5 daqiqalik ish)

### Bepul (hozirdan tayyor)
- ✅ CBRU API · ✅ MXIK ozod ro'yxat · ✅ Telegram bot

### Bepul lekin ro'yxat kerak
- ⏳ Eskiz SMS · ⏳ Soliq.uz EDO · ⏳ ASL Belgisi

### Pullik akkaunt kerak
- ⏳ Payme · ⏳ Click · ⏳ Uzcard / Humo
- ⏳ NBU/Asaka/Anor/Kapital/TBC/Trustbank/Hamkorbank
- ⏳ 1C licence
- ⏳ Marketplace seller akkauntlari

> **Strategiya**: Credentials kerakli sprint **boshlanishidan 2-4 hafta oldin**
> tayyorlash. Sprint 26 boshlangunga qadar (~10-12 oydan keyin) hech qanday
> credentials kerak emas — moysklad-native fix'lar va yangi modullar bilan
> band bo'lamiz.

