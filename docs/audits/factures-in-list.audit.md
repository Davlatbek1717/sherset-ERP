# factures-in — LIST parity audit (Cohort L3)

**Status:** Phase-1 (strukturaviy audit, runtime-tasdiqlanmagan) — **browser-smoke YO'Q**.
**Ground-truth (§4):** capture `02-module/facturein` final list-grid `<th>` (read myself): `№·Время·Контрагент·Организация·Сумма·Входящий номер·Входящая дата·Отправлено·Напечатано·Комментарий`.

## A. Structural / column deltas

- **FIXED — counterparty «Поставщик» → «Контрагент»** (`tFields('supplier')` → `tFields('agent')`, page.tsx:288). §4.
- **FIXED — currency column removed from default-visible** (capture has no «Валюта»; definition kept).
- Date column already «Время»; facture-specific columns (incoming number/date) are confirmed_mirrors.
- **DEFER (uncertain) — default-visible column set vs capture** (vatSum present in ours, «Отправлено»/«Входящая дата» column presence/order): engine verdict UNCERTAIN → not applied; deferred for capture re-confirmation.

## B. Interactive deltas

- Toolbar/bulk via shared shell. No confirmed interactive deltas.

## Gates
typecheck 0 · biome 0/0 · i18n ru+uz ✓ · web Vitest 1306 green (no regress).

---

## 2026-07-31 — DEFER bandi aniq o'lchandi (hali ham OCHIQ)

Yuqoridagi «DEFER (uncertain)» bandi bugun prod-QA sessiyasida qayta ko'rildi.
Farq **taxmin emas, o'lchangan** — lekin verdikt hali ham noaniq, shuning uchun
o'zgartirilMADI.

**Ground-truth (§4):** `№·Время·Контрагент·Организация·Сумма·Входящий номер·
Входящая дата·Отправлено·Напечатано·Комментарий` (10 ta)

**Bizda standart ko'rinadigan** (`useColumnVisibility('factures-in', …)`, 9 ta):
`name · moment · incomingNumber · agent · organization · sum · vatSum · supply · printed`

**Barcha ta'riflangan ustunlar** (12 ta): yuqoridagilar + `currency · state · description`

| # | Farq | Tafsilot |
|---|------|----------|
| 1 | `incomingNumber` **joyi** | Bizda 3-o'rinda, GT'da 6-o'rinda |
| 2 | `Входящая дата` | Ustun **umuman ta'riflanmagan** |
| 3 | `Отправлено` | Ustun **umuman ta'riflanmagan** |
| 4 | `Комментарий` | Ta'riflangan, lekin standart ko'rinmaydi |
| 5 | `vatSum` + `supply` | Bizning qo'shimchalarimiz, standart ko'rinadi |

**Nega hali ham tuzatilmadi:** 2 va 3 yangi ustun qurishni talab qiladi (backend
maydonlari bor-yo'qligi tekshirilmagan), 1 va 4 esa capture'ning o'sha paytdagi
foydalanuvchi sozlamasi bo'lishi mumkin (grid `<th>` foydalanuvchi yoqqan
ustunlarni ham ko'rsatadi — standart to'plamni isbotlamaydi).

**Yopish uchun kerak:** moysklad'ga kirib `#facturein` ni TOZA holatda
(ustun sozlamalari default'ga qaytarilgan) qayta capture qilish.

> Solishtirish uchun: shu sessiyada `supplies` va `purchase-returns` da xuddi
> shunday ustun-tartib nuqsoni tuzatildi — u yerda GT ishonchli edi va
> qo'shimchalarimiz shunchaki noto'g'ri joyda turardi, yangi ustun kerak emasdi.
