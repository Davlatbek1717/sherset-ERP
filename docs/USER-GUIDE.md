# Foydalanuvchi qo'llanmasi — Boshlash

MoySklad Clone — bulutli ERP. Bu qo'llanma sizga 10 daqiqa ichida ishni boshlashga yordam beradi.

## Birinchi 5 minut — sozlash

### 1. Tashkilot ma'lumotlarini kiriting

`Sozlamalar → Tashkilotlar → Yangi tashkilot`

Majburiy maydonlar:
- **Nom** (qisqa nom kassada va hisob-fakturalarda ko'rinadi)
- **Yuridik nom** (rasmiy hujjatlarda)
- **STIR** (Soliq Identifikatsiya Raqami) — 9 raqam yuridik shaxs uchun, 14 raqam yakka tadbirkor uchun
- **Bank rekvizitlari** — IFXM va akkord raqami

> **Maslahat**: STIR ni xato kiritsangiz, Soliq EDO ishlamaydi. Hujjatlarni `taxinfo.uz` orqali tekshiring.

### 2. Birinchi omborni yarating

`Sozlamalar → Omborlar → Yangi ombor`

Har biznesda kamida 1 ta ombor bo'lishi shart. Ko'p ombor bo'lsa (markaziy + filiallar), har biri uchun alohida yarating.

### 3. Foydalanuvchilarni qo'shing

`Sozlamalar → Foydalanuvchilar`

3 default rol:
- **EGASI** — to'liq huquq (faqat 1 kishi bo'lishi tavsiya etiladi)
- **ADMIN** — barcha modul, lekin akkountni o'chira olmaydi
- **XODIM** — faqat o'ziga biriktirilgan modullar

> **Xavfsizlik**: Har xodimga alohida login bering, parolni umumiy qilmang. Audit jurnalida har amalning egasi ko'rinadi.

### 4. Mahsulotlar ro'yxatini import qiling

**Excel orqali**: `Tovarlar → Import` (CSV/XLSX)

Yoki qo'lda: `Tovarlar → Yangi tovar`

Maydonlar:
- **Nom** (majburiy)
- **Kod** (ichki kod, izlash uchun)
- **MXIK kod** — UZ uchun zarur (Soliq EDO + ASL Belgisi)
- **Sotuv narxi**, **Tannarx**
- **NDS** (12% — UZ standart, 0% — eksport, soliqsiz mahsulotlar)
- **Kategoriya / Papka** — hujjat xabarnomalari uchun

### 5. Birinchi mijozni qo'shing

`CRM → Kontragentlar → Yangi`

