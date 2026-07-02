# Region, TrackingCode, Discount — yana 3 ta master-data moduli

> 3 ta yana flat-CRUD master-data dictionary. Moysklad'ning «Справочники» va
> «CRM» bo'limidagi qo'shimcha lug'atlarning 1:1 klon implementatsiyasi.

**Status**: ✅ Done · Sprint 9
**Test count**: 38 unit (9 region + 16 tracking-code + 13 discount)

---

## 1. Region — UZ hududlari

DB: `Region` (schema.prisma:1551). Permission entity: `region`. URL: `/settings/regions`.

Fields:
- `name` — "Toshkent shahri", "Andijon viloyati"
- `code` — ISO 3166-2 sub-code (UZ-TA, UZ-AN, UZ-BU, ...)
- `version` — optimistic concurrency (moysklad parity)
- `externalCode`

**Default seed** (bo'sh akkountga avtomat):
14 ta UZ hudud — UZ-TA, UZ-TO, UZ-AN, UZ-BU, UZ-FA, UZ-JI, UZ-XO, UZ-NG, UZ-NW, UZ-QA, UZ-QR, UZ-SA, UZ-SI, UZ-SU.

Ishlatilishi: kontragent / tashkilot manzili uchun region dropdown. Statistika hisobotlarida region bo'yicha pivot.

---

## 2. TrackingCode — ASL Belgisi (markirovka)

DB: `TrackingCode` (schema.prisma:2135). Permission entity: `trackingcode`. URL: `/tracking-codes`.

Fields:
- `cis` — DataMatrix / GTIN+serial+CRC kod (unique per accountId)
- `cis1162` — Rossiya fiskal flag variant (moysklad parity, optional)
- `type` — SHOES / TOBACCO / MEDICINES / PERFUME / TIRES / DAIRY / WATER / BEER
- `status` — ACTIVE / RETIRED / TRANSFERRED
- `productId`, `variantId` — bog'lanish (optional)
- `trackingCodes` — JSON (parent box → children units uchun)

UZ kontekst: ASL Belgisi (Аслигини белги) — bizning markirovka tizimi.
2024-2025 yildan boshlab poyabzal, tamaki, alkogol, suvga majburiy.

**DEFAULT SEED YO'Q** — kodlar fiskal printer/skannerlar orqali kelib qo'shiladi.

Ishlatilishi:
- Sotuv vaqtida: POS skanerda kod o'qiladi, status `ACTIVE` ekanligi tekshiriladi
- Sotuvdan keyin: status `RETIRED` ga o'tadi
- Soliq EDO ga submission: faqat `RETIRED` kodlar ko'rsatiladi

### List sahifasi
- Type filter: dropdown (SHOES / TOBACCO / ...)
- Status filter: toggle pills (ACTIVE / RETIRED / TRANSFERRED)
- Per-product link agar productId mavjud bo'lsa

### `/[id]` sahifa
- cis kod katta shrift bilan (skannerga osoyish o'qish uchun)
- Bog'liq mahsulot ma'lumotlari (kelajakda relation qo'shilsa)
- trackingCodes JSON viewer (agregatlangan kodlar tree)

---

## 3. Discount — Skidkalar va bonus dasturlar

DB: `Discount` (schema.prisma:2100). Permission entity: `discount`. URL: `/discounts`.

Fields:
- `name`, `kind`, `active`, `archived`
- `kind` enum: 'special' (maxsus), 'accumulative' (yig'iluvchi), 'personal' (shaxsiy), 'product' (mahsulot), 'agent' (kontragent)
- `allAgents` — true bo'lsa hammaga, false bo'lsa `agentTags[]` filtrida
- `allProducts` — true bo'lsa hammaga, rules ichida filter qo'yiladi
- `rules` — JSON (kind'ga qarab har xil shaklda)
- **Bonus program ham shu yerda**:
  - `earnRateUzsToPoint` — 1 ball uchun necha sum (masalan, 1000 = "har 1000 sumga 1 ball")
  - `spendRatePointsToUzs` — 1 ball necha sum (masalan, 100 = "1 ball = 100 sum")
  - `maxPaidRatePercents` — sotuvning necha foizini ball bilan to'lash mumkin (0-100)
  - `earnWhileRedeeming` — ball bilan to'laganda yangi ball berishmi yo'qmi

Misol `rules` JSON shakllari:
```json
// accumulative
{ "tiers": [{ "from": 0, "percent": 5 }, { "from": 1000000, "percent": 10 }] }

// product
{ "productIds": ["...", "..."], "percent": 15 }

// agent
{ "agentTagIds": ["vip-tag-id"], "percent": 20 }
```

**v1 cheklash**: UI'da `rules` raw JSON textarea — kelajakda kind-specific builder qo'shiladi.

### Ishlatilishi

Discount POS checkout'da avtomat qo'llaniladi:
1. Sotuv yaratiladi (RetailSale / CustomerOrder)
2. Tizim active+non-archived discountlarni topadi
3. Har birini kind+rules bo'yicha tekshiradi (kontragent mos kelishi, mahsulot mos kelishi, accumulative tier'i)
4. Eng yuqori summa skidka qo'llaniladi (yoki additive — biznes qoidasi)
5. Bonus program: balls hisoblanadi va spent points balansga yoziladi

---

## Texnik shakl (har 3 dictionary)

API:
```
GET    /api/v1/{slug}            # ro'yxat + filter
GET    /api/v1/{slug}/:id        # bitta
POST   /api/v1/{slug}            # create
PATCH  /api/v1/{slug}/:id        # update
DELETE /api/v1/{slug}/:id        # soft archive (yoki hard delete agentlar yo'q bo'lsa)
```

**Permissions** entities: `region`, `trackingcode`, `discount`.

---

## Kelajakda

### Region
- [ ] Cyrillic / Latin nom variantlari (uz-Cyrl + uz-Latn)
- [ ] Tuman/Shahar darajasi (Region → SubRegion → City)

### TrackingCode
- [ ] Product Prisma relation qo'shish (hozircha bare FK, no `@relation`)
- [ ] Bulk import — skanerdan kelgan ko'p kodlarni bir vaqtda yuklash
- [ ] EDO submission queue — RETIRED kodlarni soliqga avtomat yuborish
- [ ] Aggregated codes tree viewer (parent box → children units)

### Discount
- [ ] Kind-specific UI builder (textarea o'rniga)
- [ ] Discount preview — "agar bu skidka qo'llanilsa, mijoz balansiga qanday ta'sir qiladi"
- [ ] A/B testing — bir skidka qaysi mijozlarga "ON", boshqalariga "OFF"
- [ ] Bonus history — har mijozning ball tarixi (ChasUchun foydalanilgan)
- [ ] Tier visualization — accumulative discountlar uchun mehnatkash diagramma

---

**Tegishli kod**:
- Backend: `apps/api/src/modules/{region, tracking-code, discount}/`
- Frontend: 
  - `apps/web/src/app/(app)/settings/regions/`
  - `apps/web/src/app/(app)/tracking-codes/`
  - `apps/web/src/app/(app)/discounts/`
- DB: schema.prisma — Region (1551), TrackingCode (2135), Discount (2100)
- i18n: `pages.{region, tracking_code, discount}`
