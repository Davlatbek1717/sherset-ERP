# TODO — 0 dan 100% gacha

**Yaratildi:** 2026-08-05 · **Manba:** [master roadmap](docs/superpowers/specs/2026-08-02-master-roadmap.md) + 8 bo'lim TZ'si + `NEXT.md` ochiq qarzlari

> Bu fayl — **yagona bajarish ro'yxati**. Pastdagi hamma katakcha belgilangan kunda loyiha
> **100% tayyor** bo'ladi. Tartib bo'lim-bo'lim EMAS, **bog'liqlik bo'yicha** (analitika kassa
> yozadigan ma'lumotsiz ishlamaydi, bonus o'lchovsiz hisoblanmaydi).
>
> **Har bosqich = bir sessiya** → commit → sessiya yopiladi (CLAUDE.md §0).
> **Har commitda gate:** `typecheck 0` · `biome 0` · i18n key-existence ru+uz + no-hardcoded ·
> Vitest regressiyasiz.
> **Halol yorliq:** brauzerda ko'rilmagan ish «Phase-1» deb belgilanadi, «done» deyilmaydi.
>
> ⚠️ **Holat qayerdan olingan:** bajarilgan deb belgilangan har punkt commit hash bilan
> tasdiqlangan; model mavjudligi `schema.prisma` dan tekshirilgan. Taxmin yozilmagan.

---

## 📊 Umumiy holat

