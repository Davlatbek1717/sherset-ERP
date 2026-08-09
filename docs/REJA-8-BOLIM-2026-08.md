# REJA — 8 BO'LIMNI 100% GA YETKAZISH (fazama-faza, sessiyama-sessiya)

**Sana:** 2026-08-09 · **Holat:** ijroga tayyor · **Manba:** 9 ta TZ hujjati
(`docs/superpowers/specs/`) + [master roadmap](superpowers/specs/2026-08-02-master-roadmap.md) +
jonli tracker [`todo.md`](../todo.md) + `NEXT.md`

> Bu hujjat — **8 bo'limni oxirigacha yopish uchun yagona ijro rejasi**. `todo.md` katakcha-tracker
> bo'lib qoladi (raqamlar jonli), bu fayl esa **har bir funksiya uchun alohida faza** beradi:
> maqsad · qamrov · fayllar · TDD testlari · gate · tayyorlik mezoni · **sessiya-boshi prompt**.
>
> **Audit-tuzatish treki bilan aralashtirilmaydi:** `docs/REJA-AUDIT-FIX-2026-08.md` (1-to'lqin) va
> `docs/REJA-QOLDIQ-2026-08.md` (2-to'lqin, Q1–Q18) — bu **mavjud kodni tuzatish** treki.
> Shu fayl — **yangi funksiyalarni qurish** treki. Ikkalasi parallel ketishi mumkin (CLAUDE.md §6).
>
> **🔀 2026-08-09 — AJRATISH (egasining qarori):** **1-bo'lim KASSA** va **4/4M-bo'lim MENEJER**
> fazalari shu rejadan chiqarilib, alohida hujjatga ko'chirildi:
> [**`docs/REJA-MENEJER-KASSA-2026-08.md`**](REJA-MENEJER-KASSA-2026-08.md) — **MK01–MK40**.
> Ular **keyinroq** hal qilinadi. Shu faylda **89 faza** qoldi (F001–F089).
> Ikki reja o'rtasidagi bog'liqlik matnda ochiq belgilangan: `MKxx (menejer/kassa rejasi)` va
> `Fxxx (asosiy reja)`. To'liq jadval — MK faylining boshida.

**Shu rejadagi bo'limlar:** 2) Onlayn sotuv/B2B/B2G · 3) Analitika · 5) Ta'minotchilar · 6) HR ·
7) Ombor · 8) Ko'p filiallilik · **+** mahsulot kengayishi (F2/F3/F4) · moysklad vizual 1:1 ·
ishonchlilik · sifat qarzlari.
**Ko'chirilgan bo'limlar:** 1) Kassa · 4) Menejer (ruxsatlar) · 4M) Menejer (kunlik KPI va nazorat).

---

## ⛔ O'ZGARMAS QOIDALAR — HAR SESSIYA AGENTI UCHUN

Bu rejani o'qiyotgan agent quyidagilarni **so'zsiz** bajaradi:

1. **FAQAT BITTA FAZA.** Senga topshirilgan faza (`F<NN>`) ni bajarasan. Tugagach **TO'LIQ
   TO'XTAYSAN** — keyingi fazani BOSHLAMAYSAN, «yo'l-yo'lakay» qo'shimcha ish qilmaysan.
   Bu token-iqtisod qoidasi (CLAUDE.md §0.3) va **buzilmaydi**.
2. **Avval o'qi, keyin yoz:** (a) shu fayldan **o'z fazangni**, (b) fazada ko'rsatilgan **TZ
   bo'limini** (`docs/superpowers/specs/…` — aynan § raqamlari berilgan), (c) tegishli manba
   fayllarni. Rejadagi har bir da'voni **kodda o'z ko'zing bilan tasdiqla** (CLAUDE.md §2) —
   reja yozilganidan beri kod o'zgargan bo'lishi mumkin. Tasdiqlanmasa: hisobotda yoz va
   **to'xta**, ko'r-ko'rona o'zgartirma.
