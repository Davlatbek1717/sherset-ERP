# Labels — Shtrix-kod label chop etish

> Mahsulotlar uchun shtrix-kodli labellarni chop etish. Klerk shablon
> tanlaydi (qog'oz formati + tarmoq), mahsulotlar + miqdorlarni qo'shadi,
> chop etish dialogini ochadi. Moysklad'ning «Этикетки» modulining 1:1
> klon implementatsiyasi.

**Status**: ✅ Done · Sprint 9
**Code path**: `apps/api/src/modules/label` + `apps/web/src/app/(app)/settings/label-templates` + `apps/web/src/app/(app)/labels/print`
**DB models**: `LabelTemplate` + `LabelPrintJob` (`packages/db/prisma/schema.prisma`)
**Test count**: 14 unit (service)

---

## 1. Bu nima?

Magaza zali yoki ombor uchun mahsulotlarga shtrix-kodli labellarni chop
etish kerak. Har bir label'da:
- Mahsulot nomi
- Narx
- Shtrix-kod (EAN13 / CODE128 / QR)
- Artikul

Klerk:
1. **Shablon** tanlaydi (qog'oz formati, cols × rows, label o'lchami)
2. **Mahsulotlar + miqdor**larni qo'shadi (masalan, iPhone × 5, AirPods × 10)
3. **Preview**'ni ko'radi — sahifa qanday ko'rinishini tekshiradi
4. **Chop etish** tugmasini bosadi — brauzer print dialog ochiladi
5. Print job ixtiyoriy audit'ga yoziladi

---

## 2. Ikki tushuncha: Shablon va Print Job

### LabelTemplate (Shablon)

Bu **qayta foydalanilishi mumkin** bo'lgan layout konfiguratsiyasi:
- pageSize: A4 / A5 / A6 / custom (custom uchun width + height)
- cols × rows: tarmoq o'lchami (masalan 3×8 = 24 label per sahifa)
- marginTopMm, marginLeftMm: chetlashlar
- columnGapMm, rowGapMm: cell'lar orasidagi bo'shliqlar
- labelWidthMm, labelHeightMm: har label o'lchami
- includeName / includePrice / includeBarcode / includeArticle: qaysi maydonlar bosilsin
- headerText: sahifa boshidagi sarlavha (do'kon nomi)
- barcodeFormat: EAN13 / CODE128 / QR

Shablonlar **Sozlamalar** ostida boshqariladi (`/settings/label-templates`). Bir marta yaratasiz, ko'p marta ishlatasiz.

### LabelPrintJob (Print tarixi)

Bu **audit yozuv**: kim, qachon, qaysi shablonni, qaysi mahsulotlarni,
nechta chop etgan. Snapshot bilan saqlanadi — agar mahsulot keyin
tahrirlansa ham audit yozuv o'zgarmaydi.

Auto-yozish ixtiyoriy (chop etish formada checkbox).

---

## 3. Qachon ishlatamiz?

### Senariy A — Yangi tovar partiyasi keldi

100 ta iPhone keldi, hammasiga shtrix-kod label kerak.

Klerk:
- `/labels/print` ga o'tadi
- Shablon: "A4 3×8 retail" (24 label per sahifa)
- Mahsulot: iPhone 15 Pro Max, qty=100
- Preview → 5 sahifa (24 × 4 + 4 = 100)
- Chop etish → A4 qog'oz × 5 chiqadi

### Senariy B — Yangi narxlar bilan label

Narxlar yangilangan (Sales kampaniyasi). Magazadagi mahsulotlar uchun yangi
labellarni chop etish kerak.

- Shablon: "A4 narxli labellar" (price highlight)
- Mahsulotlar: barchasi (lekin har biri bittadan, qty=1) — masalan 50 ta SKU
- Print → 3 sahifa (24 × 2 + 2)
- Klerk yangi labellarni magazadagi mahsulotlar ustiga yopishtiradi

### Senariy C — Promo aksiya labellari

"Yangi yil" maxsus dizayn label kerak. Klerk yangi shablon yaratadi:
- A6 paper (kichikroq)
- 2×4 tarmoq
- Faqat nom + narx ko'rsatadi (barcode yashirilgan, dizayn maqsadida)
- Header text: "Yangi yil chegirmasi 30%"

Bu shablon faqat aksiya davrida ishlatiladi, oddiy retail shablon
saqlanib qoladi.

### Senariy D — Bulk re-label

Mahsulot artikullari xatolik bilan o'zgartirilgan. Hammasini qaytadan
labellash kerak.

- /labels/print
- "recordJob = true" (audit uchun) 
- Mahsulotlar ro'yxati (200+ SKU)
- Chop etish → har SKU uchun yangi label
- Audit jurnalida "20262-05-12 — 200 ta SKU rebrand uchun chop etildi" yozuvi

---

## 4. Qayerda chiqadi?

### Asosiy joylar

1. **Shablon boshqaruvi**: `Sozlamalar → Label shablonlari`
   — URL: `/settings/label-templates`

2. **Print flow**: `/labels/print` — to'g'ridan-to'g'ri URL yoki
   shablon /[id] sahifasidagi "Bu shablon bilan chop etish →" tugma orqali

3. **Mahsulot kartasi**: kelajakda /products/[id] sahifasida "Chop etish"
   tugmasi qo'shilishi mumkin (mahsulotni avtomat pre-fill bilan)

### Shablon list (`/settings/label-templates`)

| # | Ustun | Misol |
|---|-------|-------|
| 1 | Nom | A4 retail 3×8 |
| 2 | Izoh | Standart retail labellar |
| 3 | Qog'oz | A4 |
| 4 | Tarmoq | 3 × 8 |
| 5 | Label o'lchami | 60 × 30 mm |
| 6 | Shtrix-kod | EAN13 |
| 7 | Holat | Aktiv / Arxivlangan |
| 8 | Yaratilgan | 12.05.2026 |

### Shablon yaratish/tahrirlash sahifasi

- Form (chap tomon): Nom, Qog'oz formati, Tarmoq, O'lchamlar, Maydonlar, Shtrix-kod formati
- **Live preview** (o'ng tomon): tarmoq qanday ko'rinishini scale qilingan ko'rsatadi

### Print sahifa (`/labels/print`)

- Shablon picker
- Mahsulotlar + miqdor (inline list, har qator: product picker + qty input)
- "Tarixga yozish" checkbox
- "Preview ko'rish" tugma
- Render natijasi: A4 sahifa(lar) brauzer print-ready format'da
- "Chop etish" tugma → `window.print()` (brauzer print dialog)

---

## 5. Print rendering

Backend `/labels/render` endpointi:

**Input**: templateId + items[{ productId, quantity }] + recordJob

**Output**:
- template (full config)
- labels[] — quantity bo'yicha fan-out qilingan list. Har label:
  - productId
  - productName
  - article (yoki code agar article yo'q)
  - priceMinor (BigInt string)
  - barcode (birinchi product.barcodes yoki product.code)
- totalLabels
- labelsPerPage (cols × rows)
- pageCount (ceil(total / perPage))

**Client** o'sha datani SVG bar-kodlar bilan render qiladi:
- EAN13 / CODE128 — hash-driven SVG bars (v1 placeholder; production-grade
  uchun jsbarcode library qo'shish kerak)
- QR — 6×6 dot pattern (placeholder)

`@page { size: ... mm; margin: 0 }` CSS qog'oz formatini brauzerga aytadi
— print dialog avtomat to'g'ri o'lchamga moslashadi.

---

## 6. Holat va lifecycle

LabelTemplate:
- `archived=false` (default): print'da ishlatish mumkin
- `archived=true`: arxivga ko'chirildi, print refuses (BadRequestException)
- `deletedAt=NotNull`: butunlay yashirilgan (list'da chiqmaydi)

LabelPrintJob:
- Faqat audit yozuvi — state machine yo'q
- Snapshot bilan stable (mahsulot keyin tahrirlansa ham yozuv o'zgarmaydi)

---

## 7. API endpointlar

### Templates CRUD

```
GET    /api/v1/label-templates              # ro'yxat
GET    /api/v1/label-templates/:id          # bitta
POST   /api/v1/label-templates              # yaratish
PATCH  /api/v1/label-templates/:id          # tahrirlash
POST   /api/v1/label-templates/:id/archive  # arxivga
DELETE /api/v1/label-templates/:id          # soft delete
```

### Print

```
POST   /api/v1/labels/render                # mahsulotlar uchun label data + layout
GET    /api/v1/labels/jobs?limit=50         # print tarixi
```

**Permissions** (`label`):
- view, create, update, delete, print

### Render namunasi

```json
POST /api/v1/labels/render
{
  "templateId": "00000000-0000-0000-0000-0000000000A0",
  "items": [
    { "productId": "...A1", "quantity": 5 },
    { "productId": "...A2", "quantity": 10 }
  ],
  "recordJob": true
}
```

Response (qisqartirilgan):
```json
{
  "template": { "id": "...", "cols": 3, "rows": 8, ... },
  "labels": [
    { "productId": "A1", "productName": "iPhone", "barcode": "1234567890123", ... },
    ... 14 ta label
  ],
  "totalLabels": 15,
  "labelsPerPage": 24,
  "pageCount": 1
}
```

---

## 8. Test coverage

14 unit test (adversarial QA):

**Template CRUD**:
- ✅ Default values applied on create
- ✅ Custom pageSize requires width + height
- ✅ Custom with dims succeeds
- ✅ NotFound for missing template
- ✅ Archive stamps archived=true
- ✅ SoftDelete stamps deletedAt + archived

**Render**:
- ✅ Quantity fan-out (5 × A + 3 × B = 8 labels)
- ✅ Barcode fallback (no barcodes → use code)
- ✅ pageCount = ceil(total / (cols × rows))
- ✅ Missing product IDs rejected
- ✅ Archived template rejected
- ✅ recordJob=true persists audit with snapshot
- ✅ recordJob=false (default) skips audit
- ✅ Layout config returned to client

---

## 9. Kelajakda

- [ ] Real EAN13/CODE128/QR rendering (jsbarcode + qrcode-svg libs)
- [ ] Print labels from product list (right-click → bulk print)
- [ ] Custom field placement per template (drag-drop in template editor)
- [ ] Logo/image upload for header
- [ ] Multi-language labels (uz + ru on same label)
- [ ] Price tag templates (separate from barcode labels)

---

**Tegishli kod**:
- Backend: `apps/api/src/modules/label/`
- Frontend templates: `apps/web/src/app/(app)/settings/label-templates/`
- Frontend print: `apps/web/src/app/(app)/labels/print/`
- i18n: `pages.label_template`, `nav.settings_sidebar.label_templates`
- Permissions: `apps/api/src/modules/permissions/permissions.types.ts` (`label`)
- DB models: `packages/db/prisma/schema.prisma` — LabelTemplate, LabelPrintJob
- Migration: `20260512111343_add_labels`
