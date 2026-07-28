# LOYIHA HOLATI — moysklad 1:1 klon

**Oxirgi yangilanish**: 2026-06-15 (Round 5 · pt16 — /new vizual finishing, 5 commit)

---

> ## ⚠️ BU HUJJAT `main` BRANCH'INI TASVIRLAYDI (banner qo'shildi 2026-07-28, MASTER-TODO #32)
>
> Siz `climart-adoption` branch'idasiz. Adoption climart forkining FE'sini ustiga qo'ygan —
> NEXT.md 2026-07-23l o'zi yozadi: «**HAR Продажи FE fayli farq qiladi**» (demands 1775>1445,
> sales-returns/new 1732>1151). Shuning uchun quyidagi jadvaldagi **Phase-1 «63/67 audit
> qilingan» va Phase-2 «7 cohort»** raqamlari **shu branch'dagi sahifalarga tegishli EMAS** —
> ular boshqa implementatsiyalarni tasvirlaydi. Ularni **yuqori chegara** deb o'qing.
>
> **Bu branch uchun jonli, o'lchangan holat — `docs/MASTER-TODO-100.md`** (157 band, har birida
> dalil ustuni). 2026-07-28 o'lchovi:
>
> | Qatlam | `main` (quyida) | `climart-adoption` (real) |
> |---|---|---|
> | Phase-1 struktura | «~tugadi» 63/67 | **~70%** — climart sahifalari qayta audit qilinmagan (#36/#37) |
> | Phase-2 runtime QA | 7 cohort ✅ | **~15%** — bu branch'da amalda 0 (Blok 2) |
> | Vizual pixel-1:1 | 1 sahifa ~90% | **~5%** — capture korpusi BO'SH, bloklangan (#35) |
> | Hisobotlar | — | **17 / 200+** (#151) |
> | Gate | — | api Vitest **4101/4101 ✅** · web 26 fail (2 hujjatlangan band) |
>
> **Umumiy: ~57%.** Quyidagi tarix VERBATIM saqlanadi — u `main`'ning haqiqiy yo'li.

---

## 🎯 MAQSAD (o'zgarmas)

**Butun ilovani moysklad.uz bilan 1ga-1 (sertifikatlangan parity) qilish** — nafaqat
ishlashi bilan, balki **ko'rinishi bilan ham**: o'lcham, rang, shrift, joylashuv, har bir
filter va tugma, modal oynalar, xulq — hammasi moysklad bilan **farqsiz** bo'lishi kerak.

- **Manba (nusxa olinadigan)**: https://online.moysklad.ru (foydalanuvchining real akkaunti)
- **Sifat qoidasi**: sifat har doim birinchi — tezlik uchun qurbon qilinmaydi
  (`CLAUDE.md`). «Ishlaydi» ≠ «To'g'ri ishlaydi».
- **Halollik qoidasi**: tasdiqlanmagan narsa «done» deb aytilmaydi (`progress.json`,
  honesty-gate). To'liq 1:1 tugaguncha «100%» deyilmaydi.

---

## 📊 UMUMIY PROGRESS — 3 qatlam

Loyiha 3 darajada o'lchanadi. Yuqori darajalar tugagan, eng past (vizual) endi boshlangan:

| Qatlam | Nima | Holat |
|---|---|---|
| **1. Strukturaviy/funksional (Phase-1)** | Har sahifa bor, to'g'ri maydon/label/xulq/wiring | ✅ **~Tugadi** — 63/67 detail + 71 list sahifa audit qilingan |
| **2. Runtime QA (Phase-2)** | Real brauzer + adversarial test (pul/konkurensiya/edge) | 🟡 **Qisman** — 7 cohort QA qilingan; **production-ready EMAS** |
| **3. Vizual pixel-1:1 (HOZIRGI TRACK)** | Aynan moysklad ko'rinishi (px/rang/shrift/xulq) | 🚧 **Endi boshlandi** — 1-sahifa (customer-order /new) ~90% |

> **Muhim halol nuqta:** Ilova **funksional jihatdan juda to'liq** (barcha sahifalar bor,
> audit qilingan, ko'p feature ishlaydi). Lekin **vizual jihatdan aynan moysklad EMAS** —
> bu hozirgi asosiy ish. customer-order /new — birinchi to'liq pixel-parity qilinayotgan
> sahifa; undan keyin ~30+ forma va qolgan sahifalar.

---

## ✅ NIMALAR QILINGAN (asosiy)

**Funksional poydevor (ko'p sessiya):**
- 67 detail + 71 list sahifa qurilgan va Phase-1 audit qilingan (maydon/label/xulq parity).
- Pul-hisobi to'g'rilandi: tiyin-aniqlik (`@moysklad/money`), COGS (weighted-avg),
  valyuta/kurs snapshot, date-timezone klasslari.
- Konkurensiya xavfsizligi: optimistic-lock (56 entity), atomik hujjat-raqamlash,
  TOCTOU atomic-claim (state o'tishlari).
- Auth: JWT + refresh grace-window + RBAC + tenant izolyatsiya (RLS) + record-scope (flag ortida).
- i18n (uz+ru), audit-log/History, pagination, filter-parity (har sahifa).

**Vizual pixel-parity track (2026-06-14 dan, customer-order /new):**
- Kontrol zichlik 27→19px (butun ilova) · header zichlik · ko'k jadval-sarlavhalar (#186999).
- «Канал продаж»/«Адрес доставки» standart maydonlar · «Баланс» caption · sana DD.MM.YYYY.
- **Maxsus maydonlar** («Уста»/«Санаси» доп.поля) — sozlamada yaratiladi, /new'da chiqadi.
- **Maxsus statuslar** («Текширилмаган» kabi) — backend + /new dropdown; jonli E2E tasdiqlangan
  (statusId saqlanadi, ichki FSM `state` buzilmaydi). Real moysklad'ga kirib tekshirilgan.
- **Status ochiladigan ro'yxati** = moysklad rangli-kvadrat popup (har statusda rangli chip+nom);
  shared komponent → barcha ~28 hujjat formasiga avtomat tarqaldi (pt16).
- **Sana «от»** = bitta katak «DD.MM.YYYY HH:MM» + chap kalendar-ikon (oldin 2 quti edi) ·
  **«Сохранить»** oq fon + yashil border (oldin to'la-yashil edi) · **maxsus maydonlar** bitta tekis
  qatorda · **kalendar** «Сегодня»/«Очистить» (RU) — hammasi pt16, shared (boshqa formalarga ham tarqaldi).
- **«Запросить оплату»** tugmasi (header) — saqlaydi → to'lov (Приход) formasini ochadi; jonli E2E tasdiqlangan (pt16).

**Verifikatsiya usuli:** har o'zgarish jonli `:3100` brauzerda + zarur bo'lsa real
moysklad'ga read-only login (parol saqlanmaydi) bilan tasdiqlanadi.

---

## 🚧 HOZIRGI FOKUS + QOLGAN ISH

**Hozir**: customer-order /new sahifasini to'liq pixel+xulq 1:1 qilish (namuna sahifa).

**customer-order /new'da pt16'da TUGAGAN (6 commit, browser-cert) — endi BARCHA ko'rinadigan element moysklad bilan mos:**
- ✅ Rangli-kvadrat ochiladigan status ro'yxati (`20e0ab73`) · ✅ sana bitta katakka «DD.MM.YYYY HH:MM»
  + chap kalendar-ikon (`4337d298`) · ✅ «Сохранить» oq fon+yashil border (to'la-yashil emas, `4337d298`) ·
  ✅ maxsus maydonlar bitta tekis qatorda (`de653444`) · ✅ kalendar popover «Сегодня»/«Очистить» (`6a3f6783`) ·
  ✅ «Запросить оплату» tugmasi — saqlaydi→to'lov formasini ochadi, jonli E2E tasdiqlangan (`c1fc8715`).

**customer-order boshqa sahifalarda pt16'da TUGAGAN (browser-cert):**
- ✅ Buyurtmani **ochib ko'rish** sahifasida custom status (qizil «Текширилмаган» va h.k.) ko'rsatiladi (`94935019`,
  E2E: status tanlash→saqlash→reload saqlandi). · ✅ **«Настроить статусы» sozlama oynasi** — `/settings/customer-order-statuses`,
  statuslarni o'zi yaratish/o'chirish (`545f8743`, E2E: yaratish+o'chirish).

**customer-order — oxirgi 4 item JONLI moysklad.uz bilan ground qilinib HAL qilindi (`4638a9d7`):**
- ✅ «Внешний код» /new'ga qo'shildi (pastki-chap ko'k havola→input, moysklad'dek) · ✅ detail «План. дата отгрузки»
  DatePicker'ga o'tdi (DD.MM.YYYY) · ✅ shrift FARQ YO'Q (moysklad ham «Helvetica Neue» — biz mos) · ✅ org-account
  funksional ekvivalent (picker vs «Сум» dropdown — juda mayda).
- **Qolgan yagona mayda:** org-account ko'rsatish uslubi (agar user sezsa, named-dropdown qilish mumkin). Absolyut
  sub-piksel overlay-diff qilinmadi, lekin ko'rinadigan farq topilmadi. Halollik uchun «mutlaq 100%» deb yozilmaydi.

**Keyin**: shu paketni qolgan ~30 hujjat formasiga + barcha sahifalarga yoyish, keyin
Phase-2 runtime QA, keyin production-ready (staging + monitoring).

> To'liq batafsil navbat va har sessiya tafsiloti: [`NEXT.md`](../NEXT.md) →
> «Aniq keyingi vazifa». Tarix: `docs/audits/`, memory `session-*.md`.

---

*Bu hujjat sessiya yakunida yangilanadi. Mashina-o'qiydigan raqamlar: `docs/progress.json`.*
