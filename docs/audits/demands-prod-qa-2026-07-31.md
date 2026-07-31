# «Jo'natmalar» (demands) — PROD brauzer-QA, 2026-07-31

> Manba: **real prod** `https://erp.sherset.uz`, Playwright MCP, admin@demo.local.
> Prod commit: `bb517e0`. Har band brauzerda KO'RILGAN (taxmin emas) — qaysi sahifada
> va nima kuzatilgani yozilgan.
> Bu Phase-2 (runtime) ro'yxati; vizual pixel-diff alohida.

---

## 🔴 P0 — PROD UZILISHI (tuzatildi)

| # | Muammo | Holat |
|---|--------|-------|
| 1 | **`GET /api/v1/demands/:id` → 500**, jo'natma detal sahifasi butunlay ochilmasdi. Sabab: deploy kodni `bb517e0` ga surdi, lekin `demand_positions.cell_id/cell` migratsiyasi prod bazasiga QO'LLANMAGAN → Prisma mavjud bo'lmagan ustunni so'radi. | ✅ **TUZATILDI** 2026-07-31: migratsiya SQL prod `sherset_v2` bazasiga qo'lda qo'llandi (idempotent), 500 yo'qoldi, sahifa tiklandi |

### 1a. Sistemli sabab (ochiq)
Deploy buyrug'ida **migratsiya qadami YO'Q**:
```
git fetch … && git reset --hard FETCH_HEAD
  && pnpm --filter @moysklad/money build
  && pnpm --filter @moysklad/web build
  && pm2 restart sherset-v2-web
```
`prisma migrate deploy` chaqirilmaydi va **API ham qayta ishga tushirilmaydi**. Ya'ni har
sxema o'zgarishi shu uzilishni takrorlaydi. Bu — xotiradagi «sherset-v2 schema drift»
bug-klassining yana bir hodisasi.

### 1b. Jarayon barqarorligi (ochiq)
`pm2 list`: **`sherset-v2-web` — 779 marta qayta ishga tushgan**, `sherset-v2-api` — 99.
Crash-loop sababi tekshirilmagan.

---

## 🟠 P1 — i18n: o'zbek interfeysida rus tili

Til «🇺🇿 O'zbek» tanlangan holda quyidagilar **rus tilida** chiqadi.

### Ro'yxat sahifasi (`/demands`)
| # | Element | Hozir | Bo'lishi kerak |
|---|---------|-------|----------------|
| 2 | Qidiruv maydonining nomi (accessible name) | `По умолчанию содержит` | o'zbekcha |

### Detal sahifasi (`/demands/:id`)
| # | Element | Hozir |
|---|---------|-------|
| 3 | № va sana orasidagi ajratgich | `от` |
| 4 | Kalendar tugmasi | `Открыть календарь` |
| 5 | Sana maydonining nomi | `Дата документа` |
| 6 | Sana placeholder | `дд.мм.гггг` |
| 7 | Vaqt maydonining nomi | `Время` |
| 8 | Vaqt placeholder | `чч:мм` |
| 9 | «Rejadagi jo'natish sanasi» placeholder | `дд.мм.гггг` |
| 10 | «Rejalashtirilgan to'lov sanasi» placeholder | `дд.мм.гггг` |
| 11 | Valyuta varianti | `сум (UZS)` |
| 12 | Miqdor birligi | `шт` |

### Jamlanma bloki (`/demands/:id`) — **butun blok rus tilida**
| # | Element |
|---|---------|
| 13 | `Промежуточный итог:` |
| 14 | `НДС:` |
| 15 | `Цена включает НДС` |
| 16 | `Итого:` |
| 17 | `Прибыль:` |
| 18 | `Кол-во: 1` |

> Diqqat: bu blok `packages/design-system` ichida bo'lsa kerak — shuning uchun
> `i18n-no-hardcoded` gate'i (faqat `apps/web/src/app` ni skanlaydi) uni TUTMAGAN.
> Gate qamrovini kengaytirish kerak.

---

## 🟡 P2 — atama nomuvofiqligi

