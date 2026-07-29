# Yacheyka diapazon-generatori — dizayn

**Sana:** 2026-07-29 · **Branch:** `climart-adoption` · **Holat:** tasdiqlangan, implementatsiya kutilmoqda

## Muammo

Hozir yacheykalarni **faqat bittalab** yaratish mumkin. `StoreAddressService.createCell`
ning butun kodda bitta chaqiruvchisi bor (`POST /admin/stores/:id/cells`) va u bitta
`{name, zoneId, barcode, sortOrder}` oladi. FE'da «+ Ячейка» bitta qoralama qator
ochadi.

Ommaviy yaratishning **hech qanday** yo'li yo'q: diapazon generatori ham, CSV import
ham, ko'p qatorli joylashtirish ham. Real ombor uchun (masalan 5 qator × 10 stellaj ×
4 polka = 200 yacheyka) bu amalda ishlamaydi.

## Egasi bilan kelishilgan qarorlar (2026-07-29)

1. **Nom tuzilishi:** moslashuvchan shablon — `{a}-{b}-{c}`, har o'zgaruvchiga alohida
   diapazon. Qat'iy 2/3/4 bo'g'inli variantlar rad etildi, chunki moslashuvchan shakl
   ularning hammasini qoplaydi.
2. **Zona:** shablonning tanlangan o'zgaruvchisi zona nomiga aylanadi; yetishmayotgan
   zonalar avtomat yaratiladi, mavjudi qayta ishlatiladi. («Hammasi bitta zonaga» va
   «zonasiz» variantlari rad etildi — birinchisi ombor kengayganda foydasiz, ikkinchisi
   zonalar jadvalini bo'sh qoldiradi.)
3. **Takrorlar:** mavjud nomlar **o'tkazib yuboriladi**, qolganlari yaratiladi. Generator
   shu bilan idempotent va qayta ishlatiladigan bo'ladi (ombor kengayganda). Oldindan
   ko'rishda «yangi / mavjud» soni ko'rsatiladi.

## Tanlangan yondashuv

**Backend yoyadi; oldindan ko'rish o'sha endpointning `dryRun` rejimi.**

FE faqat *retsept* yuboradi, backend uni nomlarga yoyadi. Oldindan ko'rish alohida
endpoint EMAS — bir xil endpoint `dryRun: true` bilan chaqiriladi va yozuv qadamini
o'tkazib yuboradi.

**Nima uchun shunday.** Muqobil variant — FE yoyib, tayyor nomlar ro'yxatini yuborishi
edi. Uning yagona ustunligi «darhol oldindan ko'rish» bo'lardi, lekin «mavjud/yangi»
bo'linishini bilish uchun baribir serverga murojaat kerak — ya'ni ustunlik yo'qoladi.
Uchinchi variant (FE ham, BE ham yoyadi) **ataylab rad etildi**: bir xil matematikaning
ikkita implementatsiyasi shu loyihada qayta-qayta chiqqan bug-klass (kontragent balansi
4 xil joyda qayta hisoblanib 4 xil son berardi — `counterparty-settlement` bilan
2026-07-28 da yopildi).

**Kalit xossa:** oldindan ko'rish va yaratish jismonan bir xil kod yo'lidan o'tadi,
shuning uchun «400 ta yangi» deb ko'rsatib boshqacha ish qilishi mumkin emas.

## Arxitektura

| Fayl | Holat | Vazifa |
|---|---|---|
| `modules/store/cell-range.util.ts` | **yangi** | Retseptni nomlar ro'yxatiga yoyadi. Sof funksiya — DB yo'q |
| `modules/store/cell-range.util.test.ts` | **yangi** | Yoyish matematikasi (DBsiz) |
| `modules/store/store-address.schema.ts` | tahrir | `BulkCreateCellsSchema` |
| `modules/store/store-address.service.ts` | tahrir | `bulkCreateCells()` |
| `modules/store/store.controller.ts` | tahrir | `POST :id/cells/bulk` |
| `components/stores/cell-range-modal.tsx` | **yangi** | FE oynasi |
| `components/stores/address-storage-section.tsx` | tahrir | Tugma + oynani ulash |
| `messages/{ru,uz}.json` | tahrir | `pages.stores.address_storage.range_*` kalitlari |

Yoyish mantig'i **faqat** `cell-range.util.ts` da. Servis uni chaqiradi; boshqa hech kim
takrorlamaydi.

Mavjud `createCell` **o'zgarmaydi** — bittalab yaratish ishlab turaveradi.

## Yoyish kontrakti

```ts
type RangeVariable =
  | { key: string; kind: 'number'; from: number; to: number; pad?: number }
  | { key: string; kind: 'letter'; from: string; to: string };

interface CellRangeSpec {
  template: string;              // "{qator}-{stellaj}-{polka}"
  variables: RangeVariable[];
  zoneFrom: string | null;       // qaysi o'zgaruvchi zona nomi bo'ladi
}
```

**Qoidalar:**

- Shablondagi har `{key}` **aynan bir marta** e'lon qilingan bo'lishi shart. E'lon
  qilinmagan `{key}` → xato (jim qolmaydi). E'lon qilingan-u shablonda ishlatilmagan
  o'zgaruvchi ham → xato.
- `zoneFrom` — `variables` dagi mavjud `key` yoki `null`.
- `kind: 'number'`: `from ≤ to`, ikkalasi ham butun ≥ 0. `pad` 0–6 (nol bilan to'ldirish).
- `kind: 'letter'`: `from`/`to` — bitta katta harf `A`–`Z`, `from ≤ to`.
- **Aylanish tartibi:** `variables` dagi **birinchi** o'zgaruvchi eng sekin aylanadi
  (`01-A-1, 01-A-2, 01-A-3, 01-A-4, 01-B-1 …`). Bu inson kutgan tartib.
- **Chegara:** jami 5000 tadan oshsa xato («7 200 ta chiqadi, chegara 5 000»).
  Sabab: bitta tranzaksiyada oqilona hajm; kattaroq ombor bir necha marta yuritiladi.
- Hosil bo'lgan nom 255 belgidan oshmasligi kerak (`StoreCell.name` chegarasi).
- `variables` bo'sh bo'lsa → xato (u holda oddiy `createCell` ishlatilsin).

## API

`POST /admin/stores/:id/cells/bulk` · ruxsat: `store` / `update`

**So'rov:** `CellRangeSpec` + `dryRun: boolean` (default `false`).

**`dryRun: true`** — hech narsa yozmaydi:

```jsonc
{
  "total": 4000,
  "toCreate": 400,
  "existing": 3600,
  "zonesToCreate": ["03"],              // hali mavjud bo'lmagan zona nomlari
                                        // (zoneFrom null bo'lsa — bo'sh massiv)
  "sample": ["03-A-1", "03-A-2", "…"]   // YARATILADIGANLARIDAN dastlabki 10 ta
}
```

**`dryRun: false`** — bitta tranzaksiyada:

1. Yoyilgan nomlar bo'yicha mavjud yacheykalarni **bitta** so'rov bilan o'qiydi.
2. Yetishmayotgan zonalarni `tx.storeZone.createMany({ skipDuplicates: true })` bilan
   yaratadi, so'ng ularning id'larini bitta `findMany` bilan o'qib oladi.
   ⚠️ Mavjud `createZone()` metodi bu yerda **ishlatilmaydi**: u `this.prisma.client`
   ga bog'langan (tranzaksiyaga moslashmagan), shuning uchun uni chaqirish yozuvlarni
   tranzaksiyadan tashqarida qoldirardi va post yiqilganda zonalar «yetim» qolardi.
3. Faqat **yangi** yacheykalarni `createMany({ skipDuplicates: true })` bilan yozadi.
4. Qaytaradi: `{ created, skipped, zonesCreated }`.

`skipDuplicates` ikkala jadvalda ham ishonchli, chunki DB darajasida unikal cheklov
bor: `StoreCell @@unique([storeId, name])` va `StoreZone @@unique([storeId, name])`.
Ya'ni parallel sessiya bir vaqtda o'sha nomni yaratib qo'ysa ham tranzaksiya
yiqilmaydi — bu servis-darajali `assertCellNameFree` tekshiruviga emas, haqiqiy
cheklovga tayanadi.

Ikkala rejim ham **bir xil** yoyish + mavjudlarni ajratish funksiyasini chaqiradi;
farq faqat oxirgi yozuv qadamida.

## Frontend

Yangi `cell-range-modal.tsx`; tugma «+ Ячейка» yonida (`address-storage-section.tsx`),
«Scan»/«Sanash» tugmalari bilan bir uslubda.

**Xulqi:**

- O'zgaruvchi qatorlari **shablondan avtomat** chiqadi: `{nom}` yozilsa qator paydo
  bo'ladi, o'chirilsa yo'qoladi. Har qator: `raqam | harf` tanlovi, `from`, `to`,
  raqam uchun `pad`.
- Zona tanlagichi — shablon o'zgaruvchilari ro'yxati + «zonasiz».
- Oldindan ko'rish `dryRun` chaqiruvi bilan, **debounce 400 ms**.
- Yaratish tugmasi sonni o'zida ko'rsatadi; `toCreate === 0` bo'lsa o'chirilgan.
- Muvaffaqiyatdan keyin: oyna yopiladi, `address-storage` so'rovi invalidatsiya
  qilinadi, toast — «400 ta yaratildi, 3600 ta o'tkazildi».

Server rejimi (`storeId` bor) uchun. Yangi ombor yaratish rejimida (drafts) tugma
ko'rsatilmaydi — u yerda ombor hali saqlanmagan.

## Xatolar

| Holat | Javob |
|---|---|
| Shablonda e'lon qilinmagan `{x}` | 400 — «`{x}` uchun diapazon berilmagan» |
| E'lon qilingan-u ishlatilmagan o'zgaruvchi | 400 — o'zgaruvchi nomi bilan |
| `from > to`, harf `A–Z` dan tashqari, `pad` chegaradan tashqari | 400 — aniq o'zgaruvchi nomi bilan |
| Jami > 5000 | 400 — haqiqiy son va chegara bilan |
| Nom > 255 belgi | 400 — namunasi bilan |
| `zoneFrom` mavjud o'zgaruvchiga ishora qilmasa | 400 |
| Parallel yaratish | `createMany({ skipDuplicates: true })` |

Barcha validatsiya xatolari `dryRun` da ham chiqadi ⇒ foydalanuvchi yaratish tugmasini
bosishdan oldin ko'radi, yarim yozilgan holat bo'lmaydi.

## Testlar

**`cell-range.util.test.ts` (sof, DBsiz)**

- bitta o'zgaruvchi · to'rtta o'zgaruvchi
- aylanish tartibi (birinchi o'zgaruvchi eng sekin)
- `pad`: `1 → "01"`, `pad: 0` → `"1"`
- harf diapazoni `A–E`; `A–Z` dan tashqari → xato
- `from > to` → xato
- e'lon qilinmagan `{x}` → xato · ishlatilmagan o'zgaruvchi → xato
- 5000 chegarasi: 5000 o'tadi, 5001 xato
- 255 belgidan uzun nom → xato
- `zoneFrom` bo'yicha zona nomi to'g'ri chiqishi

**`store-address.schema.test.ts` (mavjud faylga qo'shiladi)** — Zod validatsiyasi.

**Runtime (jonli DB, bir martalik skript)**

- `dryRun` bergan `toCreate` soni **haqiqiy** yaratish sonига teng
- qayta ishga tushirish → `created: 0`, `skipped: hammasi`
- zonalar avtomat yaratilishi va mavjudi qayta ishlatilishi
- yaratilgandan keyin `GET address-storage` da yacheykalar ko'rinishi

Eng muhim test — **`dryRun` va haqiqiy yaratish bir xil sonni beradi**: bu butun
dizaynning kalit xossasi.

## Qamrovdan tashqarida

- CSV/Excel import (keyinchalik shu endpoint ustiga qurish mumkin)
- Shtrix-kod avtomat generatsiyasi — yaratilgan yacheykalar shtrix-kodsiz bo'ladi;
  mavjud «Этикетка» chop etish oqimi o'zgarmaydi
- Ommaviy **o'chirish** / qayta nomlash
- Diapazon shablonini saqlab qo'yish (preset)
