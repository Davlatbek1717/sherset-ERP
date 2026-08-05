# TODO — 0 dan 100% gacha

**Yangilandi:** 2026-08-05 · **Manba:** 9 ta TZ hujjati (to'liq o'qilgan) + [master roadmap](docs/superpowers/specs/2026-08-02-master-roadmap.md) + `NEXT.md`

> Bu fayl — **yagona bajarish ro'yxati**. Hamma katakcha belgilanganda loyiha **100% tayyor**.
> Har TZ'ning har bosqichi (`B1`…`Bn`) shu yerda. Tartib — **bog'liqlik bo'yicha**.
>
> **Qoida:** 1 bosqich = 1 sessiya → commit → sessiya yopiladi (CLAUDE.md §0).
> **Gate:** `typecheck 0` · `biome 0` · i18n ru+uz · Vitest regressiyasiz.
> **Halol yorliq:** brauzerda ko'rilmagan ish «Phase-1», «done» emas.

---

## ⏱️ QACHON TUGAYDI

| | Soni |
|---|---|
| **Qolgan bosqichlar** | **66** |
| Sifat qarzlari | 7 |
| Brauzer-QA (Phase-2) o'tishlari | ~9 (har bo'lim uchun 1) |
| **JAMI ish birligi** | **~82** |

**Hisob:** 1 bosqich ≈ 1 sessiya. Kuniga **1 sessiya** → **~4 oy**; kuniga **2 sessiya** → **~2 oy**;
kuniga **3 sessiya** → **~6 hafta**.

> ⚠️ Bu — **bosqich soni**, soat emas. Ba'zi bosqich (masalan ombor migratsiyasi `B2`,
> ruxsat matritsasi `4-B3`) bir sessiyaga sig'masligi mumkin — u holda ikkiga bo'linadi va
> jami soni oshadi. Har sessiya oxirida shu fayl yangilanadi, ya'ni raqam **jonli** qoladi.

### Bo'limlar bo'yicha qolgan bosqichlar

