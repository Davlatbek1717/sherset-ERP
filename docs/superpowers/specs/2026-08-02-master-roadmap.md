# MASTER ROADMAP — 8 bo'limli tizim TZ'sining bajarish tartibi

**Sana:** 2026-08-02 · **Holat:** egasi tomonidan tasdiqlangan

> Bu hujjat — 8 ta bo'lim TZ'sining **bajarish tartibi**. TZ'larning o'zi alohida hujjatlarda.

## Bo'limlar TZ'lari

| # | Bo'lim | Hujjat |
|---|---|---|
| 1 | Kassa | [2026-08-01-kassa-tz-design.md](2026-08-01-kassa-tz-design.md) |
| 2 | Onlayn sotuv / B2B / B2G | [2026-08-01-onlayn-sotuv-b2b-b2g-tz-design.md](2026-08-01-onlayn-sotuv-b2b-b2g-tz-design.md) |
| 3 | Analitika | [2026-08-01-analitika-tz-design.md](2026-08-01-analitika-tz-design.md) |
| 4 | Menejer | [2026-08-01-menejer-tz-design.md](2026-08-01-menejer-tz-design.md) |
| 5 | Ta'minotchilar | [2026-08-01-taminotchilar-tz-design.md](2026-08-01-taminotchilar-tz-design.md) |
| 6 | HR | [2026-08-02-hr-tz-design.md](2026-08-02-hr-tz-design.md) |
| 7 | Ombor | [2026-08-02-ombor-tz-design.md](2026-08-02-ombor-tz-design.md) |
| 8 | Ko'p filiallilik | [2026-08-02-kop-filiallilik-tz-design.md](2026-08-02-kop-filiallilik-tz-design.md) |

---

## Tartib tamoyili

Tartib **bo'lim-bo'lim emas, bog'liqlik bo'yicha**. Sabab: 3-bo'lim (Analitika) 1-bo'lim yozadigan
ma'lumotsiz ishlay olmaydi; 6-bo'lim bonusi 1- va 2-bo'limlar o'lchovisiz hisoblanmaydi.
Bir bo'limni oxirigacha qilib keyingisiga o'tish — noto'g'ri yo'l.

Ustuvorlik mezonlari (yuqoridan pastga):
1. **Buzuq/noto'g'ri ishlayotgan narsa** — ma'lumot yaxlitligi va yolg'on raqamlar
2. **Poydevor** — boshqa hamma narsa shunga tayanadi
3. **Keyin qilinsa qimmatlashadigan** struktura qarorlari
4. **Kundalik operatsion qiymat**
5. **Uzoq muddatli imkoniyatlar**

---

## To'lqin 0 — Buzuq narsalar 🔴

| # | Ish | Bo'lim | Nega birinchi |
|---|---|---|---|
| 0.1 | `RetailSaleStateSchema` ga `picking` + `ready` qo'shish | 1-B1 | POS'ning «Yig'ilmoqda»/«Tayyor» ro'yxatlari **hozir 400 qaytaradi**; `mark-ready` ishlaydi, lekin kassir natijani ko'rmaydi |
| 0.2 | `online-order.convertToCustomerOrder` soxta UUID | 2-B1 | Bazaga **hech qayerga ishora qilmaydigan** havola yoziladi — ma'lumot yaxlitligi buzilishi |

## To'lqin 1 — O'lchov poydevori 🟠

| # | Ish | Bo'lim | Nega |
|---|---|---|---|
| 1.1 | `RetailSalePosition.costMinor` + `basePriceMinor` muzlatish; savat qatorida tan narx / optom / foyda | 1-B2 | Egasining eng ko'p so'ragan xususiyati; foyda, chegirma, bonus, analitika — hammasi shunga tayanadi |
| 1.2 | `profitability` tuzatish (`0::bigint AS cost`) + «tan narx yig'ilmagan» belgisi | 3-B2 | Hozir har kassa cheki **100% marja** bilan ko'rsatiladi va shu asosda qaror qabul qilinadi |
| 1.3 | `CashierAuditEvent` | 1-B8 | «Erkinlik + nazorat» modelining nazorat yarmi — usiz erkinlik nazoratsizlik |
| 1.4 | `report/metrics/` — yagona formulalar qatlami | 3-B1 | Ikki hisobot bir savolga ikki javob bermasligi uchun |

## To'lqin 2 — Struktura (keyin qimmat) 🟡

| # | Ish | Bo'lim | Nega hozir |
|---|---|---|---|
| 2.1 | `Branch` modeli + migratsiya + `branchId` muhrlash | 8-B1..B3 | Hozir arzon; keyin **har hujjatni orqaga backfill** qilish kerak bo'ladi |
| 2.2 | `skladNo → StoreZone` (`SkladKeeper.zoneId`) | 7-B1 | 7- va 8-bo'limlar **ikkalasi ham** shunga tayanadi |

