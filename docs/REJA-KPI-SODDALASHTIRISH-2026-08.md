# REJA — KPI'NI TODO KABI SODDALASHTIRISH (fazama-faza, sessiyama-sessiya)

**Sana:** 2026-08-10 · **Holat:** ijroga tayyor · **Manba:** egasining topshirig'i
(«menejer barcha xodim KPI'larini CRUD qilsin; KPI todo kabi qo'shilsin — hozirgi holat juda
murakkab») + [4M kunlik-KPI TZ](superpowers/specs/2026-08-02-menejer-kunlik-kpi-tz-design.md)
§2.1–2.6/§9/§11 + jonli kod (`apps/api/src/modules/manager/kpi/`,
`apps/web/src/app/(app)/hr/employees/[id]/kpi/page.tsx`).

> Bu hujjat — **bitta funksiyani (KPI'ni soddalashtirish) oxirigacha qurish uchun yagona ijro
> rejasi**, [`REJA-8-BOLIM`](REJA-8-BOLIM-2026-08.md) va
> [`REJA-MENEJER-KASSA`](REJA-MENEJER-KASSA-2026-08.md) bilan **bir xil struktura va cheklovlar**da.
> Har faza: maqsad · qamrov · fayllar · TDD testlari · gate · tayyorlik mezoni · sessiya-boshi prompt.
>
> **Bog'liqlik boshqa rejalar bilan:** bu ish **MK13** (`KpiTarget` maqsad qatlami, hozir DB'siz sof
> funksiya) va **4M.2** (`/hr/employees/[id]/kpi` murakkab og'irlik-jadvali) ni **almashtiradi**, ularni
> takrorlamaydi. MK22 (maqsad kaskadi) resolveri (`kpi-target.ts`) **saqlanadi va qayta ishlatiladi** —
> yangi qatlam unga eng yuqori ustuvorlikdagi manba bo'lib ulanadi.
>
> **🎯 Loyiha-qarori (egasi, 2026-08-10 — Variant A):** og'irlikli, versiyalangan, avtomatik-hisoblanadigan
> oylik ball tizimi **buzilmaydi** — u payroll bilan bog'langan (`HrKpiMonthlyScore`, `kpi-accrual`,
> `BonusFine`). Uning ustiga **yengil, mustaqil «biriktirilgan KPI» qatlami** qo'yiladi: menejer xodimga
> *metrika + maqsad + davr* qo'shadi (todo kabi — qo'sh/tahrirla/o'chir), **og'irlik SHART EMAS**. Og'irlik
> qo'yilsa — oylik ballga kiradi; qo'yilmasa — KPI shunchaki o'lchanadi/kuzatiladi. Bu «todo»ni beradi,
> lekin formal ballash yo'lini yo'qotmaydi.

---

## ⛔ O'ZGARMAS QOIDALAR — HAR SESSIYA AGENTI UCHUN

Bu rejani o'qiyotgan agent quyidagilarni **so'zsiz** bajaradi (CLAUDE.md bilan bir xil):

1. **FAQAT BITTA FAZA.** Senga topshirilgan faza (`KPI-<NN>`) ni bajarasan. Tugagach **TO'LIQ
   TO'XTAYSAN** — keyingi fazani BOSHLAMAYSAN, «yo'l-yo'lakay» qo'shimcha ish qilmaysan (CLAUDE.md §0.3).
2. **Avval o'qi, keyin yoz:** (a) shu fayldan **o'z fazangni**, (b) TZ §raqamlarini, (c) tegishli manba
   fayllarni. Rejadagi har bir da'voni **kodda o'z ko'zing bilan tasdiqla** (CLAUDE.md §2) — reja
   yozilganidan beri kod o'zgargan bo'lishi mumkin. Tasdiqlanmasa: hisobotda yoz va **to'xta**.
