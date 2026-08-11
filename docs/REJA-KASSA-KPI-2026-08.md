# REJA — kassani topshirish → kassir KPI'si · 2026-08-11

> ⚠️ **Bu reja `docs/REJA-KASSA-PROD-2026-08.md` ichiga singdirilgan** (o'sha kunning o'zida,
> egasi kassani to'liq tayyorlash bo'yicha kengroq reja so'ragach). K1–K2 u yerda **FAZA P9**,
> K2 ning smena-yopish qismi **FAZA P4**, qolgan kontekst esa o'lchov sifatida qoladi.
> Yangi sessiya FAQAT `REJA-KASSA-PROD` fazalaridan boshlasin — bu fayl endi ma'lumotnoma.

> **Bu reja ko'p sessiyaga bo'lingan.** Har faza — ALOHIDA sessiya. Agent shu faylni o'qiydi,
> FAQAT o'z fazasini bajaradi, hisobotini pastga yozadi va **to'xtaydi**.
> Qoidalar `docs/REJA-KASSIR-EXE-2026-08.md` §0 bilan bir xil (Opus · halol status · aniq
> `git add` · «browser-smoke YO'Q» ochiq yoziladi).

---

## 0. Egasining qoidasi (2026-08-11)

> «Kassani topshirish kassirlarning KPI'si hisoblanadi.»

Ya'ni smena yopish — bu shunchaki hujjat emas, **kassirning bahosiga kiradigan o'lchov**.
Menejer tasdig'i ham shu maqsadga xizmat qiladi: qabul = «dalilni ko'rdim», ball esa
o'lchovdan chiqadi.

---

## 1. HOZIRGI HOLAT — o'lchangan (taxmin emas)

Prod (`erp.sherset.uz` · `sherset_v2`), 2026-08-11 da o'lchandi. Sxema: **223 migratsiya,
«up to date»**.

### Bor va ishlaydi ✅

| Bo'g'in | Dalil |
|---|---|
| Kassir smena yopishi | POS «Smena» tab: kutilgan naqd → sanoq → **farq darhol** → izoh → `POST /cashier-sessions/:id/close` |
| Dollar yashiq alohida | `closingCashUsdMinor` — so'mga o'girilmaydi; `null` = «sanalmagan» ≠ `0` |
| Z-hisobot | `GET /cashier-sessions/:id/z-report` — ekran (`/retail/sessions/[id]`) va 72mm chek (`/print/z-report/[id]`) **bir manbadan** |
| **To'lov turlari kesimi** | `RetailSalePayment` bo'yicha `method × currency` guruhlash; kursi yo'q valyuta jamiga kirmay alohida ko'rsatiladi |
| Menejer qabul qilishi | `/menejer/smenalar` · `GET acceptance/queue` · `POST acceptance/:id/transition`; FSM: `pending → accepted/rejected/escalated/force_accepted/stale`; 3 kundan oshsa **avtomatik egaga** |
| Qabul summalarga tegmasligi | servis darajasida qulflangan (menejer raqamni tuzata olmaydi) |
| Farq akti | `CashierSessionVariance` + «tan olish» |
| **KPI dvigateli tirik** | `EmployeeDailyKpi` **120 qator** (2026-08-03…08-10), `HrKpiDailyLog` 255 qator; cron har kuni **00:40** (Toshkent) |
| **Kassa farqi KPI metrikasi** | `till_variance_abs` — `CashierSession.discrepancyMinor` MODULI, `lower_better` (`kpi-metrics.ts`, `employee-daily-kpi.service.ts:331`) |

Ya'ni «kassani topshirish KPI'ga kiradi» qoidasi **kodda allaqachon bor**.

### Uzilgan bo'g'inlar 🔴

| № | Bo'shliq | O'lchov |
|---|---|---|
| **B1** | **Hech bir smena hech qachon YOPILMAGAN** | 3 ta smena, uchalasi ham `state=open`; biri (Admin User) **2026-08-01 dan beri ochiq**. `closedAt`/`discrepancyMinor` = NULL |
| **B2** | **`KpiProfile` = 0 qator** | Metrika o'lchanadi, lekin **maqsad va og'irlik yo'q** ⇒ ball chiqmaydi. `till_variance_abs` hech qaysi profilda emas |
| **B3** | **Menejer aktyori yo'q** | Hech kimda `hrRoles=['manager']` yo'q edi; katalogda `manager` qiymati ham yo'q edi (2026-08-11 da qo'shildi). `resolveShiftActor` har kimni «kassir» deb qaytarardi |
| **B4** | Qabul hodisalari 0, farq aktlari 0 | B1 ning natijasi — yopilmagan smenani qabul qilib bo'lmaydi |
| **B5** | Kassir cheklari `posted` emas | Kassir smenalarida 4 ta `RetailSale` bor, lekin `salesCount=0` va to'lov yozuvi YO'Q (yagona to'lov — Admin User ning 08-01 dagi cheki) |

**Xulosa:** qurilishi kerak bo'lgan yangi funksiya deyarli yo'q. Kerak bo'lgani — **profil
qiymatlarini kiritish, zanjirni bir marta uchdan-uchgacha yugurtirish va uzilgan joyini
tuzatish**.

---

## 2. Fazalar

| Faza | Nomi | Tegadigan joy | Deploy | Holat |
|---|---|---|---|---|
| **K1** | Kassir KPI profili (metrikalar · og'irlik · maqsad) | prod ma'lumot + kerak bo'lsa UI | ehtimol yo'q | ☐ |
| **K2** | Uchdan-uchgacha jonli sinov: chek → smena yopish → farq → KPI | — (o'lchov) | yo'q | ☐ |
| **K3** | K2 da topilgan uzilishlarni tuzatish | kodga bog'liq | ha | ☐ |
| **K4** | Kunlik qabul: kim, qachon, qanday eslatma | manager/kpi + bildirishnoma | ha | ☐ |

---

## FAZA K1 — Kassir KPI profili

**Muammo:** `KpiProfile` jadvali **bo'sh**. Profil bo'lmasa `employee-daily-kpi.service`
metrikani o'lchaydi, lekin `targets`/`weights` bo'sh map bo'ladi ⇒ **ball hisoblanmaydi**.
Profil qidiruv tartibi: xodim → lavozim → sukut profili → yo'q.

**Vazifalar:**
1. «Kassir» lavozimi uchun profil yaratish (lavozim 2026-08-11 da yaratildi).
2. Metrikalarni tanlash — mavjud kassa metrikalari:
   `cash_revenue` · `receipt_count` · **`till_variance_abs`** · `discount_given` ·
   `below_cost_count` · `below_cost_loss` · `cancel_count` · `refund_count` ·
   `cash_gross_profit` · `credit_given`.
3. Har biriga **og'irlik** (%) va **maqsad** qiymati. 🔴 Egasi tasdiqlaydi — taxmin qilinmaydi.
4. `EmployeeKpiTarget` muhri shartnomasi: maqsad **faqat `create` da muhrlanadi**
   (xotira: `daily-kpi-target-seal-create-only`) — tarix qayta yozilmaydi.
5. Birlik tuzog'i: maqsad **so'mda kiritiladi, tiyinda saqlanadi**
   (xotira: `kpi-target-unit-contract-asymmetric`).

**Tugash mezoni:** profil prodda, kamida bitta kassir uchun ball hisoblanadigan holatda.

---

## FAZA K2 — Uchdan-uchgacha jonli sinov

**Nima o'lchanadi (har qadam alohida dalil bilan):**
1. Kassir POS'ga PIN bilan kiradi → smena ochadi.
2. Kamida 2 chek: biri **naqd**, biri **aralash (naqd + karta/QR)** — to'lov turlari kesimi
   Z-hisobotda haqiqatan bo'linishini ko'rish uchun.
3. Smena yopiladi — **ataylab farq qoldiriladi** (masalan 5 000 kam sanaladi).
4. Tekshiriladi: `closedAt` · `expectedCashMinor` · `discrepancyMinor` · farq akti yaratildimi ·
   `acceptanceState = pending` bo'ldimi.
5. Z-hisobot chop etiladi — to'lov turlari qatorlari bormi.
6. Ertasi kuni 00:40 dan keyin: `EmployeeDailyKpi` da o'sha kassir uchun `till_variance_abs`
   qatori paydo bo'ldimi va **ball** chiqdimi.
7. Menejer (yoki egasi) qabul qiladi → jurnalga yozildimi.

🔴 **B5 shubhasi shu yerda hal bo'ladi:** kassir cheklari `posted` bo'lmasa (`salesCount=0`),
KPI ham, Z-hisobot ham bo'sh chiqadi. Sabab K2 da aniqlanadi.

---

## FAZA K3 — Uzilishlarni tuzatish

K2 natijasiga bog'liq. Ehtimoliy nomzodlar (hozircha **tasdiqlanmagan**):
- cheklarning `posted` holatiga o'tmasligi (B5);
- 08-01 dan beri ochiq qolgan smena — «unutilgan smena» uchun himoya yo'qligi;
- KPI kunining chegarasi (xotira: `hr-kpi-daily-date-off-by-one` — `hr-kpi.service.ts:55`
  yorlig'i bir kun orqada, ataylab tuzatilmagan qarz).

---

## FAZA K4 — Kunlik qabul tartibi

1. Menejer hisobi (yoki egasi) — kim qabul qiladi.
2. Eslatma: menejer qabul qilmagan smenalar uchun kunlik xabar (Telegram/brifing) —
   `manager/briefing` moduli bor, **kassa smenasi u yerga ulanganmi — tekshirilmagan**.
3. 3 kunlik avtomatik eskalatsiya allaqachon bor — jonli tasdiqlanadi.

---

## HISOBOTLAR

> Shablon `docs/REJA-KASSIR-EXE-2026-08.md` dagi bilan bir xil.

### K1 — ☐ hali bajarilmagan
### K2 — ☐ hali bajarilmagan
### K3 — ☐ hali bajarilmagan
### K4 — ☐ hali bajarilmagan