| Bo'lim | Bajarildi | Qoldi |
|---|---|---|
| 1 — Kassa | B1 B2 B3 B4, **B5-yadro** | **4** (B5-FE, B6–B8) |
| 2 — Onlayn sotuv / B2B / B2G | B1 | **8** (B2–B9) |
| 3 — Analitika | B1, B2 (qisman) | **6** (B3–B8) |
| 4 — Menejer (ruxsatlar) | — | **8** (B1–B8) |
| 4M — Menejer (kunlik KPI) | 4M.1, 4M.2 | **8** (4M.3 qoldig'i + 4M.4–4M.10) |
| 5 — Ta'minotchilar | — | **6** (B1–B6) |
| 6 — HR | B8 (qisman) | **8** (B1–B7, B9) |
| 7 — Ombor | B1 (qisman) | **11** (B2–B12) |
| 8 — Ko'p filiallilik | — | **7** (B1–B7) |

---

## ❓ EGASIDAN QAROR KUTILMOQDA (bloklovchi)

- [ ] **B1. Bonus/jarima formulasi** (4M.3 §4.2) — «kun qabul qilinganda bonus/jarima yoziladi»
      deyilgan, lekin **qancha** yozilmagan. *4M.3 shusiz yopilmaydi.*
- [ ] **B2. Kompozit ball chegarasi 150%** (`SCORE_CAP_PERCENT`) — TZ'da yo'q, men tanladim.
- [ ] **B3. `lower_better` formulasi** (0→200%, maqsad→100%, 2×→0%) — TZ'da yo'q, men tanladim.
- [ ] **B4. Rol nomlari** — hozir `admin`/`director` = ega, `manager`/`menejer` = menejer.
- [ ] **B5. Kam kelish = rad etishmi?** (5-bo'lim §5.3 taxmini) — hozir: miqdor kam bo'lsa yaroqli
      qism kiradi, sifat nuqsonida butun yetkazma qaytadi. Egasi teskarisini xohlashi mumkin.

---

# ✅ BAJARILGAN

- [x] **To'lqin 0** — `RetailSaleStateSchema` enum · soxta UUID · yig'ilgan chek — `f6cc310`, `2011424`
- [x] **1-Kassa B1** — holatlar mashinasi + `mark-ready` *(rezerv qismi tekshirilmagan)*
- [x] **1-Kassa B2** — `costMinor`/`basePriceMinor` muzlatish + savatda foyda — `6d1be01`
- [x] **1-Kassa B3** — `RetailSalePayment` aralash to'lov + USD kurs — `26df34f`
- [x] **2-Onlayn B1** — soxta UUID tuzatish + haqiqiy `CustomerOrder` — `f6cc310`
- [x] **3-Analitika B1** — `report/metrics/` yagona formulalar — `bbf7af5` + `0c36680`
- [x] **3-Analitika B2 (qisman)** — X1 `6adc495` · X3 `6d1be01` · **X2 qisman** (kassir o'qi
      `CashierAuditEvent` da bor, hisobot kesimi yo'q)
- [x] **1-Kassa B8 (yarim)** — `CashierAuditEvent` — `d35efab` *(page.tsx bo'linishi qolgan)*
- [x] **1-Kassa B4** — kiosk rejim: server guard + POS PIN + menyusiz qobiq — `45350ea` + `3b306c2`
- [x] **1-Kassa B5 (yadro)** — qarz moduli ulandi + balans simmetriyasi + FIFO — `dae7289`
- [x] **4M.1** — KPI o'lchov yadrosi + har-xodim config + **o'z ko'rsatkichi** — `829c122`, `809e2891`
- [x] **4M.2** — kunlik qabul FSM · jurnal · ball · ekran · drill-down — `fa58171`+`a2b4bb6` (brauzer-QA `d86320b`)
- [x] **4M.3 (yarim)** — M-Q8 bloklash + oylik manbai ko'chdi + sana qarzi — `e1a761b`
- [x] **6-HR B8 (yarim)** — haydovchi naqd topshirig'i (`DriverCashHandover`) + GPS — `fd8056d`, `65655f7`
- [x] **7-Ombor B1 (yarim)** — `StoreZone` + `SkladKeeper.zoneId` mavjud

---

# 🔜 QOLGAN ISHLAR (bajarish tartibida)

## 🟡 To'lqin 2 — Struktura (keyin qimmatlashadi)

- [ ] **8-Filial B1** — `Branch` modeli + migratsiya: bitta «Asosiy» filial
      *(`Branch` YO'Q. Migratsiya: standart filial → `Store`/`CashDesk` biriktirish → xodimlar →
      hujjatlarga backfill. Bir filialli holatda hech narsa o'zgarmasligi — regressiya qulfi)*
- [ ] **8-Filial B2** — `Store`/`CashDesk`/`Employee` bog'lanishi + **filial almashtirgich**
      *(`EmployeeBranch` ko'p-ko'pga, `Employee.defaultBranchId`)*
- [ ] **8-Filial B3** — hujjatlarda `branchId` muhrlash + backfill
      *(keyin qilinsa har hujjatni orqaga backfill qilish kerak bo'ladi)*

## 🟢 To'lqin 3 — Kassani to'liq yopish

- [x] **1-Kassa B4 (BE)** — `Role.uiMode` + `Employee.posPinHash` + **`KioskGuard` (global,
      default-deny)** + PIN servisi *(48+16 test, jonli tekshirilgan)*
- [x] **1-Kassa B4 (FE)** — kiosk qobiq (menyusiz POS) + PIN-qulf overlay *(12 guard test)*
      ⬜ *brauzerda ochilmagan — 1-Kassa Phase-2 QA ga kiradi*
- [x] **1-Kassa B5 (yadro)** — 🔴 `DebtModule` ilovaga ULANDI *(u yetim edi: prodda `/debts` → 404,
      butun qarz funksiyasi o'lik kod)* + **balans simmetriyasi** (`create` endi `+total` yozadi;
      backfill kerak emas — prodda 0 qarz) + **FIFO yadrosi** *(15 test)* — `dae7289`
- [ ] **1-Kassa B5 (qolgani)** — POS «Qarz to'lovi» oynasi (FE) · **PKO cheki** ·
      to'lovning joriy smenaga kirishi
- [ ] **1-Kassa B6** — Xarajat (RKO) + inkassatsiya
- [ ] **1-Kassa B7** — Smena yopish: `CashierSessionVariance` (YO'Q) + farq akti + **Z-hisobot**
      *(UZS va USD alohida; farq ≠ 0 → menejerga Telegram)*
- [ ] **1-Kassa B8 (qoldig'i)** — `sotuv/page.tsx` **1997 satr** → modullarga bo'lish
      *(har fayl < 300 satr; `lib/pos/` sof funksiyalar 100% unit-test)*
- [ ] **1-Kassa Phase-2 QA** — real brauzer + **real termal printer**
      *(E2E: smena → 3 ombordan tovar → yig'ish → `mark-ready` → aralash to'lov → chek → PKO → RKO → yopish)*

## 🟦 To'lqin 4M — Menejer bo'limi (egasining ustuvorligi)

### 4M.3 qoldig'i
- [ ] Oylik ekranida **«N kun qabul qilinmagan»** ogohlantirishi (§4.4) — ustunlar tayyor, FE yarim
- [ ] **Eskirgan kun tuzatuvchi qatori** (§3.4) — eski raqam jimgina qayta yozilmasin
- [ ] **Egaga haftalik xulosa** (M-Q7) — nechta qabul · nechta tuzatma · jami summa · kim ko'p tuzatgan
      *(hodisa jurnali tayyor, agregator yo'q)*
- [ ] ⛔ **Idempotent bonus/jarima** `HrBonusFineLog` ga — **B1 qaroriga bog'liq**

### 4M.4 — To'liq xodimlar nazorati ⭐
- [ ] **Jonli holat** — kim smena ochgan · kechikkan · haydovchi yo'lda · omborchi nima yig'yapti
- [ ] **Xodim kartasi 360°** + **suhbat va ogohlantirish jurnali** *(hozir hech qayerda yo'q)*
- [ ] 🔴 **Hayot sikli** (`EmployeeLifecycle` YO'Q) — **XAVFSIZLIK TESHIGI**: xodim ketsa ERP+HR
      ruxsatlari, Telegrami va sessiyalari **ochiq qolaveradi**
      · ishga qabul: sinov muddati + baholash sanasi
      · bo'shatish **majburiy ro'yxati**: ruxsatlarni bekor qilish · Telegram uzish · sessiyani yopish ·
        kassani topshirish · jihozni topshirish · qabul qilinmagan kunlarni yopish
      · ro'yxat tugamaguncha `arxivlangan` holatiga o'tmaydi
- [ ] **Javobgarlik** — topshirilmagan naqd · ochiq smena · yig'ilmagan topshiriq · qaytarilmagan jihoz

### 4M.5–4M.10
- [ ] **4M.5** — Ogohlantirish navbati: `ManagerWorkItem` + `ManagerRuleConfig` (ikkalasi YO'Q) +
      **12 qoida turi** + sabab kodlari + eskirish belgisi
- [ ] **4M.6** — Smena yakunini qabul qilish + **ma'lumot sifati paneli**
- [ ] **4M.7** — «Nima qotib qolgan» + **SLA paneli**
- [ ] **4M.8** — Uch xil zaxira signali (o'lchov **PUL**, dona emas) + narx o'zgarishi nazorati
- [ ] **4M.9** — `ExpenseBudget` (YO'Q): modda × oy, plan/fakt
- [ ] **4M.10** — `KpiTarget` (YO'Q) + **reyting formulasi** + `SCORE_CAP_PERCENT` ni sozlamaga chiqarish
- [ ] **4M Phase-2 QA** — rad→tushuntirish · eskalatsiya · majburiy yopish · tuzatma dialogi ·
      **RU-locale** · o'z-KPI dialogi · **xodim tomoni FE** (BE tayyor, FE yo'q)

## 🔵 To'lqin 4 — Nazorat (ruxsatlar)

- [ ] **4-Menejer B1** — `EmployeePermission` (YO'Q) + amaldagi ruxsat hisobi
      (rol `MAX(scope)` → xodim override, **ko'tarish VA tushirish**) + **G1** imtiyoz oshirish taqiqi
      (server tomonda) + **G2** «nega bu ruxsat bor» + **G3** audit
- [ ] **4-Menejer B2** — HR ruxsatlarini birlashtirish: adapter + bir martalik migratsiya + hisobot
      *(hozir ikki parallel tizim: ERP `entity×action×scope` vs HR `page×section×access`)*
- [ ] **4-Menejer B3** — Ruxsat matritsasi UI + **10 rol shabloni**
      (Egasi · Admin · Savdo menejeri · Ombor menejeri · Kassir · Sotuvchi · Omborchi · Buxgalter ·
      Ta'minotchi · Haydovchi)
- [ ] **4-Menejer B4** — Tasdiqlash navbati: `ApprovalRule` + `ApprovalItem` (ikkalasi YO'Q),
      `mode: 'review' | 'block'`
- [ ] **4-Menejer B5** — Record-scope **1-to'lqin**: `customer-order` ✓ · `demand` ✓ ·
      `invoice-out` · `retail-sale` · `sales-return`
- [ ] **4-Menejer B6** — Record-scope **2–3-to'lqin**: pul (`payment-in/out`, `cash-in/out`, `debt`,
      `counterparty-balance`) + mijozlar (`counterparty`, `contract`, `call`, `task`, `opportunity`)
- [ ] **4-Menejer B7** — Plan qo'yish · mijoz taqsimoti · narx siyosati ekranlari
- [ ] **4-Menejer B8** — Record-scope **4-to'lqin** + `recordScopeEnforced` **YOQISH**
      *(hozir `false` — `OWN_GROUP` berilsa ham hammasi ko'rinadi; yarim yoqilgan holat xavfli)*
- [ ] **4-Menejer Phase-2 QA** — E2E: admin rol yaratadi → menejerga beradi → ko'rinish chegarasi
      → kassa kamomadi navbatga tushadi → jarima → HR oyligida aks etadi

## 🟣 To'lqin 5 — Sotuv va bonus

- [ ] **2-Onlayn B2** — **Narx dvigateli** (shartnoma → mijoz → guruh → default) **umumiy servis** +
      `ContractPrice` (YO'Q) *(F2/F3 ham shuni chaqiradi — qayta yozilmasin)*
- [ ] **2-Onlayn B3** — Mijoz egaligi: `ownerId` mantiqi + bildirishnoma + **90-kun cron** +
      `Counterparty.lastActivityAt`
- [ ] **2-Onlayn B4** — **Bonus dvigateli** (4 qoida) + `BonusAccrual` (YO'Q) + HR ulanishi +
      `CustomerOrder.bonusToId` + `CustomerOrderPosition.costMinor/basePriceMinor`
- [ ] **6-HR B1** — `HrPosition.paySchemeConfig` + sxema hal qiluvchi (**4 tur**: fiks · fiks+% ·
      tier · piece)
- [ ] **6-HR B2** — Z2: lavozimga qarab bonus bazasi + **kassir korreksiyasi**
      *(optomdan past va tan narxdan past sotuv bonusdan ayriladi)*
- [ ] **6-HR B3** — Z1: dvigatel → **`Payroll` hujjati avtomatik** + `Payroll.sourceScoreId`
- [ ] **3-Analitika B3** — Rollup jadvallari (`DailySalesRollup`, `DailyStockRollup`,
      `EmployeeDailyRollup`, `CounterpartyDailyRollup`, `RollupRebuildQueue` — hammasi YO'Q) +
      cron + **qayta qurish CLI**
      *(eng muhim test: rollup ↔ jonli hisob bir xil raqam berishi)*
- [ ] **3-Analitika B4** — Rol bo'yicha boshqaruv panellari
- [ ] **3-Analitika B5** — Xodim shaxsiy ekrani («Mening natijam»)
- [ ] **3-Analitika B6** — Xodim kesimidagi **4 blok** hisoboti (sotuv/foyda · chegirma va og'ishlar ·
      qarz va undirish · intizom va faollik)
- [ ] **6-HR B9** / **4.11** — **Xodim kartasi (bitta ekran)** — 4M.4 bilan birlashtirilsin

## ⚫ To'lqin 6 — Ombor migratsiyasi

> Har qadam **qaytariladigan** + tekshiruv hisoboti chiqarishi shart.

- [ ] **7-Ombor B2** — Migratsiya 1–2 qadam: zona/yacheyka generatsiya + backfill + **farq hisoboti**
- [ ] **7-Ombor B3** — **Dual-write** (3-qadam) + kunlik farq monitoringi
- [ ] **7-Ombor B4** — Ko'p yacheyka + `StockByCell.isPrimary` (YO'Q) + `extraBins`
- [ ] **7-Ombor B5** — Yacheyka intizomi (**ogohlantirish** rejimi) + skaner oqimi
- [ ] **7-Ombor B6** — Yig'ish `StockByCell` dan (5-qadam) + **solishtirish testi**
      *(qabul mezoni: eski va yangi usul bir xil yig'ish varag'i berishi)*
- [ ] **7-Ombor B7** — Qisman yig'ish + kassirga **qizil** qaytish + `PickingError` (YO'Q)
- [ ] **7-Ombor B8** — Joylashtirish taklifi + skaner tasdiqlash
- [ ] **7-Ombor B9** — Inventarizatsiya: yacheyka skaneri + sikl + **muzlatish** + sabab/javobgarlik
- [ ] **7-Ombor B10** — Omborchi o'lchovlari (tezlik + xato) → 6- va 3-bo'limlarga
      *(`RestockTask.startedAt`/`completedAt`)*
- [ ] **7-Ombor B11** — **Yacheykalararo ko'chirish** + `CellTransfer` (YO'Q)
- [ ] **7-Ombor B12** — Intizom **`majburiy`** rejimga + eski atribut faqat-o'qish (migratsiya yakuni)
- [ ] **7-Ombor Phase-2 QA** — real brauzer + **real skaner**

## ⚪ To'lqin 7 — Qolganlari

### Ta'minotchilar (5-bo'lim)
- [ ] **5-B1** — `SupplierClaim` (YO'Q) + qabulda qayd (kam/rad) + **avtomatik da'vo**
      *(da'volar hozir umuman yozilmaydi)*
- [ ] **5-B2** — Rad etish oqibati: **butun yetkazma qaytadi** + `invoice-in` bloklanadi
      *(regressiya qulfi: stock o'zgarmasligi — `358622c` xulqi)*
- [ ] **5-B3** — `SupplierPortalToken` (YO'Q) + ta'minotchi oynasi
      *(xavfsizlik testlari MAJBURIY: cross-tenant/cross-counterparty, rate-limit, bekor qilingan token)*
- [ ] **5-B4** — Ta'minotchi oynasida o'zaro balans + to'lov jadvali + **akt-sverka**
- [ ] **5-B5** — Narx tarixi va barqarorlik tahlili + ogohlantirish
- [ ] **5-B6** — Da'volar ta'minotchi oynasida + javob yozish

### Onlayn sotuv qolgani (2-bo'lim)
- [ ] **2-B5** — Voronka + qo'ng'iroq/vazifa rejasi (sotuvchi paneli) + `SalesActivityLog` (YO'Q)
- [ ] **2-B6** — Kommersiya taklifi (KP) + `CommercialOffer` (YO'Q) + PDF + Telegram + «ko'rildi»
- [ ] **2-B7** — Hujjatlar: hisob avtomatik + **EDO faktura** + **MXIK tekshiruvi**
      *(MXIK yo'qligida faktura bloklanadi — aniq xato matni bilan)*
- [ ] **2-B8** — Webhook qabul qilish (imzo + **idempotentlik** + navbat)
- [ ] **2-B9** — Yetkazish: haydovchi biriktirish + holat + naqd topshirish
- [ ] **`SalesPlan`** (YO'Q) — xodim × oy × plan turi

### HR qolgani (6-bo'lim)
- [ ] **6-B4** — `HrLeaveRequest` (YO'Q): ta'til so'rovi + tasdiq + **davomat istisnosi** +
      kun-bay ushlanma
- [ ] **6-B5** — `HrAdvanceRequest` (YO'Q): ariza + tasdiq + kassa RKO + oylikdan ushlash
- [ ] **6-B6** — Davomat manbalari: **kassir smenasi + haydovchi smenasi → attendance**
      *(ikki marta belgilashni yo'q qiladi)*
- [ ] **6-B7** — Avtomatik jarima qoidalari (kechikish, yo'qlik) + istisnolar
- [ ] **6-B8 (qoldig'i)** — Haydovchi: yetkazma↔buyurtma bog'lanishi + ish birligiga oylik

### Analitika qolgani (3-bo'lim)
- [ ] **3-B7** — Tovar tahlili: **o'lik zaxira** (o'lchov PUL) + tugash xavfi + buyurtma tavsiyasi +
      `SlowMoverConfig` (YO'Q)
- [ ] **3-B8** — **Marja × aylanma matritsasi** (4 kvadrant) + yo'qotishlar (ombor·xodim·sabab·vaqt)

### Filial qolgani (8-bo'lim)
- [ ] **8-B4** — Ko'rinish: scope ∩ filial + **qo'riqchi test** (filtrsiz endpoint → test yiqiladi)
      *(4-B5/B6 bilan BIR to'lqinda)*
- [ ] **8-B5** — Filiallararo ko'chirish: **«yo'lda»** holati + qabul tasdig'i
- [ ] **8-B6** — Analitika: rollup'ga `branchId` + filiallar solishtiruvi
- [ ] **8-B7** — Filial bo'yicha plan/KPI

### Kelajak fazalar (alohida TZ yoziladi)
- [ ] **F2** — B2B dilerlar kabineti *(F1 shunga tayyor qurilishi kerak: `lib/pricing`,
      `order-intake` umumiy servis)*
- [ ] **F3** — B2C do'kon (`apps/shop`)
- [ ] **F4** — Marketplace platformasi

---

## 🧪 Sifat qarzlari (to'lqinlardan mustaqil)

- [ ] **`docs/moysklad-reference` BO'SH** (0 modul) — capture-grounded auditlar qayta ishlab
      bo'lmaydi; `label-grounding.test.ts` da 25 ENOENT
- [ ] **Parity foizlari `climart-adoption` da qayta tekshirilmagan** — ular `main` sahifalariga
      qarshi yozilgan (`docs/progress.json` buni ochiq aytadi)
- [ ] **List toolbar 19/56** — qolgan 37 sahifa
- [ ] **Navigation graph 0%**
- [ ] **Conv-6 data-bog'liq vizuallar** — 3/13 browser-smoked
- [ ] **Prodda ~20 yangi `/debts` route jonlanadi** — `DebtModule` ulangani sababli;
      deploy oldidan hisobga oling (avval hech qachon ishlamagan kod)
- [ ] **`wave4m-accept` branch + worktree** tozalash
- [ ] **`stash@{0}` (2026-07-31)** — begona backup, `git stash drop` (egasi tasdiqlasa)

---

## 🔁 Har sessiyada takrorlanadigan tekshiruvlar

- [ ] Sessiya boshida: `node scripts/preflight.mjs` · `git worktree list` · `git branch --no-merged`
- [ ] `pnpm dev` dan keyin to'liq test suite'dan **oldin** `packages/money` qayta build
      *(bir kunda 3 marta eskirdi; belgisi — `report/*` da aynan 33 test yiqiladi, tc esa yashil)*
- [ ] Deploydan keyin **`/api/v1/health` majburiy** — web 200 API sog'ligini isbotlamaydi
      *(2026-08-05: API 25 daqiqa 502, sayt esa 200)*
- [ ] Yangi endpointda prefiks bandligini tekshir *(guard: `apps/api/src/app-boot.test.ts`)*

---

## ✅ 100% ta'rifi

1. Yuqoridagi **hamma katakcha** belgilangan;
2. Har bo'lim **brauzerda** tekshirilgan (Phase-2) — «Phase-1» qolmagan;
3. Gate yashil: `typecheck 0` · `biome 0` · i18n ru+uz · Vitest regressiyasiz;
4. Prodga deploy qilingan, `/api/v1/health` + asosiy oqimlar jonli tasdiqlangan;
5. **B1–B5 qarorlari** yopilgan.