## To'lqin 3 — Kassani to'liq yopish 🟢

| # | Ish | Bo'lim |
|---|---|---|
| 3.1 | Aralash to'lov (`RetailSalePayment`, USD kurs, Click/Payme/QR) | 1-B3 |
| 3.2 | Kiosk rejim (`Role.uiMode`) + PIN-qulf + server cheklovi | 1-B4 |
| 3.3 | Qarz to'lovi (PKO) + qarz jurnali simmetriyasi | 1-B5 |
| 3.4 | Xarajat (RKO) + inkassatsiya + smena yopish va farq akti | 1-B6, 1-B7 |
| 3.5 | `sotuv/page.tsx` (1715 satr) modullarga bo'lish | 1-B8 |

## To'lqin 4 — Nazorat 🔵

| # | Ish | Bo'lim |
|---|---|---|
| 4.1 | `EmployeePermission` + amaldagi ruxsat hisobi + 3 qo'riqchi (G1/G2/G3) | 4-B1 |
| 4.2 | HR ruxsatlarini birlashtirish (adapter + migratsiya) | 4-B2 |
| 4.3 | Ruxsat matritsasi UI + rol shablonlari | 4-B3 |
| 4.4 | Tasdiqlash navbati (`ApprovalRule` + `ApprovalItem`) | 4-B4 |
| 4.5 | Rollup jadvallari + cron + qayta qurish CLI | 3-B3 |
| 4.6 | Rol bo'yicha panellar + xodim shaxsiy ekrani | 3-B4, 3-B5 |
| 4.7 | Record-scope 1–2-to'lqin **+ filial filtri birga** | 4-B5, 4-B6, 8-B4 |

## To'lqin 5 — Sotuv va bonus 🟣

| # | Ish | Bo'lim |
|---|---|---|
| 5.1 | Narx dvigateli (shartnoma → mijoz → guruh → default) umumiy servis | 2-B2 |
| 5.2 | Mijoz egaligi: `ownerId` mantiqi, bildirishnoma, 90-kun | 2-B3 |
| 5.3 | Bonus dvigateli (4 qoida) + `BonusAccrual` | 2-B4 |
| 5.4 | Lavozim oylik sxemalari + **kassir korreksiyasi** | 6-B1, 6-B2 |
| 5.5 | Dvigatel → `Payroll` hujjati avtomatik | 6-B3 |

## To'lqin 6 — Ombor migratsiyasi ⚫

| # | Ish | Bo'lim |
|---|---|---|
| 6.1 | Zona/yacheyka generatsiya + backfill + farq hisoboti | 7-B2 |
| 6.2 | Dual-write + kunlik monitoring | 7-B3 |
| 6.3 | Ko'p yacheyka + `isPrimary` + `extraBins` | 7-B4 |
| 6.4 | Yacheyka intizomi (ogohlantirish) + skaner oqimi | 7-B5 |
| 6.5 | Yig'ish `StockByCell` dan + solishtirish testi | 7-B6 |
| 6.6 | Qisman yig'ish + kassirga qaytish + `PickingError` | 7-B7 |

## To'lqin 7 — Qolganlari ⚪

Ta'til va avans (6-B4, 6-B5) · davomat manbalari va avtomatik jarima (6-B6, 6-B7) ·
haydovchi yetkazma/naqd (6-B8) · ta'minotchi oynasi va da'volar (5-B1..B6) ·
voronka, KP, EDO hujjatlari, webhook (2-B5..B9) · joylashtirish taklifi va inventarizatsiya
(7-B8..B12) · tovar tahlili (3-B7, 3-B8) · filial kengaytmalari (8-B5..B7) ·
F2 B2B kabinet, F3 B2C do'kon, F4 marketplace.

---

## Har bosqich uchun qat'iy qoidalar

1. **Bir sessiya = bir bosqich** (+ ehtimol bitta mayda ish) → commit → sessiya yopiladi
   (CLAUDE.md §0.3).
2. **Gate har commitda:** `typecheck 0` · `biome 0` · i18n key-existence (ru+uz) + no-hardcoded ·
   web Vitest regressiyasiz.
3. **Halol yorliq:** brauzerda tekshirilmagan ish **«Phase-1: strukturaviy, runtime-tasdiqlanmagan»**
   deb belgilanadi. «done» / «production-ready» deyilmaydi (CLAUDE.md §1).
4. **Migratsiya bosqichlari qaytariladigan** bo'lishi shart va har biridan keyin tekshiruv hisoboti
   chiqadi (ayniqsa To'lqin 6).
5. **Parallel sessiya protokoli** (CLAUDE.md §6): faqat aniq yo'llar bilan `git add`, o'zga
   o'zgarishlarga tegilmaydi.