| # | Muammo |
|---|--------|
| 19 | Bitta tushuncha, ikki xil o'zbekcha atama: ro'yxat **ustuni** «Bosib chiqarilgan», o'sha ro'yxatning **filtri** «Chop etilgan» (ikkalasi ham «Напечатано») |
| 20 | Pozitsiya ustunlari: «**NDS**» (rus transliteratsiyasi) va yonida «**QQS** summasi» (o'zbekcha) — bir xil soliq, ikki xil nom |
| 21 | «Skidka» (rus) — o'zbekcha «Chegirma» bo'lishi kerak |

---

## 🟡 P2 — ro'yxat xulqi

| # | Muammo |
|---|--------|
| 22 | «Holat» ustuni ikkala qatorda ham so'zma-so'z «**Status**» chiqaradi — status nomi emas |
| 23 | Ustun tartibi moysklad'dan farq qiladi: bizning qo'shimcha ustunlar («To'lanmagan», «Holat») moysklad ustunlari **orasiga** qo'yilgan, oxiriga emas. Capture tartibi: `№ · Время · Со склада · Контрагент · Грузополучатель · Организация · Сумма · Валюта · Оплачено · Отправлено · Напечатано · Комментарий` |
| 24 | «Yuk qabul qiluvchi» ustuni bo'yicha saralab bo'lmaydi (yonidagi «Kontragent» bo'yicha bo'ladi) |
| 25 | Saralanmaydigan boshqa ustunlar: «Valyuta», «To'lanmagan», «Holat», «Yuborilgan», «Bosib chiqarilgan», «Izoh» |
| 26 | Qator ustiga borilganda faqat «O'chirish» tugmasi chiqadi — moysklad'da kontekst menyu (Изменить / Восстановить / Закрыть) |

---

## 🟡 P2 — davr tanlash tugmalari

| # | Muammo |
|---|--------|
| 27 | «Davr» filtri tugmalari **o'qib bo'lmaydigan qisqartma**: `kech · bug · haf · oy`. «bug» = «bugun» ning kesilgani, «haf» = «hafta». moysklad: `вчера · сегодня · неделя · месяц` |
| 28 | Xuddi shu qisqartmalar «Qachon o'zgartirilgan» filtrida ham takrorlanadi |

---

## 🟠 P1 — mavjud bo'lmagan endpoint

| # | Muammo |
|---|--------|
| 29 | Detal sahifasi `GET /api/v1/demands/:id/position` ni chaqiradi — bunday marshrut YO'Q, har yuklanishda **404 ×3**. Konsol xatosi, foydalanuvchiga ko'rinmasa ham keraksiz so'rov |
| 30 | Har sahifa yuklanishida `GET /api/v1/permissions/me` → **401** |

---

## ✅ Tasdiqlangan — ishlayapti

Shu sessiyada qo'shilgan ishlar prod'da **ko'rindi va ishlayapti**:
- «Yacheyka» ustuni pozitsiya jadvalida (C1)
- «Прибыль» jamlanma qatori (C3) — 6 060,00 ko'rsatdi
- «Yuk jo'natuvchi» va «Boshqa maydonlar» alohida bloklari (D5/N3)
- Ro'yxatda «Yuk qabul qiluvchi» ustuni (L1)
- **«Qaytarish turi» filtri BOR** (Qisman qaytarilgan / Qaytarishsiz / To'liq qaytarilgan)
  → gap-ro'yxatidagi «L2 ataylab rad etilgan» yozuvi **ESKIRGAN**, tuzatish kerak

---

---

## 🔴 P1 — TIZIMLI: dizayn-tizimda qattiq yozilgan rus tili

Yuqoridagi i18n bandlarining ildizi bitta: satrlar `packages/design-system` ichida
**qattiq yozilgan**, tarjima propi yo'q. Ya'ni bu faqat jo'natmalar muammosi EMAS —
**barcha hujjat sahifalariga** tegadi. Kodda tasdiqlangan:

| # | Fayl | Muammo | Ta'sir doirasi |
|---|------|--------|----------------|
| 31 | `document-editor/DocumentTotalsPanel.tsx` | 6 ta rus satri (`Промежуточный итог:` 99, `НДС:` 114, `Цена включает НДС` 133, `Итого:` 138, `Прибыль:` 145, `Кол-во:` 177), label propi YO'Q | **15 ta sahifa** shu komponentni ishlatadi |
| 32 | `document-editor/DocumentHeader.tsx` | `от` (303), `Открыть календарь` (323), `дд.мм.гггг` (341), `Дата документа` (342), `чч:мм` (354) | har bir hujjat detal/yaratish sahifasi |
| 33 | `primitives/DatePicker.tsx` | standart placeholder `дд.мм.гггг` (53) | butun ilova |
| 34 | `document-editor/PositionTable.tsx` | birlik uchun zaxira qiymat `'шт'` (1169) | barcha pozitsiya jadvallari |

### 35. Nega hech bir gate tutmadi
`i18n-no-hardcoded` testi **faqat `apps/web/src/app`** daraxtini skanlaydi.
`packages/design-system` uning qamrovidan tashqarida — shuning uchun butun bug-klass
ko'rinmas bo'lib qolgan. **Gate qamrovini kengaytirish kerak** (aks holda tuzatgandan
keyin ham qaytib keladi).

---

## Metodika eslatmasi
`/demands/new` sahifasi tekshiruv paytida `ChunkLoadError` berdi, LEKIN bu nuqson
EMAS: o'sha payt parallel sessiya deploy qilayotgan edi (`next build` PID 1352631,
11:04 dan) va `.next/static` almashtirilayotgan edi. Build tugagach qayta tekshiriladi.
**Vaqtinchalik deploy holatini nuqson deb yozmaslik kerak.**
