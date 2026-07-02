# Analitika moduli — Design Spec

**Sana:** 2026-05-25
**Manba hujjat:** `TIZIM-QOLLANMA.md` (ilgari "Alibobo Qurilish" deb nomlangan tizim)
**Maqsad:** `TIZIM-QOLLANMA.md` da tasvirlangan barcha funksiyalarni mavjud moysklad
loyihasiga **"Analitika"** nomli yangi tepa-navbar bo'limi sifatida qo'shish.

> **Branding:** "Alibobo" nomi hech qayerda ishlatilmaydi. Bu moysklad
> ilovasining tabiiy bir qismi — moysklad logotip/rang/til (uz+ru) bilan.

---

## 1. Qabul qilingan qarorlar (brainstorming natijasi)

| # | Qaror | Tanlov |
|---|---|---|
| 1 | Ma'lumot manbai | **Mavjud moysklad bazasidan foydalanadi** (kontragent/mahsulot/qoldiq/xodim). Dublikat jadval yo'q. |
| 2 | "REGOS" nima | **Mahalliy baza = REGOS.** "REGOS qoldig'i" → moysklad `Stock`. "Sinxronlash" → qayta hisoblash/refresh. Tashqi connector **yo'q**. |
| 3 | Sub-nav tarkibi | **Faqat yangi sahifalar.** Xodimlar/Rollar/Audit qaytadan qurilmaydi — kerak bo'lsa mavjud moysklad sahifalariga havola. |
| 4 | Nomlanish | Bo'lim = **"Analitika"**, "Alibobo" yo'q, moysklad branding. |
| 5 | Navbar joyi | Tepa navbar'da **eng oxirda** (HR'dan keyin). |
| 6 | Inventerizatsiya UI | **Bitta sahifa + 4 ichki tab** (Bosh panel / Sanab kiritish / Tasdiqlash / Hisobot). |
| 7 | "Buyurtma shakllantirish" | **Yengil `AnalitikaOrder` yozuvi + Excel.** Mavjud purchase-order tizimiga tegmaydi. |

---

## 2. Texnik kontekst (mavjud loyiha)

- **Monorepo:** pnpm + turbo. `apps/api` (NestJS + Fastify), `apps/web` (Next.js App Router), `packages/db` (Prisma + Postgres).
- **Web nav:** `apps/web/src/app/(app)/layout.tsx` da `moduleNav: NavItem[]` (tepa tablar) + har modul uchun `*SubNav: SubNavItem[]`. `AppShell`, `SubNav`, `NavItem`, `SubNavItem` — `@moysklad/ui` dan.
- **i18n:** `next-intl`, `nav.*` va `subnav.*.*` namespace'lari, `uz` + `ru`.
- **Mavjud inventar:** `Inventory` + `InventoryPosition` modellari (moysklad standart bir-martalik hujjat: `expectedQty`/`actualQty`/`varianceQty`/`costMinor`). Bu Alibobo'ning **uzluksiz per-mahsulot** sanashidan farq qiladi → yangi jadvallar kerak.
- **Pul:** har doim minor birlik (`BigInt`/tiyin) + `Decimal`, **Float ishlatilmaydi**. JSON chiqishda `BigInt → string`.
- **Tenant:** har query'da `accountId` guard.

---

## 3. Navigatsiya tuzilishi

Tepa navbar'ga yangi `NavItem` (`key: 'analitika'`, `href: '/analitika'`, oxirgi pozitsiya). Pastki `analitikaSubNav: SubNavItem[]`:

| Sub-nav | URL | Tavsif |
|---|---|---|
| Boshqaruv paneli | `/analitika` | 4 KPI karta + so'nggi buyurtma/sanash + eng faol kontragent |
| Kontragentlar tahlili | `/analitika/kontragentlar`, `/[id]` | Ro'yxat → tahlil + buyurtma quruvchi |
| Mahsulotlar | `/analitika/mahsulotlar` | Ro'yxat + savat → Excel |
| Buyurtmalar | `/analitika/buyurtmalar`, `/[id]` | Shakllantirilgan buyurtmalar tarixi (faqat ko'rish) |
| Inventerizatsiya | `/analitika/inventerizatsiya` | Bitta sahifa, 4 ichki tab |
| Sozlamalar | `/analitika/sozlamalar` | Variance chegaralari + sabab kodlari |

Active-module → subnav mapping `layout.tsx` da mavjud pattern bo'yicha qo'shiladi. Web fayllar: `apps/web/src/app/(app)/analitika/...`.

---

## 4. Sahifalar — batafsil xulq-atvor

### 4.1 Boshqaruv paneli (`/analitika`)
- 4 KPI karta: kontragentlar soni · jami buyurtmalar · shu oydagi buyurtmalar · oxirgi sinxron/refresh holati.
- So'nggi 5 buyurtma + eng faol kontragentlar + bugungi sanash xulosasi (yashil/sariq/qizil).
- Kartani bosish → tegishli bo'limga o'tadi.

### 4.2 Kontragentlar tahlili (`/analitika/kontragentlar`)
- **Ro'yxat:** qidiruv (nom/STIR/telefon), guruh filtri, sahifalash. Manba: mavjud `Counterparty`.
- **Tahlil + buyurtma quruvchi (`/[id]`):** sana filtri (default 30 kun). Statistika kartalari: xarid miqdori, sotilgan miqdor, sotilgan ulush %, qoldiq, kutilayotgan foyda, xaridlar tannarxi, sotuvlar tannarxi/qiymati, so'nggi xarid/sotuv sanalari (mavjud xarid/sotuv ma'lumotidan hisoblanadi).
- Mahsulotlar jadvali + har qatorda miqdor maydoni; pastda jonli **buyurtma paneli** (tanlangan soni + summa).
- **"Buyurtma shakllantirish"** → `AnalitikaOrder` yaratadi + Excel yuklaydi + buyurtma tafsilotiga o'tadi (kamida 1 mahsulotga miqdor shart). **"Tozalash"** → ConfirmDialog bilan barcha miqdorni o'chiradi.

### 4.3 Mahsulotlar (`/analitika/mahsulotlar`)
- Qisqa statistika (jami / kam qoldiq / yetkazib beruvchisiz / savatdagilar).
- Chapda guruhlar daraxti, o'ngda jadval (kod, nom, birlik, qoldiq, sotilgan miqdor, yetkazib beruvchi, narx). Manba: mavjud `Product` + `Stock`.
- Qidiruv, sort (kod/nom/qoldiq/narx), filtrlar (kam qoldiq / yetkazib beruvchisiz / savatdagilar), sana oralig'i (sotilgan miqdor uchun).
- Miqdor kiritish → savatga qo'shadi (Zustand, sahifa yangilansa tozalanadi). **"Buyurtma shakllantirish"** → Excel + `AnalitikaOrder`.

### 4.4 Buyurtmalar (`/analitika/buyurtmalar`)
- Ro'yxat: qidiruv (raqam/kontragent), holat filtri (Hammasi/Qoralama/Shakllantirilgan/Yakunlangan). Har qator: raqam, kontragent, mahsulotlar soni, holat, sana, summa.
- "Batafsil" → tafsilot (faqat ko'rish), "Excel" → fayl.
- Tafsilot (`/[id]`): raqam/sana, kontragent (nom/STIR/telefon), holat/summa, mahsulotlar jadvali. Kontragent nomini bosish → tahlilga o'tadi. Bu sahifa o'zgartirilmaydi.

### 4.5 Inventerizatsiya (`/analitika/inventerizatsiya`) — 4 tab
**Tab A — Bosh panel:** bugungi sanash ko'rsatkichlari (jami sanalgan, yashil/sariq/qizil soni, yo'qotish, topib olingan, NET), tasdiq kutayotganlar ogohlantirishi, so'nggi sanashlar + eng faol sanovchilar.