3. **Sessiya boshida:** `node scripts/preflight.mjs` · `git worktree list` · `git branch --no-merged`
   (takroriy ish xavfi — merge qilinmagan branch butun funksiyani ikki marta qurdirgan hodisa bo'lgan).
4. **TDD (majburiy):** avval **yiqiladigan test** yoz, yiqilishini KO'R, keyin minimal implementatsiya,
   keyin yashil bo'lishini KO'R. Testlar co-located `.test.ts` (Vitest). **Mavjud test-fayl ustidan
   `Write` QILMA — faqat `Edit`** (ikki sessiyada testlar jimgina o'chgan, gate yashil qolgan).
5. **To'liq gate (commitdan oldin, majburiy):**
   - `pnpm --filter @moysklad/api typecheck` → 0 xato · web tegilsa `@moysklad/web` ham
   - `pnpm lint:product` → 0 xato
   - `pnpm i18n:gate` (UI-matn tegilsa; **gate `components/` ni ko'rmaydi** — hardcoded matnni qo'lda tekshir)
   - Fazaga tegishli test + regress: `pnpm --filter @moysklad/api exec vitest run <modul>` (web uchun `@moysklad/web`)
   - **web-only gate `apps/api` qo'riqchilarini o'tkazib yuboradi** — ikkala tomon tegilsa ikkalasini yugurt.
6. **Halol status (CLAUDE.md §1):** natija **«Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke
   YO'Q»** deb belgilanadi. **«done» / «production-ready» / «verified» DEMA.** Runtime-QA — `KPI-06`.
7. **Migratsiya (sxema tegilsa):** lokal DB = `climart_adopt @ localhost:5432` (`_prisma_migrations`-tracked
   emas → `prisma migrate dev` lokalda ishlaydi, [[preflight-db-probe-false-negative]]). Migratsiya =
   **umumiy resurs** (CLAUDE.md §6.4) — yolg'iz sessiyada. **Prod (`sherset_v2`)** — DDL «OPS-QADAMLAR»ga
   yoziladi; `/deploy` skript `prisma migrate deploy` ni o'zi qo'llaydi.
8. **Git xavfsizligi (CLAUDE.md §6/§6.7):** faqat aniq yo'llar bilan `git add <fayllar>`. Commitdan oldin
   `git status --short`, commitdan **keyin** `git show --stat HEAD`. `git reset --hard` / `checkout -- .` /
   `stash` / `clean -fd` — **TAQIQ**. Seniki bo'lmagan o'zgarishga tegma.
9. **Model:** OPUS/flagship. Mexanik ish uchun avval deterministik skript, keyin agent.
10. **HISOBOT (majburiy):** faza tugagach shu faylning oxiridagi **«HISOBOT JURNALI»** ga o'z fazang ostiga
    qilgan HAMMA ishni yoz va faza sarlavhasidagi `☐ HISOBOT` ni `☑ HISOBOT (sana)` ga o'zgartir.
    **Faqat `appendFileSync` yoki aniq `Edit`** — marker bo'yicha kesish TAQIQ ([[doc-append-marker-truncation]]).
11. **`todo.md` ni yangila** (agar tegishli katakcha bo'lsa).
12. **Commit:** gate yashil bo'lgach — `feat(kpi): KPI-<NN> — <qisqa>` yoki `fix(...)`. commitlint
    subject'i **kichik harf** bilan boshlanadi ([[commitlint-rejects-uppercase-subject-prefix]]).

---

## 📋 SESSIYANI QANDAY BOSHLASH (foydalanuvchi uchun)

Har yangi sessiyada tegishli fazaning **▶ SESSIYA-BOSHI PROMPT** blokini nusxalab yuboring. Umumiy shakl:

> `docs/REJA-KPI-SODDALASHTIRISH-2026-08.md` — **Faza KPI-<NN>** ni bajar. Shu fayldagi «O'ZGARMAS
> QOIDALAR»ga to'liq amal qil. Faqat shu faza — tugagach hisobotni jurnalga yozib **TO'XTA**.

---

## 🧭 ARXITEKTURA — bir qarashda (har faza agenti shuni tushunib boshlaydi)

**Muammo (jonli, tasdiqlangan):** har xodimga KPI biriktirish bugun **4 jadval** talab qiladi —
`KpiMetricDef` (katalog) → `KpiProfile` (lavozim/xodim) → `KpiProfileVersion` (versiyalangan) →
`KpiProfileMetric` (metrika+og'irlik+maqsad). UI (`/hr/employees/[id]/kpi`) butun katalogni bitta
jadvalda ko'rsatadi, **og'irliklar 100% ga yig'ilishi** talab qilinadi (bitta KPI qo'shish = qolganini
qayta muvozanatlash), saqlash yangi versiya yozadi. `KpiTarget` DB modeli **umuman yo'q** — maqsad faqat
profil versiyasi ichida. Bu — «todo»ning aksi.

**Yechim — yengil ustama qatlam (Variant A):**

```
YANGI:  EmployeeKpiTarget   (mustaqil qator: xodim × metrika × davr → maqsad, og'irlik IXTIYORIY)
            │  eng yuqori ustuvorlik
            ▼
MAVJUD: kpi-target.ts resolver  (xodim > bo'lim > lavozim > hisob > profil > maqsadsiz)  ← SAQLANADI
            ▼
MAVJUD: dvigatel (employee-daily-kpi) → EmployeeDailyKpiMetric (KUNGA maqsad+fakt MUHRLANADI)
            ▼
MAVJUD: kpi-score / kpi-accrual → HrKpiMonthlyScore → payroll   ← og'irlik IXTIYORIY bo'ladi (KPI-05)
```

**🔴 Versiyalash o'rniga per-kun snapshot.** Yangi qatlam **versiyalanmaydi**. Tarix butunligi (§2.3 —
to'langan oyni qayta yozmaslik) `EmployeeDailyKpiMetric` allaqachon **o'sha kungi maqsad+faktni muhrlab**
saqlagani bilan ta'minlanadi (tan-narx muzlatish klassi, [[per-unit-snapshot-blocks-exact-cost-fix]]).
`EmployeeKpiTarget` tahriri faqat **KELAJAK** kunlarga ta'sir qiladi; o'tgan kunlar o'z muhridan o'qiydi.
Bu — versiya jadvalisiz aynan o'sha kafolat. **Har faza agenti buni kodda tasdiqlaydi** (daily metric
qatori targetni saqlaydimi — saqlamasa, KPI-03 shuni qo'shadi).

---

## ⛔ EGASIDAN QAROR KUTILMOQDA

Hozircha **ochiq bloklovchi qaror yo'q** — uch dizayn-qarori (og'irlik ixtiyoriy · ikkala yuza · qo'lda KPI)
egasi tomonidan «loyihaga mos eng professionalini qil» deb topshirilgan va shu rejada qulflangan. Ijro
davomida siyosat-savol chiqsa, agent shu jadvalga yozadi va **to'xtaydi** (kod bilan hal qilmaydi):

| Qaror | Savol | Kimni bloklaydi |
|---|---|---|
| _(ochiq emas)_ | — | — |

---

## 🔧 OPS-QADAMLAR (kod EMAS — deploy/ops sessiyalari)

Fazalar davomida to'planadigan prod-amallar. `/deploy` skript bilan bajariladi.

- **KPI-01 dan keyin:** `EmployeeKpiTarget` (+ `EmployeeKpiTargetEvent`) migratsiyasi prod
  `sherset_v2` ga qo'llanadi — `/deploy` `prisma migrate deploy` ni avtomatik bajaradi. Backfill
  (profil maqsadlaridan) migratsiya ichida idempotent bo'ladi; deploydan oldin **pre-deploy backup**
  (deploy skript talab qiladi, disk 93% — eski backuplarni tozalash, [[sherset-vps-deploy]]).

---

## FAZALAR

### KPI-01 — `EmployeeKpiTarget` modeli + migratsiya + profil-maqsadlaridan backfill ☑ HISOBOT (2026-08-10)
**Bo'lim/blok:** KPI-soddalashtirish · **TZ:** `2026-08-02-menejer-kunlik-kpi-tz-design.md` §2.5, §9
**Ustuvorlik:** P0 · **Bog'liqlik:** yo'q · **Holat:** ochiq (sxemada `KpiTarget`/`EmployeeKpiTarget` YO'Q — tasdiqlangan: `grep "model KpiTarget" schema.prisma` = 0)
**Maqsad:** Mustaqil, versiyalanmaydigan KPI-maqsad qatlamini bazaga kiritish — **xulqni o'zgartirmasdan**:
mavjud profil maqsadlari yangi qatlamga ko'chiriladi, dvigatel hali eski yo'ldan o'qiydi (ko'prik KPI-03 da).
**Qamrov:**
1. `EmployeeKpiTarget` modeli:
   - `accountId`, `employeeId` (FK, `onDelete: Cascade`);
   - `metricKey` VarChar(50) — `KpiMetricDef.key` ga ishora (built-in YOKI custom/qo'lda);
   - `targetValue` BigInt? — metrikaning **o'z birligida** minor (pul=tiyin, dona=dona); `NULL` = raqamsiz
     («todo» — faqat bajarildi/bajarilmadi);
   - `period` VarChar(10): `daily | weekly | monthly` (§2.5 lug'ati);
   - `weight` Decimal(5,2)? — `NULL` = **oylik balldan tashqarida** (faqat kuzatiladi). Bu «og'irlik
     ixtiyoriy» ning yagona manbai;
   - `currency` VarChar(3)? — **faqat `money` birlik** metrikada; sanoq/vaqt turida `NULL` **SHART**
     (CHECK — [[manager-kpi-unit-vocabularies]] birlik-lug'atlarini aralashtirish bug-klassi);
   - `manualDoneAt` Timestamptz? — dvigatel hisoblay OLMAYDIGAN (custom/qo'lda) metrika uchun menejer
     «bajarildi» belgisi; o'lchanadigan metrika buni **e'tiborsiz qoldiradi** (fakt dvigateldan);
   - `active` Boolean @default(true) · `createdById` · `createdAt`/`updatedAt`.
   - `@@unique([employeeId, metricKey, period])` — takror maqsad yo'q (tahrir o'rniga in-place update).
   - Indekslar: `[accountId, employeeId, active]`, `[accountId, metricKey]`.
2. `EmployeeKpiTargetEvent` (append-only audit — [[bulk-update-wrote-no-audit]], [[journal-copies-text-not-reference]]):
   `targetId?`, `employeeId`, `action` (`created|updated|deleted|marked_done|reopened`), `payloadJson`
   (o'sha ondagi qiymatlar MATNI, havola emas), `actorId`, `createdAt`. O'chirish **qatorni o'chiradi**,
   lekin event qoladi.
3. **Migratsiya + backfill (idempotent):** har mavjud `KpiProfileMetric` (eng oxirgi versiya, `employeeId`li
   profil) → `EmployeeKpiTarget` qatori (`period='daily'`, `weight` ko'chiriladi). Lavozim-profillari
   backfill QILINMAYDI (ular xodimga emas, lavozimga tegishli — KPI-03 resolveri ularni baza sifatida o'qiydi).
4. **CHECK-larni Prisma SQL bilan mos yoz** ([[expression-index-must-match-prisma-sql]]).
**Fayllar:** `packages/db/prisma/schema.prisma` + yangi migratsiya (`packages/db/prisma/migrations/…`).
API/servis bu fazada YO'Q.
**Testlar (TDD):** (1) migratsiyadan keyin `money` metrikada `currency` NULL bo'lsa CHECK rad etadi; sanoqda
NULL majbur. (2) `@@unique` — bir xil (xodim, metrika, davr) ikkinchi qatorga urinish → rad. (3) backfill:
`employeeId`li profil maqsadi bor xodimda mos `EmployeeKpiTarget` paydo bo'ladi, `targetValue`/`weight` aynan
ko'chgan. (4) backfill **idempotent** — migratsiya ikki marta ishlasa dublikat yo'q. (5) cross-tenant: A
akkaunt B ning target'ini ko'rmaydi.
**Tayyorlik (DoD):** gate yashil · migratsiya lokal `climart_adopt` da qo'llangan · prod DDL «OPS-QADAMLAR»da ·
**hech bir mavjud endpoint javobi o'zgarmagan** (dvigatel hali eski yo'ldan — regress).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-KPI-SODDALASHTIRISH-2026-08.md` — **Faza KPI-01** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> `2026-08-02-menejer-kunlik-kpi-tz-design.md` §2.5 va §9 ni o'qi. `EmployeeKpiTarget` +
> `EmployeeKpiTargetEvent` modellari + migratsiya + profil-maqsadlaridan idempotent backfill. Dvigatelga
> HALI tegma (ko'prik KPI-03). `money↔currency` CHECK, `@@unique`, cross-tenant. TDD, to'liq gate, hisobot → **TO'XTA**.

---

### KPI-02 — CRUD API + ruxsat + append-only audit ☑ HISOBOT (2026-08-10)
**Bo'lim/blok:** KPI-soddalashtirish · **TZ:** §2.1 (katalog), §6.2 (xodim kartasi)
**Ustuvorlik:** P0 · **Bog'liqlik:** KPI-01
**Maqsad:** Menejer bitta xodim KPI'sini **mustaqil qator** sifatida CRUD qila olishi — profil versiyalamasdan,
og'irlik-100% talab qilmasdan.
**Qamrov:**
1. `employee-kpi-target` servis + controller (yangi papka `apps/api/src/modules/manager/kpi/target/`
   yoki mavjud `kpi/` ichida — mavjud naqshga qara):
   - `GET  manager/kpi/employee/:employeeId/targets` — ro'yxat (metrika labeli + birlik + davr + maqsad + og'irlik + oxirgi fakt);
   - `POST manager/kpi/employee/:employeeId/targets` — qo'shish (metricKey katalogdan tekshiriladi);
   - `PATCH manager/kpi/targets/:id` — tahrir (maqsad/davr/og'irlik/active);
   - `DELETE manager/kpi/targets/:id` — o'chirish (qator ketadi, event qoladi);
   - `POST manager/kpi/targets/:id/done` — qo'lda metrika uchun «bajarildi» (o'lchanadiganda **400**).
2. **Ruxsat:** har handler `@RequireHrPermission({ page:'employees', access:'full' })` — controller class
   `HrPermissionGuard` bilan (ikkisidan biri yechilsa ruxsat jim ochiladi, [[mk26-permission-override-contracts]],
   `kpi-permission-gate.test.ts` naqshi). Menejer roli `employees:full` ega bo'lishi — rol matritsasida
   tekshiriladi ([[stale-seeded-db-missing-permission-rows]] — seedda qator yo'q bo'lsa admin ham 403).
3. **AppModule/DI:** yangi modul `ManagerModule` (yoki `kpi`) grafiga **oshkora import** qilinadi
   ([[global-di-injection-unguarded]], [[orphan-module-dead-feature]]) — `app-boot.test.ts` yangi route
   prefiksini ko'radi.
4. Zod sxema: `targetValue` FE'dan **ko'rinish birligida** keladi (so'm), servis tiyinga o'giradi
   ([[manager-kpi-unit-vocabularies]] — metrika birligi ≠ chegara birligi, aralashsa 100× xato). Noma'lum
   `metricKey` → 400 (katalogga tekshir, mavjud `metricDef()` bilan).
**Fayllar:** `apps/api/src/modules/manager/kpi/…` (`.controller/.service/.schema/.test.ts`) ·
tegishli `*.module.ts` · `apps/api/src/app-boot.test.ts` (route guard) · shared API tiplari
(`api-contracts` paketi — [[api-contracts-provenance-tether]], agar shu paket ishlatilsa).
**Testlar (TDD):** (1) har CRUD handleri `employees:full` talab qiladi (metadata testi — guard class'da VA
handlerda). (2) o'lchanadigan metrikaga `/done` → 400. (3) noma'lum `metricKey` → 400. (4) `targetValue`
so'mda kelib tiyinda saqlanadi (100× tekshiruvi — RED test o'z o'lchoving bilan, [[audit-findings-examples-unverified]]).
(5) DELETE qatorni o'chiradi, `EmployeeKpiTargetEvent` `deleted` qoladi. (6) `app-boot.test.ts` yangi
prefiks. (7) cross-tenant 404.
**Tayyorlik (DoD):** gate yashil (api typecheck + lint + vitest) · ruxsat metadata testlari yashil ·
regress (mavjud `manager/kpi/*` route'lar o'zgarmagan).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-KPI-SODDALASHTIRISH-2026-08.md` — **Faza KPI-02** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> KPI-01 modeli ustiga CRUD API (list/create/patch/delete + qo'lda `/done`), har handler `employees:full`,
> modulni AppModule grafiga ULA (app-boot guard), `targetValue` so'm→tiyin, append-only audit event. TDD,
> to'liq gate, hisobot → **TO'XTA**.

---

### KPI-03 — Dvigatel ko'prigi: resolver yangi qatlamdan o'qiydi (per-kun snapshot) ☑ HISOBOT (2026-08-10)
**Bo'lim/blok:** KPI-soddalashtirish · **TZ:** §2.5 (maqsad ustuvorligi), §2.3 (versiya→snapshot), §2.6
**Ustuvorlik:** P0 · **Bog'liqlik:** KPI-01
**Maqsad:** Kunlik/haftalik hisob maqsadni **`EmployeeKpiTarget`** dan olsin (eng yuqori ustuvorlik), va o'sha
kungi maqsad `EmployeeDailyKpiMetric` ga **muhrlansin** — profil-versiyasiga bo'lgan ehtiyojni yo'qotib.
**Qamrov:**
1. `kpi-target.ts` resolveriga (`xodim > bo'lim > lavozim > hisob > profil`) **`EmployeeKpiTarget`ni eng
   yuqori manba** sifatida ulash — sof funksiya shartnomasi o'zgarmaydi, faqat chaqiruvchi (dvigatel)
   endi bu qatorlarni yuklaydi ([[sla-thresholds-in-rule-config-table]] naqshi: bir manba, ko'p o'quvchi).
2. `employee-daily-kpi.service.ts`: hisoblashda **o'sha kungi hal qilingan maqsadni** `EmployeeDailyKpiMetric`
   ga yozadi (agar allaqachon yozmasa — kodda tasdiqla). Bu — tarix muzlatish invarianti; tahrir faqat
   kelajakka ([[per-unit-snapshot-blocks-exact-cost-fix]], [[month-bounds-label-vs-instant]]: sana YORLIQ).
3. **Haftalik/oylik davr** kunlik ballga JIMGINA bo'linmaydi (`kpi-target.ts` dagi mavjud qoida saqlanadi) —
   faqat tegishli davr so'rovida qaytadi.
4. Qo'lda (custom) metrikada fakt = `manualDoneAt` bor/yo'qligi (bajarildi=100%, aks holda 0) — dvigatel uni
   o'lchamaydi, faqat menejer belgisidan o'qiydi.
**Fayllar:** `apps/api/src/modules/manager/kpi/kpi-target.ts` (+ `.test.ts`) ·
`employee-daily-kpi.service.ts` (+ `.test.ts`) · `employee-daily-kpi.cron.ts` (agar yuklash o'zgarsa).
**Testlar (TDD):** (1) `EmployeeKpiTarget` maqsadi profil maqsadidan **ustun** (resolver). (2) target tahrir
qilinsa **o'tgan kun** `EmployeeDailyKpiMetric` maqsadi O'ZGARMAYDI (snapshot mutant bilan tekshiriladi —
[[tz-label-test-vacuous-math-round]]: instantni kun o'rtasidan tanla). (3) `weekly` qator kunlik ballga
kirmaydi. (4) qo'lda metrika: `manualDoneAt` bo'lsa fakt=to'liq, bo'lmasa 0. (5) regress: mavjud
`daily-kpi-fsm`/`kpi-score` testlari yashil.
**Tayyorlik (DoD):** gate yashil · snapshot invarianti testda qulflangan · regress (33+ mavjud KPI testi yashil).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-KPI-SODDALASHTIRISH-2026-08.md` — **Faza KPI-03** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> §2.5/§2.3 ni o'qi. `kpi-target.ts` resolveriga `EmployeeKpiTarget`ni eng yuqori manba qil (sof shartnoma
> o'zgarmaydi); dvigatel kungi maqsadni `EmployeeDailyKpiMetric`ga muhrlaydi (tarix muzlaydi, tahrir faqat
> kelajakka). Haftalik kunga bo'linmaydi, qo'lda metrika `manualDoneAt`dan. TDD, gate, hisobot → **TO'XTA**.

---

### KPI-04 — Soddalashtirilgan UI: xodim kartasi todo-ro'yxati + menejer «barcha KPI» ekrani ☑ HISOBOT (2026-08-10)
**Bo'lim/blok:** KPI-soddalashtirish · **TZ:** §3.5 (tezlik), §6.2 (xodim kartasi)
**Ustuvorlik:** P0 · **Bog'liqlik:** KPI-02
**Maqsad:** «Todo kabi» UX — bitta KPI'ni bir bosishda qo'shish (metrika + maqsad + davr), og'irlik-100%
jadvalisiz; va menejerga **barcha xodimlar KPI'lari** ustidan CRUD ko'rinishi.
**Qamrov:**
1. **Xodim kartasi KPI tabini qayta yoz** (`/hr/employees/[id]/kpi/page.tsx`): butun-katalog jadvali →
   **biriktirilgan KPI kartalari ro'yxati** (metrika · maqsad · davr · oxirgi fakt · [tahrir][o'chir]) +
   «**+ KPI qo'shish**» (metrika tanla → maqsad → davr → saqla). Og'irlik — «▾ Kengaytirilgan» ostida,
   ixtiyoriy. Versiya raqami UI'dan olib tashlanadi (endi versiyalanmaydi). Qo'lda metrikada «bajarildi»
   belgisi + `Qo'lda` badge (mavjud naqsh saqlanadi — tizim hisoblay olmasligi ochiq aytiladi).
2. **Yangi menejer sahifasi `/menejer/kpi`** (`_components/employee-kpi-screen.tsx`): xodimlar kesimida
   barcha biriktirilgan KPI'lar, filtr (xodim/lavozim/davr), inline CRUD. Menejer bo'limining boshqa
   ekranlari naqshida (`sales-plan-screen.tsx`, `expense-budget-screen.tsx`).
3. **Navigatsiya:** `command-palette.tsx` ga `/menejer/kpi` qo'shiladi (menejer sahifalari shu yerda
   ro'yxatlanadi — tekshirilgan).
4. **i18n ru+uz** — barcha yangi matn (`i18n:gate` `components/` ni ko'rmaydi, [[i18n-gate-blind-to-components]]:
   ekran `_components/` da bo'lsa hardcoded matnni QO'LDA tekshir). Tugmalar/label MoySklad emas, menejer
   bo'limi ichki UI — hardcoded taqiq baribir amal qiladi.
5. **Rang/tone** loyiha helperi orqali ([[data-quality-flag-layer]]: NULL≠0 — fakt yo'q ≠ 0; maqsadga
   yetish rangi mavjud tone helperidan).
**Fayllar:** `apps/web/src/app/(app)/hr/employees/[id]/kpi/page.tsx` (**Edit**, Write EMAS — mavjud fayl,
[[never-write-over-existing-test-file]] klassi) · `apps/web/src/app/(app)/menejer/kpi/page.tsx` (yangi) ·
`apps/web/src/app/(app)/menejer/_components/employee-kpi-screen.tsx` (+ `.test.tsx`) ·
`apps/web/src/lib/manager-api.ts` (+`hr-api`) · `apps/web/src/components/command-palette.tsx` ·
`apps/web/src/messages/{ru,uz}.json`.
**Testlar (TDD):** (1) xodim kartasida «+ KPI qo'shish» bir metrika+maqsad bilan POST yuboradi (og'irliksiz).
(2) o'chirish tugmasi DELETE. (3) qo'lda metrikada «bajarildi» `/done` chaqiradi, o'lchanadiganda tugma yo'q.
(4) `/menejer/kpi` xodimlar bo'yicha ro'yxat render qiladi (mock API). (5) i18n: yangi kalitlar ru+uz da
mavjud (`i18n-key-existence`); hardcoded skan (qo'lda). (6) fakt NULL bo'lsa «—», 0 bo'lsa «0» (uch holat).
**Tayyorlik (DoD):** web typecheck+lint+vitest yashil · i18n gate (+ qo'lda `_components` skan) · eski murakkab
jadval olib tashlangan, hech qanday «og'irlik 100%» talabi qolmagan · browser-smoke YO'Q (KPI-06).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-KPI-SODDALASHTIRISH-2026-08.md` — **Faza KPI-04** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> Xodim kartasi KPI tabini todo-ro'yxatga aylantir (Edit), `/menejer/kpi` yangi «barcha KPI» ekrani, og'irlik
> «Kengaytirilgan» ostida ixtiyoriy, qo'lda metrikaga «bajarildi», i18n ru+uz (`_components` hardcoded qo'lda),
> command-palette. TDD, to'liq gate, hisobot → **TO'XTA**.

---

### KPI-05 — Oylik ball og'irlikni IXTIYORIY qabul qiladi (100% majburiyati olib tashlanadi) ☑ HISOBOT (2026-08-10)
**Bo'lim/blok:** KPI-soddalashtirish · **TZ:** §2.2, §4 (qabul→oylik)
**Ustuvorlik:** P1 · **Bog'liqlik:** KPI-03
**Maqsad:** Kompozit oylik ball og'irliklarni **mavjud og'irliklar yig'indisi bo'yicha normallashtirsin** —
«hammasi 100% ga yig'ilishi» majburiyati yo'qoladi; og'irliksiz (`weight=NULL`) KPI ballga **kirmaydi**,
faqat kuzatiladi. To'langan oylar (`HrKpiMonthlyScore`) **qayta yozilmaydi** (snapshot).
**Qamrov:**
1. `kpi-score.ts`: kompozit = Σ(fakt%×weight) ÷ Σ(weight) — faqat `weight>0` qatorlar. `weight=NULL/0` →
   ko'rsatiladi, sanalmaydi. 100% hard-talab olib tashlanadi (soft ogohlantirish UI'da qolishi mumkin).
2. `kpi-accrual.ts` / `HrKpiMonthlyScore` yozuvchi: normallashtirilgan ballni ishlatadi; mavjud oy
   yozuvlari **o'zgarmaydi** (faqat kelgusi hisob).
3. `data-quality.service.ts`: og'irliksiz KPI «o'lchanmagan» emas — u ataylab ballsiz; bayroq mantiqi shuni
   farqlaydi ([[data-quality-flag-layer]], [[briefing-quiet-day-contract]]: o'lchanmagan ≠ signal).
**Fayllar:** `apps/api/src/modules/manager/kpi/kpi-score.ts` (+`.test.ts`) · `kpi-accrual.ts` (+`.test.ts`) ·
`data-quality.service.ts` (+`.test.ts`).
**Testlar (TDD):** (1) og'irliklar {60,40} bo'lsa kompozit avvalgidek; {60} yolg'iz bo'lsa ÷60 (100 emas) —
ya'ni normallashtirish. (2) `weight=NULL` KPI kompozitga kirmaydi, lekin ro'yxatda fakt bilan. (3) o'tgan oy
`HrKpiMonthlyScore` qiymati o'zgarmaydi (snapshot regress). (4) hammasi og'irliksiz → kompozit `null`
(«ballanmagan»), 0 EMAS ([[data-quality-flag-layer]]).
**Tayyorlik (DoD):** gate yashil · payroll accrual regressi yashil (bonus/jarima summasi eski oylar uchun
o'zgarmagan) · `kpi-accrual-wiring.test.ts` yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-KPI-SODDALASHTIRISH-2026-08.md` — **Faza KPI-05** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> §2.2/§4 ni o'qi. `kpi-score.ts` kompozitni mavjud og'irliklar yig'indisiga normallashtirsin (100% majburiyati
> yo'q), `weight=NULL` ballsiz, hammasi ballsiz bo'lsa kompozit `null` (0 emas). O'tgan oy `HrKpiMonthlyScore`
> qayta yozilmaydi. TDD, to'liq gate, hisobot → **TO'XTA**.

---

### KPI-06 — Phase-2 QA: real brauzer verifikatsiya ☑ HISOBOT (2026-08-10)
**Bo'lim/blok:** KPI-soddalashtirish · **TZ:** — (runtime QA)
**Ustuvorlik:** P1 · **Bog'liqlik:** KPI-01…KPI-05
**Maqsad:** Butun oqimni real brauzerda tasdiqlash (`/qa-cohort` naqshi, Playwright MCP) — statik gate
ko'rmagan runtime buglarni tutish ([[browser-qa-catches-what-static-cannot]]).
**Qamrov (QA stsenariylari):**
1. Xodim kartasi: «+ KPI qo'shish» → o'lchanadigan metrika + maqsad + davr → saqla → ro'yxatda ko'rinadi →
   tahrirla → o'chir. Og'irliksiz qo'shilishini tasdiqla.
2. Qo'lda (erkin) KPI: qo'sh → «bajarildi» belgila → fakt to'liqqa o'tadi.
3. `/menejer/kpi`: barcha xodimlar KPI'lari, filtr, inline CRUD.
4. Snapshot: bugun maqsad qo'y → (seed/backdate) o'tgan kun balli o'zgarmasligini tekshir.
5. Ruxsat: `employees:full` bo'lmagan foydalanuvchi CRUD tugmalarini ko'rmaydi/403.
6. Bir raqamni ikki manbadan solishtir (kartadagi fakt vs dvigatel), NULL/0/normal uch holat
   ([[browser-qa-catches-what-static-cannot]]).
**Fayllar:** `apps/web/tests/e2e/kpi-simplify-qa.spec.ts` (yoki `/qa-cohort` sessiya hisoboti) · topilgan
buglar darhol (issiq-kontekst) tuzatiladi.
**Tayyorlik (DoD):** stsenariylar real brauzerda o'tadi · topilgan buglar tuzatilgan · status
**«Phase-2 verified»** ga o'tadi (faqat shu fazadan keyin «verified» deyish mumkin).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-KPI-SODDALASHTIRISH-2026-08.md` — **Faza KPI-06** ni bajar (`/qa-cohort`). O'ZGARMAS QOIDALARga
> amal qil. Yuqoridagi 6 QA stsenariysini real brauzerda (Playwright MCP) yugurt, topilgan buglarni
> issiq-kontekstda tuzat, hisobot → **TO'XTA**.

---

## 📓 HISOBOT JURNALI

> Har faza agenti o'z fazasini tugatgach shu yerga yozadi (append yoki aniq Edit — marker-kesish TAQIQ).
> Shablon: **Nima qilindi · Fayllar · Testlar (yashil son) · Gate natijasi · OPS-QADAM (bo'lsa) · Ochiq qarz.**

### KPI-01 — ✅ 2026-08-10 (Phase-1: strukturaviy + unit + **jonli DB xulq**-tasdiqlangan, browser-smoke YO'Q)

**Nima qilindi.** Yengil, versiyalanmaydigan «biriktirilgan KPI» ombori bazaga kiritildi va mavjud
profil maqsadlari unga idempotent ko'chirildi. **Xulq o'zgarmadi** — dvigatel hali eski yo'ldan
o'qiydi (ko'prik KPI-03), API/servis bu fazada YOZILMADI.

- `EmployeeKpiTarget` — xodim × metrika × davr → maqsad. `targetValue BigInt?` (NULL = raqamsiz
  «todo»), `weight Decimal(5,2)?` (**NULL = oylik balldan tashqarida** — «og'irlik ixtiyoriy» ning
  yagona manbai), `manualDoneAt`, `active`, `@@unique([employeeId, metricKey, period])`,
  2 indeks (`[accountId, employeeId, active]`, `[accountId, metricKey]`).
- `EmployeeKpiTargetEvent` — append-only jurnal; `targetId` **nullable + `onDelete: SetNull`**,
  ya'ni maqsad qatori o'chsa event QOLADI; `payloadJson` — o'sha ondagi qiymatlar **matni**
  ([[journal-copies-text-not-reference]]).
- **🔴 Rejadan CHEKINISH (asoslangan):** rejada `unit` ustuni yo'q edi, lekin `money ↔ currency`
  CHECK'ini **birliksiz yozib bo'lmaydi** — CHECK boshqa jadvalni (`kpi_metric_defs.unit`) ko'ra
  olmaydi. Shuning uchun `unit VARCHAR(10)` qatorga **denormallashtirildi** (aynan
  `sales_plans.plan_type` naqshi) va CHECK ikki tomonlama yozildi. Alternativalar rad etildi:
  kompozit FK (`account_id, key, unit`) built-in metrikani bloklardi — ularning hisob bo'yicha
  `kpi_metric_defs` qatori bo'lmasligi mumkin; trigger — repoda naqsh yo'q.
- `metric_key` ga **FK ATAYLAB YO'Q** (built-in katalogning asl manbai — kod, `kpi-metrics.ts`).
- CHECK'lar: `unit` yopiq lug'at · `period IN (daily, weekly, monthly)` · `currency ↔ unit`
  ikki tomonlama · `target_value >= 0` (NULL ruxsat) · `weight 0…100` (NULL ruxsat) ·
  event `action` yopiq lug'at.
- **Backfill (migratsiya ichida, idempotent):** `employee_id` to'ldirilgan (xodimga biriktirilgan),
  arxivlanmagan profillarning **eng oxirgi versiyasidan** (`LATERAL` + `version DESC`) →
  `period='daily'`, `weight`/`target` **aynan** ko'chadi, valyuta `accounts.currency` dan va faqat
  `money` birlikda. `ON CONFLICT … DO NOTHING` (DO UPDATE ATAYLAB EMAS — menejer tahririni jimgina
  bekor qilardi). **Lavozim profillari ko'chirilmaydi** (ular KPI-03 resolveriga baza bo'lib qoladi).

**Fayllar.** `packages/db/prisma/schema.prisma` (2 model + `Account`/`Employee` back-relation) ·
`packages/db/prisma/migrations/20260810160000_employee_kpi_target/migration.sql` (yangi) ·
`apps/api/src/modules/manager/kpi/employee-kpi-target-schema.test.ts` (yangi, 22 test) ·
`scripts/probe-employee-kpi-target.mts` (yangi, jonli-DB probe) · `todo.md` (4M.10 qarz qaydi).

**Testlar.** TDD: avval **22 RED** (sxema/migratsiya yo'q) va probe RED (`42P01 relation does not
exist`), keyin implementatsiya → yashil.
- Vitest guard: **22/22** — sxema shartnomasi + migratsiya CHECK/backfill matni.
- Jonli DB probe (`climart_adopt`, hammasi rollback qilinadigan tranzaksiyada): **19/19** —
  (1) `money`+currency NULL → **23514**, `count`+currency → **23514**, to'g'ri juftliklar qabul,
  notanish birlik/davr → 23514; (2) takror `(xodim, metrika, davr)` → **23505**, boshqa davr qabul;
  (3) backfill aynan ko'chgan (**14 qator · 4 xodim** — vacuous emasligi alohida o'lchandi),
  lavozim-profil qatori 0, valyuta birlikka mos; (4) backfill bloki qayta yugurtirildi → dublikat
  **yo'q** (18→18); (5) cross-tenant — B hisobining qatori A kesimida ko'rinmaydi;
  (6) target o'chirilgach event qoldi (`target_id` → NULL), notanish `action` → 23514;
  (7) **mutant**: ataylab yangi profil versiyasi qo'yildi → backfill **yangisini** oldi
  (`target=987654 weight=42.00`), ya'ni «eng oxirgi versiya» da'vosi vacuous emas.

**Gate.** `@moysklad/api typecheck` **0** · `pnpm lint:product` **0 error** · `@moysklad/api vitest`
**7500 passed / 1 skipped (531 fayl)** — regress yo'q · `prisma migrate diff --from-url … `
yangi jadvallar bo'yicha **drift yo'q**. i18n gate — UI matn tegilmagani uchun tegishli emas.

**Lokal DB.** Migratsiya `climart_adopt` ga `prisma db execute` bilan qo'llandi (14 qator backfill).
`prisma migrate dev` ISHLATILMADI: shu bazada `_prisma_migrations` **buzuq** — `20260419135104_init`
`finished_at IS NULL` (failed) va jami 2 qator, ya'ni migratsiya tarixi bu yerda haqiqiy emas
([[climart-adopt-local-db-untracked]] tasdiqlandi).

**OPS-QADAM (prod).** `/deploy` → `prisma migrate deploy` migratsiyani `sherset_v2` ga qo'llaydi;
backfill migratsiya ICHIDA va idempotent. Deploydan oldin **pre-deploy backup** (disk 93% —
eski backuplarni tozalash, [[sherset-vps-deploy]]).

**Parallel sessiya.** KPI-02 sessiyasi shu payt ochilgan va to'g'ri to'xtagan (pastdagi bloker
qaydi). Uning `docs/` qaydi shu commitga qo'shildi (bir fayl, ikki hunk) — boshqa hech qanday
begona o'zgarishga tegilmadi.

**Ochiq qarz.** KPI-02 (CRUD API + ruxsat) · KPI-03 (dvigatel ko'prigi — **`kpi-target.ts` hamon
chaqirilmaydi, o'lik kod**; kungi maqsadni `EmployeeDailyKpiMetric` ga muhrlash SHU FAZADA
QILINMADI, mavjudligini KPI-03 kodda tasdiqlashi shart) · KPI-04 (UI) · KPI-05 (og'irlik
normalizatsiyasi) · KPI-06 (brauzer QA). **Browser-smoke YO'Q.**

### KPI-02 — ✅ 2026-08-10 (Phase-1: strukturaviy + unit + **mutant**-tasdiqlangan, browser-smoke YO'Q)

**Nima qilindi.** KPI-01 ombori ustiga CRUD API. Menejer endi xodimga bitta KPI'ni **mustaqil
qator** sifatida biriktiradi — profil versiyalamasdan va og'irliklarni 100% ga yig'masdan.
Mavjud `manager/kpi/*` route'lariga TEGILMADI (regress yo'q).

- **6 route** (`manager/kpi` prefiksi): `GET employee/:id/targets` · `GET targets` (menejer
  ekrani, `employeeId`/`period` filtri) · `POST employee/:id/targets` · `PATCH targets/:id` ·
  `DELETE targets/:id` · `POST targets/:id/done`.
- **Ruxsat:** class `HrPermissionGuard` + **har** handlerda `@RequireHrPermission('employees','full')`.
  O'QISH ham yopiq (`getConfig` dan farqli): ro'yxat maqsad bilan birga **oxirgi faktni** beradi,
  ya'ni ochiq qolsa boshqa xodimning natijasini ko'rsatardi.
- 🔴 **so'm → tiyin SERVERDA** (`Money.fromMajor`, float yaxlitlashsiz). Kirish maydoni
  `targetValue` (ko'rinish birligi), chiqish maydoni `targetMinor` — **nom ataylab boshqa**, aks
  holda FE ham o'girib pul 100× ketardi ([[manager-kpi-unit-vocabularies]]).
- 🔴 **`unit`/`currency` KATALOGDAN**, klientdan emas (DTO'da umuman yo'q → Zod strip). Klient
  `unit: 'money'` yuborsa ham katalog g'olib — DB'ning `currency ↔ unit` CHECK'i buzilmaydi.
- 🔴 **`weight` NULL ≠ 0** — `input.weight ?? null` (`?? 0` EMAS). Sanoq/vaqt metrikasida kasrli
  maqsad **rad etiladi** (jimgina yaxlitlash yo'q).
- **Append-only audit:** har mutatsiya `EmployeeKpiTargetEvent` yozadi; payload — o'sha ondagi
  qiymatlar **matni** (BigInt → string). `update` da `{before, after}`. `delete` da event
  **o'chirishdan OLDIN** va `targetId: null` (havola baribir bo'shardi) — javob faqat payloadda.
- **`/done` fail-closed:** o'lchanadigan metrikada 400; katalogda topilmagan kalit ham 400
  («qo'ldami yo'qmi» aniqlanmasa belgilash mumkin emas).
- `P2002` → 409 tushunarli xabar. Cross-tenant har amalda 404.

**Fayllar.** `apps/api/src/modules/manager/kpi/employee-kpi-target.{schema,service,controller}.ts`
(yangi) · `…/employee-kpi-target.{service,schema}.test.ts` (yangi) ·
`kpi-permission-gate.test.ts` (**Edit**) · `app-boot.test.ts` (**Edit**, route skani) ·
`manager.module.ts` (controller + provider).

**Testlar.** TDD: avval 3 fayl RED (modul yo'q), keyin yashil. **96/96** (37 servis + 14 sxema +
14 ruxsat + 9 app-boot + 22 mavjud). Ruxsat testida **vakuum qo'riqchisi**: prototipdagi HAR metod
ro'yxatda borligi tekshiriladi (yangi handler `@RequireHrPermission`siz qo'shilsa `it.each` uni
ko'rmasdi).

**🔬 Mutant (vakuum emasligi o'lchandi).** Ikki mutant qo'llandi — `unit === 'money'` shoxi
o'chirildi va `weight ?? null` → `?? 0`. **6 test yiqildi** (`5000n ≠ 500000n`, `+0 ≠ null`,
`'5000' ≠ '500000'`). Revert `diff` bilan tasdiqlandi.

**Gate.** api typecheck **0** · `lint:product` **0 error** · api vitest **7601 passed / 2 skipped
(533 fayl)** — regress yo'q.

**🐞 Yo'l-yo'lakay topilgan tuzoq (hujjatlandi).** `manager.module.ts` ning `controllers: [...]`
massivi ichidagi izohga `[[wiki-havola]]` yozilsa, `money-map-wiring` / `briefing-wiring`
testlarining `moduleArray()` parseri (u `indexOf(']')` ishlatadi va izohni TOZALAMAYDI) massivni
erta kesib qo'yadi — ikkala test yiqildi. Izohdan kvadrat qavs olib tashlandi + ogohlantiruvchi
izoh qoldirildi. `app-boot.test.ts` bu tuzoqqa tushmaydi (u `stripComments` qiladi).

**Ochiq qarz.** Ruxsat qatorlari prodda seed qilinganini tekshirish
([[stale-seeded-db-missing-permission-rows]] — `employees:full` qatori yo'q bo'lsa admin ham 403).
**Browser-smoke YO'Q** (KPI-06).
- **2026-08-10 13:53 · bloker qaydi (kod yozilmagan, hech narsaga tegilmagan).** KPI-02 sessiyasi
  ochildi, lekin bog'liqlik tasdiqlanmadi (O'ZGARMAS QOIDA №2):
  - `EmployeeKpiTarget` / `EmployeeKpiTargetEvent` `schema.prisma` da **YO'Q** (0 moslik);
    KPI migratsiyasi yo'q (oxirgisi `20260810150000_lost_customer_reason`); `main` va 3 ta
    `worktree-wf_*` branchda ham yo'q (4/4 = 0). Ya'ni KPI-01 bajarilmagan.
  - KPI-01 ni shu sessiyada bajarishga o'tilganda ma'lum bo'ldiki, **parallel sessiya aynan
    KPI-01 ni yozmoqda**: `apps/api/src/modules/manager/kpi/employee-kpi-target-schema.test.ts`
    (untracked, mtime 13:53:08 — tekshiruv paytidan 5 soniya oldin) — TDD RED bosqichi;
    `schema.prisma` hali tegilmagan, `migrations/20260810160000_employee_kpi_target/` hali yo'q.
  - Sessiya **to'xtatildi** (CLAUDE.md §6.1 — begona o'zgarishga tegma; §6.4 — migratsiya va lokal
    `climart_adopt` umumiy resurs; [[parallel-worktree-duplicate-work]]).
- **Keyingi sessiya uchun:** KPI-01 commit tushganini tasdiqla (`grep "model EmployeeKpiTarget"
  packages/db/prisma/schema.prisma` + migratsiya papkasi), keyin KPI-02 promptini yubor.
### KPI-03 — ✅ 2026-08-10 (Phase-1: strukturaviy + unit + **jonli DB CHECK**-tasdiqlangan, browser-smoke YO'Q)

**Nima qilindi.** Dvigatel endi maqsadni **`EmployeeKpiTarget`** dan oladi (eng yuqori pog'ona) va
o'sha kungi maqsadni `EmployeeDailyKpiMetric` ga **muhrlaydi**. Shu bilan `kpi-target.ts` o'lik
koddan chiqdi (ilgari uni faqat o'z testi va MK22 kaskadi import qilardi).

- **Reja da'vosi TEKSHIRILDI va NOTO'G'RI chiqdi** (O'ZGARMAS QOIDA №2): reja §KPI-03.2 «dvigatel
  kungi maqsadni yozadimi — kodda tasdiqla» degan edi. **Yozmasdi va ustun ham YO'Q edi** —
  `EmployeeDailyKpiMetric` da `autoValue/adjustValue/complete` dan boshqa hech narsa yo'q edi.
  Shuning uchun faza sxema o'zgarishini ham o'z ichiga oldi (KPI-01 hisoboti buni oldindan aytgan).
- **Ustuvorlik zanjiri bitta joyda** (`resolveDailyTargets`): `employee_target` > `target_override`
  (MK13 `KpiTarget`) > `profile` > `none`. `EmployeeKpiTarget` ning `KpiTargetRow` ga siqilmagani
  ATAYLAB: yangi qatlamda `effectiveFrom/To` ham, kun maskasi ham yo'q — siqilsa soxta maydonlar
  (`effectiveFrom: '1970-01-01'`) yozilardi va ular bir kun kelib haqiqiy qoida deb o'qilardi.
- **🔴 Muhr FAQAT `create` da yoziladi, `update` da UMUMAN yo'q.** «Tahrir faqat kelajakka»
  kafolatining butun og'irligi shunda: qayta hisoblash muhrni yangilasa, bugungi tahrir o'tgan
  kunning bajarish foizini va ballini o'zgartirardi. `update` payload'i avvalgidek aynan
  `{autoValue, complete}` (mavjud test buni allaqachon qulflagan).
- **`targetSource` NULLABLE — bu NULL ≠ 0 ning shu fazadagi ko'rinishi.** Muhrlangan «maqsad yo'q»
  (`none`) va **umuman muhrlanmagan** (migratsiyadan oldingi 468 qator) holatlarini faqat shu ustun
  farqlaydi; ikkalasi ham `target_value = NULL` beradi. O'quvchi muhrsiz qatorda avvalgidek profil
  maqsadiga tushadi → **eski kunlar balli o'zgarmaydi**.
- **Qo'lda (custom) metrika fakti** `manualDoneAt` dan: belgi **kun YORLIG'IGA** taqqoslanadi
  (`localDateOnly`), instantga emas. Fakt = maqsad (100%) yoki 0. Raqamsiz «todo» ga shartli birlik
  (`MANUAL_DONE_UNIT = 1n`) beriladi — aks holda maqsad NULL bo'lib, `kpi-score.ts` uni `no_target`
  deb tashlab yuborardi va «bajarildi» belgisi hech qachon ballga aylanmasdi.
- **🔴 REJADAN CHEKINISH (asoslangan):** qo'lda metrika fakti FAQAT `higher_better` yo'nalishda
  to'qiladi. `lower_better` da «bajarilmadi» → fakt 0 bo'lardi, bu esa `kpi-score.ts` formulasida
  **200%** (cap bilan 150%) — ya'ni **ishlamaslik mukofotlanardi**. Bunday ko'rsatkich o'lchanmagan
  bo'lib qoladi va menejer buni `skipReason: 'unmeasured'` bilan ochiq ko'radi.
- Haftalik/oylik qator kunlik ballga **kirmaydi** (mavjud qoida saqlandi). `TARGET_PERIOD` ga
  `monthly` qo'shildi — davr lug'ati endi DB CHECK'i bilan bitta (ikkinchi lug'at ochilmadi).

**Fayllar.** `apps/api/src/modules/manager/kpi/kpi-target.ts` (+`.test.ts`) ·
`employee-daily-kpi.service.ts` (+`.test.ts`) · `daily-kpi-acceptance.service.ts` (+`.test.ts`) ·
`kpi-config.service.ts` · `employee-kpi-target-schema.test.ts` · `packages/db/prisma/schema.prisma` ·
`packages/db/prisma/migrations/20260810180000_daily_kpi_metric_target_seal/migration.sql` (yangi) ·
`scripts/probe-daily-kpi-target-seal.mts` (yangi, jonli-DB probe).

**Testlar.** TDD: sof qatlam **15 RED** → yashil; sxema guard **5 RED** → yashil; dvigatel
**11 RED** → yashil.
- `kpi-target.test.ts` **39** · `employee-daily-kpi.service.test.ts` **43** ·
  `daily-kpi-acceptance.service.test.ts` **22** · `employee-kpi-target-schema.test.ts` **28** ·
  butun `manager/kpi` moduli **440/440**.
- **MUTANT bilan tasdiqlangan** (vacuous emas): (a) o'quvchi testlari — `effectiveTarget` dan muhr
  shoxi olib tashlanganda **2 test yiqildi**, keyin tiklandi; (b) dvigatel muhri — `targetValue`
  ataylab `123_456n` qilinganda muhrga aynan o'sha tushdi.
- **Jonli DB probe** (`climart_adopt`, rollback qilinadigan tranzaksiyada): **12/12** — ikkala ustun
  bor va NULLABLE · mavjud **468 qatordan 0 tasi muhrlangan** (vacuous emasligi alohida o'lchandi) ·
  noma'lum manba → **23514** · «qiymat bor, manba yo'q» → **23514** · to'rt manba ham qabul ·
  rollback haqiqatan bo'ldi.

**Gate.** `@moysklad/api typecheck` **0** · `pnpm lint:product` **0 error** (3 fayl formatlandi) ·
`@moysklad/api vitest` **7601 passed / 2 skipped (533 fayl)** — regress yo'q ·
`prisma migrate diff` yangi ustunlar bo'yicha **drift yo'q**.
⚠️ Birinchi to'liq yugurtishda 2 ta **5000ms timeout flake** bo'ldi (test nomlari ushlanmadi);
keyingi **ikki to'liq yugurtish 0 yiqilish** berdi. i18n gate — UI matn tegilmagani uchun tegishli emas.

**Lokal DB.** Migratsiya `climart_adopt` ga `prisma db execute` bilan qo'llandi (`migrate dev` EMAS —
shu bazada `_prisma_migrations` buzuq, [[climart-adopt-local-db-untracked]]).

**OPS-QADAM (prod).** `/deploy` → `prisma migrate deploy` ikki ustun + 2 CHECK'ni `sherset_v2` ga
qo'llaydi. **Backfill YO'Q va bo'lmasligi ham SHART** — mavjud kunlar muhrsiz qolib, avvalgidek
profil maqsadidan o'qiladi (ya'ni deploy hech bir mavjud kunning ballini o'zgartirmaydi).

**Parallel sessiya.** Ish davomida boshqa sessiya KPI-02 (`employee-kpi-target.{controller,service,
schema}.ts`) va KPI-04 (`menejer/kpi`, `employee-kpi-screen.tsx`) ni yozmoqda edi. Ularga TEGILMADI;
`schema.prisma` diff'i tekshirildi — faqat mening bitta hunk'im (CLAUDE.md §6.1). Commit
hook'larsiz qilindi ([[commit-pathspec-does-not-stop-lint-staged]] — lint-staged begona faylni
qo'shib yuborardi), gate'lar esa qo'lda TO'LIQ yugurtirildi.

**Ochiq qarz.** (1) `weight` hamon FAQAT profil versiyasidan o'qiladi — profilda qatori yo'q
biriktirilgan KPI `no_weight` bilan ballanmaydi; bu **KPI-05** ishi (reja shunday ketma-ketlikda).
(2) `EmployeeKpiTarget` katalogda yo'q kalitga qo'yilsa kun qatori ochilmaydi, ya'ni maqsad
muhrlanmaydi — KPI-02 `metricKey` ni katalogga tekshirgani uchun amalda yopiq, lekin arxivlangan
`KpiMetricDef` holati tekshirilmagan. (3) `manualDoneAt` bitta timestamp: bir kunlik «bajarildi»
belgisi FAQAT o'sha kunga tushadi — takrorlanuvchi kunlik todo uchun har kun qayta belgilash
kerak (KPI-04/06 da UX savoli). **Browser-smoke YO'Q.**

### KPI-04 — ✅ 2026-08-10 (Phase-1: strukturaviy + unit + **mutant**-tasdiqlangan, browser-smoke YO'Q)

**Nima qilindi.** «Todo kabi» UX. Xodim kartasidagi **butun-katalog jadvali** va **«og'irlik
100%»** talabi olib tashlandi; menejerga barcha xodimlar KPI'lari ustidan ekran berildi.

- **Xodim kartasi** (`/hr/employees/[id]/kpi`, **Edit**): katalog jadvali → biriktirilgan KPI
  ro'yxati. Versiya raqami olib tashlandi (qatlam versiyalanmaydi). Hisobning O'Z ko'rsatkichini
  yaratish/tahrirlash **qoldi**, lekin ro'yxatdan PASTGA ko'chdi va «biriktirish» dan ajratildi:
  u katalog amali (metrika TA'RIFI), biriktirish emas.
- **Yangi `/menejer/kpi`** — xodimlar kesimida guruhlangan, xodim/davr filtri, **to'liq inline
  CRUD**: har guruh sarlavhasida «+ KPI qo'shish» (allaqachon biriktirilgan metrika tanlovda
  ko'rinmaydi — server `@@unique` bo'yicha 409 qaytarardi), qatorda tahrir/o'chir/«bajarildi».
  Sahifa yupqa (`menejer/plan` naqshi), mantiq `_components/employee-kpi-screen.tsx` da.
- **Bitta manba, ikki yuza:** `EmployeeKpiTodoList` (xodim kartasi) va `EmployeeKpiScreen`
  (menejer) BIR faylda va bir `TargetRow`/`TargetForm` dan foydalanadi — nusxa qilinsa biri
  jimgina bir shoxni yo'qotardi ([[copy-paste-loses-a-branch]]).
- 🔴 **Og'irlik «▾ Kengaytirilgan» ostida** va yopiq turganda maydon **umuman render
  qilinmaydi** — «ixtiyoriy» ning UI ifodasi. Yopiq bo'lsa so'rovga `weight` TUSHMAYDI.
- 🔴 **Uch holat uch xil:** fakt `null` → `—`, `0` → `0`, qiymat → o'zi. DOM'da uch atribut:
  `data-scored` (og'irlik bor/yo'q), `data-fact-complete` (`none|true|false`), `data-manual`.
- 🔴 **Pul so'mda kiritiladi va SO'MDA yuboriladi** — FE faqat probel/vergulni tozalaydi,
  o'girish serverda (yagona nuqta).
- **«Bajarildi»** faqat `measurable: false` qatorda chiziladi; belgilangan bo'lsa «qayta ochish».
- **Navigatsiya:** menejer subnav (`layout.tsx`) + command-palette (`m.manager-kpi-targets`,
  mavjud kunlik-qabul bandidan ALOHIDA — ikkisi boshqa savolga javob beradi).
- **i18n ru+uz:** `pages.menejer.ekpi_*` (31 kalit) + `subnav.menejer.kpi_targets` +
  `command_palette.commands.go_manager_kpi_targets` — **har ikki tilda +33**, deterministik skript
  bilan (mavjud kalitga tegmaydi).

**Fayllar.** `apps/web/src/app/(app)/menejer/_components/employee-kpi-screen.{tsx,test.tsx}`
(yangi) · `…/menejer/kpi/page.tsx` (yangi) · `…/hr/employees/[id]/kpi/page.tsx` (**Edit** —
486→302 qator) · `src/lib/manager-api.ts` (tiplar + `employeeKpiTargetApi`) ·
`src/components/command-palette.tsx` · `src/app/(app)/layout.tsx` · `src/messages/{ru,uz}.json`.

**Testlar.** TDD: avval RED (modul yo'q) → **22/22** yashil (14 todo-ro'yxat + 8 menejer ekrani).
Inline-qo'shish ham TDD bilan: `ekpi-group-add-*` yo'qligida RED, keyin yashil.

**♻️ Yagona yaratish yo'li.** «Qo'shish» ikki yuzada ham BITTA `AddTargetForm` orqali ketadi
(katalog so'rovi ham unda — shakl ochilmaguncha yuklanmaydi). `TargetForm` dagi metrika tanlovi
**hosila** (`effectiveKey`): katalog asinxron kelgani uchun `useState` boshlang'ich qiymati
eskirib qolar va «hech narsa tanlanmagan» holatda saqlash jimgina ishlamasdi.

**🔬 Mutant.** `showValue` ning `null → '—'` shoxi `'0'` ga, `weight` tashlab yuborish `?? 0` ga
o'zgartirildi → **2 test yiqildi** (`'0' ≠ '—'`, `+0 ≠ null`). Revert `diff` bilan tasdiqlandi.

**Gate.** web typecheck **0** · api typecheck **0** · `lint:product` **0 error** · `i18n:gate`
**9/9** (12 962 kalit skanlandi) · web vitest **3148 passed / 26 skipped (218 fayl)** — regress
yo'q · qo'lda hardcoded skan (`_components` + ikki sahifa) — **0 topilma**.

**🔴 Rejadan CHEKINISH (asoslangan).** Reja `EmployeeKpiTodoList` uchun alohida joy
ko'rsatmagan edi. U `menejer/_components/employee-kpi-screen.tsx` ichida qoldirildi (xodim
kartasi undan nisbiy yo'l bilan import qiladi) — `src/components/` ga chiqarilsa **i18n
key-existence gate uni ko'rmasdi** (gate faqat `app/(app)` ni skanlaydi,
[[i18n-gate-blind-to-components]]).

**Ochiq qarz.** Eski `PUT manager/kpi/employee/:id/config` route'i va `KpiConfigService`
**hamon tirik**, lekin endi UI'dan chaqirilmaydi (`getConfig`/`saveConfig`/`daily` web klientida
o'lik kod bo'lib qoldi) — KPI-05 dan keyin olib tashlash yoki ataylab qoldirish qarori kerak.
**Browser-smoke YO'Q** (KPI-06).

### KPI-05 — ✅ 2026-08-10 (Phase-1: strukturaviy + unit + **jonli DB CHECK**-tasdiqlangan, browser-smoke YO'Q)

**Nima qilindi.** Og'irlik endi HAQIQATAN ixtiyoriy: biriktirilgan KPI o'z og'irligi bilan
kunlik ballga kiradi, og'irliksizi esa faqat kuzatiladi — va ikkalasi ham o'sha kunga
MUHRLANADI, ya'ni bugungi tahrir o'tgan kunning ballini qayta yozmaydi.

**🔴 Rejaning uch bandi kodda tekshirildi (O'ZGARMAS QOIDA №2) — uchalasi ham allaqachon
bajarilgan yoki NOTO'G'RI da'vo bo'lib chiqdi:**

1. **§1 «kompozit mavjud og'irliklar yig'indisiga normallashtirilsin, 100% majburiyati
   olib tashlansin»** — `kpi-score.ts` da **allaqachon shunday edi**: `weightedSum /
   weightScored` (÷100 EMAS), 100% talabi esa bu faylda umuman yo'q edi (u KPI-04 da UI
   tomonidan olib tashlangan). Kod o'zgartirilmadi; shartnoma ikki OSHKORA test bilan
   qulflandi (yolg'iz 60 → ÷60 · 80+80 → ÷160) va **mutant** bilan (`/ weightScored` →
   `/ 100`) vacuous emasligi o'lchandi — 3 test yiqildi, keyin tiklandi.
2. **§2 «`kpi-accrual` / `HrKpiMonthlyScore` yozuvchi normallashtirilgan ballni ishlatsin»** —
   **NOTO'G'RI da'vo**: `HrKpiMonthlyScore` kompozit ballni **umuman o'qimaydi** (u qabul
   qilingan kunlarning SOTUV faktidan hisoblanadi — `select: {autoValue, adjustValue}`),
   `kpi-accrual` esa qabul lahzasida MUZLATILGAN `scorePercent` dan. Ya'ni og'irlik tahriri
   to'langan oyga hech qanday yo'l bilan yeta olmaydi. Kod o'zgartirilmadi; o'rniga
   **tripwire test** qo'yildi (`hr-payroll.service.test.ts`): kunlik so'rov `select` ida
   `weight|score` maydonlari paydo bo'lsa test yiqiladi — «to'langan oy endi jonli qayta
   hisoblanadi» qarori ko'r-ko'rona o'tib ketmasin.
3. **§3 «`data-quality.service.ts` og'irliksizni «o'lchanmagan»dan farqlasin»** — panel
   og'irlikni **umuman o'qimaydi** (bayroq `_count.autoValue` ustidan), ya'ni aralashtirish
   imkoni yo'q. Kod o'zgartirilmadi. Farq `kpi-score.ts` da yashaydi: `no_weight` sababi
   ATAYLAB `unmeasured` dan OLDIN turadi — og'irliksiz qator o'lchov kamchiligi EMAS,
   ataylab ballsiz ([[data-quality-flag-layer]]).

**HAQIQIY qarz shu fazada yopildi** (uni KPI-03 hisobotining o'zi KPI-05 ga qoldirgan edi):
og'irlik hamon **FAQAT profil versiyasidan** o'qilardi, ya'ni profilda qatori yo'q
biriktirilgan KPI **hech qachon ballanmasdi** — «og'irlik ixtiyoriy» va'dasining ikkinchi
yarmi (og'irlik QO'YILSA ballga kirishi) ishlamasdi.

- `EmployeeTargetRow.weight` + yangi sof funksiya **`resolveDailyWeights`** — pog'ona
  **biriktirilgan KPI > profil versiyasi**. 🔴 Qatordagi `weight = NULL` **ham USTUN**:
  menejer ataylab ballsiz qo'ygan KPI'ni profildagi eski og'irlik jimgina qaytarib
  ballamaydi (maqsad tomonidagi «raqamsiz todo pastdagi pog'onani to'sadi» qoidasining
  aynan o'zi).
- **`pickEmployeeRows`** — maqsad ham, og'irlik ham AYNAN bir qatordan olinadi. Tanlov ikki
  joyda takrorlansa, bir kun kelib maqsad bir qatordan, og'irlik boshqasidan kelib, ekrandagi
  raqam hech qaysi sozlamaga mos kelmasdi ([[copy-paste-loses-a-branch]]).
- **Sxema muhri:** `EmployeeDailyKpiMetric.weightApplied` (`Decimal(5,2)?`) + `weightSource`
  (`VarChar(20)?`) — KPI-03 maqsad muhrining AYNAN naqshi. Migratsiya
  `20260810190000_daily_kpi_metric_weight_seal`, **3 CHECK**: manba lug'ati yopiq
  (`employee_target|profile|none`) · muhr butunligi (qiymat bor, manba yo'q — TAQIQ) ·
  `0…100` oralig'i (manbadagi CHECK bilan bir xil, aks holda manbada ruxsat etilgan qiymat
  muhrda tungi hisobni yiqitardi). **Backfill YO'Q** — eski qatorlar muhrsiz qoladi.
- **Dvigatel** muhrni FAQAT `create` da yozadi (`update` payload'i avvalgidek
  `{autoValue, complete}`); **o'quvchi** `effectiveWeight` — muhr ustun, muhrsiz qator
  avvalgidek profil og'irligiga tushadi. Shu sababli jonli bazadagi **468 mavjud kun qatori**
  bu deploydan keyin ham aynan avvalgi ballini beradi.
- **`kpi-score.ts`: `weight: number | null`.** Og'irliksiz qator endi **bajarish foizini
  KO'RSATADI** (kuzatiladi), lekin `contributionPercent: null` va ballga kirmaydi — «og'irlik
  qo'yilmasa KPI shunchaki o'lchanadi» ning kod ifodasi. `NULL ≠ 0`: `ScoredMetric.weight`
  kirishdagi qiymatni AYNAN qaytaradi (qo'yilmagan = `null`, nol qo'yilgan = `0`).

**Fayllar.** `apps/api/src/modules/manager/kpi/kpi-score.ts` (+`.test.ts`) · `kpi-target.ts`
(+`.test.ts`) · `employee-daily-kpi.service.ts` (+`.test.ts`) · `daily-kpi-acceptance.service.ts`
(+`.test.ts`) · `employee-kpi-target-schema.test.ts` · `apps/api/src/modules/hr/hr-salary/
hr-payroll.service.test.ts` · `packages/db/prisma/schema.prisma` ·
`packages/db/prisma/migrations/20260810190000_daily_kpi_metric_weight_seal/migration.sql` (yangi) ·
`scripts/probe-daily-kpi-weight-seal.mts` (yangi, jonli-DB probe).
**`kpi-accrual.ts` va `data-quality.service.ts` — ATAYLAB TEGILMADI** (yuqoridagi §2/§3 sabab).

**Testlar.** TDD: sof ball **3 RED** → yashil · og'irlik resolveri **8 RED** → yashil · sxema
guard **6 RED** → yashil · dvigatel muhri **7 RED** → yashil · o'quvchi **3 RED** → yashil.
- `kpi-score.test.ts` **35** · `kpi-target.test.ts` **47** · `employee-daily-kpi.service.test.ts`
  **51** · `daily-kpi-acceptance.service.test.ts` **26** · `employee-kpi-target-schema.test.ts`
  **35** · `hr-payroll.service.test.ts` **23** · butun `manager/kpi` moduli **474/474**.
- **MUTANT bilan tasdiqlangan** (vacuous emas): (a) `weightedSum / weightScored` → `/ 100`
  qilinganda normallashtirish testlari yiqildi; (b) payroll tripwire — `select` ga
  `weightApplied: true` qo'shilganda darhol yiqildi; ikkalasi ham tiklandi (`git diff` toza).
- **Jonli DB probe** (`climart_adopt`, rollback qilinadigan tranzaksiyada): **16/16** — ikkala
  ustun bor va NULLABLE · mavjud **468 qatordan 0 tasi muhrlangan** (vacuous emasligi alohida
  o'lchandi) · muhrlangan og'irliksizlik qabul qilinadi · noma'lum manba → **23514** · «qiymat
  bor, manba yo'q» → **23514** · `100.01` va `-1` → **23514** · `0`/`100` chegaralari qabul ·
  rollback haqiqatan bo'ldi.

**Gate.** `@moysklad/api typecheck` **0** · `pnpm lint:product` **0 error** (832 warning,
siyosat bo'yicha ruxsat) · `prisma migrate diff` yangi ustunlar bo'yicha **drift yo'q** ·
`@moysklad/api vitest` **7640 passed / 2 skipped (534 fayl) — 0 yiqilish**, regress yo'q.
⚠️ Birinchi to'liq yugurtishda 4 ta **5000ms timeout flake** bo'ldi (KPI-03 hisobotidagi ayni
klass); toza qayta yugurtish **0 yiqilish** berdi. i18n gate — UI matn tegilmagani uchun tegishli emas
(bu faza faqat API/DB).

**Lokal DB.** Migratsiya `climart_adopt` ga `prisma db execute` bilan qo'llandi (`migrate dev`
EMAS — shu bazada `_prisma_migrations` buzuq, [[climart-adopt-local-db-untracked]]).
`prisma generate` qayta yugurtirildi (birinchi urinish EPERM bilan yiqildi, ikkinchisi o'tdi).

**OPS-QADAM (prod).** `/deploy` → `prisma migrate deploy` ikki ustun + 3 CHECK'ni `sherset_v2`
ga qo'llaydi. **Backfill YO'Q va bo'lmasligi ham SHART** — mavjud kunlar muhrsiz qolib,
avvalgidek profil og'irligidan o'qiladi, ya'ni deploy hech bir mavjud kunning ballini
o'zgartirmaydi.

**Parallel sessiya.** Ish davomida boshqa sessiya KPI-02 va KPI-04 ni COMMIT qildi
(`9bd914d7`, `c5b3a173`). Ularning fayllari bilan **kesishma yo'q** (tekshirildi:
`git show --name-only` × mening ro'yxatim = 0). `schema.prisma` diff'i faqat mening bitta
hunk'im (16 qator).

**Ochiq qarz.**
1. `daily-kpi-acceptance.detail()` javobida `weight: … ?? 0` — «og'irlik qo'yilmagan» ekranda
   hamon `0` bo'lib chiqadi (DB'da, sof qatlamda va muhrda esa `null` saqlanadi). Bu maydonni
   `null` ga o'tkazish `apps/web/src/lib/manager-api.ts` ni ham o'zgartirishni talab qiladi —
   u KPI-04 sessiyasining fayli, shuning uchun ATAYLAB tegilmadi (CLAUDE.md §6.1).
2. Eski `PUT manager/kpi/employee/:id/config` + `KpiConfigService` hamon tirik (KPI-04 qarzi) —
   u profil versiyasiga og'irlik yozadi, ya'ni ikkinchi yozuv yo'li ochiq qolgan.
3. `manualDoneAt` bitta timestamp (KPI-03 qarzi) — takrorlanuvchi kunlik todo uchun har kun
   qayta belgilash kerak.
**Browser-smoke YO'Q** (KPI-06).
### KPI-06 — ✅ 2026-08-10 (**Phase-2 verified** — real brauzer + API adversarial; 4 defekt tuzatildi, 1 qarz)

**Nima qilindi.** Butun oqim real brauzerda (Playwright, headless Chromium) va API qatlamida
adversarial tekshirildi. **6 stsenariydan 5 tasi to'liq o'tdi**, 1 tasi (S2) reja kutgan xulqni
BERMADI va qarz sifatida qoldi. **4 defekt topildi va shu sessiyada tuzatildi** (biri — ruxsat
teshigi).

**🔴 Topilma 1 (jiddiy, RUXSAT) — oraliq qamrov to'liq HR huquqiga ko'tarilardi.**
`HrPermissionGuard` ning core-RBAC zaxira sho'basi `scope !== 'NO'` deb yozilgan edi, hujjatlangan
maqsadi esa «core-RBAC **administrator/egasi**» (= `ALL`). Jonli o'lchov: `qa.sotuvchi@qa.local`
(`hrPermissions: []`, core-RBAC `employee.update = OWN_GROUP`) yangi KPI marshrutlarida
**200/201** oldi va **o'z guruhidan tashqaridagi** xodimga (Admin User) KPI **yaratdi**. KPI-02
controlleri o'qishni ataylab `employees:full` ortiga yopgan edi (ro'yxat boshqa xodimning
**faktini** ham beradi) — zaxira sho'ba o'sha qulfni aylanib o'tardi.

- **Sabab-bo'shliq:** mavjud qo'riqchi testlari faqat `ALL` va `NO` ni qoplagan; `OWN`,
  `OWN_GROUP`, `OWN_AND_GROUP` hech qachon o'lchanmagan — bug aynan shu bo'shliqda yashagan.
- **Tuzatish:** `if (scope === 'ALL') return true` (`!== 'NO'` o'rniga).
- **TDD:** 4 yangi test avval **RED** (4 yiqildi / 14 o'tdi) → tuzatishdan keyin **27/27** yashil.
- **Jonli tasdiq:** sotuvchi 3 marshrutda ham **403**; admin **200** (regress yo'q);
  `/hr/employees` sotuvchi uchun hamon **200** (u boshqa yo'ldan boradi — katalog yopilmadi).

**🔴 Topilma 2 (UI) — belgilangan qo'lda KPI ro'yxatda ko'rinmasdi.**
«Bajarildi deb belgilash» bosilgach ekranda o'zgargan yagona narsa — **tugma matni**. Fakt hamon
«—», hech qanday holat belgisi yo'q; menejer qaysi qo'lda KPI bajarilganini ro'yxatdan o'qiy
olmasdi. **Tuzatish:** `data-done` bayrog'i + «Bajarildi» / «Выполнено» badge. Brauzerda tasdiqlandi.

**🔴 Topilma 3 (UI, «ikki manba» sinfi) — fakt SANASIZ chizilardi.**
Karta «Fakt: —» deb yozardi, lekin bu fakt **qaysi kunniki** ekani ekranda yo'q edi. Jonli bazada
oxirgi hisoblangan kun **2026-08-09**, ekran esa **2026-08-10** da ochilgan — ya'ni menejer
kechagi o'lchovni bugungisi deb o'qirdi. `lastFactDate` API javobida bor edi, UI uni chizmasdi.
**Tuzatish:** `Fakt (2026-08-09): —` ko'rinishida sana muhri (`ekpi-fact-date-<id>`).
([[browser-qa-catches-what-static-cannot]])

**🔴 Topilma 4 (matn) — eskirgan va'da.** Xodim kartasi sarlavhasi hamon «Saqlash **yangi versiya
yaratadi**» derdi, holbuki KPI-04 versiyalashni olib tashlagan. `kpi_hint` ru+uz qayta yozildi
(«todo kabi biriktiring… har kun o'z maqsadi bilan muhrlanadi»). Brauzerda tasdiqlandi.

**Stsenariylar bo'yicha natija.**

1. **S1 — xodim kartasi CRUD ✅.** «+ KPI qo'shish» → metrika+maqsad+davr → saqlandi (qator 2→3),
   og'irlik maydoni yopiq («ixtiyoriy» ning UI ifodasi), tahrir/o'chirish ishlaydi, konsol xatosi
   **0**, 4xx/5xx **0**, xom i18n kaliti **yo'q**, «100%» talabi qolmagan.
2. **S2 — qo'lda «bajarildi» ⚠️ QISMAN.** Belgilash `manualDoneAt` ni yozadi va endi ekranda
   ko'rinadi (Topilma 2), **lekin fakt to'liqqa O'TMAYDI**: dvigatel qo'lda faktni faqat KUN
   QAYTA HISOBLANGANDA yozadi (`manualDailyOutcome`: `fact = manualDoneDate === date ? target : 0`).
   Bazada oxirgi hisoblangan kun 2026-08-09, bugungi kun hisoblanmagan → karta fakti `null`
   qoladi. **Bu KPI-03 dvigateli xulqi, KPI-02/04 xatosi emas** — qarz sifatida qoldi (quyida).
3. **S3 — `/menejer/kpi` ✅.** 4 xodim guruhi, 15 qator; xodim filtri (4→1→4) va davr filtri
   (`monthly` → 0 guruh + bo'sh holat) ikki tomonlama ishlaydi; guruh sarlavhasida inline
   «+ KPI qo'shish»; konsol xatosi **0**, 4xx/5xx **0**, xom kalit **yo'q**.
4. **S4 — kun muhri ✅.** `receipt_count` bugun `target=999, weight=77` ga o'zgartirildi →
   **2026-08-09 kunining `target`/`weight` qiymatlari o'zgarmadi** (22 metrika baytma-bayt teng).
   Keyin asl holat tiklandi.
5. **S5 — ruxsat ✅ (tuzatishdan keyin).** Token'siz **401**; `employees:full` siz **403** (3
   marshrut); admin **200**.
6. **S6 — bir raqam ikki manbadan ✅.** Menejer tuzatmasi (`days/:id/adjust`) bilan **uchala
   holat** yaratildi va karta (`/manager/kpi/employee/:id/targets`) bilan dvigatel
   (`/manager/kpi/employee/:id/daily`) **to'liq mos keldi**: `null` (karta «—»), `0` (karta «0»),
   `4500000` (karta «45 000,00 сум»). Tozalash: tuzatmalar `null` ga qaytarildi, baza 14 target
   bilan boshlang'ich holatda.

**API adversarial probe — 31/34 (3 yiqilgan = Topilma 1).** Tasdiqlangan shartnomalar:
so'm→tiyin **serverda bir marta** (`150000` → `15000000`; kasr `250000.55` → `25000055`);
og'irliksiz yaratish → `weight = null` (**0 EMAS**); klient `unit`/`currency` in'yeksiyasi
**e'tiborsiz** (katalog g'olib: `unit=count, currency=null`); takror `(metrika, davr)` → **409**,
boshqa davr → qabul; sanoqda kasr / manfiy / noma'lum metrika / `weight>100` → **400**;
noma'lum xodim va cross-tenant → **404**; `/done` o'lchanadiganda **400**, qo'ldada **201** +
qayta ochish; qisman `PATCH` tegilmagan maydonni saqlaydi.

**Fayllar.** `apps/api/src/modules/hr/hr-auth/hr-permission.guard.ts` (**Edit**) ·
`…/hr-permission.guard.test.ts` (**Edit**, +4 test) ·
`apps/web/src/app/(app)/menejer/_components/employee-kpi-screen.tsx` (**Edit**) ·
`…/employee-kpi-screen.test.tsx` (**Edit**, +4 test) · `apps/web/src/messages/{ru,uz}.json`
(`ekpi_done_badge` yangi, `kpi_hint` qayta yozildi).

**Gate.** api typecheck **0** · web typecheck **0** · `lint:product` **0 error** ·
`i18n:gate` **9/9** · api `src/modules/hr` **984/984 (93 fayl)** · api `kpi-permission-gate` +
`app-boot` **23/23** · web `src/app/(app)/menejer` **119/119 (15 fayl)**.

**⚠️ Muhit haqida halol qayd (o'lchangan).**

1. **4000-portdagi API boshqa worktree'dan ishlayotgan edi** (`D:/projects/sherset-qa-kassa`,
   `8e0a1fc0` = KPI-01) — unda yangi KPI marshrutlari YO'Q, hammasi **404**. Standart `pnpm dev`
   stack'ida brauzer-QA qilgan odam buni «KPI ekrani buzuq» deb o'qirdi. Begona jarayon
   **o'ldirilmadi** (CLAUDE.md §6.4); QA uchun alohida stack ko'tarildi (API `:4001`, web `:3111`,
   `NEXT_DISTDIR=.next-qa`), keyin to'xtatilib artefaktlar tozalandi.
2. **Sessiya davomida parallel sessiya KPI-02/04/05 ni commit qildi** (`9bd914d7`, `c5b3a173`,
   `fbee806a`). S1–S6 o'lchovlari `c5b3a173` (KPI-04) holatida olingan — **KPI-05 (og'irlik
   normalizatsiyasi) brauzerda QOPLANMADI**, u keyin kirdi.
3. **Yo'l-yo'lakay ko'rilgan (meniki EMAS, tegilmadi):** KPI-05 ishi davom etayotgan payt
   `GET /manager/kpi/days` **500** berardi — `PrismaClientValidationError` on
   `employeeDailyKpi.findMany()` (sxema/klient nomutanosibligi). Commit `fbee806a` dan keyin
   qayta o'lchanmagan.

**Ochiq qarz.**

1. **S2 to'liq emas:** qo'lda KPI belgilangach fakt faqat kun qayta hisoblangandan keyin to'ladi.
   Kerak: belgilash paytida o'sha kunni qayta hisoblash (yoki kartada «bugungi kun hali
   hisoblanmagan» holatini ochiq ko'rsatish). Dvigatel fayllari o'sha payt parallel sessiya
   qo'lida edi — ataylab TEGILMADI.
2. **KPI-05 uchun brauzer-QA yo'q** (og'irlik normalizatsiyasi, `weightApplied` muhri) — alohida
   qisqa Phase-2 seansi kerak.
3. `chala ma'lumot` badge'i fakt `null` bo'lgan qatorlarda ham chiqadi («o'lchanmagan» va «chala»
   bir xil ko'rinadi) — o'lchandi, lekin `complete` semantikasi dvigatelda, shu sababli bu
   sessiyada tuzatilmadi.
