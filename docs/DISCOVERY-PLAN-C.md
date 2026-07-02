# Discovery Plan C — 2 oylik to'liq capture

**Maqsad:** Moysklad.uz'ning **99% 1:1** fidelity klonini qurish uchun barcha kerakli ma'lumotni **kod yozishdan oldin** yig'ish. Har modul qurilganda yonida to'liq reference turishi kerak.

**Muddatlar:** 8 hafta (40 ish kuni, kuniga 6-8 soat)

**Boshlanish sanasi:** 2026-04-18

**Tugash sanasi:** 2026-06-13 (Sprint 1 boshlanadi)

---

## Nima uchun 2 oy ajratyapmiz

Har bir Sprint'da "yetishmayotgan ma'lumot" muammosi bo'lishining oldini olish uchun. Kod yozayotganda:
- ❌ "Bu tugma qaysi modalni ochadi?"
- ❌ "Bu FSM qanday tranzitsiya qiladi?"
- ❌ "Payme webhook nima qaytaradi?"
- ❌ "Админ rollarga qanday ruxsat berish kerak?"

Bu savollarning har biri — Sprint'ni to'xtatadi, noto'g'ri kod yoziladi, keyin refactor qilinadi. **Aks holda barchasini oldindan yig'sak, kod yozish silliq boradi.**

---

## 6 ta workstream

### W1 · Deep UI Capture (2 hafta — 1-14 kun)

**Har 72 ta app sahifasi uchun** — ~30 turli holat:

| Holat | Qanday triggers qilinadi |
|---|---|
| Default (empty) | Sahifa ochiladi |
| Filter panel opened | "Фильтр" tugmasi bosish |
| Filter with 5 fields filled | Har filter dropdown'ni ochib qiymat tanlash |
| Create form opened | "+ Заказ" / "+ Товар" / ... |
| Each toolbar dropdown | Изменить / Статус / Создать документ / Печать / Отправить dropdownlari |
| Each child tab | Позиции / Связанные / Файлы / Задачи / События |
| Catalog picker modal | "Добавить из справочника" |
| Quick-create modal | (+) har field'da |
| Inline edit overlay | (✎) har field'da |
| Column settings panel | settings icon |
| Save confirmation | Dirty state bilan "Закрыть" |
| User avatar dropdown | Avatar bosish |
| Top-right icons | Chat / Bell / Help bosish |
| Hover tooltips | Har (?) icon ustiga |
| Error states | Sahifa URL'ini buzish, 404/500 olish |
| Permission-denied | Free tariff'da cheklangan feature |
| Empty vs filled data | Avval bo'sh, keyin 1 qator yaratib qayta capture |
| Pagination | 2-sahifa, 3-sahifa |
| Sort changed | Har ustunni klikka |
| Responsive mobile | Viewport 375px |
| Responsive tablet | 768px |

**Avtomat skript:** `tools/capture/src/scrape-app-deep.ts`

Har sahifa uchun avtomat:
1. Navigate
2. Default screenshot
3. Har toolbar elementni programmatic bosish → screenshot + DOM + popover items
4. Har modal ochish → screenshot + to'liq form DOM
5. Har child tab bosish → content DOM
6. Viewport kichik qilib → mobile screenshots

**Deliverable:** `docs/moysklad-reference/visual-captures/<module>/<page>/` — har page folder'ida **25-30 fayl**

**Jami:** 72 sahifa × 30 holat = **~2160 screenshot + DOM + JSON**

---

### W2 · Admin/Settings Capture (1 hafta — 15-21 kun)

Moysklad admin alohida maydon — katta va chuqur.

**Qo'lga olinadigan ~150 sahifa:**

| Guruh | Sub-sahifa soni | Tarkib |
|---|---|---|
| Пользователи | 5 | CRUD, invite, 2FA setup, sessions |
| Роли | 10 | Default rollar + permission matrix (265 toggle per role) |
| Юрлица | 5 | Multi-org, bank details, requisites |
| Склады | 5 | Warehouse config, zones |
| Кассы и банк. счета | 8 | Cash desks, bank accounts, currencies |
| Валюты | 3 | Currency list + rate sources |
| Статусы документов | 36 | Har hujjat turi uchun custom status FSM |
| Шаблоны номеров | 36 | Numbering format per doc type |
| Шаблоны печатных форм | 20 | PDF templates + WYSIWYG editor |
| Шаблоны писем | 10 | Email templates |
| Шаблоны SMS | 5 | SMS templates |
| Webhooks | 3 | Subscription CRUD |
| API tokens | 2 | Token management |
| Приложения | 127 | Har integratsiyaning settings sahifasi |
| Тариф и оплата | 5 | Subscription + billing |
| Каналы продаж | 3 | Sales channels |
| Скидки | 8 | Discount rules engine |
| Бонусные программы | 5 | Loyalty programs |
| Типы цен | 3 | Price types |
| Пользовательские справочники | 5 | Custom dictionaries |
| Оборудование | 8 | Fiscal printer, scanner, scale setup |
| Точки продаж | 5 | POS points |
| Импорт/Экспорт | 10 | Import mapping configs |
| Корзина | 3 | Trash + restore |
| Бекапы | 2 | Backup schedule |
| Локализация | 3 | Format settings |