**Tab B — Sanab kiritish (eng ko'p ishlatiladi):** chapda guruhlar, o'ngda jadval. Yuqorida 4 ko'rsatkich (bugun sanaganim / jami Kam / jami Ko'p / NET). Qidiruv (nom/kod/shtrix). Har qatorda: rasm, nom, kod, **REGOS qoldig'i** (= `Stock`), sotuv narxi, **Kam** maydoni, **Ko'p** maydoni.
- Bittasiga raqam yozilsa ikkinchisi avto-bo'shaydi (ham kam ham ko'p mumkin emas).
- Blur'da **avto-saqlash** (alohida Saqlash tugmasi yo'q). Saqlangach o'ng chetda holat belgisi (yashil/sariq/qizil).
- Maydonni bo'shatib blur → sanash bekor qilinadi. Raqamni o'zgartirish → yangi qiymat.
- Pul summasi ko'rsatilmaydi — faqat miqdor + sotuv narxi.

**Tab C — Tasdiqlash (boshliq):** tablar (Tasdiq kutayotganlar / Hammasi / Qabul / Rad). Ro'yxat: mahsulot, holat, sanalgan miqdor, REGOS qoldig'i, kim/qachon. Checkbox bilan ko'p tanlash.
- **Tasdiqlash** → sabab kodi modal → qabul. **Rad etish** → sabab → qayta sanash talab. **Qayta sanash** → sanash oynasi. **Bekor qilish** → qabul qilinganni orqaga (ruxsatli xodim). **Hammasini tasdiqlash** → bulk.