UZ-specific maydonlar:
- **STIR** (yuridik shaxs uchun majburiy)
- **Yuridik manzil** (rasmiy hujjatlarda)
- **Faktik manzil** (yetkazib berish)
- **Bank hisobi** (to'lovlar uchun)

## Asosiy oqimlar

### 🛒 Savdo: Buyurtma → Otkazma → Tushum

```
Mijoz Buyurtmasi (narx kelishildi)
        ↓
   Otkazma (tovar yuborildi → ombor minus)
        ↓
   Hisob-faktura (to'lash uchun)
        ↓
   To'lov tushumi (pul keldi → mijoz balansi minus)
```

**Buyurtma yaratish:**
1. `Savdo → Yangi buyurtma`
2. Mijoz tanlash (yo'q bo'lsa, dialog'da yangi yarating)
3. Mahsulotlar qo'shish (skanerdan / qidiruvdan)
4. Yetkazib berish sanasi belgilash
5. Saqlash → status `draft`

**Otkazma:**
- Buyurtmani oching → "Yangi otgruzka" tugmasi → barcha pozitsiyalar avtomat ko'chadi
- "Provedeno" qo'ying → ombor avtomat minus

**To'lov:**
- Hisob-faktura ochilgach → "Yangi tushum" → bank yoki kassa tanlang
- Bir nechta hisob bo'lsa, "Operatsiyalar" jadvalida har biriga qancha pul tushganini ko'rsating

### 📦 Xarid: Buyurtma → Priyomka → Chiqim

Xuddi savdoga teskari yo'nalish:
1. `Xaridlar → Yangi buyurtma` (ta'minlovchiga so'rov)
2. `Priyomka` (tovar keldi → ombor + 1)
3. `Hisob-faktura` (ta'minlovchidan)
4. `To'lov chiqimi` (pul yubordik)

### 💰 Pul boshqaruvi

**Bank tushumi:** mijozdan pul keldi (P/C ga)
**Naqd qabul:** mijozdan kassaga naqd
**Bank chiqimi:** ta'minlovchiga to'ladik
**Naqd chiqimi:** kassadan naqd berdik

> **Diqqat**: ECP imzo qonun bo'yicha kassa hujjatlari uchun majburiy. Bizda ECP wiring tayyor — sozlash uchun [Soliq EDO setup](#soliq-edo) ko'ring.

### 📊 Ombor yuritish

**Inventarizatsiya** (real qoldiqni tizim bilan moslash):
1. `Ombor → Inventarizatsiya → Yangi`
2. Ombor tanlang
3. Tizim avtomat `bookQty` ko'rsatadi
4. `actualQty` ga real qoldiqni kiriting
5. Tasdiqlang → farq avtomat **Sapotka** (kam) yoki **Kirim** (ortiqcha)

**FIFO tannarx:** birinchi kelgan birinchi sotiladi.
- 10 ta @100k + 5 ta @110k → 8 ta sotsa, tannarx 8×100k=800k
- Foyda hisobiga ham FIFO ishlatiladi

## UZ Integratsiyalar

### Soliq EDO

`Sozlamalar → Soliq EDO`

Sozlash uchun:
1. **ECP** (Electron raqamli imzo) — `.pfx` fayl yuklash
2. **STIR** (organization tomonida belgilangan)
3. **Provayder** tanlash: Didox, E-Docs, yoki Soliq native

**EHF yuborish:**
- Hisob-faktura yarating → "Soliq EDO yuborish" tugmasi
- XML format hosil bo'ladi → ECP bilan imzolanadi → provayderga
- Status zanjiri: `pending → submitted → accepted/rejected`

### Payme to'lov shlyuzi

`Sozlamalar → Payme`

1. Merchant Cabinet (Payme.uz) → Settings → API → endpoint URL nusxa oling
2. Bizda: secret key + login Payme tomondan beriladi
3. **Sinov rejimi:** `test.paycom.uz` ishlatiladi

Hisob-fakturada to'lov havolasi avtomat hosil bo'ladi.

### Click to'lov shlyuzi

`Sozlamalar → Click`

1. Click Cabinet → SHOP API → service ID + secret key
2. Endpoint URL Click Cabinet ichida ko'rsatiladi: `https://your-domain.uz/api/v1/click`

**Tranzaksiya hayoti:**
- PREPARE: Click bizdan `prepare_id` so'raydi → biz autorizatsiya qilamiz
- COMPLETE: pul tushgach Click bizga capture jo'natadi → biz `paid` qilamiz

### ASL Belgisi (markirovka)

`Sozlamalar → ASL Belgisi`

Majburiy markirovka tovarlari (UZ qonunga ko'ra):
- Alkogol va sigaret
- Doril mahsulotlari
- Bottled suv
- Oyoq kiyim
- Sut mahsulotlari

**Hayotiy yo'l:**
1. **Allocate** — markirovka kodi olinadi
2. **Apply** — kod tovar+lot+seriasiga biriktiriladi
3. **MarkSold** — sotuvda kod `sold`
4. **MarkReturned** — qaytarish holatida `returned`
5. **Retire** — eskirgan kodlarni arxivlash

DataMatrix kod skanerdan o'qiladi va avtomat parslanadi.

### Eskiz SMS

`Sozlamalar → SMS`

1. eskiz.uz da akkount yarating → email + parol
2. Bizda akkount kiriting → `Sinov` tugmasi avtomat token oladi
3. Mijozlarga SMS yuborish: hujjat saqlangach yoki kron orqali

Telefon formati avtomat normalize: `+998901234567`, `90 123 45 67`, `+998 (90) 123-45-67` — barchasi bir xil saqlanadi.

## Foydali maslahatlar

### Klaviatura yorliqlari

- `⌘K` (yoki `Ctrl+K`) — Tezkor harakatlar (har joyga sakrash)
- `?` yoki `Shift+/` — Yordam ochish
- `Esc` — modal/drawer yopish
- `↑/↓` — list bo'ylab navigatsiya
- `Enter` — tanlangan qatorni ochish
- `Ctrl+S` — forma saqlash
- `Delete` — bulk-selection bilan o'chirish

### Filterlar

Har list sahifada filter chiplari yuqorida:
- **Faol / Arxivda** — soft-delete'ni boshqarish
- **Sana oralig'i** — Mar 1 — Apr 30
- **Egasi (xodim)** — kim yaratgan/biriktirilgan
- **Status** — draft / posted / cancelled

URL'dagi parametrlar saqlangani uchun, link orqali boshqaga jo'natsangiz xuddi shu filter ko'rinadi.

### Bulk operations

List sahifada bir necha qatorni tanlang → header'da quyidagi tugmalar paydo bo'ladi:
- **Provedeno qilish** — barchasini posted'ga
- **Bekor qilish** — cancelled
- **O'chirish** — soft-delete (Korzina'ga)

### Korzina (Savatcha)

O'chirilgan hujjatlar 30 kun saqlanadi.
`Bosh sahifa → Korzina` yoki `Sozlamalar → Ma'lumotnomalar → Korzina`

Tiklash mumkin bo'lgan hujjatlar:
- Cash-in/Cash-out
- Customer-order, Demand, Invoice-out, Sales-return
- Purchase-order, Supply, Invoice-in, Purchase-return
- Payment-in, Payment-out
- Move, Loss, Enter, Inventory
- Product
- Retail-sale

30 kundan keyin avtomat butunlay o'chiriladi (cron sweep).

### Audit jurnali

`Sozlamalar → Audit jurnali`

Har CRUD amal qayd qilinadi:
- Kim qildi (foydalanuvchi)
- Qachon (timestamp)
- Nima o'zgardi (eski → yangi qiymatlar)

Filter: foydalanuvchi, sana, entity type, action.

### Yordam tizimi

- `?` tugmasini bossangiz yoki sahifaning yuqori-o'ng burchagidagi `❓` icon — kontekstli yordam ochiladi
- Har sahifa uchun maxsus maqolalar: `pages.<route>` bo'yicha
- Markdown formatida, search ham ishlaydi

## Tez-tez beriladigan savollar

### Tilni qanday almashtirish?

Yuqori-o'ng burchakda bayroq icon → uz / ru tanlash. Bir necha sahifa hali to'liq tarjima qilinmagan — `ru` tanlasangiz, ba'zi forma'lar uz'da qoladi (kelgusi yangilanishlarda tuzatiladi).

### Forma o'zgartirilgach refresh bossam, o'zgarishlar yo'qoladi-mi?

Yo'q, browser native confirm so'raydi: "O'zgarishlar saqlanmagan, chiqasizmi?"

### Hujjatni "Provedeno" qilgach o'zgartirish kerak

`Provedeno` ni olib tashlang (qaytarish tugmasi) → o'zgartiring → qayta `Provedeno` qiling. Audit jurnali har bosqichni saqlaydi.

### Bir nechta admin parallel ishlasa-chi?

Hozircha optimistic lock yo'q — bir hujjatni 2 admin parallel save qilsa, oxirgi yutadi. Production'ga chiqishdan oldin bu tuzatiladi (docs/ADVERSARIAL-QA.md §1.1 bo'yicha).

### Real to'lov shlyuzi orqali sinov

Test rejim:
- Payme: `https://test.paycom.uz`
- Click: Click Cabinet ichidagi sandbox

Real production'da `Sozlamalar → Payme/Click → Sinov rejimi` tugmasini o'chiring.

## Yordam kerakmi?

- 💬 Telegram: [@moysklad_uz_support](https://t.me/moysklad_uz_support)
- 📧 Email: support@your-domain.uz
- 📚 Hujjatlar: bu sahifaning o'zi (foydalanuvchi qo'llanma)
- 🐛 Bug topdingizmi? GitHub'da Issue oching yoki support emailga yuboring

## Yangiliklar

So'nggi yangilanish: 2026-04-30. Versiya history `CHANGELOG.md` faylida.