**Deliverable:** `docs/moysklad-reference/admin/` — ~150 sahifa har biri o'z papkasida

**Skript:** `scrape-app-deep.ts` + admin-specific routes list

---

### W3 · Missing 7 schemas + FSM kickoff (1 hafta — 22-28 kun)

**Part A: Missing schemas (2-3 kun)**

Qo'lda to'ldirish:
1. `purchase` (PurchaseOrder) — UI captures + similar doc (supply.json) dan derive
2. `customer` (CustomerOrder) — demand.json'dan derive
3. `internal` (InternalOrder) — move.json dan derive
4. `production` (ProductionOrder) — processingorder.json dan derive
5. `productfolder` — product.json'dagi ref'dan infer
6. `role` — moysklad support maqolalaridan
7. `markingcodeorder` — emissionorder.json dan

Strategy:
- Moysklad'da har hujjat turining bitta namunasini **qo'lda yaratish**
- API'dan `GET /entity/<slug>/metadata` javobini olish (bizda auth bor)
- JSON'ni schema formatiga o'tkazish

**Deliverable:** 7 ta to'liq `*.json` fayl

**Part B: FSM kickoff (4-5 kun)**

Birinchi **3 ta asosiy hujjat** uchun FSM yozish (namuna sifatida):
- PurchaseOrder
- CustomerOrder
- Demand (shipment)

Har biri uchun strukturaviy JSON:
```jsonc
{
  "document": "PurchaseOrder",
  "states": [
    { "id": "draft", "label": "Черновик", "color": "gray", "default": true },
    { "id": "confirmed", "label": "Подтверждён", "color": "blue" },
    { "id": "partially_received", "label": "Частично получен", "color": "orange" },
    { "id": "fully_received", "label": "Получен", "color": "green" },
    { "id": "cancelled", "label": "Отменён", "color": "red" }
  ],
  "transitions": [
    {
      "from": "draft", "to": "confirmed",
      "trigger": { "type": "button", "label": "Провести" },
      "preconditions": [
        "agent is set",
        "positions.length > 0",
        "organization is set"
      ],
      "sideEffects": [
        "Set applicable=true",
        "Reserve positions in stock",
        "Emit audit event",
        "Notify owner"
      ],
      "permissions": ["owner", "role:manager", "role:admin"],
      "reversible": true
    },
    ...
  ]
}
```

**Deliverable:** `docs/moysklad-reference/workflows/<document>.json`

---

### W4 · FSM to'liq (1 hafta — 29-35 kun)