**Tab D — Hisobot:** pul hisobi **sotuv narxida**. 3 katta karta: 🔴 yo'qotilgan / 🟢 ortiqcha topilgan / 📊 NET. Sana filtri (Bugun/Kecha/7/30 kun).
- Tablar: **Mahsulotlar** (oxirgi sanash; rad etilganlar ko'rinmaydi), **Sanovchi bo'yicha**, **Guruh bo'yicha**, **Sabab bo'yicha**, **Top-10 farq**.
- "Barcha sanalganlar" Excel · "Excel" (joriy ko'rinish) · "PDF" · guruh tanlash · **"Reset"** (ConfirmDialog bilan barcha/guruh sanashlarini nolga tushiradi) · qidiruv.

### 4.6 Sozlamalar (`/analitika/sozlamalar`)
- **Variance chegaralari:** `greenMaxPct`, `yellowMaxPct` (undan yuqori = qizil). Saqlash.
- **Sabab kodlari:** ro'yxat + qo'shish (sheet/panel) + tahrirlash + o'chirish (ConfirmDialog).
- Audit/Xodim/Rol kerak bo'lsa mavjud moysklad sahifalariga havola.

---

## 5. Ma'lumot modeli (Prisma — `packages/db/prisma/schema.prisma`)

Yangi modellar (hammasi `accountId` + `@@index`, soft-delete kerakli joyda).

> **Sanash semantikasi:** `AnalitikaCount` joriy davr ichida **har (account, product, store)
> uchun bitta yozuv** (upsert). Qayta yozish — yangi qiymat (oxirgi yozuv g'olib). Bo'shatib
> blur — yozuv o'chadi. "Reset" — joriy davr yozuvlarini tozalaydi (yangi davr boshlanadi).
> "So'nggi sanashlar" / "Sanovchi bo'yicha" / "Top-10" — shu joriy to'plamni saralash/guruhlash.

```prisma
model AnalitikaCount {
  id             String   @id @default(uuid()) @db.Uuid
  accountId      String   @map("account_id") @db.Uuid
  productId      String   @map("product_id") @db.Uuid
  storeId        String   @map("store_id") @db.Uuid
  expectedQty    Decimal  @map("expected_qty") @db.Decimal(20, 6) // snapshot Stock = "REGOS"
  kamQty         Decimal  @default(0) @map("kam_qty") @db.Decimal(20, 6)
  kopQty         Decimal  @default(0) @map("kop_qty") @db.Decimal(20, 6)
  netQty         Decimal  @map("net_qty") @db.Decimal(20, 6)        // kopQty - kamQty
  salePriceMinor BigInt   @map("sale_price_minor")                  // snapshot
  status         String   @db.VarChar(10)                           // green|yellow|red
  decision       String?  @db.VarChar(12)                           // accepted|rejected|null
  counterId      String   @map("counter_id") @db.Uuid
  countedAt      DateTime @default(now()) @map("counted_at") @db.Timestamptz()
  reviewerId     String?  @map("reviewer_id") @db.Uuid
  reviewedAt     DateTime? @map("reviewed_at") @db.Timestamptz()
  reasonCodeId   String?  @map("reason_code_id") @db.Uuid
  note           String?
  // relations: account, product, store, counter(Employee), reviewer(Employee), reasonCode
  // @@unique([accountId, productId, storeId])   // bitta joriy sanash / mahsulot / ombor
  // @@index([accountId, status, countedAt]); @@index([accountId, counterId])
}

model AnalitikaReasonCode {
  id        String  @id @default(uuid()) @db.Uuid
  accountId String  @map("account_id") @db.Uuid
  label     String  @db.VarChar(100)
  active    Boolean @default(true)
  // @@unique([accountId, label])
}

model AnalitikaVarianceConfig {
  id           String @id @default(uuid()) @db.Uuid
  accountId    String @unique @map("account_id") @db.Uuid
  greenMaxPct  Decimal @default(5)  @map("green_max_pct") @db.Decimal(6, 2)
  yellowMaxPct Decimal @default(15) @map("yellow_max_pct") @db.Decimal(6, 2)
}

model AnalitikaOrder {
  id              String  @id @default(uuid()) @db.Uuid
  accountId       String  @map("account_id") @db.Uuid
  number          String  @db.VarChar(40)
  counterpartyId  String? @map("counterparty_id") @db.Uuid
  state           String  @default("formed") @db.VarChar(20) // draft|formed|done
  totalMinor      BigInt  @default(0) @map("total_minor")
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz()
  lines           AnalitikaOrderLine[]
  // @@unique([accountId, number]); @@index([accountId, createdAt])
}

model AnalitikaOrderLine {
  id         String  @id @default(uuid()) @db.Uuid
  orderId    String  @map("order_id") @db.Uuid
  accountId  String  @map("account_id") @db.Uuid
  productId  String  @map("product_id") @db.Uuid
  qty        Decimal @db.Decimal(20, 6)
  priceMinor BigInt  @map("price_minor")
  sumMinor   BigInt  @map("sum_minor")
  // order(cascade), product(restrict)
}
```

Kontragent tahlili va dashboard yangi jadval talab qilmaydi (read-only agregatsiya).

### Variance status hisoblash
`pct = |netQty| / expectedQty * 100` (expectedQty=0 va netQty≠0 → qizil).
`pct ≤ greenMaxPct` → green (avto-qabul). `≤ yellowMaxPct` → yellow (tasdiq kutadi). aks → red.

---

## 6. Backend (`apps/api/src/modules/analitika/`)

NestJS modul, har endpoint Zod-validatsiya + `accountId` guard + RBAC:

| Method | Path | Vazifa |
|---|---|---|
| GET | `/analitika/dashboard` | KPI agregatsiya |
| GET | `/analitika/counterparties` | tahlil ro'yxati (mavjud Counterparty ustidan) |
| GET | `/analitika/counterparties/:id/analysis` | statistika (sana filtri) |
| POST | `/analitika/orders` | AnalitikaOrder yaratish (+ Excel) |
| GET | `/analitika/orders`, `/:id` | ro'yxat / tafsilot |
| GET | `/analitika/orders/:id/excel` | Excel eksport |
| GET | `/analitika/products` | mahsulot ro'yxati (Product+Stock, savat uchun) |
| GET | `/analitika/counts` | filtr bo'yicha sanashlar |
| PUT | `/analitika/counts` | upsert (kam/kop, status hisoblash, snapshot) |
| POST | `/analitika/counts/:id/approve` `/reject` `/recount` `/cancel` | tasdiq oqimi |
| POST | `/analitika/counts/bulk-approve` | bulk |
| GET | `/analitika/report` | pul hisoboti (tab bo'yicha) |
| GET | `/analitika/report/excel` `/pdf` | eksport |
| POST | `/analitika/report/reset` | sanashlarni reset |
| GET/PUT | `/analitika/settings/variance` | chegaralar |
| GET/POST/PUT/DELETE | `/analitika/reason-codes` | sabab kodlari CRUD |

Service'lar kichik, bitta mas'uliyatli: `dashboard`, `counterparty-analysis`, `order`, `count`, `report`, `reason-code`, `variance-config`.

---

## 7. Ruxsat · i18n · Test

- **RBAC:** kodbaza permission modeli `entity + action` (action'lar fiksatsiyalangan: `view/create/update/delete/approve/print`). Shuning uchun bitta yangi entity — **`analitika`** qo'shiladi va standart action'lar qayta ishlatiladi: `view` (ko'rish/hisobot), `create` (sanash kiritish + buyurtma), `approve` (tasdiqlash/rad), `update` (sozlamalar/sabab kodlari), `delete` (reset/o'chirish). Ruxsatsiz sub-nav item ko'rinmaydi.
- **i18n:** `subnav.analitika.*`, `analitika.*` — har biri `uz` + `ru`.
- **Test (har service'ga unit):**
  - Variance status (green/yellow/red chegaralari, expectedQty=0 holati).
  - Kam/Ko'p mutual-exclusion (ikkalasi bir vaqtda ≠0 → xato yoki avto-tozalash).
  - Pul hisoboti Decimal/BigInt — Float drift yo'q (2000+ qatorda).
  - Tenant izolyatsiya — boshqa accountId ko'rinmaydi.
  - Reset faqat ruxsatli + ConfirmDialog.

### Adversarial QA (CLAUDE.md majburiy)
- **Concurrency:** 2 sanovchi bir mahsulotni sanasa lost-update bo'lmasin (upsert `accountId+productId+storeId` unique + transaction; oxirgi yozuv g'olib + audit).
- **Real-data smoke:** 2000+ qatorli sanash, guruh filtri, katta hisobot.
- **Input edges:** null/0/bo'sh string farqi, juda katta son (Decimal 20,6), unicode mahsulot nomi.
- **UX:** generic "xato" yo'q (timeout/network/validation aniq), `window.confirm()` o'rniga ConfirmDialog, loading state.

---

## 8. Fazalar (har faza oxirida: typecheck + biome + test + commit)

| Faza | Mazmun |
|---|---|
| **P0 Foundation** | Nav tab + `analitikaSubNav` + i18n kalitlar (uz/ru) + route-group skelet + RBAC kalitlar |
| **P1 Data model** | Prisma 5 model + migration + `analitika` NestJS modul skeleti |
| **P2 Inventerizatsiya yadrosi** | counts upsert/list + variance hisoblash + Sanab kiritish UI + Bosh panel tab |
| **P3 Tasdiqlash** | approve/reject/recount/cancel/bulk + sabab kodi modal + Tasdiqlash tab |
| **P4 Hisobot** | pul hisoboti (5 tab) + Excel/PDF + Reset + Hisobot tab |
| **P5 Kontragent tahlili** | analiz agregatsiya + buyurtma quruvchi + AnalitikaOrder yaratish + Excel |
| **P6 Mahsulotlar + Buyurtmalar** | mahsulot ro'yxat + savat (Zustand) + buyurtma tarixi/tafsilot |
| **P7 Sozlamalar** | variance config formasi + sabab kodlari admin |
| **P8 Dashboard** | KPI agregatsiya + Boshqaruv paneli sahifasi |

Har faza yopilishidan oldin **adversarial QA** (5-8 darvoza) bajariladi; "happy path ishlaydi, QA qilmadim" holatida halol aytiladi.

---

## 9. Scope chegarasi (DO NOT)

- Tashqi REGOS connector qurilmaydi.
- Mavjud purchase-order/inventory hujjat tizimi o'zgartirilmaydi (faqat o'qiladi).
- Xodimlar/Rollar/Audit Analitika ichida qaytadan qurilmaydi (havola).
- Mavjud `Inventory`/`InventoryPosition` modellari o'zgartirilmaydi.
- `any` yo'q; pulda Float yo'q; JSON'da `BigInt → string`.