| To'lqin | Holat |
|---|---|
| 0 — Buzuq narsalar | ✅ tugadi |
| 1 — O'lchov poydevori | ✅ tugadi |
| 2 — Struktura | 🟡 yarim (`StoreZone` bor, `Branch` yo'q) |
| 3 — Kassani yopish | 🟡 yarim (aralash to'lov bor, 4 punkt qoldi) |
| 4 — Nazorat (ruxsatlar) | ⬜ boshlanmagan |
| 4M — Menejer bo'limi | 🟡 4M.1–4M.3 qisman, 4M.4–4M.10 qoldi |
| 5 — Sotuv va bonus | ⬜ boshlanmagan |
| 6 — Ombor migratsiyasi | 🟡 yarim (yacheyka bor, migratsiya qadamlari qoldi) |
| 7 — Qolganlari | ⬜ boshlanmagan |

---

## ❓ EGASIDAN QAROR KUTILMOQDA (bloklovchi)

Bu punktlarni **o'zim hal qila olmayman** — pulga tegadi yoki siyosat qarori:

- [ ] **B1. Bonus/jarima formulasi** (TZ 4M.3 §4.2). «Kun qabul qilinganda bonus/jarima
      `HrBonusFineLog` ga yoziladi» deyilgan, lekin **qancha** — hech qayerda yozilmagan.
      `HrBonusFineRule` mavjud, ammo u **qo'lda** qo'llanadi (avtomat shart-dvigateli yo'q).
      Kerak: qaysi ko'rsatkich → qancha bonus/jarima. *Bu hal bo'lmaguncha 4M.3 yopilmaydi.*
- [ ] **B2. Kompozit ball chegarasi 150%** — TZ'da yo'q, men tanladim (`SCORE_CAP_PERCENT`).
      Tasdiqlash yoki o'zgartirish kerak.
- [ ] **B3. `lower_better` formulasi** — chiziqli-simmetrik (0→200%, maqsad→100%, 2×→0%).
      TZ'da yo'q, men tanladim.
- [ ] **B4. Menejer roli nomi** — hozir `hrRoles` da `admin`/`director` = ega,
      `manager`/`menejer` = menejer. Haqiqiy rol nomlari tasdiqlansin.

---

## 🔴 To'lqin 0 — Buzuq narsalar ✅ TUGADI

- [x] 0.1 `RetailSaleStateSchema` ga `picking` + `ready` — `f6cc310`
- [x] 0.2 `online-order.convertToCustomerOrder` soxta UUID — `f6cc310`
- [x] 0.3 Yig'ilgan chek to'lanadi va bekor qilinadi — `2011424`

## 🟠 To'lqin 1 — O'lchov poydevori ✅ TUGADI

- [x] 1.1 `RetailSalePosition.costMinor` + `basePriceMinor` muzlatish — `6d1be01` (deploy `a646bdd`)
- [x] 1.2 `profitability` tan narx yolg'oni (`0::bigint AS cost`) — `6adc495`
- [x] 1.3 `CashierAuditEvent` — `d35efab`
- [x] 1.4 `report/metrics/` yagona formulalar qatlami — `bbf7af5` + `0c36680` (deploy `90d8d0d`)
- [x] Phase-2 QA: 1.1 + 1.2 brauzerda tekshirildi — `23fdd3e`

---

## 🟡 To'lqin 2 — Struktura (keyin qimmatlashadi)

> **Nega hozir:** `branchId` ni keyin qo'shish = **har hujjatni orqaga backfill** qilish.

- [ ] **2.1 `Branch` modeli + migratsiya + `branchId` muhrlash** (8-B1..B3)
  - [ ] `Branch` modeli (`schema.prisma` da hozir YO'Q — tekshirildi)
  - [ ] Barcha hujjat modellariga `branchId` (nullable → backfill → NOT NULL)
  - [ ] Yozuvda `branchId` avtomat muhrlash (servis qatlami)
  - [ ] Qo'riqchi test: `branchId` siz hujjat yaratib bo'lmasligi
- [x] 2.2 `skladNo → StoreZone` — `StoreZone` modeli MAVJUD (pick-list ishida qurilgan)

---

## 🟢 To'lqin 3 — Kassani to'liq yopish

- [x] 3.1 Aralash to'lov (`RetailSalePayment`, USD kurs, Click/Payme/QR) — `26df34f`
- [ ] **3.2 Kiosk rejim** (1-B4) — `Role.uiMode` (hozir YO'Q) + PIN-qulf + **server cheklovi**
      *(UI'da yashirish yetarli emas — server tomonda ham cheklansin)*
- [ ] **3.3 Qarz to'lovi (PKO) + qarz jurnali simmetriyasi** (1-B5)
      *(`Debt` modeli bor; ochiq qaror: [[debt-ledger-asymmetry]] — qarz berilganda balans
      yozilmaydi, to'langanda yoziladi)*
- [ ] **3.4 Xarajat (RKO) + inkassatsiya + smena yopish va farq akti** (1-B6, 1-B7)
- [ ] **3.5 `sotuv/page.tsx` modullarga bo'lish** — hozir **1997 satr** (o'lchandi)

---

## 🔵 To'lqin 4 — Nazorat (ruxsatlar)

> Menejer bo'limi (4M) bundan **mustaqil** — u butun korxonani ko'radi (M-Q1).

- [ ] **4.1 `EmployeePermission` qatlami** (4-B1) — model YO'Q (tekshirildi)
  - [ ] `EmployeePermission(employeeId, entity, action, scope)` + migratsiya
  - [ ] Amaldagi ruxsat hisobi: rol `MAX(scope)` → xodim override (ko'tarish VA tushirish)
  - [ ] **G1** imtiyoz oshirish taqiqi (server tomonda, alohida testlar)
  - [ ] **G2** «nega bu ruxsat bor?» — har qatorda manbasi
  - [ ] **G3** audit: kim, kimga, eski→yangi scope
- [ ] **4.2 HR ruxsatlarini birlashtirish** (4-B2) — adapter + bir martalik migratsiya + hisobot
- [ ] **4.3 Ruxsat matritsasi UI + rol shablonlari** (4-B3) — 10 ta boshlang'ich rol
- [ ] **4.4 Tasdiqlash navbati** (4-B4) — `ApprovalRule` + `ApprovalItem` (ikkalasi YO'Q)
- [ ] **4.5 Rollup jadvallari + cron + qayta qurish CLI** (3-B3)
- [ ] **4.6 Rol bo'yicha panellar + xodim shaxsiy ekrani** (3-B4, 3-B5)
- [ ] **4.7 Record-scope 1–2-to'lqin + filial filtri birga** (4-B5, 4-B6, 8-B4)
- [ ] **4.8 Plan qo'yish, mijoz taqsimoti, narx siyosati ekranlari** (4-B7)
- [ ] **4.9 Record-scope 4-to'lqin + `recordScopeEnforced` YOQISH** (4-B8)
      *(hozir `false` — menejerga `OWN_GROUP` berilsa ham hammasini ko'raveradi)*
- [ ] **4.10 Xodim kesimidagi 4 blok hisoboti** (3-B6)
- [ ] **4.11 Xodim kartasi (bitta ekran)** (6-B9) — 4M.4 bilan birlashtirilsin

---

## 🟦 To'lqin 4M — Menejer bo'limi

### 4M.1 — KPI o'lchov yadrosi ✅ TUGADI
- [x] Ko'rsatkich katalogi · versiyalangan profil · yangi ombor · hisoblash · tungi cron — `829c122`
- [x] Har-xodim KPI konfiguratsiyasi (og'irlik + maqsad) — `f287bc6` + `63684d0`
- [x] **Hisobning O'Z ko'rsatkichini yaratish** (manual manba) — `809e2891` (deploy `a3cd7336`)

### 4M.2 — Kunlik qabul qilish ✅ TUGADI (deploy `28967e91`)
- [x] FSM · hodisa jurnali · kompozit ball · menejer ekrani · drill-down · klaviatura — `fa58171` + `a2b4bb6`
- [x] Brauzer-QA (navbat tartibi · drill-down · `↓`/`A` · jurnal) — `d86320b`
- [ ] **Xodim tomoni FE** — «kuningiz hali qabul qilinmagan» + tushuntirish formasi.
      *BE tayyor (`manager/kpi/my/*`), FE YO'Q*
- [ ] **Brauzer-QA qolgani:** rad etish → tushuntirish halqasi · eskalatsiya · majburiy yopish ·
      tuzatma dialogi · **RU-locale** · o'z-KPI yaratish dialogi

### 4M.3 — Qabul → oylik 🟡 QISMAN (deploy `a3cd7336`)
- [x] **M-Q8 bloklash** — faqat qabul qilingan kun oylikka kiradi — `e1a761b`
- [x] Oylik manbai `HrKpiDailyLog` → `EmployeeDailyKpi` ga ko'chdi
- [x] `HrKpiMonthlyScore` + `acceptedDays`/`pendingDays`/`blockedSalesMinor`
- [x] `hr-kpi.service.ts` sana off-by-one qarzi yopildi + 165 qator migratsiyasi
- [ ] **Oylik ekranida «N kun qabul qilinmagan» ogohlantirishi** (TZ §4.4) — ustunlar tayyor,
      FE YO'Q. *(qisman boshlangan, tugallanmagan)*
- [ ] **Idempotent bonus/jarima** `HrBonusFineLog` ga (TZ §4.2) — ⛔ **B1 qaroriga bog'liq**
- [ ] **Eskirgan kun tuzatuvchi qatori** (§3.4) — eski raqam jimgina qayta yozilmasin
- [ ] **Egaga haftalik xulosa** (M-Q7) — nechta kun qabul · nechta tuzatma · jami summa ·
      kim ko'p tuzatgan · nechta kutmoqda. *Hodisa jurnali tayyor, agregator YO'Q*

### 4M.4 — To'liq xodimlar nazorati ⭐ (egasining 2-ustuvorligi)
- [ ] **Jonli holat** — kim smena ochgan · kim kechikkan · haydovchi yo'lda · omborchi nima yig'yapti
      *(manbalar bor: `CashierSession`, `HrAttendance`, `DriverShift`, `RestockTask`)*
- [ ] **Xodim kartasi 360°** — KPI trendi · davomat kalendari · bonus/jarima · ruxsatlar ·
      ogohlantirishlar · **suhbat jurnali** *(hozir hech qayerda yo'q — bo'shatish nizosida
      yozma iz kerak)*
- [ ] 🔴 **Hayot sikli — XAVFSIZLIK TESHIGI** (`EmployeeLifecycle` modeli YO'Q)
  - [ ] Ishga qabul: sinov muddati + baholash sanasi (menejer navbatiga element)
  - [ ] Bo'shatish **majburiy ro'yxati**: ERP+HR ruxsatlarini bekor qilish · Telegram uzish ·
        ochiq sessiyani yopish · kassani topshirish · tovar/jihozni topshirish ·
        qabul qilinmagan kunlarni yopish
  - [ ] Ro'yxat tugamaguncha `arxivlangan` holatiga o'tmaydi
  - *Bugun: xodim ketsa ruxsatlari, Telegrami va sessiyalari OCHIQ qolaveradi*
- [ ] **Javobgarlik** — kimda nima turibdi: topshirilmagan naqd · ochiq smena ·
      yig'ilmagan topshiriq · qaytarilmagan jihoz

### 4M.5 — Ogohlantirish navbati
- [ ] `ManagerWorkItem` modeli (YO'Q) + `ManagerRuleConfig`
- [ ] Qoida dvigateli + **12 qoida turi**: `BELOW_COST` · `BIG_DISCOUNT` · `BELOW_WHOLESALE` ·
      `BIG_DEBT` · `OVERDUE_DEBT` · `CASH_VARIANCE` · `LATE`/`ABSENT` · `SHIFT_OUT_OF_SCHEDULE` ·
      `LOW_STOCK` · `DEAD_STOCK` · `PICKING_SLA` · `INVENTORY_VARIANCE`
- [ ] Yagona navbat ekrani (qoida buzilishi + kun qabuli + e'tiroz + eskalatsiya bir ro'yxatda)
- [ ] Sabab kodlari majburiy + eskirish belgisi (3 kundan ortiq ko'rilmagan yuqoriga)

### 4M.6 — Smena yakuni + ma'lumot sifati
- [ ] Smena yakunini qabul qilish (kutilgan naqd / sanalgan / farq) — kunlik KPI bilan bir naqsh
- [ ] Ma'lumot sifati paneli: tan narxsiz tovarlar · muzlatilmagan cheklar · KPI profilsiz xodimlar

### 4M.7 — Jarayon nazorati
- [ ] «Nima qotib qolgan» — bosqichda tiqilgan hujjatlar
- [ ] SLA paneli: buyurtma → yig'ish → yetkazish → to'lov

### 4M.8 — Tovar va narx nazorati
- [ ] Uch xil zaxira signali (tugayotgan · o'lik · **ortiqcha**) — o'lchov **dona emas, PUL**
- [ ] Narx o'zgarishi tarixi + chegaradan katta o'zgarishga menejer tasdig'i

### 4M.9 — Xarajat byudjeti
- [ ] `ExpenseBudget` modeli (YO'Q) — modda × oy, plan/fakt *(xarajat tasdiqlanmaydi, ko'rinadi)*

### 4M.10 — Target va reyting
- [ ] `KpiTarget` (YO'Q) — kunlik/haftalik/oylik target
- [ ] **Reyting formulasi** — panelda va'da qilingan, formulasi hech qayerda yo'q
- [ ] `SCORE_CAP_PERCENT` ni `ManagerRuleConfig` ga sozlama sifatida chiqarish (B2 qaroridan keyin)

---

## 🟣 To'lqin 5 — Sotuv va bonus

- [ ] **5.1 Narx dvigateli** (2-B2) — shartnoma → mijoz → guruh → default, **umumiy servis**
- [ ] **5.2 Mijoz egaligi** (2-B3) — `ownerId` mantiqi · bildirishnoma · 90-kun qoidasi
- [ ] **5.3 Bonus dvigateli** (2-B4) — 4 qoida + `BonusAccrual` (model YO'Q)
- [ ] **5.4 Lavozim oylik sxemalari + kassir korreksiyasi** (6-B1, 6-B2)
- [ ] **5.5 Dvigatel → `Payroll` hujjati avtomatik** (6-B3)

---

## ⚫ To'lqin 6 — Ombor migratsiyasi

> Har qadam **qaytariladigan** bo'lishi va tekshiruv hisoboti chiqarishi shart.

- [ ] **6.1 Zona/yacheyka generatsiya + backfill + farq hisoboti** (7-B2)
- [ ] **6.2 Dual-write + kunlik monitoring** (7-B3)
- [ ] **6.3 Ko'p yacheyka + `isPrimary` + `extraBins`** (7-B4) — `isPrimary` YO'Q
- [ ] **6.4 Yacheyka intizomi (ogohlantirish) + skaner oqimi** (7-B5)
- [ ] **6.5 Yig'ish `StockByCell` dan + solishtirish testi** (7-B6)
- [ ] **6.6 Qisman yig'ish + kassirga qaytish + `PickingError`** (7-B7) — model YO'Q

---

## ⚪ To'lqin 7 — Qolganlari

- [ ] **HR:** ta'til va avans (6-B4, 6-B5) · davomat manbalari va avtomatik jarima (6-B6, 6-B7) ·
      haydovchi yetkazma/naqd (6-B8) *(naqd topshirig'i qisman bor — `fd8056d`)*
- [ ] **Ta'minotchilar (5-bo'lim):** ta'minotchi oynasi va da'volar (5-B1..B6)
- [ ] **Onlayn sotuv (2-bo'lim):** voronka · KP · EDO hujjatlari · webhook (2-B5..B9)
- [ ] **Ombor (7-bo'lim):** joylashtirish taklifi va inventarizatsiya (7-B8..B12)
- [ ] **Analitika (3-bo'lim):** tovar tahlili (3-B7, 3-B8)
- [ ] **Filial (8-bo'lim):** kengaytmalar (8-B5..B7)
- [ ] **F2** B2B kabinet · **F3** B2C do'kon · **F4** marketplace

---

## 🧪 Sifat qarzlari (to'lqinlardan mustaqil)

- [ ] **`docs/moysklad-reference` BO'SH** (0 modul) — har capture-grounded audit
      **qayta ishlab bo'lmaydigan** holatda; `label-grounding.test.ts` da 25 ENOENT.
      *Xotira: [[moysklad-reference-dir-missing]]*
- [ ] **Parity audit foizlari `climart-adoption` da qayta tekshirilmagan** — ular `main` sahifalariga
      qarshi yozilgan, climart FE'ni almashtirgan. `docs/progress.json` buni ochiq aytadi.
      Qayta audit kerak.
- [ ] **List toolbar 19/56** — qolgan 37 sahifa
- [ ] **Navigation graph 0%**
- [ ] **Conv-6 data-bog'liq vizuallar** — 3/13 browser-smoked, qolgani real data kutmoqda
- [ ] **`wave4m-accept` branchi** — birlashtirilgan, lekin branch va worktree qolgan;
      tozalash kerak *(xotira: [[parallel-worktree-duplicate-work]])*
- [ ] **`stash@{0}` (2026-07-31)** — begona lint-staged backup, ichidagi ish allaqachon daraxtda;
      egasi tasdiqlasa `git stash drop`

---

## 🔁 Har sessiyada takrorlanadigan tekshiruvlar

Bular «bir marta qilib qo'yiladigan» ish emas — **har safar**:

- [ ] Sessiya boshida: `node scripts/preflight.mjs` · `git worktree list` · `git branch --no-merged`
- [ ] `pnpm dev` dan keyin to'liq test suite yugurtirishdan **oldin** `packages/money` ni qayta
      build qil — dist eskiradi (bir kunda 3 marta takrorlandi).
      *Belgisi: `report/*` da aynan 33 test yiqiladi, typecheck esa yashil*
- [ ] Deploydan keyin **`/api/v1/health` ni majburiy tekshir** — web 200 bo'lishi API sog'ligini
      isbotlamaydi *(2026-08-05 da API 25 daqiqa 502 bo'lib turdi, sayt esa 200 edi)*
- [ ] Yangi endpoint qo'shishdan oldin prefiks bandligini tekshir — takroriy route butun API'ni
      yiqitadi *(guard: `apps/api/src/app-boot.test.ts`)*

---

## ✅ 100% ta'rifi

Loyiha tayyor deb hisoblanadi, agar:

1. Yuqoridagi **hamma katakcha** belgilangan bo'lsa;
2. Har bosqich **brauzerda** tekshirilgan bo'lsa (Phase-2), «Phase-1» qolgani bo'lmasa;
3. Gate yashil: `typecheck 0` · `biome 0` · i18n ru+uz · Vitest regressiyasiz;
4. Prodga deploy qilingan va `/api/v1/health` + asosiy oqimlar jonli tasdiqlangan;
5. **Egasidan qaror kutayotgan B1–B4 punktlari yopilgan** bo'lsa.