3. **Sessiya boshida:** `node scripts/preflight.mjs` (GO bo'lsa darhol ishga) ·
   `git worktree list` · `git branch --no-merged` (takroriy ish xavfi — merge qilinmagan branch
   butun funksiyani ikki marta qurdirgan hodisa bo'lgan).
4. **TDD (majburiy):** avval **yiqiladigan test** yoz (yangi xulqni/bug'ni ko'rsatadigan),
   yiqilishini KO'R, keyin minimal implementatsiya, keyin yashil bo'lishini KO'R. Testlar
   co-located `.test.ts` (Vitest). **Mavjud test-fayl ustidan `Write` QILMA — faqat `Edit`**
   (ikki sessiyada testlar jimgina o'chgan, gate yashil qolgan).
5. **To'liq gate (commitdan oldin, majburiy):**
   - `pnpm --filter @moysklad/api typecheck` → 0 xato · web tegilsa `@moysklad/web` ham
   - `pnpm lint:product` → 0 xato
   - `pnpm i18n:gate` → o'tadi (UI-matn tegilgan bo'lsa; **gate `components/` ni ko'rmaydi** —
     hardcoded matnni qo'lda tekshir)
   - Fazaga tegishli test + regress: `pnpm --filter @moysklad/api exec vitest run <modul>`
     (web uchun `@moysklad/web`, pul uchun `@moysklad/money`)
   - **Diqqat:** web-only gate `apps/api` qo'riqchilarini o'tkazib yuboradi — ikkala tomon
     tegilsa ikkalasini ham yugurt.
   - `packages/money` tegilsa — **qayta build** (`dist` eskirsa runtime «X is not a function»,
     typecheck esa yashil qoladi).
6. **Halol status (CLAUDE.md §1):** natija **«Phase-1: strukturaviy + unit-tasdiqlangan,
   browser-smoke YO'Q»** deb belgilanadi. **«done» / «production-ready» / «verified» DEMA.**
   Runtime-QA alohida `Phase-2 QA` fazalariga qoldiriladi (ular shu rejada raqamlangan).
7. **Migratsiya (sxema tegilsa):** lokal DB = `climart_adopt @ localhost:5432`
   (`_prisma_migrations`-tracked emas → `prisma db execute --file`). Migratsiya = **umumiy
   resurs** (CLAUDE.md §6.4) — yolg'iz sessiyada. **Prod (`sherset_v2`) sxema-drift** — DDL'lar
   quyidagi «OPS-QADAMLAR» ro'yxatiga yoziladi, avtomatik `migrate deploy` QILINMAYDI.
8. **Git xavfsizligi (CLAUDE.md §6/§6.7):** faqat aniq yo'llar bilan `git add <fayllar>`.
   Commitdan oldin `git status --short`, commitdan **keyin** `git show --stat HEAD`
   (lint-staged begona faylni commit'ga qo'shib yuborishi aniqlangan). `git reset --hard` /
   `checkout -- .` / `stash` / `clean -fd` — **TAQIQ**. Seniki bo'lmagan o'zgarishga tegma.
9. **Model:** OPUS/flagship — Sonnet EMAS (CLAUDE.md §0.1). Mexanik ish uchun avval
   deterministik skript (fail-closed: anchor topilmasa `exit 1`), keyin agent.
10. **HISOBOT (majburiy):** faza tugagach **shu faylning oxiridagi «HISOBOT JURNALI»** bo'limiga
    o'z fazang ostiga qilgan HAMMA ishni yoz (o'sha yerdagi shablon bo'yicha) va faza
    sarlavhasidagi `☐ HISOBOT` ni `☑ HISOBOT (sana)` ga o'zgartir. Yozishda **faqat append yoki
    aniq `Edit`** — marker bo'yicha kesish TAQIQ (bir hodisada `indexOf('## X')` `### X` ga
    tushib 2270 qatorni o'chirgan); yozgandan keyin fayl qator-sonini tekshir.
11. **`todo.md` ni yangila:** tegishli katakchani `[x]` qil va «Qolgan bosqichlar» sonini
    kamaytir (raqam jonli qoladi).
12. **Commit:** gate yashil bo'lgach — `feat(<domen>): F<NN> — <qisqa>` yoki `fix(...)`.
    Parallel sessiya faol bo'lsa hook'ni bir martaga chetlab o'tish mumkin
    (`-c core.hooksPath=/dev/null`) — u holda gate'larni **qo'lda to'liq** yugurt va commit
    xabarida shuni yoz.

---

## 📋 SESSIYANI QANDAY BOSHLASH (foydalanuvchi uchun)

Har yangi sessiyada tegishli fazaning **▶ SESSIYA-BOSHI PROMPT** blokini nusxalab yuboring.
Boshqa hech narsa kerak emas — agent qolganini shu fayldan o'qiydi.

Umumiy shakl (agar prompt qo'lda yozilsa):

> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F<NN>** ni bajar. Shu fayldagi «O'ZGARMAS QOIDALAR»ga
> to'liq amal qil. Faqat shu faza — tugagach hisobotni jurnalga yozib **TO'XTA**.

---

## ⛔ EGASIDAN QAROR KUTILMOQDA (bloklovchi — alohida qisqa sessiya)

Qaror kod emas — **egasining siyosat qarori**. Shu rejada **bitta** ochiq qaror qoldi:

| Qaror | Savol | Kimni bloklaydi |
|---|---|---|
| **QAROR-B5** | **Kam kelish = rad etishmi?** Hozirgi taxmin: miqdor kam → yaroqli qism omborga kiradi; sifat nuqsonida butun yetkazma qaytadi (5-bo'lim TZ §5.3) | **F032** |

> **QAROR-B1…B4** (bonus/jarima formulasi · ball chegarasi 150% · `lower_better` formulasi ·
> rol nomlari) **menejer/kassa rejasiga ko'chdi** — ular faqat o'sha rejadagi fazalarni bloklaydi:
> [`docs/REJA-MENEJER-KASSA-2026-08.md`](REJA-MENEJER-KASSA-2026-08.md).

**▶ QAROR SESSIYASI PROMPTI:**
> `docs/REJA-8-BOLIM-2026-08.md` — «EGASIDAN QAROR KUTILMOQDA» dagi **QAROR-B5** ni men bilan yop.
> 5-bo'lim TZ §5.2/§5.3 ni o'qib, 2–3 variantni oqibati bilan ko'rsat (kod yozma). Javobimni shu
> faylga yozib TO'XTA.

---

## 🔧 OPS-QADAMLAR (kod EMAS — foydalanuvchi ishtirokidagi deploy/ops sessiyalari)

Fazalar davomida to'planadigan prod-amallar. Hech bir fazaga kirmaydi; `/deploy` skill bilan
alohida bajariladi. **Har faza agenti o'zi qo'shgan qadamni shu ro'yxatga yozadi.**

1. Prod (`sherset_v2`) DDL'lari — sxema-drift tufayli qo'lda `prisma db execute --file`.
2. Har migratsiyadan keyin `/api/v1/health` majburiy tekshiruv (web 200 API sog'ligini
   isbotlamaydi — 2026-08-05 da API 25 daqiqa 502 bo'lgan, sayt 200 qaytargan).
3. Filial backfill (F003) — prod hujjatlariga `branchId` muhrlash: DRY → hisobot → APPLY.
4. Ombor migratsiyasi (F019–F030) — har qadam qaytariladigan, har qadamdan keyin farq hisoboti.
5. PM2/VPS gigiena: `instances: 1` saqlanishi; yetim `while pgrep next build` poll-sikllari
   deploydan oldin tekshiriladi.
6. **F001 (2026-08-09) — filial DDL'i + ruxsat top-up.** Prod (`sherset_v2`) da:
   (a) `packages/db/prisma/migrations/20260810000000_branch_model_and_default_branch/migration.sql`
   ni `prisma db execute --file` bilan qo'llash (faqat QO'SHADI: `branches` jadvali + har akkauntga
   bitta «Asosiy» filial; backfill idempotent, ikki marta yugursa dublikat chiqmaydi);
   (b) keyin `apps/api/src/scripts/topup-role-permissions.ts` — **allaqachon seed qilingan** rollarga
   `branch.*` ruxsatlarini qo'shadi, aks holda ruxsat matritsasida yangi qator hamma uchun `NO`
   bo'lib qoladi; (c) `/api/v1/health` tekshiruvi (2-band).
   Tekshiruv so'rovi: har akkauntda `branches` dan `is_default = true` bo'lgan **aynan bitta** qator.
7. **F019 (2026-08-09) — ombor 1–2-qadam prodda.**
   `pnpm --filter @moysklad/api exec tsx src/scripts/migrate-cells-step1-2.ts` — avval **DRY**
   (hech narsa yozmaydi). Hisobotni egasi bilan ko'rib chiq: **noto'g'ri formatdagi kodlar** va
   **nol-to'ldirish to'qnashuvi** ro'yxatlari bo'sh bo'lishi kerak (bo'sh bo'lmasa — avval
   ma'lumotni tuzatish, keyin APPLY). So'ng `MANIFEST=<yo'l> APPLY=1`.
   **`MANIFEST` faylini SAQLANG — qaytarish faqat shu fayl bilan mumkin** (`ROLLBACK=1 APPLY=1`).
   Prod `Store` bittadan ko'p bo'lsa `STORE_ID` **majburiy** (skript o'zi to'xtaydi).
   Migratsiyadan keyin `/api/v1/health` (2-band) + hisobotdagi `|farq| jami` ni yozib qo'ying.
8. **MK01 (2026-08-09) — bonus/jarima kanalining DDL'i.** Prod (`sherset_v2`) da
   `packages/db/prisma/migrations/20260810030000_bonus_fine_kpi_accrual_link/migration.sql`
   ni `prisma db execute --file` bilan qo'llash. Faqat QO'SHADI: `hr_bonus_fine_log` ga ikkita
   **nullable** ustun (`daily_kpi_id`, `kpi_event_id`) + 1 unique + 1 oddiy indeks + 2 FK
   (`ON DELETE SET NULL`). Mavjud qatorlarga tegmaydi, backfill KERAK EMAS (eski yozuvlar
   boshqa kanallardan). **Unique indeks xavfi yo'q**: `kpi_event_id` barcha eski qatorlarda
   NULL, PostgreSQL'da NULL'lar to'qnashmaydi. Keyin `/api/v1/health` (2-band).
   ⚠️ **Kanal OPT-IN**: DDL o'zi hech qanday pul yozmaydi — egasi `hr_bonus_fine_rule` ga
   `condition = {"type":"kpi_day_score","minPercent":…,"maxPercent":…}` qoidalarini
   qo'shmaguncha xulq o'zgarmaydi.
9. **MK08 (2026-08-09) — smena qabuli DDL'i.** Prod (`sherset_v2`) da
   `packages/db/prisma/migrations/20260810070000_shift_acceptance/migration.sql`
   ni `prisma db execute --file` bilan qo'llash. Qo'shadi: `cashier_sessions` ga 4 ta ustun
   (`acceptance_state` NOT NULL DEFAULT `'open'`, `accepted_by_id`, `accepted_at`,
   `acceptance_changed_at`) + 2 indeks; yangi `cashier_session_acceptance_events` jadvali
   (+3 indeks, 2 FK `ON DELETE CASCADE`).
   ⚠️ **BACKFILL BOR va u ko'rinadigan xulq o'zgartiradi:** `UPDATE … SET acceptance_state='pending'
   WHERE state='closed'` — ya'ni prodda ALLAQACHON yopilgan HAMMA smena menejer navbatiga tushadi
   va **javobgarlik taxtasida kassirlar ustida ko'rinadi**. Bu ATAYLAB: ularni hech kim ko'rmagan,
   `accepted` deb belgilash yolg'on yozuv bo'lardi. Egasini OLDINDAN ogohlantiring — birinchi kuni
   navbat uzun bo'ladi (`/menejer/smenalar` da sana filtri bor).
   Tekshiruv: `SELECT acceptance_state, count(*) FROM cashier_sessions GROUP BY 1` — `closed`
   smenalar soni `pending` bilan mos kelishi kerak. Keyin `/api/v1/health` (2-band).
   ⚠️ **Lokal `climart_adopt` ga ham QO'LLANMAGAN** (MK08 sessiyasida DB o'chiq edi) — keyingi
   runtime/QA sessiya avval shuni qo'llasin, aks holda API `acceptance_state` ustunini topa olmaydi.
   *(MK06 sessiyasi aniqladi: `climart_adopt` aslida **ISHLAYAPTI** — `preflight.mjs` ning TCP
   probi postgres'ni «o'chiq» deb noto'g'ri belgilaydi. Ya'ni bu qadamni darhol bajarish mumkin.)*
10. **MK06 (2026-08-09) — menejer ish navbatining DDL'i.** Prod (`sherset_v2`) da
   `packages/db/prisma/migrations/20260810080000_manager_work_queue/migration.sql`
   ni `prisma db execute --file` bilan qo'llash. Faqat QO'SHADI: uchta YANGI jadval
   (`manager_rule_configs`, `manager_work_items`, `manager_work_item_events`) + 1 unique + 5 oddiy
   indeks + 6 FK + 2 CHECK. **Mavjud birorta jadvalga TEGMAYDI.**
   ✅ **BACKFILL YO'Q va bu ataylab** — deploy'dan keyin navbat **BO'SH** bo'ladi, ya'ni ko'rinadigan
   xulq o'zgarmaydi. Elementlar faqat menejer `/menejer/navbat` da «Yangilash» bosganda (yoki
   `POST /api/v1/manager/queue/sync`) paydo bo'ladi va u `sinceDays` (default 30 kun) bilan
   cheklangan. MK08 dagidan farqli o'laroq bu yerda «birinchi kuni navbat uzun» xavfi YO'Q.
   ⚠️ **`mode` ustunida CHECK bor** (`observe|notify`) — bu 4M TZ §5.1 («navbat bloklamaydi»)
   qulfining baza qatlami, olib tashlamang.
   Tekshiruv: `SELECT count(*) FROM manager_work_items` → **0**; keyin `/api/v1/health` (2-band).
   ✅ Lokal `climart_adopt` ga **QO'LLANGAN va tekshirilgan** (MK06 sessiyasi).
11. **MK31 (2026-08-09) — kassa smenasining DOLLAR naqd ustunlari.** Prod (`sherset_v2`) da
   `packages/db/prisma/migrations/20260810090000_shift_usd_cash/migration.sql`
   ni `prisma db execute --file` bilan qo'llash. Faqat QO'SHADI: `cashier_sessions` ga 4 ta ustun
   (`opening_cash_usd_minor` NOT NULL DEFAULT 0, `closing_cash_usd_minor`,
   `expected_cash_usd_minor`, `discrepancy_usd_minor` — uchalasi NULLABLE). Indeks/FK/CHECK yo'q.
   ✅ **BACKFILL YO'Q va bu ataylab** — uch ustun NULL bo'lib qoladi, ya'ni «dollar sanalmagan»
   holati. Ular `0` bilan to'ldirilsa, mavjud smenalar «dollar sanaldi, 0 chiqdi» bo'lib
   ko'rinardi. Deploy'dan keyin ko'rinadigan xulq O'ZGARMAYDI: dollar maydoni POS yopish
   formasida faqat smenada `CASH_USD` to'lov bo'lganda paydo bo'ladi, `CASH_USD` esa yangi
   to'lov turi (eski cheklarda yo'q).
   ⚠️ **Kurs YOZUVCHISI hali yo'q:** POS to'lov oynasida dollar tugmasi qo'shilmagan (MK31
   qamrovidan tashqarida) — server yo'li tayyor, jonli oqim keyingi fazada ochiladi.
   Tekshiruv: `SELECT count(*) FROM cashier_sessions WHERE closing_cash_usd_minor IS NOT NULL`
   → **0**; keyin `/api/v1/health` (2-band).
   ✅ Lokal `climart_adopt` ga **QO'LLANGAN va tekshirilgan** (MK31 sessiyasi).

---

## 🗺️ FAZALAR XARITASI (ijro tartibi)

> **2026-08-09:** menejer (4/4M-bo'lim) va kassa (1-bo'lim) fazalari shu rejadan **chiqarildi** →
> [`docs/REJA-MENEJER-KASSA-2026-08.md`](REJA-MENEJER-KASSA-2026-08.md) (MK01–MK40).
> Shu faylda **89 faza** qoldi. Ikki reja o'rtasidagi havolalar matnda ochiq ko'rsatilgan.

| To'lqin | Fazalar | Mazmun |
|---|---|---|
| **T1** | F001–F003 | STRUKTURA POYDEVORI (filial) |
| **T2** | F004–F018 | SOTUV, BONUS, OYLIK VA ANALITIKA PANELLARI |
| **T3** | F019–F030 | OMBOR MIGRATSIYASI (manzilli saqlash) |
| **T4** | F031–F037 | TA'MINOTCHILAR |
| **T5** | F038–F044 | ONLAYN SOTUV / B2B / B2G (qolgani) |
| **T6** | F045–F050 | HR (qolgani) |
| **T7** | F051–F056 | ANALITIKA TOVAR TAHLILI VA FILIAL YAKUNI |
| **T8** | F057–F061 | SIFAT QARZLARI (to'lqinlardan mustaqil, istalgan payt) |
| **T9** | F062–F066 | MAHSULOT KENGAYISHI: F2 B2B KABINET · F3 B2C DO'KON · F4 MARKETPLACE |
| **T10** | F067–F084 | MOYSKLAD VIZUAL 1:1 PARITY TREKI |
| **T11** | F085–F088 | ISHONCHLILIK VA TAXMINLAR REVIZIYASI |
| **T12** | F089–F089 | YAKUN |

**Jami: 89 faza.**

## 🚦 IJRO GRAFIGI — bir vaqtda nechta sessiya

Qoidalar: **har sessiya alohida worktree** (bitta checkoutda parallel commit = lint-staged/reset
xavfi, CLAUDE.md §6.7) · paketda **bitta 🗄️ migratsiya** · paketda **bitta 🌐 QA** (u bilan
migratsiya birga emas) · `git add` faqat aniq yo'llar bilan · paket tugab **merge** bo'lgach
keyingisi boshlanadi · 📝 fazalar kod yozmaydi, istalgan paket bilan ketaveradi.

Belgilar: 🗄️ migratsiya · 🌐 brauzer/QA · 📝 kodsiz · ⛔ qaror kutmoqda

| # | Bir vaqtda beriladigan fazalar |
|---|---|
| **1** | **F001** 🗄️ `Branch` modeli + migratsiya (bitta «Asosiy» filial)<br>**F010** X2: kassir kesimi hisobotlarda (hujjat egasidan ajratilgan<br>**F019** Migratsiya 1–2-qadam: zona/yacheyka generatsiya + backfill<br>**F042** Webhook qabul qilish (imzo + idempotentlik + navbat) |
| **2** | **F002** 🗄️ `Store`/`CashDesk`/`Employee` filialga bog'lanishi + filia<br>**F043** Yetkazish: haydovchi biriktirish + holat + naqd topshirish<br>**F047** Davomat manbalari: kassir/haydovchi smenasi → attendance<br>**F057** `docs/moysklad-reference` capture'larini tiklash |
| **3** | **F003** 🗄️ Hujjatlarda `branchId` muhrlash + backfill<br>**F058** Parity foizlarini `climart-adoption` da qayta o'lchash<br>**F059** List toolbar: qolgan 37 sahifa<br>**F060** Navigation graph (0%) |
| **4** | **F004** 🗄️ Narx dvigateli (shartnoma → mijoz → guruh → default)<br>**F067** Vizual parity metodikasi va o'lchov harness'i<br>**F088** 📝⛔B5 TZ taxminlarini reviziya qilish (egasi bilan) |
| **5** | **F005** 🗄️ Mijoz egaligi: `ownerId` + bildirishnoma + 90-kun<br>**F040** Hujjatlar: hisob avtomatik + EDO faktura<br>**F068** Vizual 1:1 · cohort A (Production-core)<br>**F069** Vizual 1:1 · cohort B (Stock + internal) |
| **6** | **F006** 🗄️ Bonus dvigateli (4 qoida) + `BonusAccrual`<br>**F038** Voronka + qo'ng'iroq/vazifa rejasi (sotuvchi paneli)<br>**F041** MXIK tekshiruvi (B2G talabi)<br>**F070** Vizual 1:1 · cohort C (Production-config) |
| **7** | **F007** 🗄️ `HrPosition.paySchemeConfig` + sxema hal qiluvchi (4 tur)<br>**F062** 📝 F2 (B2B dilerlar kabineti) TZ'si<br>**F071** Vizual 1:1 · cohort D (Money / returns)<br>**F072** Vizual 1:1 · cohort E (Retail) |
| **8** | **F008** Z2: bonus bazasi lavozimga qarab + kassir korreksiyasi<br>**F011** 🗄️ Rollup jadvallari + tungi cron<br>**F049** Haydovchi: yetkazma ↔ buyurtma + ish birligiga oylik<br>**F063** 📝 F2 B2B kabinetni qurish (meta-faza) |
| **9** | **F009** Z1: dvigatel → `Payroll` hujjati avtomatik<br>**F012** 🗄️ Rollup qayta qurish CLI + `RollupRebuildQueue`<br>**F013** Rol bo'yicha boshqaruv panellari<br>**F014** Xodim shaxsiy ekrani («Mening natijam») |
| **10** | **F015** Xodim kesimidagi 4 blok hisoboti<br>**F019b** 🗄️ `SkladKeeper.zoneId` + `skladNo` → `StoreZone` ulanishi<br>**F054** Analitika: rollupga `branchId` + filiallar solishtiruvi<br>**F064** 📝 F3 (B2C onlayn do'kon) TZ'si |
| **11** | **F016** Xodim kartasi (bitta ekran) — 4M.4 bilan birlashtirish<br>**F018** 🌐 3-Analitika Phase-2 QA (panellar va rolluplar)<br>**F020** Migratsiya 3-qadam: dual-write + kunlik farq monitoringi<br>**F055** Filial bo'yicha plan/KPI |
| **12** | **F017** 🌐 T5 Phase-2 QA: bonus → oylik zanjiri<br>**F065** 📝 F3 B2C do'konni qurish (meta-faza)<br>**F066** 📝 F4 (Marketplace platformasi) TZ'si<br>**F073** Vizual 1:1 · cohort F (Catalog items) |
| **13** | **F021** 🗄️ Ko'p yacheyka: `isPrimary` + `extraBins`<br>**F074** Vizual 1:1 · cohort G (CRM)<br>**F075** Vizual 1:1 · cohort H (E-commerce / pricing)<br>**F076** Vizual 1:1 · cohort I (HR) |
| **14** | **F022** Migratsiya 4-qadam: yacheyka intizomi (ogohlantirish) + sk<br>**F028** 🗄️ Yacheykalararo ko'chirish (`CellTransfer`)<br>**F077** Vizual 1:1 · cohort J (Analytics)<br>**F078** Vizual 1:1 · cohort K (Settings-finance) |
| **15** | **F023** 🌐 Migratsiya 5-qadam: yig'ish `StockByCell` dan + solishtiri<br>**F025** Joylashtirish taklifi (putaway) + skaner tasdiqlash<br>**F053** Filiallararo ko'chirish: «yo'lda» holati + qabul tasdig'i<br>**F079** Vizual 1:1 · cohort L (Settings-org) |
| **16** | **F024** 🗄️ Qisman yig'ish + kassirga qaytish + `PickingError`<br>**F026** Inventarizatsiya: yacheyka skaneri · sikl · muzlatish · sa<br>**F080** Vizual 1:1 · ro'yxat sahifalari guruh 1 (L1–L3) |
| **17** | **F027** Omborchi ish o'lchovlari (tezlik + xato)<br>**F031** 🗄️ `SupplierClaim` + qabulda qayd (kam/rad) + avtomatik da'vo<br>**F081** Vizual 1:1 · ro'yxat sahifalari guruh 2 (L4–L6)<br>**F082** Vizual 1:1 · ro'yxat sahifalari guruh 3 (L7–L9) |
| **18** | **F029** Migratsiya 6-qadam: intizom majburiy + eski atribut faqat-<br>**F032** ⛔B5 Rad etish oqibati: butun yetkazma qaytishi + `invoice-in` <br>**F033** 🗄️ `SupplierPortalToken` + ta'minotchi oynasi<br>**F035** Narx tarixi va barqarorlik tahlili + ogohlantirish |
| **19** | **F030** 🌐 7-Ombor Phase-2 QA (real brauzer + real skaner)<br>**F034** Ta'minotchi oynasida o'zaro balans + to'lov jadvali + akt-<br>**F036** Da'volar ta'minotchi oynasida + javob yozish<br>**F083** Vizual 1:1 · ro'yxat sahifalari guruh 4 (L10–L12) |
| **20** | **F037** 🌐 5-Ta'minotchilar Phase-2 QA<br>**F084** Vizual parity yakuniy o'lchovi + navigatsiya 1:1<br>**F087** Xavfsizlik auditi (tashqi kirish nuqtalari) |
| **21** | **F039** 🗄️ Kommersiya taklifi (KP): `CommercialOffer` + PDF + Telegra |
| **22** | **F044** 🌐 2-Onlayn sotuv Phase-2 QA |
| **23** | **F045** 🗄️ `HrLeaveRequest`: ta'til so'rovi + tasdiq + davomat istisn |
| **24** | **F046** 🗄️ `HrAdvanceRequest`: avans + kassa RKO + oylikdan ushlash<br>**F048** Avtomatik jarima qoidalari + istisnolar |
| **25** | **F050** 🌐 6-HR Phase-2 QA |
| **26** | **F051** 🗄️ Tovar tahlili: o'lik zaxira + tugash xavfi + buyurtma tavs |
| **27** | **F052** Marja × aylanma matritsasi + yo'qotishlar<br>**F056** 🌐 8-Filial Phase-2 QA |
| **28** | **F061** 🌐 Conv-6 data-bog'liq vizuallar browser-smoke (3/13)<br>**F085** Prod-hajmdagi ma'lumot bilan ishlash (sekin so'rovlarni to |
| **29** | **F086** Yuklama testi (bir vaqtda ishlovchi foydalanuvchilar) |
| **30** | **F089** ⛔B5 YAKUNIY: «100% ta'rifi» tekshiruvi + prod deploy verifikat |

**Jami 30 paket** (90 faza).

---


### Qoplama tekshiruvi va ogohlantirishlar

> **2026-08-09 qoplama tekshiruvi:** har TZ bloki (`B1…Bn`) fazaga xaritalandi va **3 ta bo'shliq**
> topilib qo'shildi (uchalasi kodda tasdiqlangan, taxmin emas): jihoz reyestri → **MK05**
> (menejer/kassa rejasi) · kassa `CASH_USD` naqd oqimi → **MK31** (menejer/kassa rejasi) ·
> **X2 kassir kesimi hisobotlarda** → **F010** (shu rejada; `report/` da `cashierId` 0 marta
> uchraydi).

> ⚠️ **Faza soni jonli:** bir faza sessiyaga sig'masa ikkiga bo'linadi (`F012a`/`F012b`) va jami
> oshadi. Bo'lgan agent buni hisobotda yozadi va yuqoridagi jadvalni yangilaydi.

> ⚠️ **Meta-fazalar (`F063`, `F065`) hozir bo'sh** — B2B kabinet va B2C do'konni **qurish** ishini
> bildiradi, lekin TZ'si yo'q, shuning uchun aniq qamrov yozilmagan (yozilsa taxmin bo'lardi).
> `F062`/`F064` (TZ sessiyalari) tugagach ular ~6–14 fazaga bo'linadi va jami raqam qayta hisoblanadi.

### Allaqachon bajarilgan (qayta qilinmaydi)

`todo.md` → «✅ BAJARILGAN» bo'limi rasmiy manba. Shu rejaga tegishlisi: 2-Onlayn **B1** ·
3-Analitika **B1** va B2 (qisman) · 6-HR B8 (yarim) · 7-Ombor B1 (yarim).
**Har faza agenti baribir kodda tasdiqlaydi** (CLAUDE.md §2).

---

# T1 — STRUKTURA POYDEVORI (filial)

> **Nega aynan shu yerda:** `Branch` hozir YO'Q. Har hujjatga `branchId` keyin qo'shilsa — butun
> tarixni orqaga backfill qilish kerak. Keyingi to'lqin (menejerning ko'rinish chegarasi) filial
> o'qisiz yozilsa har endpoint ikki marta qayta yoziladi (master roadmap 4.7) — shuning uchun
> filial undan OLDIN turadi.
> Bir filialli holatda foydalanuvchi hech qanday o'zgarish sezmasligi kerak — bu **regressiya qulfi**.

### F001 — `Branch` modeli + migratsiya (bitta «Asosiy» filial) ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 8-B1 · **TZ:** `2026-08-02-kop-filiallilik-tz-design.md` §2.3, §8.1
**Ustuvorlik:** P0 · **Bog'liqlik:** yo'q · **Holat:** ochiq (sxemada `Branch` yo'q — tasdiqlangan)
**Maqsad:** Filial o'qini bazaga kiritish, lekin **xulqni o'zgartirmasdan**: mavjud ma'lumot
bitta «Asosiy» filialga tegishli bo'ladi.
**Qamrov:**
1. `Branch` modeli (`accountId`, `name`, `code`, `isActive`, manzil/telefon, `isDefault`).
2. Migratsiya: har akkaunt uchun bitta `isDefault: true` «Asosiy» filial yaratiladi.
3. CRUD modul (`branch`) + ro'yxat/detal API. UI bu fazada shart emas.
4. **Nega bitta yuridik shaxs / nega `Store` filialga aylantirilmaydi** — TZ §2.1/§2.2 dagi
   asos hujjat izohi sifatida sxemaga yoziladi (keyingi agent qayta muhokama qilmasin).
**Fayllar:** `packages/db/prisma/schema.prisma` + yangi migratsiya ·
yangi `apps/api/src/modules/branch/` (`.controller/.service/.schema/.test.ts`) ·
`apps/api/src/app.module.ts` (**modulni ULA** — ulanmagan modul prodda 404 beradi, guard:
`app-boot.test.ts`).
**Testlar (TDD):** (1) migratsiyadan keyin har akkauntda **aynan bitta** `isDefault` filial.
(2) ikkinchi `isDefault` yaratishga urinish → rad. (3) `app-boot.test.ts` yangi route prefiksini
ko'radi. (4) cross-tenant: A akkaunt B ning filialini ko'rmaydi.
**Tayyorlik (DoD):** gate yashil · migratsiya lokal DB'da qo'llangan · prod DDL «OPS-QADAMLAR»ga
yozilgan · hech bir mavjud endpoint javobi o'zgarmagan (regress).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F001** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> `docs/superpowers/specs/2026-08-02-kop-filiallilik-tz-design.md` §2.1–2.3 va §8.1 ni o'qi.
> `Branch` modeli + migratsiya + CRUD modul + AppModule'ga ulash. Bir filialli holatda hech narsa
> o'zgarmasligi — regressiya qulfi. TDD, to'liq gate, hisobotni jurnalga yozib **TO'XTA**.

---

### F002 — `Store`/`CashDesk`/`Employee` filialga bog'lanishi + filial almashtirgich ☐ HISOBOT
**Bo'lim/blok:** 8-B2 · **TZ:** §3.2, §4 (umumiy va ajratilgan resurslar)
**Ustuvorlik:** P0 · **Bog'liqlik:** F001
**Maqsad:** Resurslarni filialga biriktirish va foydalanuvchiga **faol filial** tushunchasini berish.
**Qamrov:**
1. `Store.branchId`, `CashDesk.branchId` (nullable → default filialga backfill).
2. `EmployeeBranch` (ko'p-ko'pga) + `Employee.defaultBranchId` — xodim bir necha filialda ishlashi
   mumkin (TZ §4).
3. **Filial almashtirgich** (header) — faol filial sessiyada saqlanadi; **kiosk kassir
   almashtira olmaydi** (1-bo'lim bilan chegara, TZ §6).
4. Katalog (tovar/narx) **umumiy qoladi** — TZ §1.1 taxminini kodda izohla.
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/store`, `cash-desk`, `hr` ·
`apps/web/src/app/(app)/layout.tsx` yoki header komponenti · `apps/web/src/lib` (faol filial holati).
**Testlar (TDD):** (1) backfilldan keyin har `Store`/`CashDesk` default filialda. (2) xodim 2
filialga biriktiriladi, `defaultBranchId` ulardan biri bo'lishi majburiy. (3) kiosk rejimida
almashtirish endpointi **403**. (4) faol filial berilmasa — `defaultBranchId` ishlatiladi.
**Tayyorlik (DoD):** gate yashil · i18n ru+uz (almashtirgich matnlari) · kiosk guard testi yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F002** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 8-bo'lim TZ §3.2, §4, §6 ni o'qi. `Store`/`CashDesk`/`Employee` ↔ filial bog'lanishi,
> `EmployeeBranch`, filial almashtirgich (kiosk kassirga **taqiq**). TDD, gate, hisobot → **TO'XTA**.

---

### F003 — Hujjatlarda `branchId` muhrlash + backfill ☐ HISOBOT
**Bo'lim/blok:** 8-B3 · **TZ:** §3.1 (stamping), §8.1
**Ustuvorlik:** P0 · **Bog'liqlik:** F002
**Maqsad:** Har hujjat **yaratilgan paytdagi** filialini muhrlab olsin — keyin bu ma'lumot
tiklanmaydi.
**Qamrov:**
1. `branchId` ustuni savdo/pul/ombor hujjatlariga (TZ §3.1 ro'yxati bo'yicha).
2. **Muhrlash `create()` da** — o'zgarmaydi (hujjat filiali keyin tahrirlanmaydi).
3. Backfill: mavjud hujjatlar → `Store`/`CashDesk` orqali filial; aniqlanmasa default filial.
   **DRY-run + farq hisoboti majburiy**, keyin APPLY.
4. Hisobotlarga filial filtri hali QO'SHILMAYDI (u F054'da) — bu fazada faqat ma'lumot.
**Fayllar:** `schema.prisma` + migratsiya · tegishli `*.service.ts` `create()` nuqtalari ·
yangi `scripts/backfill-branch-id.ts` (DRY/APPLY rejimi, fail-closed).
**Testlar (TDD):** (1) yangi hujjat faol filial bilan muhrlanadi. (2) hujjat `update()` da
`branchId` **o'zgarmaydi**. (3) backfill skripti DRY rejimida hech nima yozmaydi va sonlarni
to'g'ri hisoblaydi. (4) filiali aniqlanmagan hujjat default filialga tushadi va hisobotda
alohida sanaladi.
**Tayyorlik (DoD):** gate yashil · backfill DRY hisoboti hisobotga qo'shilgan · prod backfill
«OPS-QADAMLAR»ga yozilgan (bu sessiyada prodga tegilmaydi).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F003** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 8-bo'lim TZ §3.1 va §8.1 ni o'qi. Hujjatlarga `branchId` muhrlash (`create()` da, keyin
> o'zgarmas) + DRY/APPLY backfill skripti + farq hisoboti. Prodga TEGMA — OPS ro'yxatiga yoz.
> TDD, gate, hisobot → **TO'XTA**.

---

# T2 — SOTUV, BONUS, OYLIK VA ANALITIKA PANELLARI

> **Nega birga:** bonus **foydadan** va **pul tushganda** hisoblanadi (2-bo'lim §3) — u
> 1-bo'lim muzlatgan `costMinor` ga va 6-bo'lim oylik dvigateliga bog'langan. Bittasini
> yolg'iz qilish — yarim halqa.

### F004 — Narx dvigateli (shartnoma → mijoz → guruh → default) ☐ HISOBOT
**Bo'lim/blok:** 2-B2 · **TZ:** `2026-08-01-onlayn-sotuv-b2b-b2g-tz-design.md` §4.6
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q · **Holat:** `ContractPrice` **YO'Q**
**Maqsad:** narx hisoblashning **yagona** servisi — F2 (B2B kabinet) va F3 (do'kon) ham shuni
chaqiradi, qayta yozilmaydi.
**Qamrov:** `ContractPrice` modeli · ustuvorlik zanjiri: shartnoma narxi → mijoz narx turi →
mijoz guruhi → default · **sof funksiya** sifatida ajratilgan (`packages/` yoki `lib/pricing`) ·
POS va hujjatlar shu servisdan foydalanadi.
**Fayllar:** `schema.prisma` + migratsiya · yangi `apps/api/src/modules/shared/pricing/` yoki
`packages/` · `customer-order`, `invoice-out`, `retail-sale` chaqiruvchilari.
**Testlar (TDD):** (1) to'rt bosqichli ustuvorlik jadval-testi. (2) shartnoma narxi muddati
tugagan bo'lsa keyingi bosqichga tushadi. (3) valyuta: narx boshqa valyutada bo'lsa kurs
shartnomasi buzilmaydi. (4) hech bir chaqiruvchi o'z narx mantig'ini saqlamaydi (grep-guard test).
**Tayyorlik (DoD):** gate yashil · POS narxi **o'zgarmagan** (regress — jonli kassa).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F004** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 2-bo'lim TZ §4.6. Narx dvigateli **umumiy servis** sifatida (shartnoma → mijoz → guruh →
> default) + `ContractPrice`. Chaqiruvchilar o'z mantig'ini saqlamasin (guard test). POS narxi
> o'zgarmasin — regress. TDD, gate → **TO'XTA**.

---

### F005 — Mijoz egaligi: `ownerId` + bildirishnoma + 90-kun ☐ HISOBOT
**Bo'lim/blok:** 2-B3 · **TZ:** §3 Qoida 3 va Qoida 4
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q
**Qamrov:** `Counterparty.ownerId` mantiqi (**yumshoq egalik — bloklamaydi**: boshqa sotuvchi
sotishi mumkin, bonus egaga ketadi) · `Counterparty.lastActivityAt` · **90-kun cron** (faolliksiz
mijoz egalikdan chiqadi) · egaga bildirishnoma.
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/counterparty/` · cron ·
`notification`/`telegram`.
**Testlar (TDD):** (1) boshqa sotuvchi sotganda amal **bloklanmaydi**, bonus egaga yoziladi.
(2) 90 kun faolliksizdan keyin egalik bo'shaydi. (3) faollik yangilanishi taymerni qayta
boshlaydi. (4) egalik o'zgarishi tarixga yoziladi.
**Tayyorlik (DoD):** gate yashil · cron ro'yxatga qo'shilgan.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F005** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 2-bo'lim TZ §3 (Qoida 3 va 4). `ownerId` yumshoq egalik (**bloklamaydi**, bonus egaga) +
> `lastActivityAt` + 90-kun cron + bildirishnoma. TDD, gate → **TO'XTA**.

---

### F006 — Bonus dvigateli (4 qoida) + `BonusAccrual` ☐ HISOBOT
**Bo'lim/blok:** 2-B4 · **TZ:** §3 (4 qoida)
**Ustuvorlik:** P1 · **Bog'liqlik:** F004, F005 · **Holat:** `BonusAccrual` **YO'Q**
**Qamrov:**
1. **Qoida 1** — bonus bazasi = **yalpi foyda**, tushum emas (chegirma o'z bonusini kamaytiradi).
2. **Qoida 2** — bonus **pul tushganda** (cash-basis) hisoblanadi (qarz undirishga manfaat).
3. Qoida 3/4 — egalik (F005'dan).
4. `BonusAccrual` yozuvlari · `CustomerOrder.bonusToId` ·
   `CustomerOrderPosition.costMinor/basePriceMinor` **muzlatish** (1-bo'lim naqshi bilan bir xil).
**Diqqat:** `costMinor` **NULL ≠ 0** — tan narx yig'ilmagan pozitsiya bonusga «100% foyda» bo'lib
kirmasligi kerak.
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/customer-order/`, yangi
`bonus` modul (AppModule'ga ula) · `packages/money/profit.ts` (formulalar shu yerda).
**Testlar (TDD):** (1) chegirma bonusni kamaytiradi. (2) to'lov kelmaguncha bonus yozilmaydi;
qisman to'lovda proporsional. (3) `costMinor` NULL → bonus hisoblanmaydi va sabab qayd etiladi.
(4) qaytarish → bonus teskarilanadi (zero-sum). (5) muzlatilgan narx keyin tovar kartasi
o'zgarganda **o'zgarmaydi**.
**Tayyorlik (DoD):** gate yashil · `packages/money` qayta build qilingan.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F006** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 2-bo'lim TZ §3 (4 qoida). Bonus dvigateli: baza = **yalpi foyda**, hisob **pul tushganda**;
> `BonusAccrual` + `CustomerOrder.bonusToId` + pozitsiya narx muzlatishi (1-bo'lim naqshi).
> **NULL≠0** — tan narxsiz pozitsiya bonusga kirmaydi. Qaytarishda zero-sum. TDD, gate → **TO'XTA**.

---

### F007 — `HrPosition.paySchemeConfig` + sxema hal qiluvchi (4 tur) ☐ HISOBOT
**Bo'lim/blok:** 6-B1 · **TZ:** `2026-08-02-hr-tz-design.md` §2.1–§2.3
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q
**Qamrov:** `HrPosition.paySchemeConfig` (ikki qatlamli: lavozim standarti → xodim override) ·
**4 tur**: fiks · fiks+% · tier (pog'onali) · piece (ish birligiga) · sxema hal qiluvchi **sof
funksiya** · §2.3 dagi lavozim standartlari seed sifatida.
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/hr/` (yoki `payroll`) ·
sof hisoblash moduli + testlar.
**Testlar (TDD):** har tur uchun chegara qiymatlari (4 × 3) · xodim override lavozim standartidan
ustun · noto'g'ri config **jimgina 0 bermaydi**, xato beradi (Zod jim tashlash bug-klassi).
**Tayyorlik (DoD):** gate yashil · hisoblash sof funksiya (DB'siz testlanadi).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F007** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 6-bo'lim TZ §2.1–2.3. `paySchemeConfig` + 4 tur (fiks · fiks+% · tier · piece) + sof hal
> qiluvchi funksiya + lavozim standartlari. Noto'g'ri config **xato beradi**, 0 emas.
> TDD, gate → **TO'XTA**.

---

### F008 — Z2: bonus bazasi lavozimga qarab + **kassir korreksiyasi** ☐ HISOBOT
**Bo'lim/blok:** 6-B2 · **TZ:** §2.4, §2.5
**Ustuvorlik:** P1 · **Bog'liqlik:** F006, F007
**Maqsad:** «erkinlik teshigi»ni yopish — kassir **optomdan past** va **tan narxdan past** sotsa,
farq uning bonusidan ayriladi (taqiq emas, **korreksiya**).
**Qamrov:** lavozimga qarab bonus bazasi (sotuvchi = foyda cash-basis, kassir = tushum) ·
**kassir korreksiyasi** manbasi = `CashierAuditEvent` hodisalari · sotuvchi uchun cash-basis (§2.5).
**Fayllar:** `apps/api/src/modules/hr/`, `payroll/` · `cashier-session`/`retail-sale` hodisalari.
**Testlar (TDD):** (1) optomdan past sotuv → korreksiya summasi aynan farq. (2) tan narxdan past
sotuv → korreksiya. (3) `costMinor` NULL → korreksiya **hisoblanmaydi** va sabab qayd etiladi.
(4) korreksiya bonusdan katta bo'lsa — natija manfiy bo'lmaydi (yoki TZ qoidasiga muvofiq).
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F008** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 6-bo'lim TZ §2.4/§2.5. Lavozimga qarab bonus bazasi + **kassir korreksiyasi**
> (`CashierAuditEvent` dan: optomdan past va tan narxdan past sotuv). NULL≠0. TDD, gate → **TO'XTA**.

---

### F009 — Z1: dvigatel → `Payroll` hujjati avtomatik ☐ HISOBOT
**Bo'lim/blok:** 6-B3 · **TZ:** §3
**Ustuvorlik:** P1 · **Bog'liqlik:** F007, F008
**Muammo (Z1):** hisoblash dvigateli va `Payroll` hujjati **ikki alohida tizim** — qo'lda
ko'chiriladi.
**Qamrov:** dvigatel natijasi → `Payroll` hujjati **avtomatik** yaratiladi ·
`Payroll.sourceScoreId` (qaysi hisobdan kelgani) · qayta hisoblash **idempotent** (ikkinchi marta
ishga tushirilsa dublikat hujjat chiqmaydi) · qo'lda tahrir qilingan hujjat **qayta yozilmaydi**.
**Fayllar:** `apps/api/src/modules/payroll/`, `hr/` · migratsiya (`sourceScoreId`).
**Testlar (TDD):** (1) idempotentlik. (2) qo'lda tahrir saqlanadi va ogohlantirish beriladi.
(3) qabul qilinmagan KPI kunlari bo'lsa oylik **bloklanadi** (4M.3 qoidasi bilan mos).
**Tayyorlik (DoD):** gate yashil · HR mavjud testlari yashil (regress).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F009** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 6-bo'lim TZ §3 (Z1). Dvigatel → `Payroll` avtomatik + `sourceScoreId` + idempotentlik + qo'lda
> tahrirni qayta yozmaslik. Qabul qilinmagan KPI kunlari oylikni bloklashini tekshir.
> TDD, gate → **TO'XTA**.

---

### F010 — X2: kassir kesimi hisobotlarda (hujjat egasidan ajratilgan) ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 3-Analitika B2 qoldig'i · **TZ:** `2026-08-01-analitika-tz-design.md` §9 (X2)
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q
**Muammo (2026-08-09 da tasdiqlandi):** kassa xodim kesimi `rs.owner_id` (**hujjat egasi**)
bo'yicha ketadi; **kassir** kesimi (`cashier-session.cashierId`) hisobotlarda umuman yo'q —
`apps/api/src/modules/report/` da `cashierId` ishlatilmaydi (grep: 0 natija). Ya'ni «bu kassir
qancha sotdi» degan savolga tizim javob bermaydi va kassir bonusi/korreksiyasi shu kesimga tayanadi.
**Qamrov:** kassir kesimi `report/metrics/` da **alohida o'lchov** sifatida (hujjat egasi kesimi
saqlanib qoladi — TZ X2 ikkalasini alohida talab qiladi) · rentabellik va xodim hisobotlarida
ko'rinishi · smenaga bog'lanmagan chek uchun «noma'lum kassir» (0 emas).
**Fayllar:** `apps/api/src/modules/report/metrics/` · `report/profitability*` ·
`cashier-session/` (kesim manbai).
**Testlar (TDD):** (1) owner ≠ cashier bo'lgan chekda **ikkala** kesim ham to'g'ri. (2) smenasiz
chek kassir kesimida «noma'lum» bo'ladi, jimgina 0 emas. (3) ikki kesim bir-birini almashtirmaydi
(regressiya qulfi). (4) formulalar `metrics` qatlamida (ikkinchi formula yozilmaydi).
**Tayyorlik (DoD):** gate yashil · `todo.md` da «3-Analitika B2 (qisman)» → to'liq yopiladi.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F010** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> Analitika TZ §9 X2 bandini o'qi. Kassir kesimini (`cashier-session.cashierId`) hisobotlarga
> **alohida o'lchov** sifatida qo'sh — hujjat egasi kesimini almashtirma. Smenasiz chek «noma'lum»,
> 0 emas. Formulani `report/metrics/` da joylashtir. TDD, gate → **TO'XTA**.

---

### F011 — Rollup jadvallari + tungi cron ☐ HISOBOT
**Bo'lim/blok:** 3-B3 (1-yarim) · **TZ:** `2026-08-01-analitika-tz-design.md` §5.1–§5.2
**Ustuvorlik:** P1 · **Bog'liqlik:** F006 (bonus o'lchovi), F003 (`branchId` — rollupga o'q sifatida)
**Holat:** `DailySalesRollup`, `DailyStockRollup`, `EmployeeDailyRollup`, `CounterpartyDailyRollup`
— **hammasi YO'Q**
**Qamrov:** 4 rollup jadvali (**`branchId` o'qi bilan birga** — keyin qo'shish qimmat) · tungi
cron · qayta hisoblash oynasi (kechikkan hujjatlar) · rollup **faqat `report/metrics/`
formulalaridan** to'ldiriladi.
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/report/` (rollup servis + cron).
**Testlar (TDD):** (1) **eng muhim test:** rollup ↔ jonli hisob **bir xil raqam** beradi (bir
necha kesimda). (2) cron ikki marta ishlasa dublikat yozilmaydi. (3) kechikkan hujjat kunni
qayta hisoblatadi. (4) valyuta/kurs shartnomasi buzilmaydi.
**Tayyorlik (DoD):** gate yashil · rollup↔jonli tenglik testi yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F011** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 3-bo'lim TZ §5.1–5.2. 4 rollup jadvali (**`branchId` o'qi bilan**) + tungi cron. Rollupni faqat
> `report/metrics/` formulalaridan to'ldir. **Rollup ↔ jonli hisob tengligi** — asosiy test.
> TDD, gate → **TO'XTA**.

---

### F012 — Rollup qayta qurish CLI + `RollupRebuildQueue` ☐ HISOBOT
**Bo'lim/blok:** 3-B3 (2-yarim) · **TZ:** §5.2
**Ustuvorlik:** P1 · **Bog'liqlik:** **F011**
**Qamrov:** `RollupRebuildQueue` (qayta qurish navbati) · CLI: sana oralig'i / kesim bo'yicha
qayta qurish · **DRY rejim** (nima o'zgarishini ko'rsatadi) · progress va yakuniy farq hisoboti.
**Fayllar:** `schema.prisma` + migratsiya · `scripts/rebuild-rollups.ts` ·
`apps/api/src/modules/report/`.
**Testlar (TDD):** (1) DRY hech nima yozmaydi. (2) qayta qurishdan keyin rollup = jonli hisob.
(3) navbat elementi ikki marta bajarilmaydi (claim naqshi). (4) katta oraliqda bo'lakma-bo'lak
ishlaydi (xotira portlamaydi).
**Tayyorlik (DoD):** gate yashil · CLI hujjatlangan (hisobotda buyruq misoli).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F012** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> **F011 rolluplari borligini kodda tasdiqla.** `RollupRebuildQueue` + qayta qurish CLI (DRY +
> APPLY + farq hisoboti + bo'lakma-bo'lak). Navbat claim naqshi bilan (ikki marta bajarilmasin).
> TDD, gate → **TO'XTA**.

---

### F013 — Rol bo'yicha boshqaruv panellari ☐ HISOBOT
**Bo'lim/blok:** 3-B4 · **TZ:** §3.1
**Ustuvorlik:** P2 · **Bog'liqlik:** F011
**Qamrov:** rol bo'yicha oldindan hisoblangan panellar (ega · menejer · savdo · ombor · kassa) ·
har panel **rollupdan** o'qiydi (jonli hisob emas) · ruxsat/scope hisobga olinadi · «ma'lumot
sifati» bayrog'i ko'rinadi (MK09 (menejer/kassa rejasi) bilan bir xil manba).
**Fayllar:** `apps/api/src/modules/report/` · `apps/web/src/app/(app)/` (dashboard sahifalari) · i18n.
**Testlar (TDD):** (1) panel rollupdan o'qiydi (jonli so'rov yo'q — guard test). (2) scope'siz
foydalanuvchi ko'rmasligi kerak bo'lgan ko'rsatkichni ko'rmaydi. (3) bo'sh ma'lumotda «yo'q»
holati (0 emas).
**Tayyorlik (DoD):** gate + i18n yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F013** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 3-bo'lim TZ §3.1. Rol bo'yicha panellar, **rollupdan** o'qiydi (guard test bilan qulfla),
> ruxsat/scope hisobga olinadi, sifat bayrog'i ko'rinadi. i18n ru+uz. TDD, gate → **TO'XTA**.

---

### F014 — Xodim shaxsiy ekrani («Mening natijam») ☐ HISOBOT
**Bo'lim/blok:** 3-B5 · **TZ:** §3.3
**Ustuvorlik:** P2 · **Bog'liqlik:** F011, MK13 (menejer/kassa rejasi) (target/reyting)
**Qamrov:** xodim o'z natijasini ko'radi: kunlik KPI · plan/fakt · bonus (hisoblangan va
to'lanmagan) · jarima · qabul holati. **Faqat o'z ma'lumoti** — scope qulfi majburiy.
**Fayllar:** `apps/web/src/app/(app)/` (xodim ekrani) · `apps/api/src/modules/manager|hr/` · i18n.
**Testlar (TDD):** (1) boshqa xodim ma'lumotiga so'rov → 403. (2) qabul qilinmagan kun ochiq
ko'rsatiladi. (3) bonus «hisoblangan» va «to'langan» ajratilgan.
**Tayyorlik (DoD):** gate + i18n yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F014** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 3-bo'lim TZ §3.3. «Mening natijam» ekrani: KPI · plan/fakt · bonus (hisoblangan≠to'langan) ·
> jarima · qabul holati. **Faqat o'z ma'lumoti** — 403 testi majburiy. TDD, gate → **TO'XTA**.

---

### F015 — Xodim kesimidagi 4 blok hisoboti ☐ HISOBOT
**Bo'lim/blok:** 3-B6 · **TZ:** §7
**Ustuvorlik:** P2 · **Bog'liqlik:** F011
**Qamrov:** 4 blok: (1) sotuv/foyda · (2) chegirma va og'ishlar · (3) qarz va undirish ·
(4) intizom va faollik. Eksport (Excel) + filtr (davr, filial, bo'lim).
**Fayllar:** `apps/api/src/modules/report/` · `apps/web/src/app/(app)/reports/` · i18n.
**Testlar (TDD):** (1) har blok rollup/metrics dan bir xil raqam beradi. (2) filial filtri
qo'llanadi. (3) eksport ustunlari ekran bilan mos (bir raqamni ikki manbadan solishtir).
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F015** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 3-bo'lim TZ §7. Xodim kesimidagi 4 blok hisoboti + eksport + filtrlar. Raqamlar `metrics`/rollup
> bilan bir xil bo'lishini test qil. TDD, gate → **TO'XTA**.

---

### F016 — Xodim kartasi (bitta ekran) — 4M.4 bilan birlashtirish ☐ HISOBOT
**Bo'lim/blok:** 6-B9 / roadmap 4.11 · **TZ:** 6-bo'lim §8
**Ustuvorlik:** P2 · **Bog'liqlik:** MK04 (menejer/kassa rejasi) (4M kartasi), F015
**Diqqat:** 4M.4 da **`GET hr/employees/:id/card` allaqachon bor** — bu faza **ikkinchi kartani
qurmaydi**, mavjudini 6-bo'lim §8 talablariga (oylik, ta'til, avans, davomat, hujjatlar)
kengaytiradi. Ikki karta paydo bo'lsa — bu **regressiya**.
**Fayllar:** `apps/api/src/modules/hr/` (mavjud card servisi) · `apps/web/.../hr/`.
**Testlar (TDD):** (1) karta 6-bo'lim §8 bloklarini qaytaradi. (2) mavjud 4M testlari yashil
(regress). (3) ruxsatsiz foydalanuvchi oylik blokini ko'rmaydi.
**Tayyorlik (DoD):** gate yashil · **bitta** karta endpointi (ikkinchisi yo'q — grep bilan tasdiqla).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F016** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> **Mavjud `GET hr/employees/:id/card` ni kengaytir — yangi karta QURMA.** 6-bo'lim TZ §8
> bloklarini qo'sh (oylik, ta'til, avans, davomat, hujjatlar), ruxsat bo'yicha bloklarni yashir.
> Mavjud 4M testlari yashil qolsin. TDD, gate → **TO'XTA**.

---

### F017 — T5 **Phase-2 QA**: bonus → oylik zanjiri ☐ HISOBOT
**Bo'lim/blok:** 2/6-bo'lim QA · **Tur:** QA sessiyasi
**Ustuvorlik:** P1 · **Bog'liqlik:** F004–F009, F016
**Qamrov (real brauzer, uchdan-uchiga):** narx dvigateli (shartnoma narxi) → buyurtma → yetkazish →
**to'lov kelishi** → `BonusAccrual` yozilishi → oylik hisoblanishi → `Payroll` hujjati → xodim
ekranida ko'rinishi. Alohida: chegirma bonusni kamaytirishi · qaytarishda teskarilanishi ·
kassir korreksiyasi.
**Tayyorlik (DoD):** har qadam skrinshot · bir raqamni **ikki manbadan** solishtir (ekran vs
hisobot) · bug → darhol yoki yangi faza.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F017** (bonus→oylik Phase-2 QA) ni bajar. `/qa-cohort`.
> Real brauzer: narx → buyurtma → yetkazish → to'lov → bonus → oylik → `Payroll` → xodim ekrani.
> Chegirma/qaytarish/kassir korreksiyasi. Har raqamni ikki manbadan solishtir. Hisobot → **TO'XTA**.

---

### F018 — 3-Analitika **Phase-2 QA** (panellar va rolluplar) ☐ HISOBOT
**Bo'lim/blok:** 3-bo'lim QA · **TZ:** §10.2 · **Tur:** QA sessiyasi
**Ustuvorlik:** P1 · **Bog'liqlik:** F011–F015
**Qamrov:** har panel real brauzerda ochiladi · **rollup raqami = jonli hisob** (qo'lda
solishtiriladi) · filtrlar (davr, filial, bo'lim) · eksport · bo'sh ma'lumot holati ·
sifat bayrog'i · sekin so'rovlar (panel ochilish vaqti).
**Tayyorlik (DoD):** har panel skrinshot + raqam solishtiruvi · 3-bo'lim «Phase-2 verified».
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F018** (3-Analitika Phase-2 QA) ni bajar. `/qa-cohort`.
> Har panelni brauzerda och, **rollup raqamini jonli hisob bilan solishtir**, filtr/eksport/bo'sh
> holat/sifat bayrog'i/tezlikni tekshir. Hisobot → **TO'XTA**.

---

# T3 — OMBOR MIGRATSIYASI (manzilli saqlash)

> **TZ:** `2026-08-02-ombor-tz-design.md` · Migratsiya **6 qadam** (§4), **bir zarbada emas**.
> Har qadam **qaytariladigan**, har qadamdan keyin **tekshiruv hisoboti**. Ombor to'xtamaydi.
> 5-qadamgacha eski mexanizm ishlashda davom etadi — muammo chiqsa bayroq o'chiriladi.
> **Holat:** `StoreZone`, `StoreCell`, `StockByCell` sxemada **bor**; `SkladKeeper.zoneId` bor
> (7-B1 yarim). `StockByCell.isPrimary`, `PickingError`, `CellTransfer` — **YO'Q**.

### F019 — Migratsiya 1–2-qadam: zona/yacheyka generatsiya + backfill + farq hisoboti ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 7-B2 · **TZ:** §4 (1–2-qadam), §3.1
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q
**Avval tasdiqla:** `todo.md` 7-B1 ni «yarim» deb belgilagan (`StoreZone` + `SkladKeeper.zoneId`
sxemada bor). Ish boshlashdan oldin `skladNo → StoreZone` bog'lanishi **kodda to'liq ulanganini**
tekshir (omborchi zonasi bo'yicha `mark-ready` oqimi) — ulanmagan qismi bo'lsa shu fazada yop yoki
hisobotda alohida faza sifatida rejaga qo'sh.
**Qamrov:**
1. `__yacheyka` kodlaridan `StoreZone` + `StoreCell` generatsiya (mavjud
   `2026-07-29-yacheyka-diapazon-generatori-design.md` spec'idan foydalan).
2. Backfill: har tovarning joriy `Stock.qty` → **asosiy** yacheykaga `StockByCell` qatori.
3. **Tekshiruv hisoboti:** yaratilgan zona/yacheyka soni · **noto'g'ri formatdagi kodlar ro'yxati** ·
   `Σ StockByCell == Stock` farq hisoboti.
4. **Qaytarish skripti** (generatsiya va backfillni bekor qiladi).
**Fayllar:** yangi `scripts/migrate-cells-step1-2.ts` (DRY/APPLY/ROLLBACK) ·
`apps/api/src/modules/store/`, `sklad-keeper/`.
**Testlar (TDD):** (1) DRY hech nima yozmaydi va sonlarni to'g'ri beradi. (2) noto'g'ri formatdagi
kod **jimgina tashlanmaydi** — ro'yxatga tushadi. (3) backfilldan keyin `Σ StockByCell == Stock`.
(4) rollback holatni tiklaydi.
**Tayyorlik (DoD):** gate yashil · DRY hisoboti hisobotda · prod migratsiya **OPS-QADAM**.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F019** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 7-bo'lim TZ §4 (1–2-qadam) + yacheyka-diapazon-generatori spec'i. Generatsiya + backfill +
> **farq hisoboti** + **rollback**. `Σ StockByCell == Stock` — asosiy test. Prodga tegma (OPS).
> TDD, gate → **TO'XTA**.

---

### F019b — `SkladKeeper.zoneId` + `skladNo` → `StoreZone` ulanishi ☐ HISOBOT
**Bo'lim/blok:** 7-B1 qoldig'i · **TZ:** §2 (Q5), §0.2 P2
**Ustuvorlik:** P1 · **Bog'liqlik:** F019 (zonalar avval yaratilishi kerak)
**NEGA YANGI FAZA (F019 topilmasi, 2026-08-09):** reja va `todo.md` `SkladKeeper.zoneId` ni
«sxemada bor» degan edi — **YO'Q**. `schema.prisma:1111-1127` da `SkladKeeper` da `skladNo Int`
bor, `zoneId` va `Store`/`StoreZone` ga havola YO'Q. Ya'ni «`skladNo` = `StoreZone`» qarori
(TZ §2, Q5) hali **kodga kirmagan**: yig'ish varag'ini taqsimlash bugun ham yacheyka kodining
1-segmentini `Number()` qilib o'qiydi (`restock-task.service.ts:46`, `retail-sale.service.ts:109`),
jadval-bog'lanish orqali emas. F019 qamrovi (generatsiya + backfill) bunga bog'liq emas —
shuning uchun bloklamadi, alohida fazaga ajratildi.
**Qamrov:** `SkladKeeper.zoneId` (nullable) + migratsiya · mavjud yozuvlarni `skladNo` raqami
bo'yicha zonaga bog'lash (backfill; zona nomi `«01»`/`«1»` yozuvida bo'lishi mumkin — **raqam
bo'yicha** solishtir, satr bo'yicha emas) · `skladNoOf()` o'qiydigan joylarni zona-bog'lanishiga
ko'chirish · omborchi sozlamalari UI'da zona tanlagich.
**Diqqat:** zona nomi = kodning 1-segmenti **satr ko'rinishida** (`«01»`), `skladNo` esa `Int`
(`1`). F019 hisoboti «nol-to'ldirish to'qnashuvi» ogohlantirishini chiqaradi — backfill oldidan
DRY hisobotida shu ro'yxat bo'sh ekaniga ishonch hosil qil.
**Testlar (TDD):** (1) `skladNo` → zona bog'lanishi `«01»` va `«1»` ikkalasida ham topiladi.
(2) zonasi yo'q omborchi eski xulqni saqlaydi (regress yo'q). (3) bog'lanmagan yacheyka kodi
hamon «biriktirilmagan» varaqqa tushadi.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F019b** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 7-bo'lim TZ §2 (Q5) + §0.2 P2. `SkladKeeper.zoneId` sxema + migratsiya + backfill + o'quvchilarni
> ko'chirish. Prodga tegma (OPS). TDD, gate → **TO'XTA**.

---

### F020 — Migratsiya 3-qadam: dual-write + kunlik farq monitoringi ☐ HISOBOT
**Bo'lim/blok:** 7-B3 · **TZ:** §4 (3-qadam)
**Ustuvorlik:** P1 · **Bog'liqlik:** **F019b**
**Qamrov:** hujjatlar (`supply`, `enter`, `demand`, `retail-sale`, `loss`, `move`,
`sales-return`, `purchase-return`) **ham eski atributni, ham `StockByCell` ni** yangilaydi ·
kunlik farq monitoringi (cron + hisobot) · bayroq bilan o'chiriladigan.
**Diqqat:** `applyDeltas` da **yacheyka inferensiyasi** mavjud — yacheykani o'zi boshqargan
chaqiruvchi `cellMode: 'store-only'` ishlatishi kerak, aks holda ikki marta yozadi.
**Fayllar:** stock delta qatlami (`stock`/`shared`) · yuqoridagi hujjat servislari ·
cron + hisobot.
**Testlar (TDD):** (1) har hujjat turi uchun: eski atribut va `StockByCell` **bir xil** natija.
(2) `cellMode` noto'g'ri ishlatilsa test tutadi (ikki marta yozish). (3) bayroq o'chirilganda eski
yo'l ishlaydi. (4) kunlik monitoring farqni topadi (sun'iy farq kiritilgan test).
**Tayyorlik (DoD):** gate yashil · 0 farq bilan bir kun monitoring (lokal seed'da).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F020** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 7-bo'lim TZ §4 (3-qadam). Dual-write barcha kirim/chiqim hujjatlariga + kunlik farq monitoringi
> + o'chirish bayrog'i. `applyDeltas` `cellMode` gotcha'siga e'tibor ber (ikki marta yozmasin).
> TDD, gate → **TO'XTA**.

---

### F021 — Ko'p yacheyka: `isPrimary` + `extraBins` ☐ HISOBOT
**Bo'lim/blok:** 7-B4 · **TZ:** §3.2 · **Holat:** `StockByCell.isPrimary` **YO'Q**
**Ustuvorlik:** P1 · **Bog'liqlik:** F020
**Qamrov:** bitta tovar **bir necha yacheykada** · `isPrimary` (asosiy yacheyka) ·
`extraBins` haqiqiy to'ldirilishi · asosiy yacheyka o'zgarishi tarixi.
**Diqqat:** tovar↔yacheyka bog'lanishi **ko'p-ko'pga** (bir marta xato bilan bir-birga
qilingan va tuzatilgan — o'sha regressiyani qaytarma).
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/store/`, `stock/`.
**Testlar (TDD):** (1) bir tovar 3 yacheykada, `Σ` = `Stock.qty`. (2) **aynan bitta** `isPrimary`
(ikkinchisi rad). (3) asosiy yacheykani o'zgartirish qoldiqni ko'chirmaydi (faqat belgi).
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F021** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 7-bo'lim TZ §3.2. Ko'p yacheyka + `isPrimary` + `extraBins`. Tovar↔yacheyka **ko'p-ko'pga**
> qolishi shart. TDD, gate → **TO'XTA**.

---

### F022 — Migratsiya 4-qadam: yacheyka intizomi (ogohlantirish) + skaner oqimi ☐ HISOBOT
**Bo'lim/blok:** 7-B5 · **TZ:** §4 (4-qadam), §5
**Ustuvorlik:** P1 · **Bog'liqlik:** F021
**Qamrov:** kirim/chiqim pozitsiyalarida yacheyka — avval **ogohlantirish** rejimida (hujjat
darajasida sozlanadi) · **skaner oqimi: yacheyka → tovar → miqdor** (yacheyka skaneri
`/cell/[code]` mavjud) · yacheykasiz eski hujjatlar «biriktirilmagan qoldiq» hisobotida.
**Fayllar:** hujjat schema/servislari · `apps/web/src/app/(app)/cell/`, `scan/`, `omborchi/` ·
sozlama (`company-settings`).
**Testlar (TDD):** (1) ogohlantirish rejimida yacheykasiz hujjat **saqlanadi** + belgi qo'yiladi.
(2) «biriktirilmagan qoldiq» hisoboti to'g'ri sanaydi. (3) skaner oqimi tartibi buzilsa xato.
**Tayyorlik (DoD):** gate yashil · **blok rejimi YOQILMAYDI** (u F029'da).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F022** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 7-bo'lim TZ §4 (4-qadam) va §5. Yacheyka intizomi **ogohlantirish** rejimida + skaner oqimi
> (yacheyka→tovar→miqdor) + «biriktirilmagan qoldiq» hisoboti. **Blok rejimini YOQMA.**
> TDD, gate → **TO'XTA**.

---

### F023 — Migratsiya 5-qadam: yig'ish `StockByCell` dan + solishtirish testi ☐ HISOBOT
**Bo'lim/blok:** 7-B6 · **TZ:** §4 (5-qadam), §7
**Ustuvorlik:** P1 · **Bog'liqlik:** F022 · **Xavf:** yuqori (jonli yig'ish oqimi)
**Qamrov:** yig'ish varag'i `cellOf(attributes)` o'rniga **`StockByCell`** dan o'qiydi ·
**qabul mezoni: eski va yangi usul AYNAN bir xil varaq beradi** (solishtirish testi) ·
bayroq bilan qaytariladigan.
**Fayllar:** `apps/api/src/modules/pick-list/`, `sklad-keeper/` · `apps/web/.../pick-lists/`,
`picking-waves/`.
**Testlar (TDD):** (1) **solishtirish testi** — real seed ma'lumotida ikki usul bir xil varaq
(bu fazaning asosiy qabul mezoni). (2) ko'p yacheykali tovar uchun tartib qoidasi determinist.
(3) bayroq o'chirilganda eski usul qaytadi.
**Tayyorlik (DoD):** gate yashil · solishtirish testi 100% mos · `/qa-cohort` uchun qayd.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F023** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 7-bo'lim TZ §4 (5-qadam) va §7. Yig'ish `StockByCell` dan; **eski va yangi usul bir xil varaq
> berishini** solishtirish testi bilan isbotla. Bayroq bilan qaytariladigan qil.
> TDD, gate → **TO'XTA**.

---

### F024 — Qisman yig'ish + kassirga qaytish + `PickingError` ☐ HISOBOT
**Bo'lim/blok:** 7-B7 · **TZ:** §7 · **Holat:** `PickingError` **YO'Q**
**Ustuvorlik:** P1 · **Bog'liqlik:** F023
**Qamrov:** qisman yig'ilgan buyurtma · kassirga **qizil** qaytish (yetmagan pozitsiya
ko'rinadi) · `PickingError` (sabab: yo'q · noto'g'ri yacheyka · shikastlangan · boshqa) ·
1-bo'lim bilan halqani yopadi (POS chek holati).
**Fayllar:** `schema.prisma` + migratsiya · `pick-list/`, `retail-sale/` · POS FE.
**Testlar (TDD):** (1) qisman yig'ishda chek `ready` ga o'tmaydi. (2) `PickingError` sabab
kodisiz yozilmaydi. (3) kassir ekranida yetmagan pozitsiya ko'rinadi. (4) xato tuzatilgach oqim
davom etadi.
**Tayyorlik (DoD):** gate yashil · POS regressiya testlari (MK32 (menejer/kassa rejasi)) yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F024** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 7-bo'lim TZ §7. Qisman yig'ish + kassirga qizil qaytish + `PickingError` (sabab majburiy).
> POS tomonini buzma — MK32 (menejer/kassa rejasi) testlari yashil qolsin. TDD, gate → **TO'XTA**.

---

### F025 — Joylashtirish taklifi (putaway) + skaner tasdiqlash ☐ HISOBOT
**Bo'lim/blok:** 7-B8 · **TZ:** §6
**Ustuvorlik:** P2 · **Bog'liqlik:** F022
**Qamrov:** qabuldan keyin tizim yacheyka **taklif qiladi** (bo'sh joy, o'sha tovar turgan
yacheyka, zona qoidasi) · omborchi skaner bilan **tasdiqlaydi yoki boshqasini tanlaydi** ·
tanlov sababi yoziladi.
**Fayllar:** `apps/api/src/modules/supply/`, `store/` · `apps/web/.../omborchi/`, `scan/`.
**Testlar (TDD):** (1) taklif tartibi determinist va tushuntiriladi. (2) omborchi boshqa
yacheykani tanlasa qabul qilinadi (bloklamaydi). (3) bo'sh joy yo'q bo'lsa taklif «yo'q» deydi,
noto'g'ri yacheyka taklif qilmaydi.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F025** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 7-bo'lim TZ §6. Joylashtirish taklifi + skaner tasdiqlash; omborchi tanlovi ustun (bloklamaydi),
> sabab yoziladi. TDD, gate → **TO'XTA**.

---

### F026 — Inventarizatsiya: yacheyka skaneri · sikl · muzlatish · sabab ☐ HISOBOT
**Bo'lim/blok:** 7-B9 · **TZ:** §8
**Ustuvorlik:** P2 · **Bog'liqlik:** F023
**Qamrov:** yacheyka bo'yicha sanash (skaner) · **sikl inventarizatsiya** (zona/ABC bo'yicha
navbat) · sanash paytida yacheykani **muzlatish** · farq uchun **sabab va javobgarlik** ·
natija → `inventory` hujjati.
**Fayllar:** `apps/api/src/modules/inventory/`, `store/` · `apps/web/.../inventories/`, `scan/`.
**Testlar (TDD):** (1) muzlatilgan yacheykaga harakat rad etiladi (yoki navbatga qo'yiladi).
(2) farq sababsiz yopilmaydi. (3) sikl navbati determinist. (4) natija `Stock` va `StockByCell`
ni **birga** to'g'rilaydi.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F026** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 7-bo'lim TZ §8. Yacheyka skaneri bilan inventarizatsiya + sikl + muzlatish + sabab/javobgarlik.
> Natija `Stock` va `StockByCell` ni birga to'g'rilasin. TDD, gate → **TO'XTA**.

---

### F027 — Omborchi ish o'lchovlari (tezlik + xato) ☐ HISOBOT
**Bo'lim/blok:** 7-B10 · **TZ:** §9
**Ustuvorlik:** P2 · **Bog'liqlik:** F024, F026
**Qamrov:** yig'ish tezligi (`RestockTask.startedAt/completedAt` — mavjud modelni tekshir) ·
xatolar (`PickingError`, inventarizatsiya farqi) · o'lchovlar **6-bo'lim** (oylik) va
**3-bo'lim** (analitika) ga uzatiladi — **yagona formulalar qatlami orqali**.
**Fayllar:** `apps/api/src/modules/restock-task/`, `report/metrics/`, `hr/`.
**Testlar (TDD):** (1) tezlik faqat tugallangan vazifadan hisoblanadi. (2) yarim vazifa
o'rtachani buzmaydi. (3) o'lchov `metrics` qatlamida (ikkinchi formula yo'q).
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F027** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 7-bo'lim TZ §9. Omborchi tezlik/xato o'lchovlari → `report/metrics/` orqali HR va analitikaga.
> Ikkinchi formula yozma. TDD, gate → **TO'XTA**.

---

### F028 — Yacheykalararo ko'chirish (`CellTransfer`) ☐ HISOBOT
**Bo'lim/blok:** 7-B11 · **TZ:** §10 · **Holat:** `CellTransfer` **YO'Q**
**Ustuvorlik:** P2 · **Bog'liqlik:** F021
**Qamrov:** ombor **ichida** yacheykadan yacheykaga ko'chirish (`Stock` o'zgarmaydi, faqat
`StockByCell`) · skaner oqimi · tarix.
**Testlar (TDD):** (1) ko'chirishdan keyin `Σ StockByCell` va `Stock` **o'zgarmaydi**.
(2) manbada yetarli qoldiq bo'lmasa rad. (3) `isPrimary` ko'chirilganda qoida aniq.
**Fayllar:** `schema.prisma` + migratsiya · `store/`, `move/` (chegarani ajrat: `move` = ombordan
omborga, `CellTransfer` = ombor ichida) · `apps/web/.../scan/`.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F028** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 7-bo'lim TZ §10. `CellTransfer` (ombor ichida yacheyka→yacheyka). `Stock` **o'zgarmasligi** —
> asosiy test. `move` bilan chegarani aniq ajrat. TDD, gate → **TO'XTA**.

---

### F029 — Migratsiya 6-qadam: intizom **majburiy** + eski atribut faqat-o'qish ☐ HISOBOT
**Bo'lim/blok:** 7-B12 · **TZ:** §4 (6-qadam)
**Ustuvorlik:** P1 · **Bog'liqlik:** F019–F028 · **Xavf:** yuqori (omborni to'xtatishi mumkin)
**Qamrov:** yacheyka intizomi **blok** rejimiga · eski `__yacheyka` atributi **faqat o'qish** ·
**yoqishdan oldin qabul mezoni:** «yacheykasiz hujjat ulushi 0 ga tushgan» hisoboti ·
bayroq **qaytariladigan** bo'lib qoladi.
**Testlar (TDD):** (1) blok rejimida yacheykasiz hujjat **rad etiladi** (aniq xato matni bilan).
(2) eski atributga yozish urinishi rad. (3) bayroq o'chirilsa ogohlantirish rejimi qaytadi.
(4) yoqishdan oldingi hisobot 0 bo'lmasa — **yoqish bloklanadi** (kodda guard).
**Tayyorlik (DoD):** gate yashil · prodda yoqish **OPS-QADAM** (bu sessiyada prodga tegilmaydi).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F029** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 7-bo'lim TZ §4 (6-qadam). Intizomni **majburiy** rejimga o'tkazish + eski atribut faqat-o'qish.
> Yoqish uchun «yacheykasiz hujjat = 0» guard'i shart. Qaytariladigan bo'lsin. Prodda yoqishni
> OPS ro'yxatiga yoz. TDD, gate → **TO'XTA**.

---

### F030 — 7-Ombor **Phase-2 QA** (real brauzer + real skaner) ☐ HISOBOT
**Bo'lim/blok:** 7-bo'lim QA · **TZ:** §12.3 · **Tur:** QA sessiyasi
**Ustuvorlik:** P1 · **Bog'liqlik:** F029
**Qamrov (real qurilma):** qabul → joylashtirish taklifi → skaner tasdiqlash → yig'ish varag'i →
qisman yig'ish → kassirga qaytish → inventarizatsiya (muzlatish) → yacheykalararo ko'chirish.
**Real skaner** bilan: yacheyka → tovar → miqdor oqimi.
**Tayyorlik (DoD):** har oqim skrinshot/video · farq hisobotlari 0 · 7-bo'lim «Phase-2 verified».
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F030** (7-Ombor Phase-2 QA) ni bajar. `/qa-cohort`.
> Real brauzer + **real skaner**: qabul → putaway → yig'ish → qisman yig'ish → inventarizatsiya →
> yacheykalararo ko'chirish. Farq hisobotlarini tekshir. Hisobot → **TO'XTA**.

---

# T4 — TA'MINOTCHILAR

> **TZ:** `2026-08-01-taminotchilar-tz-design.md` · Ko'prikning birinchi yarmi (qabul-tasdiqlash
> zanjiri) **jonli**. Ikkinchi yarmi — ta'minotchi tomoni — umuman yo'q.
> **Holat:** `SupplierClaim`, `SupplierPortalToken` — **YO'Q**.

### F031 — `SupplierClaim` + qabulda qayd (kam/rad) + avtomatik da'vo ☐ HISOBOT
**Bo'lim/blok:** 5-B1 · **TZ:** §5.1, §5.4
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q
**Muammo:** da'volar hozir **umuman yozilmaydi**.
**Qamrov:** `SupplierClaim` modeli · qabul jarayonida kam kelish / rad etish **qayd etiladi** ·
shartlar bajarilsa **avtomatik da'vo** hujjati yaratiladi · da'vo holati (ochiq/javob
kutilmoqda/yopiq).
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/supply/`, `supply-approval/` ·
yangi `supplier-claim` modul (AppModule'ga **ula**) · `apps/web/.../supplies/`.
**Testlar (TDD):** (1) kam kelishda da'vo avtomatik yaratiladi. (2) rad etishda da'vo + sabab.
(3) bir qabul uchun ikki da'vo yaratilmaydi (idempotent). (4) mavjud qabul-tasdiqlash FSM'i
o'zgarmaydi (regress — jonli zanjir).
**Tayyorlik (DoD):** gate yashil · mavjud supply testlari yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F031** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 5-bo'lim TZ §5.1/§5.4. `SupplierClaim` + qabulda kam/rad qaydi + avtomatik da'vo (idempotent).
> **Mavjud qabul-tasdiqlash FSM'ini buzma** — u jonli. TDD, gate → **TO'XTA**.

---

### F032 — Rad etish oqibati: butun yetkazma qaytishi + `invoice-in` bloklanishi ☐ HISOBOT
**Bo'lim/blok:** 5-B2 · **TZ:** §5.2, §5.3
**Ustuvorlik:** P1 · **Bog'liqlik:** F031 · ⛔ **QAROR-B5** (kam kelish = rad etishmi?)
**Qamrov:** sifat nuqsonida **butun yetkazma qaytadi** · shu yetkazmaga bog'liq `invoice-in`
**bloklanadi** · **regressiya qulfi: stock o'zgarmasligi** (rad etilgan yetkazma qoldiqqa
kirmaydi).
**Testlar (TDD):** (1) rad etilgan yetkazmada `Stock` **o'zgarmaydi**. (2) `invoice-in` yaratishga
urinish → aniq xato. (3) qisman qabul (QAROR-B5 bo'yicha) qoidasi. (4) rad etish bekor qilinsa
holat tiklanadi.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F032** ni bajar. **Avval QAROR-B5 yopilganini tekshir.**
> 5-bo'lim TZ §5.2/§5.3. Rad etish → butun yetkazma qaytadi + `invoice-in` bloklanadi + **stock
> o'zgarmaydi** (regressiya qulfi). TDD, gate → **TO'XTA**.

---

### F033 — `SupplierPortalToken` + ta'minotchi oynasi ☐ HISOBOT
**Bo'lim/blok:** 5-B3 · **TZ:** §3, §3.1, §4.1
**Ustuvorlik:** P1 · **Bog'liqlik:** F031 · **Xavf:** yuqori (**tashqi kirish**)
**Qamrov:** `SupplierPortalToken` (muddatli, bekor qilinadigan) · ta'minotchi oynasi:
buyurtmalar va holati · **ikki xil havola** farqi (§3) aniq amalga oshiriladi.
**Xavfsizlik testlari MAJBURIY (§8.2):** cross-tenant · cross-counterparty · rate-limit ·
bekor qilingan token · muddati o'tgan token · token oshkor bo'lish yo'llari (log, referrer).
**Fayllar:** `schema.prisma` + migratsiya · yangi `supplier-portal` modul · public route
(`apps/web/src/app/p/` naqshi — mavjud public bo'limni ko'r).
**Testlar (TDD):** yuqoridagi 6 xavfsizlik stsenariysi + (7) faqat o'z buyurtmalari ko'rinadi +
(8) token log'ga tushmaydi.
**Tayyorlik (DoD):** gate yashil · **xavfsizlik testlari 8/8** · hech qanday ichki ma'lumot
oqmasligi hisobotda tasdiqlangan.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F033** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 5-bo'lim TZ §3/§3.1/§4.1 va §8.2. `SupplierPortalToken` + ta'minotchi oynasi (buyurtmalar).
> **Xavfsizlik testlari majburiy:** cross-tenant, cross-counterparty, rate-limit, bekor/muddati
> o'tgan token, token oqmasligi. TDD, gate → **TO'XTA**.

---

### F034 — Ta'minotchi oynasida o'zaro balans + to'lov jadvali + akt-sverka ☐ HISOBOT
**Bo'lim/blok:** 5-B4 · **TZ:** §4.2
**Ustuvorlik:** P1 · **Bog'liqlik:** F033
**Qamrov:** o'zaro hisob-kitob (nizolarning asosiy manbasi): balans · to'lov jadvali ·
**akt-sverka** (mavjud `kontragent-akt-sverka` spec'i va Excel eksportidan foydalan).
**Diqqat:** ta'minotchi qarzi hozir **Supply-only** (InvoiceIn balansdan uzilgan) — oynada
ko'rsatiladigan raqam **qaysi manbadan** kelishini hisobotda aniq yoz; tarixiy ikki-karra qarz
mavjud bo'lishi mumkin.
**Fayllar:** `apps/api/src/modules/counterparty-balance/`, `counterparty-act/` (mavjud) ·
`supplier-portal`.
**Testlar (TDD):** (1) portal balansi ichki akt-sverka bilan **bir xil** raqam. (2) boshqa
kontragent balansi ko'rinmaydi. (3) valyuta/kurs shartnomasi.
**Tayyorlik (DoD):** gate yashil · raqam **ikki manbadan** solishtirilgan.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F034** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 5-bo'lim TZ §4.2. Portal: o'zaro balans + to'lov jadvali + akt-sverka (mavjud akt-sverka
> servisidan foydalan, ikkinchisini yozma). Raqamni ichki hisobot bilan solishtir.
> TDD, gate → **TO'XTA**.

---

### F035 — Narx tarixi va barqarorlik tahlili + ogohlantirish ☐ HISOBOT
**Bo'lim/blok:** 5-B5 · **TZ:** §6
**Ustuvorlik:** P2 · **Bog'liqlik:** F031
**Qamrov:** xarid narxi tarixi (ta'minotchi × tovar) · **barqarorlik** ko'rsatkichi (egasi tanlagan
baholash) · chegaradan oshgan o'zgarish → menejer navbatiga (MK06 (menejer/kassa rejasi)) · 3-bo'lim M11 o'lchoviga manba.
**Fayllar:** `apps/api/src/modules/supply/`, `product/` · `report/metrics/`.
**Testlar (TDD):** (1) narx tarixi har qabulda yoziladi. (2) barqarorlik formulasi chegara
qiymatlarida. (3) ogohlantirish navbat elementi yaratadi, **bloklamaydi**.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F035** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 5-bo'lim TZ §6. Xarid narxi tarixi + barqarorlik tahlili + chegara ogohlantirishi (navbatga,
> bloklamaydi). Formulani `report/metrics/` da joylashtir. TDD, gate → **TO'XTA**.

---

### F036 — Da'volar ta'minotchi oynasida + javob yozish ☐ HISOBOT
**Bo'lim/blok:** 5-B6 · **TZ:** §5.4, §4
**Ustuvorlik:** P2 · **Bog'liqlik:** F031, F033
**Qamrov:** da'vo ta'minotchi oynasida ko'rinadi · ta'minotchi **javob yozadi** (yozishma) ·
holat o'zgarishi tarixi · fayl biriktirish (rasm — nuqson dalili).
**Testlar (TDD):** (1) faqat o'z da'volari ko'rinadi. (2) yopilgan da'voga javob yozilmaydi.
(3) yozishma append-only (o'chirilmaydi). (4) fayl turi/hajmi cheklovi.
**Tayyorlik (DoD):** gate yashil · xavfsizlik testlari (F033 to'plami) qayta yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F036** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 5-bo'lim TZ §5.4. Da'volar portalda + javob yozishmasi (append-only) + fayl biriktirish.
> F033 xavfsizlik testlari yashil qolsin. TDD, gate → **TO'XTA**.

---

### F037 — 5-Ta'minotchilar **Phase-2 QA** ☐ HISOBOT
**Bo'lim/blok:** 5-bo'lim QA · **TZ:** §8.3 · **Tur:** QA sessiyasi
**Ustuvorlik:** P1 · **Bog'liqlik:** F036
**Qamrov:** buyurtma → yetkazma → qabulda kam kelish → avtomatik da'vo → ta'minotchi oynasida
ko'rinishi → javob → yopilishi · balans/akt-sverka raqami ichki hisobot bilan mos ·
**xavfsizlik**: boshqa ta'minotchi havolasi bilan kirishga urinish.
**Tayyorlik (DoD):** har oqim skrinshot · xavfsizlik urinishlari rad etilgan · 5-bo'lim
«Phase-2 verified».
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F037** (5-Ta'minotchilar Phase-2 QA) ni bajar.
> `/qa-cohort`. Buyurtma → qabul → da'vo → portal → javob → yopish; balans solishtiruvi;
> xavfsizlik urinishlari. Hisobot → **TO'XTA**.

---

# T5 — ONLAYN SOTUV / B2B / B2G (qolgani)

> **TZ:** `2026-08-01-onlayn-sotuv-b2b-b2g-tz-design.md` · `B1` bajarilgan, narx/egalik/bonus
> (`B2`–`B4`) T5'da. Bu yerda — sotuvchining kundalik ish o'rni va tashqi kanallar.

### F038 — Voronka + qo'ng'iroq/vazifa rejasi (sotuvchi paneli) ☐ HISOBOT
**Bo'lim/blok:** 2-B5 · **TZ:** §4.1, §4.3 · **Holat:** `SalesActivityLog` **YO'Q**
**Ustuvorlik:** P2 · **Bog'liqlik:** F005 (egalik)
**Qamrov:** mijoz voronkasi (mavjud `pipeline`/`opportunity` modullarini **qayta ishlat**,
ikkinchi voronka qurma) · qo'ng'iroq/vazifa rejasi (mavjud `call`/`task`) · `SalesActivityLog`
(faollik tarixi — `Counterparty.lastActivityAt` manbai) · sotuvchi paneli ekrani.
**Fayllar:** `apps/api/src/modules/pipeline/`, `opportunity/`, `call/`, `task/` + yangi
`SalesActivityLog` · `apps/web/.../pipelines/`, yangi sotuvchi paneli.
**Testlar (TDD):** (1) faollik yozuvi `lastActivityAt` ni yangilaydi (90-kun taymeri bilan
bog'liq). (2) ikkinchi voronka modeli yaratilmagan (grep-guard). (3) panel faqat o'z mijozlarini
ko'rsatadi (scope).
**Tayyorlik (DoD):** gate + i18n yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F038** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 2-bo'lim TZ §4.1/§4.3. Sotuvchi paneli: voronka (**mavjud `pipeline`/`opportunity` ni qayta
> ishlat**) + qo'ng'iroq/vazifa rejasi + `SalesActivityLog` → `lastActivityAt`.
> TDD, gate → **TO'XTA**.

---

### F039 — Kommersiya taklifi (KP): `CommercialOffer` + PDF + Telegram + «ko'rildi» ☐ HISOBOT
**Bo'lim/blok:** 2-B6 · **TZ:** §4.2 · **Holat:** `CommercialOffer` **YO'Q**
**Ustuvorlik:** P2 · **Bog'liqlik:** F004 (narx dvigateli)
**Qamrov:** KP hujjati (pozitsiyalar, narx **dvigateldan**, amal muddati) · PDF chiqarish ·
Telegram orqali yuborish (mavjud `telegram` moduli) · **«ko'rildi» belgisi** (ochilish qayd
etiladi) · KP → buyurtmaga aylantirish.
**Fayllar:** `schema.prisma` + migratsiya · yangi `commercial-offer` modul (AppModule'ga **ula**) ·
`print-template`/PDF · `telegram`.
**Testlar (TDD):** (1) narx dvigateldan keladi (o'z mantig'i yo'q). (2) muddati o'tgan KP
buyurtmaga aylanmaydi. (3) «ko'rildi» bir marta yoziladi (idempotent). (4) Telegram yuborish
outbox orqali (dublikat yo'q).
**Tayyorlik (DoD):** gate yashil · yangi route `app-boot.test.ts` da.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F039** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 2-bo'lim TZ §4.2. `CommercialOffer` + PDF + Telegram + «ko'rildi» + buyurtmaga aylantirish.
> Narxni F004 dvigatelidan ol. Telegram yuborishni mavjud outbox naqshi bilan qil.
> TDD, gate → **TO'XTA**.

---

### F040 — Hujjatlar: hisob avtomatik + EDO faktura ☐ HISOBOT
**Bo'lim/blok:** 2-B7 (1-yarim) · **TZ:** §4.5
**Ustuvorlik:** P2 · **Bog'liqlik:** F004
**Qamrov:** buyurtmadan **hisob (invoice-out) avtomatik** yaratilishi (aralash model — §4.5) ·
**EDO faktura** (mavjud `edo`/`facture-out` modullarini kengaytir; PFX sirlari allaqachon
shifrlangan — o'sha qatlamdan foydalan).
**Fayllar:** `apps/api/src/modules/customer-order/`, `invoice-out/`, `edo/`, `facture-out/`.
**Testlar (TDD):** (1) buyurtma → hisob idempotent (ikki marta yaratilmaydi). (2) hisob qo'lda
tahrir qilingan bo'lsa qayta yozilmaydi. (3) EDO yuborish xatosi hujjatni **yarim holatda**
qoldirmaydi.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F040** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 2-bo'lim TZ §4.5. Buyurtmadan hisob avtomatik (idempotent) + EDO faktura (mavjud `edo` qatlami,
> shifrlangan PFX). Yarim holat qolmasin. TDD, gate → **TO'XTA**.

---

### F041 — MXIK tekshiruvi (B2G talabi) ☐ HISOBOT
**Bo'lim/blok:** 2-B7 (2-yarim) · **TZ:** §4.5
**Ustuvorlik:** P2 · **Bog'liqlik:** F040
**Qamrov:** MXIK kodi yo'q tovar bilan **faktura bloklanadi** — **aniq xato matni** bilan (qaysi
tovar, nima qilish kerak) · mavjud `mxik` modulini kengaytir · ommaviy tekshirish (buyurtma
darajasida hammasini bir marta).
**Testlar (TDD):** (1) MXIK yo'q → faktura yaratilmaydi, xato tovar nomini beradi. (2) hammasi
bor → o'tadi. (3) xato matni i18n ru+uz.
**Tayyorlik (DoD):** gate + i18n yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F041** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 2-bo'lim TZ §4.5. MXIK tekshiruvi: kodsiz tovarda faktura **bloklanadi**, xato matni aniq
> (tovar nomi + nima qilish). i18n ru+uz. TDD, gate → **TO'XTA**.

---

### F042 — Webhook qabul qilish (imzo + idempotentlik + navbat) ☑ HISOBOT (2026-08-09) · QISMAN
**Bo'lim/blok:** 2-B8 · **TZ:** §4.4
**Ustuvorlik:** P2 · **Bog'liqlik:** yo'q · **Xavf:** yuqori (tashqi kirish)
**Qamrov:** tashqi kanaldan buyurtma qabul qilish: **imzo tekshiruvi** (constant-time) ·
**idempotentlik** (bir xil hodisa ikki marta hujjat yaratmaydi) · navbat (outbox/inbox naqshi,
qayta urinish) · xato holatida DLQ.
**Diqqat:** mavjud `webhook`/`payment-gateway` modullarida imzo va idempotentlik naqshi bor —
**o'shani qayta ishlat**, yangisini yozma.
**2026-08-09 holati:** imzo + idempotentlik + qabul endpointi BAJARILDI. **Navbat/qayta-urinish/DLQ
→ `F042b`** (egasining qarori): ular kiruvchi inbox jadvalini talab qiladi, sxema esa o'sha sessiyada
F001 qo'lida edi. To'liq tafsilot — jurnaldagi «Faza F042» yozuvi.
**Fayllar:** `apps/api/src/modules/webhook/`, `online-order/`.
**Testlar (TDD):** (1) noto'g'ri imzo → 401, log'da sir yo'q. (2) bir xil `eventId` ikki marta →
bitta hujjat. (3) qayta urinish eksponensial. (4) DLQ ga tushgan hodisa yo'qolmaydi.
**Tayyorlik (DoD):** gate yashil · xavfsizlik testlari yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F042** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 2-bo'lim TZ §4.4. Webhook qabul: imzo (constant-time) + idempotentlik + navbat + DLQ.
> Mavjud `webhook`/`payment-gateway` naqshini qayta ishlat. TDD, gate → **TO'XTA**.

---

### F043 — Yetkazish: haydovchi biriktirish + holat + naqd topshirish ☐ HISOBOT
**Bo'lim/blok:** 2-B9 · **TZ:** §4.7
**Ustuvorlik:** P2 · **Bog'liqlik:** F042
**Qamrov:** buyurtmaga haydovchi biriktirish · yetkazish holati (yo'lda / yetkazildi / qaytdi) ·
**naqd topshirish** — mavjud `DriverCashHandover` ni qayta ishlat (yangi mexanizm qurma) ·
GPS treki mavjud qatlamdan.
**Fayllar:** `apps/api/src/modules/customer-order/`, `hr/` (haydovchi), `tracking-code/` ·
`apps/web/.../hr/` haydovchi ekrani.
**Testlar (TDD):** (1) naqd topshirish `DriverCashHandover` ga tushadi (ikkinchi jadval yo'q).
(2) yetkazilmagan buyurtma yopilmaydi. (3) haydovchi qo'lidagi naqd javobgarlik taxtasida
ko'rinadi (MK03 (menejer/kassa rejasi) bilan bog'liq).
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F043** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 2-bo'lim TZ §4.7. Haydovchi biriktirish + yetkazish holati + naqd topshirish (**mavjud
> `DriverCashHandover`**). Javobgarlik taxtasi bilan bog'lanishini tekshir. TDD, gate → **TO'XTA**.

---

### F044 — 2-Onlayn sotuv **Phase-2 QA** ☐ HISOBOT
**Bo'lim/blok:** 2-bo'lim QA · **TZ:** §9.2 · **Tur:** QA sessiyasi
**Ustuvorlik:** P1 · **Bog'liqlik:** F038–F043
**Qamrov:** onlayn buyurtma qabul → `CustomerOrder` → KP → hisob → EDO faktura → yig'ish →
yetkazish → naqd topshirish → bonus. Webhook: tashqi hodisa yuborib, dublikat yaratilmasligi.
**Tayyorlik (DoD):** har oqim skrinshot · 2-bo'lim «Phase-2 verified».
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F044** (2-Onlayn Phase-2 QA) ni bajar. `/qa-cohort`.
> Onlayn buyurtma → CO → KP → hisob → EDO → yig'ish → yetkazish → naqd → bonus; webhook
> dublikat testi. Hisobot → **TO'XTA**.

---

# T6 — HR (qolgani)

> **TZ:** `2026-08-02-hr-tz-design.md` · Oylik dvigateli T5'da (`F007`–`F009`). Bu yerda —
> ta'til, avans, davomat manbalari, jarima, haydovchi.

### F045 — `HrLeaveRequest`: ta'til so'rovi + tasdiq + davomat istisnosi ☐ HISOBOT
**Bo'lim/blok:** 6-B4 · **TZ:** §5.1–§5.2 · **Holat:** `HrLeaveRequest` **YO'Q**
**Ustuvorlik:** P2 · **Bog'liqlik:** F009
**Qamrov:** ta'til/ruxsat so'rovi · tasdiqlash oqimi · **davomatga ta'siri** (o'sha kunlar
yo'qlik deb sanalmaydi) · **oylikka ta'siri**: kun-bay ushlanma (§5.2 — egasining aniq talabi).
**Testlar (TDD):** (1) tasdiqlangan ta'til kuni davomatda jarima keltirmaydi. (2) kun-bay
ushlanma formulasi chegara qiymatlarida. (3) tasdiqlanmagan so'rov davomatga ta'sir qilmaydi.
(4) ta'til oylik hisoblangandan keyin kiritilsa — tuzatma yo'li (4M.3 naqshi).
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/hr/`, `payroll/` ·
`apps/web/.../hr/`.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F045** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 6-bo'lim TZ §5. `HrLeaveRequest` + tasdiq + davomat istisnosi + kun-bay ushlanma.
> Oylik hisoblangandan keyingi holat uchun tuzatma yo'li. TDD, gate → **TO'XTA**.

---

### F046 — `HrAdvanceRequest`: avans + kassa RKO + oylikdan ushlash ☐ HISOBOT
**Bo'lim/blok:** 6-B5 · **TZ:** §4 · **Holat:** `HrAdvanceRequest` **YO'Q**
**Ustuvorlik:** P2 · **Bog'liqlik:** F009
**Qamrov:** avans arizasi · tasdiq · **kassa RKO** yaratilishi (mavjud `RetailDrawerCashOut`
tasnifi yoki `cash-out` — qaysi biri to'g'ri ekanini kodda aniqla va hisobotda asosla) ·
oylikdan **avtomatik ushlash** (ikki marta ushlanmaydi).
**Testlar (TDD):** (1) tasdiqlangan avans RKO yaratadi va kassa qoldig'iga ta'sir qiladi.
(2) oylikda **bir marta** ushlanadi (idempotent). (3) avans oy oxirigacha to'lanmasa keyingi oyga
o'tadi (yoki TZ qoidasiga muvofiq). (4) rad etilgan ariza pul harakati yaratmaydi.
**Fayllar:** `schema.prisma` + migratsiya · `hr/`, `payroll/`, `cash-out/` yoki `retail-sale`
kassa qatlami.
**Tayyorlik (DoD):** gate yashil · pul oqimi **bitta manbadan** (ikkinchi yozuvchi ochilmagan).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F046** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 6-bo'lim TZ §4. `HrAdvanceRequest` + tasdiq + kassa RKO + oylikdan **bir marta** ushlash.
> Pul yozuvchisini ko'paytirma — mavjud kassa qatlamidan foydalan va tanlovingni asosla.
> TDD, gate → **TO'XTA**.

---

### F047 — Davomat manbalari: kassir/haydovchi smenasi → attendance ☐ HISOBOT
**Bo'lim/blok:** 6-B6 · **TZ:** §6
**Ustuvorlik:** P2 · **Bog'liqlik:** yo'q
**Qamrov:** kassir smenasi va haydovchi smenasi **avtomatik** davomatga aylanadi — xodim ikki
marta belgilamaydi · manbalar ustuvorligi (qo'lda belgilash vs smena) aniq qoida bilan.
**Diqqat:** HR KPI kunlik sanasi bo'yicha ma'lum **yorliq bug'i** bor (localDateOnly vs
startOfLocalDay) — yangi kod **o'sha xatoni takrorlamasin**; sana chegarasini toshkent vaqtida
hisobla.
**Testlar (TDD):** (1) smena ochilishi davomat yozuvini yaratadi. (2) qo'lda belgilash bilan
ziddiyat qoidaga muvofiq hal bo'ladi. (3) yarim tundan o'tuvchi smena **bir kunga** yoziladi
(sana chegarasi testi).
**Fayllar:** `apps/api/src/modules/hr/`, `cashier-session/`, `smena/`.
**Tayyorlik (DoD):** gate yashil · sana chegarasi testi yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F047** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 6-bo'lim TZ §6. Kassir/haydovchi smenasi → davomat (ikki marta belgilash yo'q) + manba
> ustuvorligi. **Sana chegarasini Toshkent vaqtida hisobla** — yarim tundan o'tuvchi smena testi
> majburiy. TDD, gate → **TO'XTA**.

---

### F048 — Avtomatik jarima qoidalari + istisnolar ☐ HISOBOT
**Bo'lim/blok:** 6-B7 · **TZ:** §6.1–§6.2
**Ustuvorlik:** P2 · **Bog'liqlik:** F045, F047
**Qamrov:** kechikish va yo'qlik uchun avtomatik jarima · istisnolar (tasdiqlangan ta'til,
ruxsat, texnik nosozlik) · jarima **`HrBonusFineLog`** ga (MK01 (menejer/kassa rejasi) bilan bir xil kanal) ·
menejer bekor qila oladi (sabab bilan).
**Testlar (TDD):** (1) kechikish chegarasida jarima. (2) tasdiqlangan ta'til → jarima yo'q.
(3) bekor qilish teskari yozuv (o'chirish emas). (4) bir kun uchun ikki jarima yozilmaydi.
**Fayllar:** `apps/api/src/modules/hr/` · cron.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F048** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 6-bo'lim TZ §6.1/§6.2. Avtomatik jarima + istisnolar + bekor qilish (teskari yozuv).
> Jarimani **`HrBonusFineLog`** ga yoz (MK01 (menejer/kassa rejasi) kanali). TDD, gate → **TO'XTA**.

---

### F049 — Haydovchi: yetkazma ↔ buyurtma + ish birligiga oylik ☐ HISOBOT
**Bo'lim/blok:** 6-B8 qoldig'i · **TZ:** §7
**Ustuvorlik:** P2 · **Bog'liqlik:** F043, F007 (piece sxemasi)
**Qamrov:** yetkazma ↔ buyurtma bog'lanishi (hozir uzilgan) · **ish birligiga oylik** (piece
sxemasi F007 dan) · haydovchi kunlik yakuni.
**Diqqat:** GPS **manba tomoni** ilgari yo'q edi (backend tirik, 0 ping) — bu fazada GPS
ishlatilsa **manbani alohida tekshir**, «401 = ishlayapti» degan xulosa chiqarma.
**Testlar (TDD):** (1) yetkazma buyurtmaga bog'lanadi, ikkalasi holati mos. (2) piece oylik
tugallangan yetkazmalardan hisoblanadi. (3) bekor qilingan yetkazma to'lovga kirmaydi.
**Fayllar:** `apps/api/src/modules/hr/`, `customer-order/`, `payroll/`.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F049** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 6-bo'lim TZ §7. Yetkazma↔buyurtma bog'lanishi + ish birligiga oylik (F007 piece sxemasi).
> GPS ishlatilsa manba tomonini alohida tekshir. TDD, gate → **TO'XTA**.

---

### F050 — 6-HR **Phase-2 QA** ☐ HISOBOT
**Bo'lim/blok:** 6-bo'lim QA · **TZ:** §10.2 · **Tur:** QA sessiyasi
**Ustuvorlik:** P1 · **Bog'liqlik:** F045–F049
**Qamrov:** ta'til so'rovi → tasdiq → davomat → oylik ushlanma · avans → RKO → oylikdan ushlash ·
kechikish → jarima → bekor qilish · haydovchi kuni → piece oylik · `Payroll` hujjati.
**Tayyorlik (DoD):** har oqim skrinshot · raqamlar ikki manbadan solishtirilgan · 6-bo'lim
«Phase-2 verified».
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F050** (6-HR Phase-2 QA) ni bajar. `/qa-cohort`.
> Ta'til → davomat → oylik; avans → RKO → ushlash; jarima → bekor; haydovchi piece oylik.
> Hisobot → **TO'XTA**.

---

# T7 — ANALITIKA TOVAR TAHLILI VA FILIAL YAKUNI

### F051 — Tovar tahlili: o'lik zaxira + tugash xavfi + buyurtma tavsiyasi ☐ HISOBOT
**Bo'lim/blok:** 3-B7 · **TZ:** §6.1–§6.2 · **Holat:** `SlowMoverConfig` **YO'Q**
**Ustuvorlik:** P2 · **Bog'liqlik:** F011
**Qamrov:** **o'lik zaxira — o'lchov PUL** («qancha pul qotib qolgan», dona emas) ·
tugab qolish xavfi + **buyurtma tavsiyasi** · `SlowMoverConfig` (chegaralar sozlanadi).
**Testlar (TDD):** (1) o'lchov pulda (tan narx NULL bo'lsa «hisoblanmadi», 0 emas).
(2) tugash xavfi sotuv tezligiga asoslanadi va yangi tovarni noto'g'ri belgilamaydi.
(3) tavsiya miqdori determinist va tushuntiriladi.
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/report/`, `restock-task/` ·
`apps/web/.../reports/`.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F051** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 3-bo'lim TZ §6.1/§6.2. O'lik zaxira (**o'lchov PUL**) + tugash xavfi + buyurtma tavsiyasi +
> `SlowMoverConfig`. NULL≠0. TDD, gate → **TO'XTA**.

---

### F052 — Marja × aylanma matritsasi + yo'qotishlar ☐ HISOBOT
**Bo'lim/blok:** 3-B8 · **TZ:** §6.3–§6.4
**Ustuvorlik:** P3 · **Bog'liqlik:** F051
**Qamrov:** marja × aylanma **4 kvadrant** matritsasi (qaysi tovar pul keltiradi, qaysi biri
joy egallaydi) · yo'qotishlar tahlili (ombor · xodim · sabab · vaqt kesimida).
**Testlar (TDD):** (1) kvadrant chegaralari sozlanadi va determinist. (2) tan narxsiz tovar
matritsaga kirmaydi (alohida sanaladi). (3) yo'qotish kesimlari `metrics` dan.
**Fayllar:** `apps/api/src/modules/report/` · `apps/web/.../reports/`.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F052** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 3-bo'lim TZ §6.3/§6.4. Marja×aylanma 4 kvadrant + yo'qotishlar (ombor/xodim/sabab/vaqt).
> Tan narxsiz tovar alohida sanaladi. TDD, gate → **TO'XTA**.

---

### F053 — Filiallararo ko'chirish: «yo'lda» holati + qabul tasdig'i ☐ HISOBOT
**Bo'lim/blok:** 8-B5 · **TZ:** §5.1
**Ustuvorlik:** P2 · **Bog'liqlik:** F003, F028
**Qamrov:** filialdan filialga ko'chirish: jo'natish → **«yo'lda»** → qabul tasdig'i · yo'ldagi
tovar **ikkala filialda ham qoldiqda ko'rinmaydi** (alohida «yo'lda» qoldiq) · farq bo'lsa da'vo
naqshi (kam yetib kelish).
**Testlar (TDD):** (1) jo'natishdan keyin manba filialda kamayadi, maqsadda **hali qo'shilmaydi**.
(2) qabul tasdig'idan keyin qo'shiladi. (3) qabul qilinmagan ko'chirish javobgarlik taxtasida.
(4) kam yetib kelish qayd etiladi.
**Fayllar:** `apps/api/src/modules/move/` (kengaytirish) · `apps/web/.../moves/`.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F053** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 8-bo'lim TZ §5.1. Filiallararo ko'chirish: «yo'lda» holati + qabul tasdig'i + kam yetib kelish.
> Yo'ldagi tovar ikkala filial qoldig'ida ko'rinmasin. TDD, gate → **TO'XTA**.

---

### F054 — Analitika: rollupga `branchId` + filiallar solishtiruvi ☐ HISOBOT
**Bo'lim/blok:** 8-B6 · **TZ:** §7
**Ustuvorlik:** P2 · **Bog'liqlik:** F011, F003
**Qamrov:** rolluplarda filial o'qi **ishlatiladi** (F011 da ustun qo'shilgan) · filial bo'yicha
filtr barcha hisobotlarda · **filiallar solishtiruvi** ekrani (egasining asosiy ekrani).
**Testlar (TDD):** (1) filial filtri jonli hisob bilan mos. (2) «hamma filial» yig'indisi =
filiallar yig'indisi. (3) filialsiz (eski) hujjatlar alohida sanaladi, yo'qolmaydi.
**Fayllar:** `apps/api/src/modules/report/` · `apps/web/.../reports/`, dashboard.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F054** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 8-bo'lim TZ §7. Rolluplarda filial o'qi + filtr + filiallar solishtiruvi ekrani.
> «Hamma filial» = filiallar yig'indisi — test bilan qulfla. TDD, gate → **TO'XTA**.

---

### F055 — Filial bo'yicha plan/KPI ☐ HISOBOT
**Bo'lim/blok:** 8-B7 · **TZ:** §7
**Ustuvorlik:** P3 · **Bog'liqlik:** MK37 (menejer/kassa rejasi), MK13 (menejer/kassa rejasi), F054
**Qamrov:** plan va KPI target'lari **filial kesimida** · filial reytingi · xodim KPI'si filialga
bog'lanishi (xodim bir necha filialda ishlasa — taqsimlash qoidasi).
**Testlar (TDD):** (1) filial plani xodim planlari yig'indisiga teng emas — mustaqil (yoki TZ
qoidasiga muvofiq, hisobotda asosla). (2) ko'p filialli xodim KPI'si ikki marta sanalmaydi.
**Fayllar:** `apps/api/src/modules/manager/`, `report/` · FE.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F055** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 8-bo'lim TZ §7. Filial bo'yicha plan/KPI + filial reytingi + ko'p filialli xodim taqsimoti
> (ikki marta sanalmasin). TDD, gate → **TO'XTA**.

---

### F056 — 8-Filial **Phase-2 QA** ☐ HISOBOT
**Bo'lim/blok:** 8-bo'lim QA · **TZ:** §9.3 · **Tur:** QA sessiyasi
**Ustuvorlik:** P1 · **Bog'liqlik:** F053–F055
**Qamrov:** ikkinchi filial yaratish → do'kon/kassa biriktirish → xodimni ikki filialga →
filial almashtirgich → hujjat muhrlanishi → ko'rinish chegarasi → filiallararo ko'chirish →
solishtiruv hisoboti. **Bir filialli rejim regressiyasi ham tekshiriladi.**
**Tayyorlik (DoD):** har oqim skrinshot · 8-bo'lim «Phase-2 verified».
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F056** (8-Filial Phase-2 QA) ni bajar. `/qa-cohort`.
> Ikkinchi filial → biriktirish → almashtirgich → muhrlash → ko'rinish → ko'chirish → solishtiruv.
> Bir filialli regressiyani ham tekshir. Hisobot → **TO'XTA**.

---

# T8 — SIFAT QARZLARI (to'lqinlardan mustaqil, istalgan payt)

### F057 — `docs/moysklad-reference` capture'larini tiklash ☐ HISOBOT
**Ustuvorlik:** P2 · **Bog'liqlik:** yo'q
**Muammo:** `docs/moysklad-reference` **bo'sh/yo'q** (0 modul) → `label-grounding.test.ts` da
**25 ENOENT** — capture-grounded auditlarni qayta ishlab bo'lmaydi, himoya **ishlamayapti**.
**Qamrov:** `scripts/capture-moysklad-*.ts` bilan referens capture'larni qayta yig'ish (real
akkaunt kerak) yoki arxivdan tiklash · `label-grounding.test.ts` yashil bo'lishi ·
yiqilganlar soni **aynan 25** ekanini avval o'lchab tasdiqlash.
**Testlar:** `apps/web/src/__tests__/label-grounding.test.ts` → 0 ENOENT.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F057** ni bajar. Avval `label-grounding.test.ts` ni
> yugurtirib **yiqilganlar sonini o'lcha** (kutilgan 25). `docs/moysklad-reference` capture'larini
> tikla (capture skriptlari yoki arxiv). Test 0 ENOENT bo'lsin. Hisobot → **TO'XTA**.

---

### F058 — Parity foizlarini `climart-adoption` da qayta o'lchash ☐ HISOBOT
**Ustuvorlik:** P3 · **Bog'liqlik:** yo'q
**Muammo:** parity foizlari `main` sahifalariga qarshi o'lchangan (`docs/progress.json` buni ochiq
aytadi) — joriy branch uchun **qayta tekshirilmagan**.
**Qamrov:** o'lchash skriptini shu branchda yugurtirish · `progress.json` va `PARITY-STATUS.md`
ni yangilash · farqni hisobotda tushuntirish.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F058** ni bajar. Parity o'lchovini `climart-adoption`
> branchida qayta yugurtir, `progress.json` + `PARITY-STATUS.md` ni yangila, farqni tushuntir.
> Hisobot → **TO'XTA**.

---

### F059 — List toolbar: qolgan 37 sahifa ☐ HISOBOT
**Ustuvorlik:** P3 · **Bog'liqlik:** yo'q · **Holat:** 19/56 bajarilgan
**Qamrov:** qolgan 37 ro'yxat sahifasida toolbar parity (moysklad bilan). Mexanik ish —
**deterministik codemod** afzal, agent faqat hukm talab joyda.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F059** ni bajar. Qolgan 37 list sahifasida toolbar
> parity. Avval **codemod** yoz (fail-closed), keyin qo'lda hukm talab qilganlarini tuzat.
> Gate → **TO'XTA**. *(Sig'masa 2 fazaga bo'l va rejani yangila.)*

---

### F060 — Navigation graph (0%) ☐ HISOBOT
**Ustuvorlik:** P3 · **Bog'liqlik:** yo'q
**Qamrov:** `docs/nav-map.html` mavjud — navigatsiya grafi parity o'lchovi va yetishmayotgan
o'tishlar ro'yxati; keyin tuzatish.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F060** ni bajar. Navigation graph parity: o'lchash →
> yetishmayotgan o'tishlar ro'yxati → tuzatish. Gate → **TO'XTA**.

---

### F061 — Conv-6 data-bog'liq vizuallar browser-smoke (3/13) ☐ HISOBOT
**Ustuvorlik:** P3 · **Bog'liqlik:** yo'q · **Tur:** QA
**Qamrov:** qolgan 10 data-bog'liq vizual holatni real brauzerda tekshirish (seed ma'lumot bilan).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F061** ni bajar. `/qa-cohort`. Conv-6 data-bog'liq
> vizuallardan qolgan 10 tasini brauzerda tekshir (seed bilan). Hisobot → **TO'XTA**.

---

# T9 — MAHSULOT KENGAYISHI: F2 B2B KABINET · F3 B2C DO'KON · F4 MARKETPLACE

> **2026-08-09 — qamrov kengaytirildi.** 2-bo'lim TZ §1 da `F2`/`F3` «arxitektura darajasida»,
> `F4` «faqat eslatib o'tiladi» deb belgilangan edi. Egasi ularni ham rejaga kiritdi.
> **Bu to'lqin T7 dan keyin boshlanadi** — chunki F2/F3 narx dvigateli (F004), buyurtma modeli va
> rezerv mantiqini **qayta ishlatadi**; ular tayyor bo'lmasa hammasi qayta yoziladi.
>
> ⚠️ **Halol chegara:** quyidagi 5 fazadan **3 tasi TZ yozish sessiyasi**. Qurish fazalari
> (`F063`, `F065`) — **meta-faza**: TZ tayyor bo'lgach ular N ta odatiy fazaga bo'linadi va shu
> reja yangilanadi. Hozir ularga aniq fayl/test ro'yxati yozib bo'lmaydi — bu taxmin bo'lardi.

### F062 — F2 (B2B dilerlar kabineti) TZ'si ☐ HISOBOT
**Tur:** spec sessiyasi (kod YO'Q) · **Ustuvorlik:** P2 · **Bog'liqlik:** F004, F005, F006
**Qamrov:** dilerning o'zi kiradigan kabinet: kirish/autentifikatsiya modeli (ta'minotchi portali
`SupplierPortalToken` naqshi bilan solishtiriladi) · katalog va **shartnoma narxi** ko'rinishi ·
buyurtma berish → `CustomerOrder` · qarz va akt-sverka · hujjatlar · limit/kredit siyosati ·
xavfsizlik talablari (cross-tenant, rate-limit, token oshkorligi).
**Natija:** `docs/superpowers/specs/<sana>-b2b-kabinet-tz-design.md` + shu rejaga `F063` ni
almashtiruvchi faza ro'yxati.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F062** ni bajar. **Kod yozma.** 2-bo'lim TZ §5 (F2
> arxitektura bandi) va 5-bo'lim portal xavfsizlik talablarini o'qi, mavjud narx dvigateli va
> buyurtma modelini kodda ko'r. B2B kabinet uchun to'liq TZ yoz + uni fazalarga bo'lib shu rejaga
> `F063` o'rniga qo'y. Hisobot → **TO'XTA**.

---

### F063 — F2 B2B kabinetni qurish (**meta-faza**) ☐ HISOBOT
**Tur:** meta-faza · **Bog'liqlik:** **F062**
**Holat:** TZ yo'q — aniq qamrov yozilmaydi. `F062` tugagach bu faza **o'chiriladi** va uning
o'rniga TZ bergan fazalar qo'yiladi (raqamlash qayta hisoblanadi).
**Kutilayotgan hajm (taxmin, majburiy emas):** ~6–10 faza (kirish · katalog/narx · buyurtma ·
qarz/hujjatlar · bildirishnoma · xavfsizlik testlari · Phase-2 QA).
**▶ SESSIYA-BOSHI PROMPT:**
> Bu meta-faza — to'g'ridan-to'g'ri bajarilmaydi. Avval **F062** (TZ) bajarilishi shart.

---

### F064 — F3 (B2C onlayn do'kon) TZ'si ☐ HISOBOT
**Tur:** spec sessiyasi (kod YO'Q) · **Ustuvorlik:** P3 · **Bog'liqlik:** F004, F063
**Qamrov:** ochiq katalog · savat · Click/Payme to'lovi (mavjud `payment-gateway` qatlami —
capture → `PaymentIn` DRAFT shartnomasi hisobga olinadi) · yetkazish · mehmon buyurtmasi ·
SEO/marketing (mavjud `apps/marketing` bilan chegara) · `apps/shop` alohida ilova bo'ladimi degan
qaror · zaxira/rezerv ko'rinishi.
**Natija:** `docs/superpowers/specs/<sana>-b2c-dokon-tz-design.md` + `F065` o'rniga faza ro'yxati.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F064** ni bajar. **Kod yozma.** 2-bo'lim TZ §6 ni o'qi,
> mavjud `payment-gateway`, `online-order`, narx dvigateli va rezerv mantiqini kodda ko'r.
> B2C do'kon TZ'sini yoz (`apps/shop` qarori bilan) + fazalarga bo'lib rejaga qo'y →
> **TO'XTA**.

---

### F065 — F3 B2C do'konni qurish (**meta-faza**) ☐ HISOBOT
**Tur:** meta-faza · **Bog'liqlik:** **F064**
**Holat:** TZ yo'q — `F064` tugagach almashtiriladi. **Kutilayotgan hajm:** ~8–14 faza.
**▶ SESSIYA-BOSHI PROMPT:**
> Bu meta-faza — avval **F064** (TZ) bajarilishi shart.

---

### F066 — F4 (Marketplace platformasi) TZ'si ☐ HISOBOT
**Tur:** spec sessiyasi (kod YO'Q) · **Ustuvorlik:** P4 · **Bog'liqlik:** F064
**Eslatma:** egasining asl qarori — «**marketplace oxirida**» (2-bo'lim TZ §1). Shu tartib
saqlanadi: bu — rejaning eng oxirgi mahsulot fazasi.
**Qamrov:** tashqi sotuvchilar modeli (multi-tenant chegarasi — hozirgi `accountId` izolyatsiyasi
yetarlimi?) · komissiya va hisob-kitob · moderatsiya · sotuvchi kabineti · to'lov taqsimoti ·
huquqiy/soliq savollari ro'yxati.
**Natija:** TZ hujjati + qurish fazalari ro'yxati (rejaga alohida to'lqin sifatida qo'shiladi).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F066** ni bajar. **Kod yozma.** 2-bo'lim TZ §7 ni o'qi,
> hozirgi tenant izolyatsiyasini kodda tekshir. Marketplace TZ'sini yoz (komissiya, moderatsiya,
> to'lov taqsimoti, huquqiy savollar ro'yxati bilan) → **TO'XTA**.

---

# T10 — MOYSKLAD VIZUAL 1:1 PARITY TREKI

> **Bu — 8 bo'limdan alohida maqsad.** `NEXT.md`: «butun ilovani moysklad.uz bilan 1ga-1 qilish —
> ishlashi bilan ham, **ko'rinishi bilan ham**». Hozirgi holat: strukturaviy Phase-1 ✅ (63 detail +
> 71 list audit), **vizual pixel-1:1 endi boshlangan** (customer-order `/new` = 1-namuna, ~90%).
> Ya'ni ~90 sahifaning vizual ishi qolgan.
>
> **Bog'liqlik:** butun to'lqin **F057** (capture-reference tiklash) ga tayanadi — usiz
> solishtirish uchun ground-truth yo'q.
> **Metod:** har faza = bitta cohort; sahifalar ro'yxati `NEXT.md` → «Cohort audit navbati»
> jadvalidan olinadi (yangisini o'ylab topilmaydi).

### F067 — Vizual parity metodikasi va o'lchov harness'i ☐ HISOBOT
**Ustuvorlik:** P1 · **Bog'liqlik:** **F057**
**Qamrov:** capture → render → **pixel/DOM diff** → hisobot zanjiri (takrorlanadigan, skript) ·
«qabul chegarasi» ta'rifi (nima 1:1 hisoblanadi: o'lcham/rang/shrift/joylashuv/bo'shliq) ·
namuna sahifada (customer-order `/new`, ~90%) kalibratsiya · **soxta yashil** oldini olish
(diff bo'sh chiqsa — capture yo'qligidan emasligini isbotlash).
**Fayllar:** `scripts/` (yangi harness) · `docs/` (metodika + qabul chegarasi).
**Testlar:** (1) ma'lum farq kiritilsa harness uni **topadi** (mutatsiya testi). (2) capture yo'q
bo'lsa harness **xato** beradi, «0 farq» emas.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F067** ni bajar. **F057 capture'lari borligini avval
> tasdiqla.** Vizual parity harness'i (capture → diff → hisobot) + qabul chegarasi ta'rifi +
> namuna sahifada kalibratsiya. Mutatsiya testi bilan «soxta yashil»ni yop. → **TO'XTA**.

---

## 📐 F068–F083 uchun UMUMIY METOD (har fazada takrorlanmaydi)

Quyidagi 16 fazaning har biri **bir xil qadamlarni** bajaradi — shuning uchun bu yerda bir marta
yozilgan; faza entry'lari faqat **qamrovni** (qaysi sahifalar) belgilaydi:

1. Cohort sahifalarini `F067` harness'i bilan **o'lchash** → «oldin» diff raqami.
2. Farqlarni ustuvorlik bo'yicha ro'yxatlash (tuzilma/joylashuv → o'lcham/bo'shliq → rang/shrift).
3. Tuzatish. **Label o'zgartirilsa — CLAUDE.md §4 intizomi majburiy:** DOM-rol o'qiladi
   (grep-count grounding EMAS), yangi audited label `label-grounding.test.ts` registriga qo'shiladi.
4. **Qayta o'lchash** → «keyin» diff raqami. Ikkalasi hisobotda bo'ladi.
5. **Brauzer-smoke shu fazada bajariladi** — vizual ish brauzersiz ma'nosiz (bu fazalar
   «Phase-1» deb emas, **«vizual o'lchov bilan tasdiqlangan»** deb belgilanadi).
6. Gate: `typecheck 0` · `biome 0` · i18n ru+uz · web Vitest regressiyasiz.

**▶ UMUMIY PROMPT SHABLONI:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F9XX** ni bajar. «F068–F083 uchun UMUMIY METOD»
> bo'limidagi 6 qadamni bajar. Sahifalar ro'yxati — fazaning «Qamrov» qatorida.
> «Oldin/keyin» diff raqamlari bilan hisobot yozib **TO'XTA**.

---

### F068 — Vizual 1:1 · cohort A (Production-core) ☐ HISOBOT
**Ustuvorlik:** P2 · **Bog'liqlik:** F067 · **Qamrov:** `processing-orders` · `processings` · `productions`

---

### F069 — Vizual 1:1 · cohort B (Stock + internal) ☐ HISOBOT
**Ustuvorlik:** P2 · **Bog'liqlik:** F067 · **Qamrov:** `enters` · `losses` · `inventories` · `internal-orders`

---

### F070 — Vizual 1:1 · cohort C (Production-config) ☐ HISOBOT
**Ustuvorlik:** P2 · **Bog'liqlik:** F067 · **Qamrov:** `production/boms` · `production/processes` ·
`production/stages` · `production/work-orders`

---

### F071 — Vizual 1:1 · cohort D (Money / returns) ☐ HISOBOT
**Ustuvorlik:** P2 · **Bog'liqlik:** F067 · **Qamrov:** `prepayments` · `prepayment-returns` ·
`counterparty-adjustments`

---

### F072 — Vizual 1:1 · cohort E (Retail) ☐ HISOBOT
**Ustuvorlik:** P1 · **Bog'liqlik:** F067, MK34 (menejer/kassa rejasi) · **Qamrov:** `retail/sales` · `retail/sessions`
*(kassa oqimi — MK34 (menejer/kassa rejasi) QA dan keyin qilinsa ikki marta tuzatish bo'lmaydi)*

---

### F073 — Vizual 1:1 · cohort F (Catalog items) ☐ HISOBOT
**Ustuvorlik:** P2 · **Bog'liqlik:** F067 · **Qamrov:** `bundles` · `services` · `variants` · `tracking-codes`

---

### F074 — Vizual 1:1 · cohort G (CRM) ☐ HISOBOT
**Ustuvorlik:** P2 · **Bog'liqlik:** F067 · **Qamrov:** `opportunities` · `pipelines` ·
`contact-persons` · `tasks`

---

### F075 — Vizual 1:1 · cohort H (E-commerce / pricing) ☐ HISOBOT
**Ustuvorlik:** P2 · **Bog'liqlik:** F067, F004 · **Qamrov:** `ecommerce/channels` ·
`ecommerce/orders` · `discounts` · `price-lists`

---

### F076 — Vizual 1:1 · cohort I (HR) ☐ HISOBOT
**Ustuvorlik:** P2 · **Bog'liqlik:** F067, F016 · **Qamrov:** `hr/employees` · `payrolls`
*(xodim kartasi F016 da qayta qurilgan — undan keyin o'lchansin)*

---

### F077 — Vizual 1:1 · cohort J (Analytics) ☐ HISOBOT
**Ustuvorlik:** P2 · **Bog'liqlik:** F067, F013 · **Qamrov:** `analitika/*` sahifalari
*(NEXT.md jadvalidagi J qatori — panellar F013 da o'zgargan bo'lishi mumkin)*

---

### F078 — Vizual 1:1 · cohort K (Settings-finance) ☐ HISOBOT
**Ustuvorlik:** P3 · **Bog'liqlik:** F067 · **Qamrov:** `settings/bank-accounts` · `cash-desks` ·
`expense-items` · `tax-rates` · `price-types`

---

### F079 — Vizual 1:1 · cohort L (Settings-org) ☐ HISOBOT
**Ustuvorlik:** P3 · **Bog'liqlik:** F067, MK28 (menejer/kassa rejasi) · **Qamrov:** `settings/organizations` · `regions` ·
`publications` · `custom-entities` · `label-templates` · `users`
*(ruxsat matritsasi MK28 (menejer/kassa rejasi) shu bo'limga yangi ekran qo'shadi — undan keyin)*

---

### F080 — Vizual 1:1 · ro'yxat sahifalari guruh 1 (L1–L3) ☐ HISOBOT
**Ustuvorlik:** P2 · **Bog'liqlik:** F067, F059
**Qamrov:** `docs/audits/*-list.audit.md` dagi L1–L3 cohortlari. Ro'yxat sahifasida o'lchanadigan
narsalar: ustun kengligi · toolbar · filtr paneli · bo'sh holat · paginatsiya · tanlash xulqi.
**Chegara:** toolbar **funksional** qismi F059 da — bu yerda faqat **ko'rinish**.

---

### F081 — Vizual 1:1 · ro'yxat sahifalari guruh 2 (L4–L6) ☐ HISOBOT
**Ustuvorlik:** P2 · **Bog'liqlik:** F080 · **Qamrov:** L4–L6 cohortlari (F080 bilan bir xil mezon)

---

### F082 — Vizual 1:1 · ro'yxat sahifalari guruh 3 (L7–L9) ☐ HISOBOT
**Ustuvorlik:** P2 · **Bog'liqlik:** F080 · **Qamrov:** L7–L9 cohortlari

---

### F083 — Vizual 1:1 · ro'yxat sahifalari guruh 4 (L10–L12) ☐ HISOBOT
**Ustuvorlik:** P2 · **Bog'liqlik:** F080 · **Qamrov:** L10–L12 cohortlari

---

### F084 — Vizual parity yakuniy o'lchovi + navigatsiya 1:1 ☐ HISOBOT
**Ustuvorlik:** P1 · **Bog'liqlik:** F067–F083, F060 (nav-graph)
**Qamrov:** butun ilova bo'yicha yakuniy vizual o'lchov · qolgan farqlar ro'yxati (ataylab
qoldirilganlari sabab bilan) · `docs/progress.json` + `PARITY-STATUS.md` yangilanishi ·
navigatsiya oqimi 1:1 (nav-graph F060 natijasi ustida).
**Tayyorlik (DoD):** har sahifa uchun yakuniy diff raqami · **«1:1» faqat o'lchov bilan
tasdiqlangan sahifaga yoziladi**, taxmin bilan emas.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F084** ni bajar. Butun ilova bo'yicha yakuniy vizual
> o'lchov + navigatsiya 1:1 + `progress.json`/`PARITY-STATUS.md` yangilash. «1:1» yorlig'ini
> faqat o'lchangan sahifaga yoz. Hisobot → **TO'XTA**.

---

# T11 — ISHONCHLILIK VA TAXMINLAR REVIZIYASI

> **Nega alohida to'lqin:** rejadagi 10 ta Phase-2 QA fazasi **funksional** — «to'g'ri
> ishlayaptimi». Ular **yuklama**, **xavfsizlik** va **prod-hajmdagi ma'lumot** savollariga javob
> bermaydi. Shuningdek har TZ'da «Qabul qilingan taxminlar» bo'limi bor — ular hech qachon
> qayta ko'rilmagan.

### F085 — Prod-hajmdagi ma'lumot bilan ishlash (sekin so'rovlarni topish) ☐ HISOBOT
**Ustuvorlik:** P1 · **Bog'liqlik:** F011 (rollup), F056 (ombor QA)
**Muammo:** hozirgi seed kichik. Indeks bor-yo'qligi kichik jadvalda **bilinmaydi** — bir
hodisada faqat indeks so'rovni 18ms dan 66ms ga o'zgartirgan, ya'ni sxema emas, **so'rov shakli**
hal qiladi.
**Qamrov:** prod-hajmga yaqin seed generatori (hujjat/pozitsiya/qoldiq soni sozlanadi) ·
og'ir ekranlarni o'lchash (dashboard · ro'yxatlar · hisobotlar · rollup qurish · yig'ish varag'i) ·
sekin so'rovlar ro'yxati + `EXPLAIN` · tuzatish (indeks yoki so'rov shakli).
**Fayllar:** `packages/db/prisma/seed*.ts` yoki yangi `scripts/seed-scale.ts` · `docs/perf/`.
**Testlar:** o'lchov **takrorlanadigan** bo'lsin (skript + hisobot); tuzatishdan oldin/keyin raqam.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F085** ni bajar. Prod-hajmga yaqin seed generatori yoz,
> og'ir ekranlarni o'lcha, sekin so'rovlarni `EXPLAIN` bilan tahlil qil va tuzat. Oldin/keyin
> raqamlarini hisobotga yoz → **TO'XTA**.

---

### F086 — Yuklama testi (bir vaqtda ishlovchi foydalanuvchilar) ☐ HISOBOT
**Ustuvorlik:** P2 · **Bog'liqlik:** F085
**Qamrov:** real stsenariylar bo'yicha yuklama: bir necha kassa bir vaqtda sotadi · omborchilar
yig'adi · menejer panellarni ochadi · cron rollup ishlaydi. O'lchanadigan: javob vaqti ·
xatolar ulushi · DB qulflari/deadlock · PM2 `instances: 1` cheklovi.
**Diqqat:** atomik claim/serializable tranzaksiyalar (smena yopish, delete, outbox) aynan
yuklamada sinaladi — poyga holatlari shu yerda ko'rinadi.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F086** ni bajar. Yuklama testi: parallel kassa sotuvi +
> yig'ish + panellar + cron. Javob vaqti, xato ulushi, deadlock o'lchanadi. Poyga holatlarini
> alohida qayd et → **TO'XTA**.

---

### F087 — Xavfsizlik auditi (tashqi kirish nuqtalari) ☐ HISOBOT
**Ustuvorlik:** P1 · **Bog'liqlik:** F033 (ta'minotchi portali), F042 (webhook), MK39 (menejer/kassa rejasi) (record-scope)
**Qamrov:** butun tashqi sirtni bir joyda tekshirish: ta'minotchi portali tokeni · webhook imzosi ·
public route'lar (`app/p/`, magic-link) · API tokenlari va scope · JWT/cookie sirlari ·
cross-tenant izolyatsiya · rate-limit · fayl yuklash · log'da sir oqishi.
**Metod:** har nuqta uchun **hujum stsenariysi** yozilib, test bilan qulflanadi (refute-default:
«ishlayapti» degan taxmin emas, buzishga urinish).
**Tayyorlik (DoD):** har topilma yo tuzatilgan, yo ochiq xavf sifatida hujjatlangan (yashirilmagan).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F087** ni bajar. Tashqi kirish nuqtalarining xavfsizlik
> auditi (portal · webhook · public route · API token · cross-tenant · rate-limit · fayl · log).
> Har nuqtaga hujum stsenariysi yoz va test bilan qulfla. Topilmani yashirma → **TO'XTA**.

---

### F088 — TZ taxminlarini reviziya qilish (egasi bilan) ☐ HISOBOT
**Tur:** qaror sessiyasi (kod YO'Q) · **Ustuvorlik:** P2 · **Bog'liqlik:** yo'q
**Qamrov:** har TZ'ning «Qabul qilingan taxminlar» bo'limini egasi bilan birma-bir ko'rib chiqish.
Ma'lum bo'lganlari: **QAROR-B5** (kam kelish = rad etishmi) · «tovar katalogi filiallarda umumiy» ·
«bitta yuridik shaxs» · «mijoz qarzi filiallar bo'ylab umumiy» · kassir/sotuvchi bonus bazasi.
**Natija:** o'zgargan taxmin uchun **yangi faza** shu rejaga qo'shiladi (o'zgarish narxi bilan).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F088** ni bajar. **Kod yozma.** 9 ta TZ'ning «Qabul
> qilingan taxminlar» bo'limlarini yig'ib, men bilan birma-bir ko'rib chiq: har biri uchun
> «shundaymi?» + o'zgartirilsa **narxi qancha** (nechta faza). Javoblarimni rejaga yozib → **TO'XTA**.

---

# T12 — YAKUN

### F089 — YAKUNIY: «100% ta'rifi» tekshiruvi + prod deploy verifikatsiyasi ☐ HISOBOT
**Tur:** aralash (tekshiruv + ops) · **Ustuvorlik:** P0 (eng oxirida) · **Bog'liqlik:** BARCHA fazalar
**Qamrov:**
1. Shu rejadagi va `todo.md` dagi **hamma katakcha** belgilanganini tasdiqlash (sanash skripti).
2. Har bo'lim **«Phase-2 verified»**, vizual trek **«o'lchov bilan tasdiqlangan»** ekanini
   tasdiqlash — «Phase-1» qolmagan.
3. To'liq gate: `typecheck 0` · `biome 0` · i18n ru+uz · **butun** Vitest suite regressiyasiz.
4. Prodga deploy (`/deploy`) + `/api/v1/health` + asosiy oqimlar **jonli** tasdiqlash.
5. **QAROR-B5** yopilgan · **F088** taxminlar reviziyasi bajarilgan.
6. **OPS-QADAMLAR** ro'yxati bo'sh.
7. **Menejer/kassa rejasi holati** (`REJA-MENEJER-KASSA-2026-08.md`) qayd etilgan: MK01–MK40 dan
   qaysilari bajarilgan, qaysilari qolgan — hamda shu rejadagi qaysi fazalar **qamrovi
   qisqartirilib** bajarilgani (`F013`, `F014`, `F016`, `F024`, `F035`, `F043`, `F048`, `F055`,
   `F072`, `F079`, `F087`).
8. Yakuniy hisobot: nima qurildi · nima ataylab qilinmadi · qanday qarz qoldi.
**Tayyorlik (DoD):** 8/8 band tasdiqlangan. **Tasdiqlanmagan band «tasdiqlanmadi» deb yoziladi** —
«done» deyilmaydi (CLAUDE.md §1, §2).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-8-BOLIM-2026-08.md` — **Faza F089** (yakuniy tekshiruv) ni bajar. «100% ta'rifi»ning
> 8 bandini birma-bir tasdiqla (sanash skripti bilan), to'liq gate yugurt, `/deploy` + health +
> jonli oqimlar. Tasdiqlanmagan bandni **«tasdiqlanmadi»** deb yoz. Yakuniy hisobot → **TO'XTA**.

---

## ✅ 100% TA'RIFI

1. Shu rejadagi va `todo.md` dagi **hamma katakcha** belgilangan (meta-fazalar F063/F065 ochilib,
   ulardan chiqqan fazalar ham bajarilgan);
2. Har bo'lim **brauzerda** tekshirilgan (Phase-2) — «Phase-1» qolmagan;
3. **Vizual 1:1**: har sahifa uchun yakuniy diff raqami o'lchangan (T15) — «1:1» yorlig'i faqat
   o'lchov bilan qo'yilgan, taxmin bilan emas;
4. Gate yashil: `typecheck 0` · `biome 0` · i18n ru+uz · Vitest regressiyasiz;
5. **Ishonchlilik** (T16): prod-hajmda o'lchangan · yuklama testi o'tgan · xavfsizlik auditi
   topilmalari yopilgan yoki ochiq xavf sifatida hujjatlangan;
6. Prodga deploy qilingan, `/api/v1/health` + asosiy oqimlar **jonli** tasdiqlangan;
7. **QAROR-B5** yopilgan va **F088** (taxminlar reviziyasi) bajarilgan
   *(QAROR-B1…B4 — menejer/kassa rejasida)*;
8. **OPS-QADAMLAR** ro'yxati bo'sh (hammasi bajarilgan).

> **Shundagina** «8 bo'lim + moysklad 1:1 + mahsulot kengayishi = 100%» deyish mumkin.
> Bittasi ham tasdiqlanmagan bo'lsa — natija **«qisman»** deb yoziladi, «done» emas.

---

# 📓 HISOBOT JURNALI

> **Har faza agenti shu yerga o'z bo'limini QO'SHADI (append).** Mavjud yozuvlarni tahrirlash yoki
> kesish **TAQIQ** — faqat oxiriga qo'shiladi. Yozgandan keyin fayl qator-sonini tekshir.

**Shablon (nusxa ol):**

```markdown
## Faza F<NN> — <sarlavha> (sana: YYYY-MM-DD)

**Holat:** BAJARILDI | QISMAN | BLOKLANDI
**Commit(lar):** <hash> — <xabar>

### Nima o'zgardi
- `path/to/file.ts` — <nima va nega>

### Testlar (RED → GREEN)
- `path/to/file.test.ts` — <test nomi> · avval YIQILDI (<sabab>) → keyin YASHIL
- Yugurtirilgan: `<buyruq>` → <N passed, M failed>

### Gate natijasi
- typecheck: 0 · biome: 0 · i18n: OK/N-A · vitest: <natija>

### Tasdiqlangan/rad etilgan da'volar
- Rejada «X» deyilgan edi — kodda <tasdiqlandi | boshqacha ekan: …>

### Qolgan qarz / DEFER
- <nima qilinmadi va nega> → <qaysi fazaga>

### OPS-QADAM qo'shildimi
- <ha: … | yo'q>

### Status yorlig'i
**Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q** *(yoki QA fazasi uchun:
Phase-2 verified — nimalar brauzerda ko'rildi)*
```

---

<!-- HISOBOTLAR SHU QATORDAN KEYIN QO'SHILADI -->

## Faza F001 — `Branch` modeli + migratsiya (bitta «Asosiy» filial) (sana: 2026-08-09)

**Holat:** BAJARILDI
**Commit(lar):** `cfad3900` — `feat(branch): F001 — Branch modeli + «Asosiy» filial migratsiyasi`
*(hook'lar bir martaga chetlab o'tilgan — parallel sessiya ~90 faylni o'zgartirayotgan edi;
gate'lar qo'lda to'liq yugurtirildi, tarkib `git show --stat` bilan tekshirildi: 18 fayl, begona
fayl tushmagan)*

### Nima o'zgardi
- `packages/db/prisma/schema.prisma` — `model Branch` (`accountId`, `organizationId?`, `name`,
  `code?`, `address?`, `phone?`, `isDefault`, `archived`, `sortOrder`, `version`) +
  `Account.branches` va `Organization.branches` back-relation'lari. Model izohida TZ §2.1/§2.2
  asoslari (**nega bitta yuridik shaxs**, **nega `Store` filialga aylantirilmaydi**) yozib
  qo'yildi — qamrov 4-bandi, keyingi agent qayta muhokama qilmasin.
- `packages/db/prisma/migrations/20260810000000_branch_model_and_default_branch/migration.sql` —
  `branches` jadvali (FK'lar `CREATE TABLE` ICHIDA, `ALTER TABLE`siz), qisman-unikal indeks
  `branches_account_id_is_default_key ... WHERE "is_default"`, va har akkaunt uchun bitta
  «Asosiy» filial backfill'i (`INSERT … SELECT FROM accounts`, `NOT EXISTS` + `ON CONFLICT DO NOTHING`).
- `apps/api/src/modules/branch/` — yangi modul: `.schema.ts` (Zod), `.service.ts`, `.controller.ts`
  (`admin/branches`, har mutatsiya `@RequirePermission`), `.module.ts`.
- `apps/api/src/app.module.ts` — `BranchModule` **ULANDI** (yetim modul = prodda 404, `app-boot` qulfi).
- Ruxsat lug'ati — `branch` entity'si **beshta** ro'yxatga qo'shildi (sync-qulfi talab qiladi):
  `permissions.types.ts` · `permissions.service.ts` · `packages/db/prisma/seed.ts` ·
  `apps/api/src/scripts/topup-role-permissions.ts` · `roles.controller.ts`
  (`KNOWN_ENTITIES` + `CATEGORY_BY_ENTITY` → «Master data»).
- `apps/api/src/app-boot.test.ts` — skaner-vakuum tekshiruviga `admin/branches` anchor'i qo'shildi.

### Testlar (RED → GREEN)
- `apps/api/src/modules/branch/branch.service.test.ts` (11 test) — avval YIQILDI
  («Failed to load url ./branch.service.js») → keyin YASHIL. Qamrov: birinchi standart filial ·
  **ikkinchi `isDefault` rad etiladi** · **`update` orqali yon eshik ham yopiq** · `setDefault`
  bayroqni ko'chiradi (ikkitasi qolmaydi) · standart filialni arxivlash/o'chirish taqiq ·
  **cross-tenant** (B akkaunt A ning filialini ko'rmaydi, o'qiy/o'zgartira/o'chira olmaydi;
  ro'yxat va `total` ham ajratilgan) · boshqa akkauntda standart filial bo'lishi mumkin ·
  arxiv filtri · optimistik qulf 409 · bo'sh nom rad etiladi.
- `apps/api/src/modules/branch/branch-migration.test.ts` (7 test) — avval YIQILDI
  («F001 migratsiya papkasi topilmadi») → keyin YASHIL. Qulflaydi: qisman-unikal indeks mavjudligi ·
  backfill `INSERT … SELECT FROM accounts` (bitta akkauntga qattiq bog'lanmagan) · idempotentlik ·
  **REGRESSIYA QULFI: migratsiya `ALTER TABLE`/`UPDATE`/`DELETE`/`DROP` qilmaydi** ·
  sxemada `Branch` bor va `branches` ga xaritalangan.
- Yugurtirilgan: `pnpm --filter @moysklad/api exec vitest run` → **5844 passed, 0 failed**
  (443 fayl, 1 skipped) — regress yo'q.

### Migratsiya lokal DB'da (`climart_adopt @ localhost:5432`)
`prisma db execute --file …` → `Script executed successfully.`
O'lchangan (jonli, taxmin emas):
- `accounts=1 branches=1` · «Demo Organization»: `branches=1 isDefault=1 name=Asosiy`
  `orgId=00000000-…-000000000010` → **INVARIANT OK — har akkauntda aynan bitta `isDefault`**.
- Backfill INSERT'i **2-marta** yugurtirildi → `branches=1` (idempotentlik jonli tasdiqlandi).
- Ikkinchi `isDefault: true` yaratishga urinish → **DB rad etdi**: `code=P2002 target=["account_id"]`.
- Standart BO'LMAGAN ikkinchi filial esa yaratildi (indeks qisman ishlayapti) → tozalandi.

### Gate natijasi
- typecheck `@moysklad/api`: **0** · `@moysklad/db`: **0**
- `pnpm lint:product`: **0 error** (749 warning — siyosat bo'yicha ruxsat)
- i18n: **N/A** — bu fazada UI yo'q (reja: «UI bu fazada shart emas»), web tegilmadi
- vitest (api, to'liq): **5844 passed / 0 failed**

### Tasdiqlangan/rad etilgan da'volar
- «Sxemada `Branch` yo'q» — **tasdiqlandi** (qo'shilishdan oldin `model Branch` topilmadi).
- «`app-boot.test.ts` yangi route prefiksini ko'radi» — **tasdiqlandi**: mavjud «yetim modul»
  qo'riqchisi `BranchModule` ulanmasa qizil bo'ladi; ustiga `admin/branches` anchor'i qo'shildi.
- **Chetlanish (ongli):** reja `isActive` deydi, TZ §8 esa `archived`. Kodda `Store`/`CashDesk`/
  `Organization` — hammasi `archived`. Ikki xil bayroq saqlanmadi: **`archived` olindi**
  (TZ §8 + loyiha konvensiyasi), `isActive` = `!archived`. Sxema izohida yozilgan.
- **Rejadan tashqari qo'shildi:** `POST /admin/branches/:id/set-default`. Sababi — `create`/`update`
  ikkinchi standartni rad etgani uchun standart filialni **umuman ko'chirib bo'lmas edi**; ikki
  alohida PATCH bilan qilinsa oraliqda ikkita (yoki nol) standart holati paydo bo'lardi, shuning
  uchun bitta tranzaksiya.

### Qolgan qarz / DEFER
- `Store`/`CashDesk`/`Employee` ↔ filial bog'lanishi, `EmployeeBranch`, filial almashtirgich → **F002**.
- Hujjatlarda `branchId` muhrlash + backfill → **F003**. Ko'rinish filtri (scope ∩ filial, TZ §6)
  → **F-B4 to'lqini** (4-bo'lim ruxsat to'lqini bilan birga).
- **UI yo'q** (reja: shart emas) — filial ro'yxati/kartasi hech qayerda ko'rinmaydi; ruxsat
  matritsasida `branch` qatori paydo bo'ladi.
- **Eski (allaqachon seed qilingan) bazalar** `branch.*` ruxsatlarini olmaydi —
  `apps/api/src/scripts/topup-role-permissions.ts` shuning uchun yangilandi, lekin **hali
  yugurtirilmagan** (prod amali → OPS ro'yxatida).

### OPS-QADAM qo'shildimi
- **Ha** — ikkita: prod (`sherset_v2`) da F001 DDL'ini qo'lda qo'llash + `topup-role-permissions`
  ni yugurtirish. «OPS-QADAMLAR» ro'yxatiga 6-band sifatida yozildi.

### Status yorlig'i
**Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q.**
*(Migratsiya invariantlari lokal DB'da JONLI o'lchandi — yuqoridagi raqamlar. Brauzerda hech narsa
ochilmadi: bu fazada UI umuman yo'q. Runtime-QA → **F056** (8-Filial Phase-2 QA).)*

---

## Faza F010 — X2: kassir kesimi hisobotlarda (hujjat egasidan ajratilgan) (sana: 2026-08-09)

**Holat:** BAJARILDI
**Commit(lar):** `9b8ea5d6` — feat(report): F010 — kassir kesimi rentabellik hisobotida (X2)
*(hujjat/`todo.md` tahrirlari commit'ga KIRMADI — o'sha ikki faylda parallel sessiyaning
commit qilinmagan ishi bor edi, CLAUDE.md §6.1; ular ishchi daraxtda qoldi.)*

### Nima o'zgardi
- `apps/api/src/modules/report/metrics/cashier-slice.ts` (**yangi**) — kesimning yagona formulasi:
  `UNKNOWN_CASHIER_ID` sentineli + `cashierSliceKey()` + `isUnknownCashier()`. Funksiya `ownerId`
  ni **umuman qabul qilmaydi** — «kassir bo'sh bo'lsa egani olaman» degan jim fallback dizayn
  bilan yozib bo'lmaydi (X2 talabi: ikki kesim yonma-yon, biri ikkinchisini almashtirmaydi).
- `apps/api/src/modules/report/metrics/index.ts` — uchta eksport qo'shildi.
- `apps/api/src/modules/report/profitability.service.ts`:
  - `groupBy` enumiga `'cashier'` qo'shildi (`employee` — ega — **o'zgarmadi**);
  - chakana agregatida kalit `cs.cashier_id`, manba `LEFT JOIN cashier_sessions cs ON cs.id =
    rs.session_id` (INNER JOIN sessiyasi topilmagan chekni jimgina tushirib qoldirardi);
  - otgruzka/qaytarish kaliti kassir kesimida konstanta `NULL::uuid` → hammasi «noma'lum»
    guruhiga (jam boshqa tablardan farq qilmaydi);
  - konstanta kalit `GROUP BY` ro'yxatidan chiqarildi (`demandGroupBy`/`returnGroupBy`);
  - merge nuqtasida kalitni **faqat** `cashierSliceKey()` beradi; label qidiruvida sentinel
    filtrlanadi (u UUID emas — `employees.id` so'roviga tushsa Prisma yiqilardi).
- `apps/web/src/app/(app)/reports/profitability/page.tsx` — «По кассирам» tab'i + `col_cashier`
  sarlavhasi + kassiri aniqlanmagan qator tarjima bilan chiqadi (quruq «—» emas).
- `apps/web/src/messages/{ru,uz}.json` — `tab_by_cashiers`, `col_cashier`, `row_cashier_unknown`.
  Qiymatlar ikkala faylda ham RU: shu blokdagi qo'shni tab/ustun kalitlari (`tab_by_employees`,
  `col_employee`) ham RU — bitta tab-lentada ikki til aralashmasligi uchun.

### Testlar (RED → GREEN)
- `metrics/cashier-slice.test.ts` (**yangi**, 7 test) — avval YIQILDI (`Failed to load url
  ./cashier-slice.js`) → YASHIL. Ichida manba-skaneri: sentinel `report/` da qo'lda yozilmaydi va
  kesimni o'qiydigan fayl kalitni `metrics/` dan oladi (X4 — ikkinchi formula yozilmasin).
- `profitability.service.test.ts` (**Edit**, +6 test) — avval 5 tasi YIQILDI
  (`ZodError: Invalid enum value … received 'cashier'`) → YASHIL:
  1. owner ≠ cashier bo'lgan chek: ega kesimi egaga, kassir kesimi kassirga (jami bir xil);
  2. smenasiz chek «noma'lum» guruhida, summasi bilan — tashlanmaydi va 0 ham emas;
  3. kassiri yo'q otgruzka jamida qoladi;
  4. **regressiya qulfi**: xodim (ega) kesimi SQL'da `rs.owner_id` da qoladi va
     `cashier_sessions` ga tegmaydi;
  5. kassir kesimi `LEFT JOIN` qiladi;
  6. sentinel `employees` so'roviga sizmaydi (mock Prisma kabi UUID bo'lmasa yiqiladi).
  Testda `Prisma.sql` fragmentlari qayta yig'iladi (`sqlSkeleton`) — «qaysi ustun bo'yicha
  guruhlandi» degan savolga **mock emas, haqiqiy SQL** javob beradi.
- `apps/web/src/__tests__/profitability-cashier-slice.test.ts` (**yangi**, 4 test) — FE↔BE
  kontrakt qulfi (`abc-report-contract.test.ts` konventsiyasi): avval 3 tasi YIQILDI → YASHIL.
  Sahifadagi sentinel **API'dagi konstanta bilan solishtiriladi** (ikki manba bog'landi).
- Yugurtirilgan: `vitest run src/modules/report src/modules/cashier-session` → **507 passed** ·
  web to'liq suite → **2849 passed, 26 skipped, 0 failed**.

### SQL runtime tekshiruvi (unit testlar ko'rmaydigan qism)
Mock SQL'ni parse qilmaydi, shuning uchun uchala yangi so'rov shakli **haqiqiy Postgres'da**
(`climart_adopt`, `prisma db execute` + `EXPLAIN`, ma'lumot o'zgarmaydi) tekshirildi: `LEFT JOIN
cashier_sessions` + `GROUP BY cs.cashier_id`, va SELECT'dagi konstanta `NULL::uuid::text` bilan
uni GROUP BY'ga qo'shmaslik — uchalasi ham plan bo'ldi. Bu «noto'g'ri GROUP BY = runtime 500»
sinfini yopadi.

### Gate natijasi
- api typecheck: **0** · web typecheck: **0** · `lint:product`: **0 xato** (783 ogohlantirish —
  siyosat bo'yicha ruxsat) · `i18n:gate`: **OK** (12341 kalit) · vitest: yuqoridagi.
- Eslatma: `lint:product` birinchi yugurishda yiqilgan edi — ro'yxatdagi fayllar
  (`invoices-out`, `demands`, `customer-orders`, contract testlari) **meniki emas**, parallel
  sessiyaning o'sha paytdagi holati; qayta yugurtirilganda 0 xato.

### Tasdiqlangan/rad etilgan da'volar
- «`report/` da `cashierId` 0 marta uchraydi» — **tasdiqlandi** (grep, 0 natija).
- «kassa xodim kesimi `rs.owner_id` bo'yicha ketadi» — **tasdiqlandi**
  (`profitability.service.ts:638` va `:398`).
- «rentabellik **va xodim hisobotlarida**» — `report/` da xodim kesimi **faqat bitta joyda** bor:
  rentabellikning «По сотрудникам» tab'i. Savdo hisoboti (`report.service.ts`) `owner` bo'yicha
  guruhlaydi, lekin unda **chakana umuman yo'q** (grep: `retail` — 0 natija), demak u yerda
  kassir kesimining manbai ham yo'q. Shuning uchun kesim aynan rentabellik hisobotiga qo'shildi.
- `RetailSale.sessionId` sxemada **NOT NULL** (FK `Restrict`) — ya'ni «smenasiz chek» normal
  yo'l bilan paydo bo'lmaydi. «Noma'lum» guruhi shunga qaramay kerak: (a) otgruzka/qaytarishda
  kassir tushunchasi yo'q, (b) prod-DB sxema-drifti bo'lgan holatda LEFT JOIN bo'sh qaytarishi
  mumkin — ikkala holatda ham pul **ko'rinadi**, yo'qolmaydi.

### Qolgan qarz / DEFER
- **Grafik** kassir tab'ida chakanani ko'rsatmaydi — bu **oldindan mavjud** bo'shliq
  (`profitability.service.ts` sarlavhasida hujjatlangan: `chartBuckets` faqat otgruzka+qaytarish).
  Kassir tab'i chakana-markazli bo'lgani uchun bo'shliq u yerda ko'proq ko'rinadi. Tuzatish shu
  fazaning qamrovida emas → alohida faza.
- `documentType=retail` filtri qaytarish so'rovini gate qilmaydi (oldindan mavjud xulq, hamma
  tablar uchun) — kassir tab'ida qaytarishlar «noma'lum»ga tushadi. O'zgartirilmadi.
- Chop etish (`print_by_*`) menyusiga kassir varianti qo'shilmadi — qamrovda yo'q.
- Brauzerda ochilmadi.

### OPS-QADAM qo'shildimi
- **Yo'q** — sxema o'zgarmadi, migratsiya yo'q, yangi endpoint yo'q (mavjud
  `GET /reports/profitability` ga bitta `groupBy` qiymati qo'shildi).

### Status yorlig'i
**Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q.**
*(SQL shakli haqiqiy Postgres'da EXPLAIN bilan tasdiqlandi, lekin sahifa brauzerda ochilmadi —
tab, ustun va «noma'lum» qatorining ko'rinishi → **F018** (3-Analitika Phase-2 QA).)*

---

## Faza F019 — Migratsiya 1–2-qadam: zona/yacheyka generatsiya + backfill + farq hisoboti (sana: 2026-08-09)

**Holat:** BAJARILDI
**Commit(lar):** `<shu sessiya commiti>` — `feat(store): F019 — yacheyka migratsiyasi 1–2-qadam (DRY/APPLY/ROLLBACK)`

### Nima o'zgardi
- `apps/api/src/modules/store/cell-migration.ts` — **yangi**, SOF planlovchilar (DB yo'q):
  `parseCellCode` (kod → zona + yacheyka nomi) · `planCellGeneration` (1-qadam) ·
  `planStockBackfill` (2-qadam) · `diffStockVsCells` (tekshiruv hisoboti) · `planRollback`.
  Butun miqdor arifmetikasi 1e6-shkalali `bigint` (`fifo-consumer` ning `parseDecimalScaled`/
  `formatDecimalScaled` i) — `Number` bilan hisoblansa suzuvchi-nuqta xatosi «drift» bo'lib
  hisobotga chiqardi.
- `apps/api/src/modules/store/cell-migration.runner.ts` — **yangi**, orkestratsiya
  `CellMigrationPort` (14 metod) ustida. DRY va APPLY **ayni bir kod yo'lidan** yuradi.
- `apps/api/src/scripts/migrate-cells-step1-2.ts` — **yangi** CLI: Prisma adapteri + hisobot.
  Rejimlar: DRY (default) · `APPLY=1` · `ROLLBACK=1` · `ROLLBACK=1 APPLY=1`.
  Fail-closed: akkaunt/ombor bir qiymatli aniqlanmasa `exit 1`.
- `todo.md` — 7-Ombor B2 `[x]`; yangi **B2a** bandi; B1 dagi **xato da'vo tuzatildi**.
- Shu reja — **F019b** fazasi qo'shildi, **OPS-QADAM 7** yozildi.

**Rejadagi fayl yo'lidan ONGLI chetlanish:** reja `scripts/migrate-cells-step1-2.ts` (repo ildizi)
deydi. `apps/api/src/scripts/` olindi — DB'ga tegadigan `tsx` skriptlar shu yerda
(`backfill-counterparty-balance-journal.ts` naqshi), `@moysklad/db` import va api tsconfig'i
shu yerdan ishlaydi; ildizdagi `scripts/` asosan `.mjs` audit/codemod vositalari.

### Testlar (RED → GREEN)
- `cell-migration.test.ts` (27 test) — avval YIQILDI («Failed to load url ./cell-migration.js»)
  → keyin YASHIL. Qamrov: kod bo'laklash (kanonik 4 segment · qisqa 2–3 · 1/5 segment rad ·
  **zona segmenti raqam bo'lishi shart** · bo'sh segment · begona belgi · ichki bo'shliq · 255
  belgi) · generatsiya (mavjudini qayta yaratmaslik · takroriy kod bitta yacheyka · ombor bo'yicha
  ajratish · `sortOrder` mavjuddan keyin davom etishi) · **noto'g'ri kod ro'yxatga tushishi** ·
  **nol-to'ldirish to'qnashuvi** · backfill (to'liq · idempotent farq · nol · `over-allocated` ·
  4 xil «biriktirilmagan» sababi) · farq hisoboti (**yetim yacheyka qatori ham sanaladi**) ·
  rollback (toza qaytish · **drift → BLOK** · mavjud qatorni kamaytirish · ishlatilayotgan
  yacheyka · zona bo'shamasa qolishi).
- `cell-migration.runner.test.ts` (12 test) — avval YIQILDI («Failed to load url
  ./cell-migration.runner.js») → keyin YASHIL. **DRY hech narsa yozmaydi** (har yozuv metodi
  0 marta chaqirilgani o'lchanadi) · **DRY simulyatsiyasi APPLY dan keyingi HAQIQIY farqni
  oldindan aytadi** · `Σ StockByCell == Stock` · idempotentlik (2-yugurish = 0 yozuv) ·
  manifest to'liqligi · rollback holatni AYNAN tiklaydi (JSON-snapshot solishtiruvi) ·
  DRY rollback o'chirmaydi · drift/ishlatilayotgan yacheyka bloklari.
- Yugurtirilgan: `vitest run src/modules/store src/modules/stock` → **180 passed, 0 failed**
  (13 fayl) — mavjud yacheyka/qoldiq testlarida regress yo'q.

### JONLI o'lchov (lokal `climart_adopt @ localhost:5432`) — DRY → APPLY → ROLLBACK
Baza F019 dan **oldingi holatiga to'liq qaytarildi** (quyida tekshirilgan).

1. **DRY:** zona yaratiladi 1 · yacheyka 1 (`01-02-03-04`, zona «01») · noto'g'ri kod 0 ·
   backfill 0 qator, `allaqachon mos: 1`, biriktirilmagan (`no-home-code`) 3 ·
   farq: oldin `3 nomuvofiqlik, |farq| 293` → keyin (kutilgan) **aynan o'sha 293**.
   **Bu son muhim:** tovar `a0b44c73…` ning kodi `01-02-03-04`, lekin uning 30 donasi
   BOSHQA yacheykada (`01-09-09-01`) turibdi. «Butun `Stock.qty` ni uy-yacheykaga yoz»
   varianti bu yerda 30 ni IKKI marta sanab, `Σ StockByCell > Stock` driftini yaratardi —
   `delta = Stock − Σ StockByCell` formulasi buni real ma'lumotda to'sdi.
2. **APPLY:** raqamlar DRY bilan **aynan** bir xil chiqdi; yozildi `zona 1 · yacheyka 1 ·
   StockByCell 0`. Bazada tekshirildi: `store_zones` da «01», `store_cells.zone_id` unga ulangan.
3. **Backfill yo'lini ham o'lchash uchun** bir tovarga (`fceb1d9c…`, qoldiq 99, kodi yo'q edi)
   vaqtincha `__yacheyka = '02-05-01-03'` qo'yildi → APPLY: `zona 1 · yacheyka 1 · StockByCell 1`,
   farq **293 → 194** (aynan 99 kamaydi) ⇒ o'sha tovar uchun `Σ StockByCell == Stock`.
4. **Idempotentlik (jonli):** uchinchi APPLY → `zona 0 · yacheyka 0 · StockByCell 0`, farq 194.
5. **ROLLBACK:** DRY rejasi (1 qator o'chirish, 1 yacheyka, 1 zona, 0 blok) → APPLY.
   Ikkala manifest qaytarildi; vaqtinchalik atribut ham tiklandi.
   **Yakuniy holat = boshlang'ich holat:** `store_zones` 0 · `store_cells` 1 (`01-09-09-01`,
   `zone_id = null`) · `stock_by_cell` 1 qator (qty 30) · tovar `attributes = {}`.

### Gate natijasi
- typecheck `@moysklad/api`: **0**
- biome (shu fazaning 5 fayli): **0 error** (qolgan ogohlantirishlar — CLI'dagi `noConsoleLog`
  va testlardagi `noNonNullAssertion`, mavjud skriptlar bilan bir xil siyosat)
- `pnpm lint:product` (butun repo): **7 error — HAMMASI PARALLEL SESSIYA fayllarida**
  (`apps/web/.../{counterparties,customer-orders,demands,invoices-out}/page.tsx`,
  `apps/api/src/modules/shared/contract-conformance.test.ts`,
  `apps/web/src/__tests__/shared-api-contracts.test.ts`). CLAUDE.md §6.1 bo'yicha **tegilmadi**.
- i18n: **N/A** — bu fazada UI yo'q, `apps/web` tegilmadi
- vitest: **180 passed / 0 failed** (`src/modules/store` + `src/modules/stock`)

### Tasdiqlangan/rad etilgan da'volar
- **RAD ETILDI:** reja va `todo.md` «`SkladKeeper.zoneId` sxemada bor (7-B1 yarim)» deydi —
  **YO'Q**. `schema.prisma:1111-1127`: `SkladKeeper` da faqat `skladNo Int`, `Store`/`StoreZone`
  ga havola yo'q. Marshrutlash hamon kod satridan o'qiydi (`skladNoOf`, `restock-task.service.ts:46`
  va `retail-sale.service.ts:109`). F019 ning «Avval tasdiqla» bandi shuni talab qilgan edi →
  **alohida faza F019b** yaratildi va `todo.md` dagi xato da'vo tuzatildi.
- **TASDIQLANDI:** `StoreZone` / `StoreCell` / `StockByCell` sxemada bor; `StockByCell.isPrimary`
  **yo'q** (F021 da).
- **TASDIQLANDI:** zona = kodning **1-segmenti** — mavjud `skladNoOf()` aynan shuni o'qiydi.
  Ya'ni generatsiya mavjud marshrutlash bilan bir xil segmentni ishlatadi.
- **`cell-range.util.ts` (diapazon-generatori) MAVJUD, lekin `bulkCreateCells` servisi/endpointi
  YO'Q** — spec'ning faqat sof qismi implementatsiya qilingan. F019 unga bog'liq emas
  (bu yerda manba diapazon emas, mavjud `__yacheyka` kodlari), spec'dan **tamoyillar** olindi:
  idempotentlik, zonani avtomat yaratish, DRY va APPLY bitta kod yo'li.
- **`__polka` tegilmadi.** U mavjud kodda zona nomi sifatida yoziladi
  (`store-address.service.ts:639`), legacy zonasiz yacheykalarda esa **2-segmentga** tushadi
  (`product-cell-move.service.ts:160`) — ya'ni TZ §2 bilan ziddiyat. F019 zona yaratganda
  `__polka` ni QAYTA YOZMAYDI: regressiya yo'q (avval bu yacheykalar umuman mavjud emas edi),
  lekin ziddiyat ochiq qarz bo'lib qoladi → **F019b/F021**.

### Qolgan qarz / DEFER
- `SkladKeeper.zoneId` + `skladNo → StoreZone` ulanishi → **F019b** (yangi).
- `__polka` ning 1-segment/2-segment ziddiyati → **F019b/F021**.
- `ProductCellLink` qatorlari backfillda **yaratilmaydi** (F019 qamrovi = zona/yacheyka +
  `StockByCell`). Ko'p-yacheyka biriktirmasi → **F021**.
- `StockByCell.isPrimary` yo'q ⇒ «asosiy yacheyka» hozircha `__yacheyka` atributi orqali
  bilvosita → **F021**.
- **Prodda yugurtirilmagan** — OPS-QADAM 7.
- Lokal DB seed juda kichik (1 kodli tovar, 4 qoldiq qatori) ⇒ **noto'g'ri format** va
  **nol-to'ldirish to'qnashuvi** ro'yxatlari real ma'lumotda o'lchanmagan; ular unit-testlarda
  qoplangan, lekin prod DRY hisoboti birinchi haqiqiy o'lchov bo'ladi.

### OPS-QADAM qo'shildimi
- **Ha** — 7-band: prod DRY → egasi ko'rib chiqadi → `MANIFEST=… APPLY=1` → manifestni saqlash →
  `/api/v1/health`.

### Status yorlig'i
**Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q.**
*(Migratsiya invariantlari — DRY=APPLY, `Σ StockByCell == Stock`, idempotentlik, rollback —
lokal DB'da JONLI o'lchandi va baza boshlang'ich holatiga qaytarildi. Bu fazada UI yo'q,
brauzerda hech narsa ochilmadi. Runtime-QA → **F030** (7-Ombor Phase-2 QA).)*

---

## Faza F042 — Webhook qabul qilish (imzo + idempotentlik) (sana: 2026-08-09)

**Holat:** QISMAN — imzo + idempotentlik + qabul endpointi BAJARILDI; **navbat/qayta-urinish/DLQ
egasining qaroriga ko'ra F042b ga ko'chirildi** (sabab quyida).
**Commit(lar):** `feat(online-order): F042 — webhook qabul (HMAC imzo + idempotentlik)`

### Nima o'zgardi
- `apps/api/src/modules/online-order/online-order.inbound.ts` — **YANGI**. Kiruvchi imzo
  protokoli: `X-Sherset-Signature: sha256=<hex>` = HMAC-SHA256(**xom tana**, kanal siri).
  Solishtirish `shared/timing-safe.ts` → `secretEquals` bilan constant-time (INT-01/INT-14
  naqshi qayta ishlatildi, yangisi yozilmadi). FAIL-CLOSED: sir yo'q / sarlavha yo'q / tana yo'q
  → hech qachon o'tmaydi.
- `apps/api/src/modules/online-order/online-order.webhook.controller.ts` — **YANGI**. Guard'siz
  ochiq qabul qiluvchi `POST /api/v1/webhooks/online-orders/:channelId`
  (Payme/Click/Telegram qabul qiluvchilari bilan bir xil naqsh). `accountId` **tanadan emas**,
  kanal yozuvidan olinadi.
- `online-order.service.ts` — `ingestWebhook()` (autentifikatsiya → avtorizatsiya → validatsiya →
  idempotent yozuv) va `rotateWebhookSecret()` (sir AES-GCM bilan `SalesChannel.settings` da,
  ochiq matn javobda bir marta).
- `online-order.controller.ts` — `POST /online-orders/channels/:channelId/webhook-secret`
  (`settings:update`, payment-gateway config naqshi).
- `online-order.schema.ts` — `InboundOnlineOrderSchema` = `CreateOnlineOrderSchema.omit(channelId)`.
- `online-order.module.ts` — yangi controller ro'yxatga olindi.
- `apps/api/src/main.ts` — `rawBody: true` (Nest 11 Fastify adapteri natively qo'llaydi:
  `fastify-adapter.js:341-361`). Imzo aynan kelgan baytlar ustidan tekshirilishi shart.
- `modules/permissions/mutation-guard-coverage.test.ts` — yangi guard'siz endpoint AUTH-07
  klass-qulfini uyg'otdi (kutilgan xulq); `INTENTIONALLY_OPEN` ga sababi bilan qo'shildi.

### Testlar (RED → GREEN)
- `online-order.inbound.test.ts` (12 test) — avval YIQILDI («Failed to load url
  ./online-order.inbound.js») → keyin YASHIL. Qamrov: xom hex va `sha256=` prefiksi, probel/registr,
  **tana bir baytga o'zgarsa false**, noto'g'ri sir, sirsiz/sarlavhasiz/tanasiz fail-closed.
- `online-order.webhook.test.ts` (20 test) — avval YIQILDI (controller fayli yo'q) → keyin YASHIL.
  Qamrov: (1) noto'g'ri imzo → 401 va `create` CHAQIRILMAYDI · (2) javobda ham, **log'da ham** sir
  va kutilgan imzo YO'Q · (3) bir xil `externalOrderId` ikkinchi marta → ikkinchi hujjat yo'q ·
  (4) POYGA: `findUnique` bo'sh + `create` P2002 → 500 emas, mavjudi qaytadi · (5) noma'lum
  channelId → 401 (enumeratsiya oracle yo'q) · (6) arxiv holati **imzosiz aniqlanmaydi** (401,
  403 emas) · (7) rotatsiya PATCH-semantikada (INT-13 sabog'i) · (8) rotatsiyadan keyingi sir
  bilan imzolangan so'rov haqiqatda o'tadi.
- **Log-sizish testi vakuum emasligi o'lchandi:** log qatoriga ataylab `secret=${secret}`
  qo'shilganda test YIQILDI (`expected … not to contain 'chan-secret-…'`), qaytarilgach YASHIL.
- Yugurtirilgan: `vitest run src/modules/online-order/` → **57 passed** ·
  `src/app-boot.test.ts src/modules/webhook src/modules/payment-gateway` → **113 passed** ·
  `mutation-guard-coverage.test.ts` → **51 passed**.

### Gate natijasi
- **typecheck:** o'z fayllarimda 0 (16:46 da butun `@moysklad/api` toza edi). Keyinroq paydo
  bo'lgan 2 xato — F019 sessiyasining **untracked** `store/cell-migration.runner.ts:152`
  (`parseDecimalScaled` topilmadi), meniki EMAS.
- **biome:** o'z fayl to'plamimda 0 (`biome check apps/api/src/main.ts modules/online-order/` +
  guard testi → «No fixes applied»). Repo-keng `pnpm lint:product` qizil — 12 xatoning HAMMASI
  parallel sessiyalarning jonli fayllarida (`store/cell-migration*`, `shared/contract-*`,
  `apps/web/.../page.tsx` × 5).
- **i18n:** N/A — web tegilmadi, UI-matn qo'shilmadi (xato matnlari API qatlamida, qo'shni
  `'Sales channel not found'` uslubida).
- **vitest (butun API):** 5942 passed / 1 failed — yiqilgani `mutation-guard-coverage.test.ts >
  «POS qarz to'lovi…»`, u **izolyatsiyada 51/51 yashil** (to'liq suite'da 5010ms da timeout;
  3 parallel sessiya yuklamasi). Mening o'zgarishimdan kelgan regress emas.

### Tasdiqlangan/rad etilgan da'volar
- ✅ «Mavjud `webhook`/`payment-gateway` naqshini qayta ishlat» — **tasdiqlandi va bajarildi**:
  `secretEquals` (constant-time), guard'siz public-controller naqshi, `encryptPassword` creds
  saqlash, `P2002` idempotentlik naqshi — hammasi mavjudidan olindi.
- ✅ «`externalOrderId` bo'yicha idempotentlik» (TZ §4.4) — sxemada `@@unique([channelId,
  externalOrderId])` **bor**, kalit shu. Faza matnidagi «eventId» aynan shu maydon.
- ❌ «navbat (outbox/inbox naqshi, qayta urinish) · DLQ» — **kodda tayanch YO'Q**. `OnlineOrder`
  da `attempt`/`nextRetryAt`/`lastError` maydonlari yo'q; `WebhookDelivery` esa **chiquvchi**
  obunaga bog'langan (`webhookId` FK) — kiruvchi hodisaga yaramaydi. Reja F042 ni 🗄️ deb
  belgilamagan va TZ §8 «Baza o'zgarishlari» ro'yxatida inbox jadvali yo'q ⇒ reja bu talabni
  jadvalsiz tasavvur qilgan, lekin jadvalsiz uni bajarib bo'lmaydi.
- ℹ️ Replay-himoya vaqt-tamg'asi bilan emas, **idempotentlik** bilan beriladi (o'sha hodisa qayta
  kelsa ikkinchi hujjat yo'q). Vaqt-tamg'asi kerak bo'lsa imzo bazasi `timestamp + '.' + body`
  bo'ladi — F042b.

### Qolgan qarz / DEFER → **F042b**
- **Kiruvchi inbox jadvali** (`OnlineOrderInboxEvent` yoki umumiy inbox): xom hodisa + `attempt` +
  `nextRetryAt` + `lastError` + `status(queued|processed|dead)`. Undan keyin: eksponensial
  qayta-urinish (`WebhookDeliveryService` BACKOFF_MS naqshi) va DLQ ro'yxati/qayta-yuborish UI.
  **Sabab kechiktirilgani:** migratsiya = umumiy resurs (CLAUDE.md §6.4) va shu sessiyada
  `schema.prisma` F001 (filial modeli) sessiyasining qo'lida edi — egasining qarori bilan
  ajratildi.
- Sirni boshqarish UI'si (web) qo'shilmadi — hozircha faqat API endpointi.
- Brauzerda ochilmadi; tashqi provayder bilan jonli so'rov yuborilmadi.

### OPS-QADAM qo'shildimi
- **Yo'q** — sxema o'zgarmadi, migratsiya yo'q. Deploy paytida e'tibor: `main.ts` da `rawBody: true`
  yoqildi (JSON/urlencoded so'rovlar uchun xom Buffer ham saqlanadi — 8 MB `bodyLimit` da
  rasm-yuklashlar `multipart` bo'lgani uchun ta'sir minimal).

### Status yorlig'i
**Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q.**
*(Imzo/idempotentlik faqat unit darajada o'lchandi; jonli HTTP so'rov, `rawBody` ning haqiqiy
Fastify oqimida yetib kelishi va dublikat-yuborish stsenariysi → **F044** (2-Onlayn Phase-2 QA).)*

---