**33 qolgan hujjat uchun FSM** (W3'da 3 ta tayyorlangan).

Manba:
- `support.moysklad.ru/hc/ru/` — har hujjat uchun maqolalar
- Moysklad'ni jonli sinash (har status'ni o'zimiz o'zgartirib ko'rish)
- API javobi (status endpoint'lar)

Tempi: **~5 hujjat/kun** × 5 kun × 2 agent = 50+ hujjat (overshoot)

**Deliverable:** `docs/moysklad-reference/workflows/*.json` — 36 ta fayl

---

### W5 · UZ integratsiyalar API hujjatlari (1 hafta — 36-42 kun)

**15 ta kritik integratsiya** uchun strukturaviy API spec:

| # | Integratsiya | Hujjat manbasi | Asosiy narsa |
|---|---|---|---|
| 1 | **Soliq.uz (EDO)** | soliq.uz/api-docs | Schet-faktura, akt yuborish, status tracking |
| 2 | **ASL Belgisi** | aslbelgisi.uz/docs | Code issuance, retire, status |
| 3 | **Payme (merchant)** | business.payme.uz | Subscribe, webhook, refund |
| 4 | **Click** | docs.click.uz | Merchant API |
| 5 | **Uzum Bank + Multicard** | uzumbank.uz | Card processing + open banking |
| 6 | **UzCard / Humo** | uzcard.uz | POS network |
| 7 | **Didox / E-DOCS** | didox.uz | EDO platform |
| 8 | **CBRU** | cbu.uz/ru/arkhiv-kursov-valyut/json | Kundalik kurs |
| 9 | **Eskiz SMS** | eskiz.uz/api-docs | SMS yuborish |
| 10 | **REGOS (VCR)** | regos.uz/api | Virtual kassa (fiskal chek) |
| 11 | **Uzum Market** | seller.uzum.uz/api | Marketplace seller API |
| 12 | **Yandex GO UZ** | fleet.yandex.uz | Delivery booking |
| 13 | **Kapitalbank Open API** | — (kerak so'rash) | Statement sync |
| 14 | **NBU Open API** | — | — |
| 15 | **Generic SMTP** | Standard | Email setup |

**Har integratsiya uchun tayyorlanadi:**
```
docs/moysklad-reference/integrations-uz/<name>/
├── README.md           # Overview
├── endpoints.json      # All API endpoints
├── auth.md             # OAuth2 / API key / HMAC setup
├── payloads/
│   ├── request-<action>.json
│   └── response-<action>.json
├── webhooks.json       # If applicable
├── error-codes.md      # Error handling
├── rate-limits.md
└── sandbox.md          # Test env setup
```

**Deliverable:** 15 ta integratsiya uchun to'liq spec papkasi

---

### W6 · Business rules (1 hafta — 43-49 kun)

**Moysklad'ning ichki biznes logikasi.** Kodda implement qilishdan oldin yozilishi shart.

| Qoidalar guruhi | Ichida |
|---|---|
| **Stock ledger** | FIFO / average cost tanlash, reversal, Sereyna | |
| **Reserve** | Customer order'dan kelgan reservlar qanday tarqaladi, bekor bo'lganda nima |
| **VAT cascade** | Price-includes-VAT vs net, per-line rate, document-level rate, multi-country |
| **Discount rules** | Personal, accumulating, seasonal; ketma-ketlik; kaskad |
| **Multi-currency** | Rate pinning on document, historical rates, difference posting |
| **Doc numbering** | Format string, sequence, reset yearly/monthly, per-org |
| **Permission inheritance** | Role → user → entity-level overrides |
| **Audit log** | Kim/nima/qachon/eski/yangi |
| **Notification rules** | Event → triger → recipient → template |
| **Fiscal rules (UZ)** | MXIK majburiy, soliq yuborish shartlari |
| **Markirovka (UZ)** | ASL Belgisi qachon va qanday code generatsiya qilinadi |
| **Bonus / loyalty** | Earn/spend rules, expiration, tier system |
| **Print numbering** | Copy count, watermark, QR code embedding |
| **Time zones** | UTC storage, tenant TZ display, DST handling |

**Deliverable:** `docs/moysklad-reference/business-rules/*.md` — har qoida guruhi uchun hujjat

---

### W7 · Konsolidatsiya + Verification (1 hafta — 50-56 kun)

**Maqsad:** barcha yig'ilgan ma'lumotni **tekshirish** va **ishga yaroqli reference'ga** aylantirish.

**Vazifalar:**
1. `data-model/` — 79/79 schema (missing 7 qayta yig'ilgan)
2. `visual-captures/` — ~2400 file to'liq
3. `admin/` — 150 sahifa
4. `workflows/` — 36 FSM
5. `integrations-uz/` — 15 spec
6. `business-rules/` — 14 hujjat

**Cross-check:**
- Har schema'ning field'lari visual capture'dagi form'lar bilan mos kelishini tekshirish
- Har FSM'ning status badge ranglari admin'dan `Статусы документов` sahifasi bilan mos
- Har integratsiya API'siga test chaqiriq (sandbox'da)

**Pattern library seed:**
Visual capture'lardan 15 pattern'ni ajratib olish:
- ListView → 50 page'dan umumiy pattern
- EditForm → 30 form'dan umumiy
- Modal → quick-create, picker, confirm
- etc.

Har pattern uchun:
- Reference screenshots
- DOM structure
- Required props API (bizning React komponenti uchun)

**Deliverable:** `docs/moysklad-reference/patterns/*.md` — 15 fayl

---

## Haftalar bo'yicha xulosa

| Hafta | Workstream | Natija |
|---|---|---|
| 1-2 | Deep UI Capture | ~2400 state screenshot + DOM |
| 3 | Admin/Settings | 150 admin sahifa |
| 4 | Missing 7 schema + FSM boshlang'ich | Barcha schema + 3 FSM |
| 5 | FSM to'liq | 36 FSM JSON |
| 6 | UZ integratsiyalar | 15 API spec papka |
| 7 | Business rules | 14 rule hujjat |
| 8 | Konsolidatsiya + pattern library seed | Kodga tayyor reference |

---

## Keyingi qadam — bugundan

Men hozir **W1** ishni boshlayman:
1. `tools/capture/src/scrape-app-deep.ts` yozaman — har sahifada barcha interaksiyalarni programmatic ochadigan skript
2. Siz skriptni ishga tushirasiz
3. Skript 1-2 kecha davomida ~2400 capture qiladi

**Parallel:** siz (agar xohlasangiz) Moysklad'da test ma'lumotlarini yaratib berishingiz mumkin — shunda bizda "empty state" va "filled state" ikkalasi ham bo'ladi (masalan, bitta Product, bitta Counterparty, bitta Order yaratish).

---

## Kelishuvlar

- **Sifat tezlikdan ustun** (CLAUDE.md qoidalariga muvofiq)
- Har workstream tugaganda **commit** qilinadi
- Haftalik progress hisoboti
- 2 oy oxirida — Sprint 1 boshlash uchun 99% tayyor reference

**Bu reja tasdiqlangandan keyin, men W1 skriptini yozishni boshlayman.**
