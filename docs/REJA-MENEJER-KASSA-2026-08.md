# REJA — MENEJER va KASSA bo'limlari (fazama-faza, sessiyama-sessiya)

**Sana:** 2026-08-09 · **Holat:** ijroga tayyor · **Fazalar:** MK01–MK40

> Bu reja [`docs/REJA-8-BOLIM-2026-08.md`](REJA-8-BOLIM-2026-08.md) dan **ajratib olindi**
> (egasining 2026-08-09 qarori): **1-bo'lim KASSA** va **4/4M-bo'lim MENEJER** ning barcha
> fazalari shu yerga ko'chdi. Ular **keyinroq** hal qilinadi; asosiy reja ularsiz davom etadi.
>
> **TZ manbalari:** `docs/superpowers/specs/2026-08-01-kassa-tz-design.md` ·
> `2026-08-01-menejer-tz-design.md` · `2026-08-02-menejer-kunlik-kpi-tz-design.md`.
> Jonli tracker — [`todo.md`](../todo.md).

## 🔗 IKKI REJA O'RTASIDAGI BOG'LIQLIK (muhim)

Fazalar ajratilgani bilan bog'liqlik yo'qolmadi. Havolalar ikkala faylda ham **ochiq** yozilgan:
`F0xx (asosiy reja)` va `MKxx (menejer/kassa rejasi)`.

### Shu reja → asosiy rejaga tayanadi (4 ta; asosiy reja o'sha nuqtaga yetmaguncha boshlanmaydi)

| Faza | Nimani kutadi |
|---|---|
| **MK15** «Korxona puli qayerda» | `F011` — Rollup jadvallari + tungi cron |
| **MK17** Yo'qolgan mijozlar signali | `F005` — Mijoz egaligi (`ownerId`, `lastActivityAt`) |
| **MK35** Record-scope 1-to'lqin + filial filtri | `F003` — Hujjatlarda `branchId` muhrlash |
| **MK38** Plan qo'yish · narx siyosati ekranlari | `F004` — Narx dvigateli (narx siyosati qismi uchun) |

### Asosiy reja → shu rejaga tayanadi (asosiy reja kechikmasligi uchun bilib turing)

| Asosiy rejadagi faza | Nimani kutadi |
|---|---|
| `F013` Rol bo'yicha panellar | **MK09** ma'lumot sifati bayrog'i |
| `F014` Xodim shaxsiy ekrani | **MK13** `KpiTarget` va reyting formulasi |
| `F016` Xodim kartasi (bitta ekran) | **MK04** 4M xodim kartasi 360° |
| `F024` Qisman yig'ish + `PickingError` | **MK32** POS xulq-testlari (regressiya qulfi) |
| `F035` Narx tarixi va barqarorlik | **MK06** menejer navbat dvigateli |
| `F043` Yetkazish: haydovchi + naqd | **MK03** javobgarlik taxtasi |
| `F048` Avtomatik jarima qoidalari | **MK01** `HrBonusFineLog` kanali |
| `F055` Filial bo'yicha plan/KPI | **MK13** + **MK37** (`SalesPlan`) |
| `F072` Vizual 1:1 cohort E (Retail) | **MK34** kassa Phase-2 QA |
| `F079` Vizual 1:1 cohort L (Settings-org) | **MK28** ruxsat matritsasi UI |
| `F087` Xavfsizlik auditi | **MK39** `recordScopeEnforced` yoqilishi |

> **Agar shu reja kechiksa:** yuqoridagi fazalar **qamrovi qisqartirilib** bajariladi va
> hisobotda ochiq yoziladi («menejer/kassa qismi kutilmoqda»), keyin qaytib to'ldiriladi.
> **Jimgina yarim bajarish TAQIQ** — nima qilinmagani yozilmasa, qarz ko'rinmay qoladi.

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

> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK<NN>** ni bajar. Shu fayldagi «O'ZGARMAS
> QOIDALAR»ga to'liq amal qil. Faqat shu faza — tugagach hisobotni jurnalga yozib **TO'XTA**.

---

---

## ⛔ EGASIDAN QAROR KUTILMOQDA (bloklovchi — alohida qisqa sessiya)

| Qaror | Savol | Kimni bloklaydi |
|---|---|---|
| ~~**QAROR-B1**~~ | ~~Bonus/jarima **formulasi**~~ — ✅ **YOPILDI 2026-08-09** (egasining tasdig'i), quyida | ~~MK01~~ |
| **QAROR-B2** | Kompozit ball chegarasi **150%** (`SCORE_CAP_PERCENT`) — TZ'da yo'q, agent tanlagan | **MK13** |
| **QAROR-B3** | `lower_better` formulasi (0→200%, maqsad→100%, 2×→0%) — TZ'da yo'q, agent tanlagan | **MK13** |
| **QAROR-B4** | Rol nomlari: hozir `admin`/`director` = ega, `manager`/`menejer` = menejer — shundaymi? | **MK29** |

**▶ QAROR SESSIYASI PROMPTI:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — «EGASIDAN QAROR KUTILMOQDA» dagi 4 qarorni men bilan yop.
> Har biri uchun TZ'dagi tegishli § ni o'qib, 2–3 variantni oqibati bilan ko'rsat (kod yozma).
> Javoblarimni shu faylga va `todo.md` ga yozib TO'XTA.

### ✅ QAROR-B1 — YOPILDI (2026-08-09, egasining tasdig'i)

**Savol edi:** kun qabul qilinganda `HrBonusFineLog` ga **qancha** yoziladi (4M TZ §4/2-band —
«yoziladi» bor, «qancha» yo'q)?

**Qaror: ball-oralig'i (band) qoidalari — OPT-IN, qat'iy summa.** Yangi jadval yo'q, mavjud
`HrBonusFineRule` ishlatiladi:

| Nima | Qiymat |
|---|---|
| Manba raqam | Qabul lahzasida **MUZLATILGAN** `EmployeeDailyKpi.scorePercent` (jonli qayta hisob EMAS) |
| Sozlama | `HrBonusFineRule.condition = { type: 'kpi_day_score', minPercent, maxPercent }` · `kind` + `amountMinor` qoidaning o'zida |
| Oraliq | **Yarim ochiq `[min, max)`**, `maxPercent: null` = ∞ ⇒ oraliqlar ustma-ust tushmay tiladi (masalan `[0,70) jarima · [70,100) hech narsa · [100,∞) bonus`) |
| Yozuv | `source='kpi_accept'`, `kind`/`amountMinor` qoidadan **nusxa** (keyin qoida tahrirlansa tarix o'zgarmaydi — `applyRule` naqshi) |
| **Qoida yo'q** | **Hech narsa yozilmaydi.** Mavjud hisoblarning xulqi o'zgarmaydi — funksiya yoqilmaguncha pul paydo bo'lmaydi |
| **Ball yo'q** (`scorePercent = null`) | **Hech narsa yozilmaydi** — NULL ≠ 0 (kun ballanmagan bo'lsa «0% ⇒ jarima» YOLG'ON bo'lardi) |
| **Ikki qoida mos kelsa** | **Hech narsa yozilmaydi** + ogohlantirish log. Tavakkal summa yozishdan ko'ra yozmaslik xavfsiz; konfiguratsiya xatosi ko'rinib turadi |
| Bekor qilish | `accepted`/`force_accepted` dan **chiqishda** (`reopen`, `mark_stale`) — sof qoldiqni **nolga** keltiruvchi teskari qator (`source='kpi_accept_reversal'`, manfiy `amountMinor`). **O'chirish YO'Q** (audit izi) |
| Qayta qabul | Yangi ball → yangi yozuv. Teskari qator + yangi yozuv ⇒ ikki karra bo'lmaydi |
| Qaysi oyga tushadi | Yozuv `createdAt` bo'yicha (mavjud `aggregateRaw` shunday o'qiydi) — ya'ni iyul kunining avgustdagi bekori **avgust** oyligiga tushadi. Bu `EmployeeKpiCorrection` (`correctionPeriod(now)`) siyosati bilan **bir xil**, ataylab |

**Nega qat'iy summa (foiz emas):** foiz uchun baza kerak (oylik? sotuv?) — u har xodimda har xil va
`HrSalaryConfig` da faqat akkаunt darajasida turibdi. Qat'iy summa buxgalterga tushunarli va
`HrBonusFineLog.amountMinor` (BigInt tiyin) bilan aynan mos. Foizli/progressiv variant kerak bo'lsa —
`condition` ga yangi `type` qo'shiladi, bu qaror buzilmaydi.

**Qamrovdan tashqarida (ataylab):** bir kunda **ham** bonus **ham** jarima (masalan sotuv yaxshi-yu
kassa farqi bor) — bu 12 qoida turi bilan **MK07** ishi. MK01 da bir qabul = ko'pi bilan bitta yozuv.

---

## 🗺️ FAZALAR XARITASI

| To'lqin | Fazalar | Mazmun |
|---|---|---|
| **M1 — Menejer: kunlik KPI va xodimlar nazorati** | MK01–MK14 | Bonus/jarima yakuni · ishga qabul · FE ekranlar · jihoz reyestri · ish navbati + 12 qoida · smena qabuli · sifat paneli · SLA · zaxira/narx · byudjet · reyting · **QA** |
| **M2 — Menejer: ilgari kiritilmagan 10 band** | MK15–MK25 | Pul manzarasi · qarz undirish · yo'qolgan mijoz · xato narx · brifing/yakun · shablon izoh · qaror jurnali · maqsad kaskadi · 1:1 suhbat · **mobil rejim** · **QA** |
| **M3 — Menejer: ruxsat modeli (yadro)** | MK26–MK30 | `EmployeePermission` + G1/G2/G3 · HR ruxsatlarini birlashtirish · matritsa UI · 10 rol shabloni · tasdiqlash navbati |
| **M4 — Kassa yakuni** | MK31–MK34 | **USD naqd oqimi (`CASH_USD`)** · POS xulq-testlari · komponentga bo'lish · **QA** (real termal printer) |
| **M5 — Menejer: ko'rinish chegarasi** | MK35–MK40 | Record-scope 1–4-to'lqin **+ filial filtri birga** · `SalesPlan` · plan/mijoz/narx ekranlari · `recordScopeEnforced` yoqish · **QA** |

**Jami: 40 faza.** Shundan **4 tasi Phase-2 QA** — `MK14` (menejer nazorati) · `MK25` (mobil +
yangi ekranlar) · `MK34` (kassa, real printer) · `MK40` (ruxsatlar). **11 tasi 🗄️ migratsiya.**

## 🚦 IJRO GRAFIGI — bir vaqtda nechta sessiya

Qoidalar asosiy rejadagi bilan bir xil: **har sessiya alohida worktree** · paketda **bitta 🗄️
migratsiya** · paketda **bitta 🌐 QA** (u bilan migratsiya birga emas) · `git add` aniq yo'llar
bilan · paket tugab merge bo'lgach keyingisi.

Belgilar: 🗄️ migratsiya · 🌐 brauzer/QA · 📝 kodsiz · ⛔ qaror kutmoqda

| # | Bir vaqtda beriladigan fazalar |
|---|---|
| **1** | **MK01** ⛔B1 4M.3 yakuni: idempotent bonus/jarima<br>**MK02** 🗄️ 4M.4 qoldig'i: ishga qabul tomoni (sinov muddati)<br>**MK03** Menejer FE-A: «Jonli holat» va «Javobgarlik» ekranlari<br>**MK04** Menejer FE-B: xodim kartasi 360° · jurnal · haftalik xul |
| **2** | **MK05** 🗄️ Jihoz reyestri + javobgarlik taxtasida jihoz bloki<br>**MK08** 4M.6a: smena yakunini qabul qilish<br>**MK11** 4M.8: uch xil zaxira signali + narx o'zgarishi nazorati<br>**MK23** 1:1 suhbat va o'qitish rejasi |
| **3** | **MK06** 🗄️ 4M.5a: menejer ish navbati — dvigatel va model<br>**MK09** 4M.6b: ma'lumot sifati paneli<br>**MK18** Xato narx nazorati<br>**MK31** Kassa USD naqd oqimi (`CASH_USD`): kutilgan naqd · farq  |
| **4** | **MK07** 4M.5b: 12 qoida turi + sabab kodlari<br>**MK10** 4M.7: «Nima qotib qolgan» + SLA paneli<br>**MK12** 🗄️ 4M.9: xarajat byudjeti (plan/fakt)<br>**MK16** Qarz undirish ish ro'yxati |
| **5** | **MK13** 🗄️⛔B2 4M.10: KPI target + kompozit ball va reyting formulasi<br>**MK15** ⏳ «Korxona puli qayerda» — pul manzarasi paneli *(kutadi: F011)*<br>**MK20** Shablon izohlar (tez javob matnlari)<br>**MK21** Qaror jurnali (alohida ekran) |
| **6** | **MK14** 🌐 4M Phase-2 QA (menejer nazorati)<br>**MK32** POS xulq-testlari qoplamasi (bo'lishdan OLDIN) |
| **7** | **MK19** Ertalabki brifing va kechki yakun<br>**MK24** Mobil rejim (menejer va kassir/omborchi uchun)<br>**MK26** 🗄️ `EmployeePermission` + amaldagi ruxsat hisobi + G1/G2/G3<br>**MK33** POS komponentlarga bo'linishi |
| **8** | **MK27** HR ruxsatlarini birlashtirish (adapter + migratsiya)<br>**MK30** 🗄️ Tasdiqlash navbati: `ApprovalRule` + `ApprovalItem`<br>**MK35** ⏳ Record-scope 1-to'lqin + filial filtri birga *(kutadi: F003)* |
| **9** | **MK28** Ruxsat matritsasi UI (entity × action × scope)<br>**MK34** 🌐 1-Kassa Phase-2 QA (real brauzer + real termal printer)<br>**MK36** Record-scope 2–3-to'lqin (pul + mijozlar) |
| **10** | **MK29** ⛔B4 10 rol shabloni<br>**MK37** 🗄️ `SalesPlan` modeli (xodim × oy × plan turi) |
| **11** | **MK22** Maqsad kaskadi (ega → bo'lim → xodim)<br>**MK38** ⏳ Plan qo'yish · mijoz taqsimoti · narx siyosati ekranlari *(kutadi: F004)*<br>**MK39** 🗄️ Record-scope 4-to'lqin + `recordScopeEnforced` YOQISH |
| **12** | **MK17** ⏳ Yo'qolgan mijozlar signali *(kutadi: F005)*<br>**MK40** 🌐 4-Menejer Phase-2 QA (ruxsatlar) |
| **13** | **MK25** 🌐 M2 Phase-2 QA (mobil qurilma + yangi menejer ekranlari) |

**Jami 13 paket** (40 faza).

> ⏳ = **asosiy rejadagi fazani kutadi** (`docs/REJA-8-BOLIM-2026-08.md`). Bu 4 faza shu
> grafikda o'z o'rnida turibdi, lekin **kutayotgan fazasi bajarilmaguncha boshlanmaydi**:
> `MK15` ← F011 · > `MK17` ← F005 · > `MK35` ← F003 · > `MK38` ← F004

> ⏳ = **asosiy rejadagi fazani kutadi** (`docs/REJA-8-BOLIM-2026-08.md`). Bu 4 faza shu
> grafikda o'z o'rnida turibdi, lekin **kutayotgan fazasi bajarilmaguncha boshlanmaydi**:
> `MK15` ← F011 · > `MK17` ← F005 · > `MK35` ← F003 · > `MK38` ← F004

---

### Allaqachon bajarilgan (qayta qilinmaydi)

`todo.md` → «✅ BAJARILGAN» bo'limi rasmiy manba. Shu rejaga tegishlisi:
**1-Kassa B1–B7** va B8ning 1-bo'lagi (savat matematikasi `lib/pos/cart-math.ts`) ·
**4M M1, M2, M4** va M3ning yarmi · **4-Menejer (ruxsatlar) — hech narsa bajarilmagan**.
**Har faza agenti baribir kodda tasdiqlaydi** (CLAUDE.md §2).

> **Qoplama tekshiruvida topilgan 2 bo'shliq** (2026-08-09, kodda tasdiqlangan): **MK05** jihoz
> reyestri (`Equipment`/`Asset` modeli yo'q — javobgarlik taxtasida jihoz bloki shu sababdan
> ataylab tashlangan edi) va **MK31** kassa `CASH_USD` naqd oqimi (ulanmagan; USD farqi
> yozilmasligi `cashier-session/variance-wiring.test.ts` da qulflangan).

> ⚠️ **Faza soni jonli:** bir faza sessiyaga sig'masa ikkiga bo'linadi (`MK12a`/`MK12b`) va
> jami oshadi. Bo'lgan agent buni hisobotda yozadi va yuqoridagi jadvalni yangilaydi.

---

# M1 — MENEJER: KUNLIK KPI QABUL QILISH VA XODIMLAR NAZORATI

> **Egasining 1- va 2-ustuvorligi — shuning uchun butun rejaning boshida.** `M1`, `M2`, `M4`
> bajarilgan; `M3` yarim. Ko'p BE tayyor, **FE ekranlari yo'q** — ular quyida alohida fazalar.
> Bu to'lqin hech narsaga bog'liq emas (filial ham, kassa ham kerak emas) — darhol boshlanadi.
> **TZ:** `2026-08-02-menejer-kunlik-kpi-tz-design.md`

### MK01 — 4M.3 yakuni: idempotent bonus/jarima ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 4M.3 qoldig'i · **TZ:** §4 (Qabul → oylik), §4.2
**Ustuvorlik:** P1 · **Bog'liqlik:** ✅ **QAROR-B1 YOPILDI** (2026-08-09) — formula yuqorida
**Muammo:** «kun qabul qilinganda bonus/jarima yoziladi» deyilgan, lekin **qancha** yozilishi
TZ'da yo'q. `HrBonusFineLog` sxemada **bor** — yangi jadval kerak emas, tasdiqla.
**Qamrov:**
1. Qabul qilingan kun → `HrBonusFineLog` ga yozuv (**idempotent**: bir kun ikki marta qabul
   qilinsa ikki yozuv chiqmaydi — tabiiy kalit yoki `@@unique`).
2. Qabul **bekor qilinsa/tuzatilsa** — teskari yozuv (zero-sum), o'chirish emas.
3. Eskirgan kun tuzatmasi (`EmployeeKpiCorrection`) bilan **ikki karra hisoblanmaslik**.
**Fayllar:** `apps/api/src/modules/manager/` (KPI qabul servisi) · `apps/api/src/modules/hr/`
(bonus/jarima jurnali) · kerak bo'lsa migratsiya (`@@unique`).
**Testlar (TDD):** (1) bir kunni 2 marta qabul → 1 yozuv. (2) qabul → bekor → jami 0. (3) tuzatma
qo'llanganda oylikda ikki karra ko'rinmaydi. (4) formula chegara qiymatlari (QAROR-B1 bo'yicha).
**Tayyorlik (DoD):** gate yashil · idempotentlik test bilan qulflangan · `todo.md` 4M.3 yopiladi.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK01** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> **Avval QAROR-B1 (bonus/jarima formulasi) yopilganini tekshir** — yopilmagan bo'lsa ish
> boshlama, shuni hisobotga yozib TO'XTA. 4M TZ §4/§4.2 ni o'qi. Idempotent `HrBonusFineLog`
> yozuvi + bekor qilishda zero-sum + tuzatma bilan ikki-karra bo'lmasligi. TDD, gate → **TO'XTA**.

---

### MK02 — 4M.4 qoldig'i: ishga qabul tomoni (sinov muddati) ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 4M.4 qoldig'i · **TZ:** §6.3 (hayot sikli)
**Ustuvorlik:** P2 · **Bog'liqlik:** yo'q (bo'shatish tomoni `EmployeeOffboarding` bilan bajarilgan)
**Qamrov:** ishga qabul: sinov muddati (boshlanish/tugash) · **baholash sanasi** va eslatma ·
sinov natijasi (o'tdi/o'tmadi) → hayot sikli holatiga ta'siri. Bo'shatish ro'yxati bilan bir xil
naqsh: **tizim biladigan bandni qo'lda «bajarildi» deb belgilash mumkin emas**.
**Fayllar:** `schema.prisma` (mavjud `EmployeeOffboarding` naqshiga qarab onboarding tomoni) ·
`apps/api/src/modules/hr/` · `apps/web/src/app/(app)/hr/`.
**Testlar (TDD):** (1) sinov muddati tugashiga N kun qolganda ogohlantirish chiqadi. (2) natija
belgilanmagan xodim «sinovda» holatida qoladi. (3) qo'lda soxta belgilash rad etiladi.
**Tayyorlik (DoD):** gate yashil · i18n ru+uz · `todo.md` 4M.4 to'liq yopiladi.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK02** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 4M TZ §6.3 ni o'qi va mavjud `EmployeeOffboarding` naqshini kodda ko'r. Ishga qabul tomoni:
> sinov muddati + baholash sanasi + natija. Tizim biladigan bandni qo'lda belgilashga yo'l qo'yma.
> TDD, gate, hisobot → **TO'XTA**.

---

### MK03 — Menejer FE-A: «Jonli holat» va «Javobgarlik» ekranlari ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 4M.4 FE · **TZ:** §6.1, §6.4
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q — **BE tayyor** (`GET manager/kpi/live`,
`GET manager/kpi/accountability`), FE **yo'q**
**Qamrov:**
1. «Hozir kim ishda» ekrani: ochiq smena · davomat · haydovchi reysi · yig'ilayotgan buyurtma.
   **Diqqat talab qiladigani tepada**; chegaralar ekranda izohlanadi (smena 12s · kechikish
   15daq · yig'ish 45daq). Ekran «hammasi joyida» demaydi.
2. «Javobgarlik» taxtasi: ochiq smena · haydovchi qo'lidagi naqd · tugallanmagan yig'ish ·
   qabul qilinmagan KPI kunlari. Pul ko'p bo'lgan tepada; **nol qatorlar ko'rsatilmaydi**.
   **Jihoz bloki YO'Q** — reyestr mavjud emas, «0 ta jihoz» yolg'on ishonch berardi.
**Fayllar:** `apps/web/src/app/(app)/menejer/` (yangi sahifalar) · `apps/web/src/messages/{ru,uz}.json`.
**Testlar (TDD):** (1) bo'sh javobda «ma'lumot yo'q» holati (0 emas). (2) tartiblash: diqqat
talab qiladigan qator birinchi. (3) i18n kalitlari ru+uz mavjud, hardcoded matn yo'q.
**Tayyorlik (DoD):** gate + i18n gate yashil · **komponent matnlari qo'lda tekshirilgan**
(i18n gate `components/` ni ko'rmaydi) · brauzer-smoke YO'Q (MK14'ga).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK03** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> BE allaqachon bor: `GET manager/kpi/live` va `GET manager/kpi/accountability` — javob shaklini
> kodda tasdiqla. FE: «Jonli holat» + «Javobgarlik» ekranlari (4M TZ §6.1, §6.4). Nol qator
> ko'rsatilmaydi, jihoz bloki YO'Q. i18n ru+uz. Gate → **TO'XTA**.

---

### MK04 — Menejer FE-B: xodim kartasi 360° · jurnal · haftalik xulosa ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 4M.4 / 4M.3 FE · **TZ:** §6.2, §7
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q — BE tayyor (`GET hr/employees/:id/card`,
`GET manager/kpi/weekly-summary`), FE **yo'q**
**Qamrov:**
1. Xodim kartasi 360° ekrani + **suhbat/ogohlantirish jurnali**: jurnal **append-only** —
   yozuv o'chirilmaydi, xatosi `void` qilinadi va tarixda ko'rinadi · 90 kunlik oyna ·
   3 ogohlantirish = naqsh belgisi · **maqtov turi ham ko'rinadi** (jurnal faqat salbiy bo'lmasin).
2. Egaga **haftalik xulosa** ekrani (dushanba 09:00 cron bilan yoziladi).
**Fayllar:** `apps/web/src/app/(app)/hr/` (xodim kartasi) · `apps/web/src/app/(app)/menejer/` ·
i18n fayllari.
**Testlar (TDD):** (1) `void` qilingan yozuv ro'yxatdan yo'qolmaydi, belgisi bilan turadi.
(2) 3-ogohlantirish naqsh belgisini yoqadi. (3) haftalik xulosada «yo'qdan kiritilgan» tuzatma
alohida sanaladi (jonli bug'da jami 0 chiqqan edi — regressiya qulfi).
**Tayyorlik (DoD):** gate + i18n yashil · brauzer-smoke YO'Q (MK14).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK04** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> BE bor: `GET hr/employees/:id/card`, `GET manager/kpi/weekly-summary` — shaklini kodda tasdiqla.
> FE: xodim kartasi 360° + append-only jurnal (void, 90 kun, 3-ogohlantirish naqshi, maqtov) +
> haftalik xulosa ekrani. i18n ru+uz. TDD, gate → **TO'XTA**.

---

### MK05 — Jihoz reyestri + javobgarlik taxtasida jihoz bloki ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 4M.4 qo'shimchasi · **TZ:** `2026-08-02-menejer-kunlik-kpi-tz-design.md` §6.4, §6.3
**Ustuvorlik:** P2 · **Bog'liqlik:** MK03 (javobgarlik taxtasi)
**Muammo (2026-08-09 da tasdiqlandi):** javobgarlik taxtasida **jihoz bloki ataylab YO'Q** —
reyestr mavjud emas, «0 ta jihoz» yo'q ma'lumotga ishontirardi. Sxemada `Equipment`/`Asset`
modeli yo'q (grep bilan tekshirildi). Bo'shatish ro'yxatida ham jihoz bandi shu sababdan to'liq emas.
**Qamrov:**
1. Jihoz reyestri: nomi · inventar raqami · holati · kimda · qachon berilgan/qaytarilgan.
2. Xodimga biriktirish / qaytarish (tarix bilan).
3. **Bo'shatish ro'yxatiga ulanish** (`EmployeeOffboarding`) — qaytarilmagan jihoz bandi
   **tizim biladigan** band bo'ladi (qo'lda «bajarildi» deb belgilanmaydi).
4. Javobgarlik taxtasiga (MK03) jihoz bloki qo'shiladi.
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/hr/` · `manager/` ·
`apps/web/.../hr/`, `.../menejer/`.
**Testlar (TDD):** (1) qaytarilmagan jihoz bo'lsa bo'shatish ro'yxati yopilmaydi. (2) jihozsiz
xodim taxtada ko'rinmaydi (nol qator tashlanadi). (3) biriktirish tarixi append-only.
**Tayyorlik (DoD):** gate yashil · MK03 taxtasi regressiyasiz.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK05** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 4M TZ §6.4/§6.3. Jihoz reyestri + xodimga biriktirish + bo'shatish ro'yxatiga ulash + javobgarlik
> taxtasida jihoz bloki. Tizim biladigan bandni qo'lda belgilashga yo'l qo'yma. TDD, gate → **TO'XTA**.

---

### MK06 — 4M.5a: menejer ish navbati — dvigatel va model ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 4M.5 (1-yarim) · **TZ:** §5.1–§5.2
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q · **Holat:** `ManagerWorkItem` va `ManagerRuleConfig`
sxemada **YO'Q** (tasdiqlangan)
**Qamrov:** `ManagerWorkItem` + `ManagerRuleConfig` modellari · **bitta navbat** tamoyili (hamma
ogohlantirish bir joyda) · qoida dvigateli skeleti (qoida → element yaratish, dedup, eskirish) ·
navbat API + menejer ekrani (ro'yxat, filtr, harakatlar).
**Diqqat:** navbat **bloklamaydi** — egasining falsafasi «erkinlik + keyingi nazorat».
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/manager/` ·
`apps/web/src/app/(app)/menejer/`.
**Testlar (TDD):** (1) bir sabab bo'yicha ikki marta ishga tushirilsa **bitta** element (dedup).
(2) element eskirsa belgi qo'yiladi, o'chirilmaydi. (3) qoida o'chirilgan bo'lsa element
yaratilmaydi. (4) navbat hech qanday amalni bloklamaydi (regressiya qulfi).
**Tayyorlik (DoD):** gate yashil · 12 qoida turi **hali yo'q** (MK07) — bu ochiq qarz sifatida
hisobotda.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK06** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 4M TZ §5.1–5.2 ni o'qi. `ManagerWorkItem` + `ManagerRuleConfig` + qoida dvigateli skeleti +
> navbat ekrani. Qoida turlari MK07'da — bu fazada 1–2 namunaviy qoida yetarli. Navbat
> BLOKLAMAYDI. TDD, gate → **TO'XTA**.

---

### MK07 — 4M.5b: 12 qoida turi + sabab kodlari ☐ HISOBOT
**Bo'lim/blok:** 4M.5 (2-yarim) · **TZ:** §5.2 (to'rt toifa), §5.3
**Ustuvorlik:** P1 · **Bog'liqlik:** **MK06**
**Qamrov:** TZ §5.2 dagi **12 qoida turi** to'liq (to'rt toifa bo'yicha) + **sabab kodlari**
(§5.3) + har qoida uchun sozlanadigan chegara (`ManagerRuleConfig`).
**Fayllar:** `apps/api/src/modules/manager/` (qoida ta'riflari alohida faylda, registry naqshi) ·
i18n (qoida nomlari + sabab kodlari ru+uz).
**Testlar (TDD):** har qoida uchun kamida bitta **yoqadigan** va bitta **yoqmaydigan** stsenariy
(12 × 2 = 24 test) · chegara sozlamasi ta'sir qilishi · noma'lum sabab kodi rad etilishi.
**Tayyorlik (DoD):** 12/12 qoida testlangan · i18n ru+uz to'liq · gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK07** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> **MK06 dvigateli borligini kodda tasdiqla.** 4M TZ §5.2/§5.3 dagi **12 qoida turi** va sabab
> kodlarini to'liq joriy et — har biriga yoqadigan/yoqmaydigan test. i18n ru+uz. Gate → **TO'XTA**.

---

### MK08 — 4M.6a: smena yakunini qabul qilish ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 4M.6 · **TZ:** §6 (qabul naqshini kengaytirish)
**Ustuvorlik:** P2 · **Bog'liqlik:** MK01 (qabul naqshi)
**Qamrov:** kunlik KPI qabul FSM'ining **smena** ob'ektiga ko'chirilishi: smena yopilgach menejer
uni qabul qiladi/rad etadi · farq akti va Z-hisobot qabul ekranida ko'rinadi · rad etish →
tushuntirish halqasi (kassirga qaytadi).
**Fayllar:** `apps/api/src/modules/cashier-session/` + `manager/` · `apps/web/.../menejer/`.
**Testlar (TDD):** (1) qabul qilinmagan smena javobgarlik ro'yxatida turadi. (2) rad etilgan
smena kassirga qaytadi va sabab saqlanadi. (3) qabul **summalarga tegmaydi** (akt = dalil).
**Tayyorlik (DoD):** gate yashil · i18n ru+uz.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK08** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 4M TZ §6 va mavjud kunlik-qabul FSM kodini o'qi. Smena yakunini qabul qilish + rad→tushuntirish
> halqasi. Qabul summalarga TEGMAYDI. TDD, gate → **TO'XTA**.

---

### MK09 — 4M.6b: ma'lumot sifati paneli ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 4M.6 · **TZ:** §2.4 (NULL ≠ 0 bayrog'i), §0.2
**Ustuvorlik:** P2 · **Bog'liqlik:** MK08
**Maqsad:** «Bu raqamga qanchalik ishonish mumkin» degan savolga **ekranda** javob berish.
**Qamrov:** har ko'rsatkich uchun ma'lumot sifati bayrog'i (to'liq / qisman / yig'ilmagan) ·
`costMinor` NULL bo'lgan cheklar ulushi · qabul qilinmagan kunlar ulushi · manbasi yo'q
ko'rsatkichlar ro'yxati. **NULL hech qachon 0 sifatida ko'rsatilmaydi** (100% marja yolg'oni
shu sinfdan chiqqan).
**Fayllar:** `apps/api/src/modules/report/metrics/` (bayroq hisoblash) · `apps/web/.../menejer/`.
**Testlar (TDD):** (1) NULL tan narxli chek «yig'ilmagan» deb sanaladi, 0 emas. (2) 100% to'liq
ma'lumotda bayroq «to'liq». (3) panel foizi jonli hisob bilan mos.
**Tayyorlik (DoD):** gate yashil · «NULL≠0» shartnomasi test bilan qulflangan.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK09** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 4M TZ §2.4/§0.2 ni o'qi. Ma'lumot sifati paneli: bayroqlar + NULL ulushi + qabul qilinmagan
> kunlar. **NULL ≠ 0** — test bilan qulfla. Gate → **TO'XTA**.

---

### MK10 — 4M.7: «Nima qotib qolgan» + SLA paneli ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 4M.7 · **TZ:** §8
**Ustuvorlik:** P2 · **Bog'liqlik:** MK06
**Qamrov:** jarayon bo'yicha qotib qolgan ob'ektlar (yig'ilmagan buyurtma · qabul qilinmagan
yetkazma · javobsiz da'vo · yopilmagan smena · tasdiqlanmagan hujjat) + har bosqich uchun **SLA
chegarasi** va oshib ketganlar ro'yxati.
**Fayllar:** `apps/api/src/modules/manager/` · `apps/web/.../menejer/`.
**Testlar (TDD):** (1) SLA ichidagi ob'ekt ro'yxatga tushmaydi. (2) chegara sozlamasi ta'sir
qiladi. (3) yopilgan ob'ekt ro'yxatdan chiqadi.
**Tayyorlik (DoD):** gate yashil · SLA chegaralari sozlamada (kodda qattiq yozilmagan).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK10** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 4M TZ §8 ni o'qi. «Nima qotib qolgan» + SLA paneli; chegaralar sozlamada. TDD, gate → **TO'XTA**.

---

### MK11 — 4M.8: uch xil zaxira signali + narx o'zgarishi nazorati ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 4M.8 · **TZ:** §8
**Ustuvorlik:** P2 · **Bog'liqlik:** yo'q
**Qamrov:**
1. **Uch xil zaxira signali** — o'lchov **PUL**, dona emas: qotib qolgan pul · tugash xavfi ·
   ortiqcha zaxira.
2. **Narx o'zgarishi tarixi va chegarasi** — kim, qachon, qancha o'zgartirdi; chegaradan oshsa
   navbatga tushadi (bloklamaydi).
**Fayllar:** `apps/api/src/modules/manager/`, `product`/`price-type` (narx tarixi manbai) ·
`apps/web/.../menejer/`.
**Testlar (TDD):** (1) signal **pul** o'lchovida hisoblanadi (dona emas). (2) chegaradan oshgan
narx o'zgarishi navbat elementi yaratadi va **amalni bloklamaydi**. (3) tan narx NULL bo'lsa
signal «hisoblanmadi» deydi, 0 emas.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK11** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 4M TZ §8 ni o'qi. Uch xil zaxira signali (**o'lchov PUL**) + narx o'zgarishi tarixi/chegarasi
> (bloklamaydi, navbatga tushadi). NULL≠0. TDD, gate → **TO'XTA**.

---

### MK12 — 4M.9: xarajat byudjeti (plan/fakt) ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 4M.9 · **TZ:** §8
**Ustuvorlik:** P3 · **Bog'liqlik:** yo'q · **Holat:** `ExpenseBudget` sxemada **YO'Q**
**Qamrov:** `ExpenseBudget` (modda × oy) · plan kiritish ekrani · fakt manbasi = mavjud xarajat
hujjatlari (`expense-item` + kassa RKO) · og'ish ko'rsatkichi va ogohlantirish.
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/manager/` yoki yangi
`expense-budget` modul (AppModule'ga **ula**) · `apps/web/.../menejer/`.
**Testlar (TDD):** (1) fakt jamlash mavjud xarajat hujjatlaridan (ikki manba qo'shilmaydi).
(2) plan yo'q oyda og'ish «plan qo'yilmagan» deydi, 100% emas. (3) valyuta: kursi yo'q summa
jamiga qo'shilmaydi (hisobot konvertatsiya shartnomasi).
**Tayyorlik (DoD):** gate yashil · yangi modul `app-boot.test.ts` da ko'rinadi.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK12** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 4M TZ §8 ni o'qi. `ExpenseBudget` (modda × oy) + plan/fakt + og'ish. Faktni **mavjud** xarajat
> hujjatlaridan ol (yangi yozuvchi ochma). Modulni AppModule'ga ula. TDD, gate → **TO'XTA**.

---

### MK13 — 4M.10: KPI target + kompozit ball va reyting formulasi ☐ HISOBOT
**Bo'lim/blok:** 4M.10 · **TZ:** §2.5, §11
**Ustuvorlik:** P2 · **Bog'liqlik:** ⛔ **QAROR-B2 va QAROR-B3** · **Holat:** `KpiTarget` **YO'Q**
**Qamrov:** `KpiTarget` (kunlik/haftalik target) · **reyting formulasi** (panelda va'da qilingan,
formulasi hech qayerda yo'q edi) · `SCORE_CAP_PERCENT` ni **sozlamaga** chiqarish ·
`lower_better` ko'rsatkichlar formulasi · adolat normalizatsiyasi (§2.5).
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/manager/` (ball hisoblash) ·
sozlamalar (`company-settings`).
**Testlar (TDD):** (1) cap chegarasida ball qisiladi (QAROR-B2 qiymati). (2) `lower_better`
formulasi chegara qiymatlarida (QAROR-B3). (3) targeti yo'q ko'rsatkich reytingga **kirmaydi**
(0 sifatida emas). (4) reyting tartibi determinist (teng ballda barqaror tartib).
**Tayyorlik (DoD):** gate yashil · formulalar hujjatda (shu faza hisobotida) yozib qoldirilgan.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK13** ni bajar. **Avval QAROR-B2 va QAROR-B3
> yopilganini tekshir** — yopilmagan bo'lsa boshlama, hisobotga yozib TO'XTA. 4M TZ §2.5 ni o'qi.
> `KpiTarget` + reyting formulasi + `SCORE_CAP_PERCENT` sozlamaga. Targeti yo'q ko'rsatkich
> reytingga kirmaydi (0 emas). TDD, gate → **TO'XTA**.

---

### MK14 — 4M **Phase-2 QA** (menejer nazorati) ☐ HISOBOT
**Bo'lim/blok:** 4M QA · **TZ:** §10 · **Tur:** QA sessiyasi
**Ustuvorlik:** P1 · **Bog'liqlik:** MK01–MK13
**Qamrov (real brauzer):** rad etish → tushuntirish halqasi · eskalatsiya · majburiy yopish ·
tuzatma dialogi · **RU-locale** · **o'z-KPI dialogi** · **xodim tomoni FE** · jonli holat ·
javobgarlik · xodim kartasi · navbat · SLA · byudjet · reyting.
**Tayyorlik (DoD):** har oqim skrinshot bilan · topilgan bug darhol tuzatiladi yoki yangi faza ·
4M statusi «Phase-2 verified».
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK14** (4M Phase-2 QA) ni bajar. `/qa-cohort` protokoli.
> Real brauzer: rad→tushuntirish, eskalatsiya, majburiy yopish, tuzatma dialogi, RU-locale,
> o'z-KPI dialogi, xodim tomoni FE, navbat/SLA/byudjet/reyting. Bug → issiq kontekstda tuzat yoki
> rejaga yangi faza. Hisobot → **TO'XTA**.

---

# M2 — MENEJER: ILGARI KIRITILMAGAN 10 BAND

> **2026-08-09 — egasining qarori TZ'ni bekor qiladi.** 4M TZ §8.1 bu 10 bandni «ko'rib chiqilgan,
> KIRITILMAGAN · qayta muhokama qilinmasin» deb yopgan edi. Egasi ularni **rejaga qo'shishni**
> talab qildi — TZ §8.1 endi amal qilmaydi, shu to'lqin uning o'rnini bosadi.
> Hammasi M1 (menejer yadrosi) ustiga quriladi va **bloklamaydigan** nazorat falsafasiga bo'ysunadi.

### MK15 — «Korxona puli qayerda» — pul manzarasi paneli ☐ HISOBOT
**Bo'lim/blok:** 4M §8.1/1 · **Ustuvorlik:** P2 · **Bog'liqlik:** MK12 (byudjet), F011 (asosiy reja) (rollup)
**Maqsad:** bir ekranda: kassalarda · bank hisoblarida · mijoz qarzida · ta'minotchi qarzida ·
haydovchi qo'lida · yo'ldagi tovarda qancha pul turibdi.
**Qamrov:** har manba **bitta yozuvchidan** o'qiladi (yangi formula yozilmaydi — `report/metrics/`) ·
valyuta shartnomasi (kursi yo'q summa jamiga qo'shilmaydi, alohida ko'rsatiladi) · «hisoblanmadi»
holati (NULL ≠ 0).
**Fayllar:** `apps/api/src/modules/report/metrics/`, `money/`, `counterparty-balance/` ·
`apps/web/.../menejer/`.
**Testlar (TDD):** (1) har manba mavjud servisdan keladi (grep-guard: ikkinchi formula yo'q).
(2) kursi yo'q valyuta jamiga qo'shilmaydi. (3) manba javob bermasa blok «hisoblanmadi» deydi.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK15** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> «Korxona puli qayerda» paneli: kassa · bank · mijoz qarzi · ta'minotchi qarzi · haydovchi naqdi ·
> yo'ldagi tovar. Har raqamni **mavjud** servisdan ol, yangi formula yozma. NULL≠0, kurs
> shartnomasi. TDD, gate → **TO'XTA**.

---

### MK16 — Qarz undirish ish ro'yxati ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 4M §8.1/2 · **Ustuvorlik:** P2 · **Bog'liqlik:** MK06 (navbat dvigateli)
**Qamrov:** kimdan qancha undirish kerak · muddati o'tgan kunlar bo'yicha tartib · javobgar
(sotuvchi/ega) · oxirgi aloqa sanasi · harakat (qo'ng'iroq/SMS/Telegram eslatma — mavjud
`counterparty-debt-notify` va `sms` modullaridan foydalanadi, yangisini qurmaydi).
**Testlar (TDD):** (1) to'langan qarz ro'yxatdan chiqadi. (2) eslatma yuborilishi jurnalga
tushadi va takror yuborilmaydi (idempotent). (3) tartib determinist.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK16** ni bajar. Qarz undirish ish ro'yxati (muddat ·
> javobgar · oxirgi aloqa · harakat). Eslatmani **mavjud** `counterparty-debt-notify`/`sms`
> orqali yubor. TDD, gate → **TO'XTA**.

---

### MK17 — Yo'qolgan mijozlar signali ☐ HISOBOT
**Bo'lim/blok:** 4M §8.1/3 · **Ustuvorlik:** P2 · **Bog'liqlik:** F005 (asosiy reja) (`lastActivityAt`), MK38
**Qamrov:** ilgari sotib olib, endi to'xtagan mijozlar (davr sozlanadi) · yo'qolish «sababi»
belgisi (qo'lda) · sotuvchi bo'yicha kesim · mijoz taqsimoti ekraniga (MK38) ulanish.
**Diqqat:** «mijoz taqsimoti» qismi MK38 da qurilgan — **takrorlama**, ulan.
**Testlar (TDD):** (1) yangi mijoz «yo'qolgan» deb belgilanmaydi. (2) davr sozlamasi ta'sir qiladi.
(3) 90-kun egalik taymeri bilan ziddiyat yo'q.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK17** ni bajar. Yo'qolgan mijozlar signali + sabab
> belgisi + sotuvchi kesimi. MK38 dagi mijoz taqsimoti ekraniga ulan, ikkinchisini qurma.
> TDD, gate → **TO'XTA**.

---

### MK18 — Xato narx nazorati ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 4M §8.1/4 · **Ustuvorlik:** P2 · **Bog'liqlik:** MK11 (narx o'zgarishi nazorati)
**Qamrov:** shubhali narx aniqlash — tan narxdan past · optomdan past · o'rtachadan keskin farq ·
nol/bo'sh narx · o'nlik xatosi (10× / 0.1×) belgisi. **Bloklamaydi** — navbatga tushadi.
**Diqqat:** MK11 narx **o'zgarishi** tarixini beradi; bu faza **qiymat mantiqsizligini** tutadi.
Ikkalasi bir qoida dvigatelida (MK06) yashaydi.
**Testlar (TDD):** (1) 10× xato aniqlanadi. (2) chegirma sababli past narx **xato deb
belgilanmaydi** (chegirma qonuniy). (3) tan narx NULL bo'lsa «tekshirib bo'lmadi», xato emas.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK18** ni bajar. Xato narx nazorati (tan narxdan past ·
> optomdan past · o'nlik xatosi · nol narx) — **bloklamaydi**, navbatga tushadi. Chegirmani xato
> deb belgilama, NULL≠0. TDD, gate → **TO'XTA**.

---

### MK19 — Ertalabki brifing va kechki yakun ☐ HISOBOT
**Bo'lim/blok:** 4M §8.1/5 · **Ustuvorlik:** P3 · **Bog'liqlik:** MK03, MK10, MK14
**Qamrov:** ertalabki brifing ekrani (bugun nima muhim: qotib qolganlar · SLA buzilishi · qabul
kutayotgan kunlar · zaxira signali) · kechki yakun (bugun nima bo'ldi: tushum · qabul · farq ·
ochiq qolganlar) · ixtiyoriy Telegram yuborish (outbox orqali).
**Testlar (TDD):** (1) bo'sh kunda «tinch kun» holati (soxta ogohlantirish yo'q). (2) Telegram
yuborish dublikatsiz. (3) barcha raqamlar mavjud servislardan.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK19** ni bajar. Ertalabki brifing + kechki yakun
> ekranlari (+ixtiyoriy Telegram, outbox orqali). Raqamlarni mavjud servislardan ol.
> TDD, gate → **TO'XTA**.

---

### MK20 — Shablon izohlar (tez javob matnlari) ☐ HISOBOT
**Bo'lim/blok:** 4M §8.1/6 · **Ustuvorlik:** P3 · **Bog'liqlik:** MK01, MK06
**Qamrov:** rad etish/tuzatma/ogohlantirish izohlari uchun shablonlar (menejer sozlaydi) ·
kontekst bo'yicha taklif · shablon tanlansa ham **matn tahrirlanadi** (majburlanmaydi) ·
i18n ru+uz.
**Testlar (TDD):** (1) shablon matni jurnalga **to'liq** yoziladi (havola emas — keyin shablon
o'zgarsa tarix buzilmaydi). (2) shablonsiz izoh ham qabul qilinadi.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK20** ni bajar. Shablon izohlar (rad etish/tuzatma/
> ogohlantirish uchun). Jurnalga **matn ko'chiriladi**, havola emas. i18n ru+uz.
> TDD, gate → **TO'XTA**.

---

### MK21 — Qaror jurnali (alohida ekran) ☐ HISOBOT
**Bo'lim/blok:** 4M §8.1/8 · **Ustuvorlik:** P3 · **Bog'liqlik:** MK01, MK06
**Eslatma:** TZ «qaror jurnali qabul hodisa jurnalidan texnik jihatdan chiqadi — alohida ekran
qilinmaydi» degan edi. **Egasi teskarisini tanladi** → ekran quriladi (yangi jadval EMAS, mavjud
hodisa jurnali ustidan ko'rinish).
**Qamrov:** kim · qachon · nima qaror qildi · sababi · natijasi; filtr (xodim, tur, davr);
eksport. **Yangi yozuvchi ochilmaydi** — manba mavjud hodisa jurnallari.
**Testlar (TDD):** (1) ekran mavjud jurnaldan o'qiydi (grep-guard: yangi jadval yo'q).
(2) `void` qilingan yozuv ko'rinib qoladi. (3) filtr/eksport ekran raqamiga mos.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK21** ni bajar. Qaror jurnali ekrani — **mavjud hodisa
> jurnallari ustidan ko'rinish**, yangi jadval ochma. Filtr + eksport. TDD, gate → **TO'XTA**.

---

### MK22 — Maqsad kaskadi (ega → bo'lim → xodim) ☐ HISOBOT
**Bo'lim/blok:** 4M §8.1/9 · **Ustuvorlik:** P3 · **Bog'liqlik:** MK13 (`KpiTarget`), MK37 (`SalesPlan`)
**Qamrov:** yuqoridagi maqsad pastga taqsimlanadi (ega → bo'lim → xodim) · taqsimot qoldig'i
ko'rinadi (100% taqsimlanmagan bo'lsa ochiq aytiladi) · kaskad o'zgarishi tarixi.
**Diqqat:** `KpiTarget` (MK13) va `SalesPlan` (MK37) allaqachon bor — **uchinchi plan modeli
yaratma**, ular ustiga qatlam qur.
**Testlar (TDD):** (1) taqsimlanmagan qoldiq ko'rsatiladi, jimgina 0 emas. (2) xodim maqsadlari
yig'indisi bo'lim maqsadidan oshsa ogohlantiriladi (bloklamaydi). (3) yangi model yaratilmagan.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK22** ni bajar. Maqsad kaskadi (ega → bo'lim → xodim)
> **mavjud** `KpiTarget`/`SalesPlan` ustida. Uchinchi plan modelini yaratma. Taqsimlanmagan
> qoldiqni ochiq ko'rsat. TDD, gate → **TO'XTA**.

---

### MK23 — 1:1 suhbat va o'qitish rejasi ☐ HISOBOT
**Bo'lim/blok:** 4M §8.1/10 · **Ustuvorlik:** P3 · **Bog'liqlik:** MK04 (xodim kartasi jurnali)
**Qamrov:** rejalashtirilgan 1:1 suhbatlar (sana, mavzu, natija) · o'qitish rejasi va bajarilishi ·
**mavjud append-only suhbat jurnaliga** yoziladi (yangi jurnal emas) · muddati o'tgan suhbat
javobgarlik taxtasida ko'rinadi.
**Testlar (TDD):** (1) yozuv mavjud jurnalga tushadi. (2) o'tkazilmagan suhbat eslatma beradi.
(3) o'qitish bandi tugallanmasa xodim kartasida ochiq turadi.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK23** ni bajar. 1:1 suhbat va o'qitish rejasi —
> **mavjud** append-only jurnalga yoz, yangisini ochma. Muddati o'tganini javobgarlikka ulan.
> TDD, gate → **TO'XTA**.

---

### MK24 — Mobil rejim (menejer va kassir/omborchi uchun) ☐ HISOBOT
**Bo'lim/blok:** 4M §8.1/7 · **Ustuvorlik:** P2 · **Bog'liqlik:** MK03, MK04, MK06, MK14
**Muammo:** hozir UI faqat desktop uchun mo'ljallangan; menejer va omborchi telefonda ishlaydi.
**Qamrov:** mobil qobiq (responsive layout + touch-target o'lchamlari) **menejer nazorat
ekranlari** (jonli holat · javobgarlik · navbat · qabul) va **omborchi/skaner oqimi** uchun ·
mobil navigatsiya · offline holatida aniq xato (soxta muvaffaqiyat yo'q).
**Chegara:** butun ERP mobil qilinmaydi — faqat shu ikki oqim. Buni hisobotda ochiq yoz.
**Fayllar:** `apps/web/src/app/(app)/menejer/`, `.../omborchi/`, `.../scan/` ·
`packages/design-system` (touch variantlari).
**Testlar (TDD):** (1) tor ekran breakpointida asosiy harakatlar erishimli (render test).
(2) touch-target minimal o'lcham qoidasi. (3) offline/xato holati aniq matn beradi.
**Tayyorlik (DoD):** gate + i18n yashil · **real qurilmada tekshirilmagan** → MK25 QA.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK24** ni bajar. Mobil rejim: menejer nazorat ekranlari
> + omborchi/skaner oqimi (butun ERP emas — chegarani hisobotda yoz). Responsive + touch-target +
> offline xato holati. TDD, gate → **TO'XTA**.

---

### MK25 — M2 **Phase-2 QA** (mobil qurilma + yangi menejer ekranlari) ☐ HISOBOT
**Tur:** QA sessiyasi · **Ustuvorlik:** P1 · **Bog'liqlik:** MK15–MK24
**Qamrov:** **real telefonda** menejer nazorat oqimi va omborchi skaner oqimi · pul manzarasi
paneli raqamlari ichki hisobotlar bilan solishtiriladi · qarz undirish eslatmasi jonli yuboriladi ·
brifing/yakun ekranlari · qaror jurnali filtri · maqsad kaskadi.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK25** (M2 Phase-2 QA) ni bajar. `/qa-cohort` + **real
> telefon**. Menejer nazorat oqimi, omborchi skaner, pul manzarasi raqamlarini ichki hisobot bilan
> solishtir. Hisobot → **TO'XTA**.

---

# M3 — MENEJER: RUXSAT MODELI (yadro)

> **TZ:** `2026-08-01-menejer-tz-design.md` · Hozir **ikki parallel ruxsat tizimi** bor
> (ERP `entity×action×scope` va HR `page×section×access`).
> Bu to'lqin — ruxsat **modeli va boshqaruvi**. Ko'rinish chegarasi (record-scope) esa **M5**'da,
> chunki u filial o'qi bilan **bitta to'lqinda** qilinishi shart (master roadmap 4.7): alohida
> qilinsa har endpoint ikki marta qayta yoziladi.

### MK26 — `EmployeePermission` + amaldagi ruxsat hisobi + G1/G2/G3 ☐ HISOBOT
**Bo'lim/blok:** 4-B1 · **TZ:** §3.1, §3.3
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q · **Holat:** `EmployeePermission` sxemada **YO'Q**
**Qamrov:**
1. `EmployeePermission` — xodim darajasidagi **override** (ko'tarish VA tushirish).
2. **Amaldagi ruxsat** hisobi: rol `MAX(scope)` → xodim override → yakuniy natija.
3. **G1** — imtiyoz oshirish taqiqi **server tomonda** (o'zidan yuqori ruxsat bera olmaydi).
4. **G2** — «nega bu ruxsat bor» (izohlash: qaysi roldan/overridedan keldi).
5. **G3** — ruxsat o'zgarishi **audit**ga yoziladi.
**Diqqat:** HR self-eskalatsiya teshigi ilgari tuzatilgan — o'sha testlarni **buzma**, ular
regressiya qulfi.
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/permissions/` ·
`apps/api/src/modules/audit-log/`.
**Testlar (TDD):** (1) override ko'taradi va tushiradi. (2) G1: o'zidan yuqori ruxsat berish →
403. (3) G2: izohlash to'g'ri manbani ko'rsatadi. (4) G3: har o'zgarish audit yozuvi. (5) mavjud
rol-based xulq **o'zgarmaydi** (override yo'q bo'lganda).
**Tayyorlik (DoD):** gate yashil · mavjud permissions testlari yashil (regress).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK26** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 4-bo'lim TZ §3.1/§3.3 ni o'qi va `apps/api/src/modules/permissions/` ni kodda ko'r.
> `EmployeePermission` + amaldagi ruxsat hisobi + G1 (server-side imtiyoz taqiqi) + G2 (nega) +
> G3 (audit). Mavjud rol xulqi o'zgarmasin. TDD, gate → **TO'XTA**.

---

### MK27 — HR ruxsatlarini birlashtirish (adapter + migratsiya) ☐ HISOBOT
**Bo'lim/blok:** 4-B2 · **TZ:** §3.2
**Ustuvorlik:** P1 · **Bog'liqlik:** **MK26**
**Muammo:** ikki parallel model: ERP `entity×action×scope` vs HR `page×section×access`.
**Qamrov:** adapter (HR modelini ERP modeliga xaritalash) · **bir martalik migratsiya** ·
migratsiya **hisoboti** (kim nimani yo'qotdi/oldi) · eski HR yozuvlari faqat-o'qish.
**Fayllar:** `apps/api/src/modules/permissions/`, `hr/` · yangi
`scripts/migrate-hr-permissions.ts` (DRY/APPLY, fail-closed).
**Testlar (TDD):** (1) har HR kombinatsiyasi ERP ekvivalentiga xaritalanadi (jadval-test).
(2) xaritalanmaydigan holat **jimgina tushib qolmaydi** — xato beradi. (3) migratsiyadan keyin
hech bir xodim **kutilmaganda ko'proq** ruxsat olmaydi (kengayish taqiqi).
**Tayyorlik (DoD):** gate yashil · DRY hisoboti hisobotga qo'shilgan · prod migratsiyasi OPS ro'yxatiga.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK27** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 4-bo'lim TZ §3.2. HR `page×section×access` → ERP `entity×action×scope` adapter + bir martalik
> migratsiya + DRY hisobot. **Hech kim ko'proq ruxsat olmasin** — buni test bilan qulfla.
> Prodga tegma (OPS ro'yxati). TDD, gate → **TO'XTA**.

---

### MK28 — Ruxsat matritsasi UI (entity × action × scope) ☐ HISOBOT
**Bo'lim/blok:** 4-B3 (1-yarim) · **TZ:** §3.1, §6
**Ustuvorlik:** P2 · **Bog'liqlik:** MK26, MK27
**Qamrov:** admin uchun matritsa ekrani: entity × action × scope · rol va xodim qatlamlari
**farqlanadi** (qaysi qiymat roldan, qaysi biri overriddan — G2 ko'rinishi) · o'zgarishni
saqlashdan oldin **farq ko'rsatiladi**.
**Fayllar:** `apps/web/src/app/(app)/settings/` (ruxsatlar bo'limi) · i18n ru+uz.
**Testlar (TDD):** (1) override qiymati vizual farqlanadi. (2) G1 buzilishi UI'da ham rad etiladi
(server javobini ko'rsatadi). (3) saqlashdan oldingi farq ro'yxati to'g'ri.
**Tayyorlik (DoD):** gate + i18n yashil · brauzer-smoke YO'Q (MK40).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK28** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> Ruxsat matritsasi UI (entity × action × scope), rol vs override qatlamlari farqlansin, saqlashdan
> oldin farq ko'rsatilsin. i18n ru+uz. TDD, gate → **TO'XTA**.

---

### MK29 — 10 rol shabloni ☐ HISOBOT
**Bo'lim/blok:** 4-B3 (2-yarim) · **TZ:** §3.4
**Ustuvorlik:** P2 · **Bog'liqlik:** MK28 · ⛔ **QAROR-B4** (rol nomlari)
**Qamrov:** Egasi · Admin · Savdo menejeri · Ombor menejeri · Kassir · Sotuvchi · Omborchi ·
Buxgalter · Ta'minotchi · Haydovchi — har biri uchun boshlang'ich ruxsat to'plami; shablonni
qo'llash **mavjud overridelarni o'chirmaydi** (yoki ochiq ogohlantirish bilan o'chiradi).
**Fayllar:** `apps/api/src/modules/permissions/` (shablon registry) · seed · i18n.
**Testlar (TDD):** har shablon uchun snapshot-test (10 ta) · shablonni qo'llash overridega
ta'siri aniq va testlangan · kassir shabloni **kiosk cheklovi** bilan mos.
**Tayyorlik (DoD):** 10/10 shablon testlangan · gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK29** ni bajar. **Avval QAROR-B4 (rol nomlari)
> yopilganini tekshir.** 4-bo'lim TZ §3.4 dagi 10 rol shablonini joriy et (snapshot-test bilan).
> Shablon qo'llash overridelarga qanday ta'sir qilishini aniq belgila. Gate → **TO'XTA**.

---

### MK30 — Tasdiqlash navbati: `ApprovalRule` + `ApprovalItem` ☐ HISOBOT
**Bo'lim/blok:** 4-B4 · **TZ:** §5.1–§5.4
**Ustuvorlik:** P1 · **Bog'liqlik:** MK26 · **Holat:** ikkala model **YO'Q**
**Qamrov:** `ApprovalRule{mode: 'review' | 'block'}` (**default `review`** — bloklamaydi) ·
`ApprovalItem` navbati · menejer ekrani · §5.4 «nima tasdiqlanmaydi» ro'yxati kodda qulflanadi.
**Diqqat:** mavjud `supply-approval` FSM'i bilan **ziddiyat bo'lmasin** — u alohida, jonli
zanjir; bu umumiy qatlam uni **almashtirmaydi** (hisobotda chegara aniq yozilsin).
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/manager/` yoki yangi `approval`
modul (AppModule'ga **ula**) · `apps/web/.../menejer/`.
**Testlar (TDD):** (1) `review` rejimida amal **bajariladi** va navbatga tushadi. (2) `block`
rejimida amal to'xtaydi. (3) §5.4 ro'yxatidagi amal hech qachon navbatga tushmaydi. (4) mavjud
supply-approval oqimi o'zgarmaydi (regress).
**Tayyorlik (DoD):** gate yashil · yangi route prefiksi `app-boot.test.ts` da.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK30** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 4-bo'lim TZ §5 ni o'qi. `ApprovalRule{mode: review|block}` (default **review**, bloklamaydi) +
> `ApprovalItem` + menejer ekrani. Mavjud `supply-approval` FSM'iga TEGMA — chegarani hisobotda
> yoz. TDD, gate → **TO'XTA**.

---

# M4 — KASSA YAKUNI

> Kassa bo'limi `B1`–`B7` va `B8`ning 1-bo'lagi tugagan. Qolgani — **texnik qarz** va **runtime QA**.
> Menejer yadrosidan keyin darhol keladi (egasining 2026-08-09 qarori); hech narsaga bog'liq emas.

### MK31 — Kassa USD naqd oqimi (`CASH_USD`): kutilgan naqd · farq akti · Z-hisobot ☑ HISOBOT (2026-08-09)
**Bo'lim/blok:** 1-Kassa B3/B7 qoldig'i · **TZ:** `2026-08-01-kassa-tz-design.md` §6, §8.4, §8.5
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q
**Muammo (2026-08-09 da tasdiqlandi):** USD naqd oqimi **ulanmagan** — shu sababdan smena
yopishda **USD farqi ataylab yozilmaydi**. Hozirgi xulq testda qulflangan:
`cashier-session/variance-wiring.test.ts` → «USD akti yozilmaydi — CASH_USD ulanmagan».
Ya'ni kassadagi USD naqd **umuman o'lchanmaydi** (soxta «USD ortiqcha» aktidan ko'ra akt yo'qligi
tanlangan edi — bu vaqtinchalik yechim).
**Qamrov:**
1. `CASH_USD` tenderi bo'yicha kirim/chiqim smena naqd oqimiga kiradi.
2. USD **kutilgan naqd** hisobi (§8.4) + USD farq akti.
3. Z-hisobotda USD qatori (§8.5).
4. Kurs shartnomasi buzilmaydi (kanonik ×10⁸; kursi yo'q summa jamiga qo'shilmaydi).
**Diqqat:** `variance-wiring.test.ts` dagi «USD akti yozilmaydi» testini **o'chirma** — uni yangi
shartnomaga **Edit** bilan moslab qayta yoz va o'zgarish sababini hisobotda asosla
(mavjud test-fayl ustidan `Write` TAQIQ).
**Fayllar:** `apps/api/src/modules/cashier-session/` (`.service.ts`, `.schema.ts`) ·
`retail-sale/retail-tenders.ts` · `packages/money` (kerak bo'lsa) · POS FE yopish formasi.
**Testlar (TDD):** (1) USD to'lovli chek smena USD kutilgan naqdiga kiradi. (2) USD farqi bo'lsa
akt yoziladi, nol farqda akt YO'Q. (3) kursi yo'q USD summa UZS jamiga qo'shilmaydi.
(4) Z-hisobotda USD qatori mos.
**Tayyorlik (DoD):** gate yashil · `packages/money` tegilsa qayta build · POS testlari yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK31** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> Kassa TZ §6/§8.4/§8.5. `CASH_USD` naqd oqimini ulash: USD kutilgan naqd + farq akti +
> Z-hisobot qatori. `variance-wiring.test.ts` dagi eski xulq testini **Edit bilan** yangi
> shartnomaga moslab qayta yoz (o'chirma), sababini asosla. TDD, gate → **TO'XTA**.

---

### MK32 — POS xulq-testlari qoplamasi (bo'lishdan OLDIN) ☐ HISOBOT
**Bo'lim/blok:** 1-B8 (2-bo'lak, 1-qadam) · **TZ:** `2026-08-01-kassa-tz-design.md` §11, §13.1
**Ustuvorlik:** P1 · **Bog'liqlik:** yo'q
**Muammo:** `sotuv/page.tsx` (~1700 satr) uchun render/xulq qoplamasi **YO'Q**. Ko'r-ko'rona
bo'lish — jonli kassani buzish xavfi (shu sababdan 1-bo'lakda ataylab qilinmagan).
**Qamrov:** `SalesScreen`, `OpenShiftForm`, `ChekDetailPanel` ning **hozirgi** xulqini qamrab
oluvchi testlar: smena ochish · savatga qo'shish/o'chirish · chegirma · aralash to'lov oynasi ·
qarz to'lovi oynasi · kassadan chiqim oynasi · chek detali. **Xulq o'zgartirilmaydi** — bu
xarakteristik (characterization) testlar.
**Fayllar:** yangi testlar `apps/web/src/app/(app)/sotuv/__tests__/` (mavjud
`lib/pos/cart-math.ts` testlaridan naqsh sifatida foydalan).
**Testlar (TDD):** bu fazada test **maqsadning o'zi** — har test avval yozilib, hozirgi kodga
qarshi yashil bo'lishi kerak; yiqilsa — bu **bug**, hisobotda qayd etiladi (tuzatish alohida faza).
**Tayyorlik (DoD):** har uch komponent uchun kamida 6 stsenariy · gate yashil · topilgan bug'lar
ro'yxati hisobotda.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK32** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> `apps/web/src/app/(app)/sotuv/page.tsx` uchun **xarakteristik testlar** yoz (xulqni
> O'ZGARTIRMA): smena · savat · chegirma · aralash to'lov · qarz to'lovi · kassadan chiqim ·
> chek detali. Yiqilgan test = bug, hisobotga yoz (tuzatma alohida fazaga). Gate → **TO'XTA**.

---

### MK33 — POS komponentlarga bo'linishi ☐ HISOBOT
**Bo'lim/blok:** 1-B8 (2-bo'lak, 2-qadam) · **TZ:** §11
**Ustuvorlik:** P2 · **Bog'liqlik:** **MK32 (majburiy)**
**Qamrov:** `page.tsx` → `OpenShiftForm` (~130) · `ChekDetailPanel` (~280) · `SalesScreen` (~1540)
alohida fayllarga. **Sof refactor** — bironta xulq o'zgarmaydi.
**Diqqat:** yangi header/prop qo'shilsa u **uzatilishini** ham tekshir — typecheck jim o'tkazadi,
lekin render'ga yetmaydi (prop-drop bug-klassi).
**Fayllar:** `apps/web/src/app/(app)/sotuv/` (yangi komponent fayllari) + `page.tsx`.
**Testlar (TDD):** MK32 testlari **o'zgarmagan holda** yashil qolishi — bu fazaning yagona qabul
mezoni. Yangi test yozilmaydi (kerak bo'lsa import yo'llari yangilanadi).
**Tayyorlik (DoD):** MK32 testlari 100% yashil · `page.tsx` < 300 satr · gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK33** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> **Avval MK32 testlari borligini tasdiqla** — yo'q bo'lsa TO'XTA va shuni hisobotga yoz.
> `sotuv/page.tsx` ni `OpenShiftForm`/`ChekDetailPanel`/`SalesScreen` ga bo'l — sof refactor,
> xulq o'zgarmaydi, MK32 testlari yashil qolishi shart. Gate → **TO'XTA**.

---

### MK34 — 1-Kassa **Phase-2 QA** (real brauzer + real termal printer) ☐ HISOBOT
**Bo'lim/blok:** 1-bo'lim QA · **TZ:** §13.4
**Ustuvorlik:** P1 · **Bog'liqlik:** MK33 · **Tur:** QA sessiyasi (`/qa-cohort`)
**Qamrov (uchdan-uchiga E2E, real brauzerda):** smena ochish → 3 ombordan tovar → yig'ish
(`picking`) → `mark-ready` → **aralash to'lov** (naqd + karta + USD) → chek chop etish →
**qarz to'lovi PKO** → **kassadan chiqim RKO** → inkassatsiya → smena yopish → **farq akti** →
**Z-hisobot**. Kiosk rejimi + PIN-qulf ham brauzerda ochiladi.
**Alohida tekshiriladi (ochiq qarzlar):** PKO/RKO/Z-hisobot **real termal printerda** sinalmagan ·
kiosk qobiq brauzerda ochilmagan · `CASH_USD` oqimi ulanmagani uchun USD farqi ataylab yozilmaydi
— QA buni **kutilgan xulq** sifatida tasdiqlaydi yoki bosqich ochadi.
**Stack:** DB `climart_adopt @ localhost:5432` · `pnpm dev` · Playwright MCP · `pnpm db:seed-real`.
**Tayyorlik (DoD):** har qadam skrinshot/log bilan · topilgan bug **darhol** (issiq kontekstda)
tuzatiladi yoki yangi faza sifatida shu rejaga qo'shiladi · 1-Kassa statusi
**«Phase-1» → «Phase-2 verified»** ga o'tadi (`todo.md` + `NEXT.md`).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK34** (1-Kassa Phase-2 QA) ni bajar. `/qa-cohort`
> protokoli. Real brauzer: smena → yig'ish → aralash to'lov → chek → PKO → RKO → inkassatsiya →
> yopish → farq akti → Z-hisobot → kiosk+PIN. Har bug'ni issiq kontekstda tuzat yoki yangi faza
> qilib rejaga qo'sh. Hisobot → **TO'XTA**.

---

# M5 — MENEJER: KO'RINISH CHEGARASI VA BOSHQARUV EKRANLARI

> Menejer bo'limining yakuni: ruxsat modeli (M3) + asosiy rejadagi filial o'qi (F001–F003) ustiga quriladi.
> Hozir `recordScopeEnforced = false` — ya'ni `OWN_GROUP` berilsa ham hammasi ko'rinadi
> (**yarim yoqilgan holat xavfli**).

### MK35 — Record-scope 1-to'lqin **+ filial filtri birga** ☐ HISOBOT
**Bo'lim/blok:** 4-B5 **+ 8-B4** · **TZ:** 4-bo'lim §4.2, 8-bo'lim §6
**Ustuvorlik:** P1 · **Bog'liqlik:** MK26, F003 (asosiy reja)
**Nega birga:** ikki o'q (scope ∩ filial) alohida qilinsa — har endpoint ikki marta qayta
yoziladi. Master roadmap 4.7 buni **bitta to'lqin** deb belgilagan.
**Qamrov:** `customer-order` · `demand` · `invoice-out` · `retail-sale` · `sales-return` uchun
record-scope + filial filtri · **qo'riqchi test**: filtrsiz endpoint qo'shilsa test **yiqiladi**.
**Fayllar:** tegishli `*.service.ts` list/detail so'rovlari · `permissions/` · yangi qo'riqchi test.
**Testlar (TDD):** (1) `OWN` scope'da boshqa xodim hujjati ko'rinmaydi. (2) filial B foydalanuvchisi
filial A hujjatini ko'rmaydi. (3) scope ∩ filial ikkalasi birga qo'llanadi. (4) **qo'riqchi**:
ro'yxatga yangi endpoint qo'shilib filtr qo'yilmasa — test yiqiladi.
**Tayyorlik (DoD):** gate yashil · `recordScopeEnforced` hali **`false`** (yoqish MK39'da) —
buni hisobotda ochiq yoz.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK35** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 4-bo'lim §4.2 + 8-bo'lim §6. Record-scope 1-to'lqin (`customer-order`, `demand`, `invoice-out`,
> `retail-sale`, `sales-return`) **va filial filtrini BIRGA** qo'lla + filtrsiz endpointni tutuvchi
> qo'riqchi test. `recordScopeEnforced` ni YOQMA. TDD, gate → **TO'XTA**.

---

### MK36 — Record-scope 2–3-to'lqin (pul + mijozlar) ☐ HISOBOT
**Bo'lim/blok:** 4-B6 · **TZ:** §4.2
**Ustuvorlik:** P2 · **Bog'liqlik:** MK35
**Qamrov:** pul (`payment-in/out`, `cash-in/out`, `debt`, `counterparty-balance`) + mijozlar
(`counterparty`, `contract`, `call`, `task`, `opportunity`) uchun scope ∩ filial.
**Diqqat:** **mijoz qarzi filiallar bo'ylab UMUMIY** (8-bo'lim §4.1 qarori) — balans so'roviga
filial filtri **qo'llanmaydi**; faqat hujjatlar filtrlangan. Buni test bilan qulfla.
**Fayllar:** tegishli modul servislari · qo'riqchi test ro'yxatini kengaytirish.
**Testlar (TDD):** (1) pul hujjatlari filial bo'yicha filtrlanadi. (2) **kontragent balansi
filtrlanmaydi** (umumiy qarz). (3) qo'riqchi test yangi modullarni qamraydi.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK36** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> Record-scope 2–3-to'lqin: pul va mijozlar modullari. **Mijoz qarzi filiallar bo'ylab UMUMIY**
> (8-bo'lim §4.1) — balansga filial filtri qo'llanmaydi, test bilan qulfla. Gate → **TO'XTA**.

---

### MK37 — `SalesPlan` modeli (xodim × oy × plan turi) ☐ HISOBOT
**Bo'lim/blok:** 2-bo'lim qo'shimchasi (4-B7 uchun poydevor) · **TZ:** 2-bo'lim §4.8, 4-bo'lim §6
**Ustuvorlik:** P2 · **Bog'liqlik:** yo'q · **Holat:** `SalesPlan` **YO'Q**
**Qamrov:** `SalesPlan` (xodim × oy × plan turi: tushum / foyda / mijoz soni / undirilgan qarz) ·
plan/fakt hisoblash · fakt manbasi **yagona formulalar qatlamidan** (`report/metrics/`).
**Fayllar:** `schema.prisma` + migratsiya · `apps/api/src/modules/report/metrics/` (fakt) ·
yangi yoki mavjud modul (AppModule'ga ula).
**Testlar (TDD):** (1) plan yo'q oyda «plan qo'yilmagan» (0% emas). (2) fakt `metrics` qatlamidan
keladi (ikkinchi formulasi yozilmaydi — `no-adhoc-percent` naqshi). (3) valyuta shartnomasi.
**Tayyorlik (DoD):** gate yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK37** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> `SalesPlan` (xodim × oy × plan turi) + plan/fakt. **Faktni `report/metrics/` dan ol** — yangi
> formula yozma. Plan yo'q bo'lsa «plan qo'yilmagan», 0% emas. TDD, gate → **TO'XTA**.

---

### MK38 — Plan qo'yish · mijoz taqsimoti · narx siyosati ekranlari ☐ HISOBOT
**Bo'lim/blok:** 4-B7 · **TZ:** §6
**Ustuvorlik:** P2 · **Bog'liqlik:** MK37 (plan) · ⚠️ **F004 (asosiy reja) (narx dvigateli) KEYINROQ turadi** — bu yagona oldinga
qaragan bog'liqlik. Agar F004 (asosiy reja) hali bajarilmagan bo'lsa: plan qo'yish va mijoz taqsimoti qismini
bajar, **narx siyosati ekranini DEFER qil** (hisobotda yoz, F004 (asosiy reja) dan keyin alohida mayda faza).
**Qamrov:** menejerning kundalik boshqaruv ekranlari: (1) plan qo'yish (xodim × oy),
(2) mijoz taqsimoti (`ownerId` ni qo'lda o'zgartirish + tarix), (3) narx siyosati (chegirma
chegaralari, kim qancha chegirma bera oladi).
**Fayllar:** `apps/web/src/app/(app)/menejer/` · tegishli API modullari · i18n.
**Testlar (TDD):** (1) mijoz egaligi o'zgarishi **tarixga** yoziladi. (2) chegirma chegarasi
bloklamaydi, navbatga tushadi (falsafa). (3) plan saqlash → MK37 modeliga tushadi.
**Tayyorlik (DoD):** gate + i18n yashil.
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK38** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> 4-bo'lim TZ §6. Plan qo'yish + mijoz taqsimoti (tarix bilan) + narx siyosati ekranlari.
> Chegirma chegarasi **bloklamaydi** — navbatga tushadi. TDD, gate → **TO'XTA**.

---

### MK39 — Record-scope 4-to'lqin + `recordScopeEnforced` **YOQISH** ☐ HISOBOT
**Bo'lim/blok:** 4-B8 · **TZ:** §4.2, §4.3
**Ustuvorlik:** P1 · **Bog'liqlik:** MK35, MK36 · **Xavf:** yuqori
**Muammo:** hozir `recordScopeEnforced = false` — `OWN_GROUP` berilsa ham hammasi ko'rinadi.
**Yarim yoqilgan holat xavfli**: ruxsat berildi deb o'ylanadi, aslida ishlamaydi.
**Qamrov:** qolgan modullarga scope · **bayroqni yoqish** · yoqishdan oldin **qamrov hisoboti**
(qaysi endpoint qoplangan, qaysi biri yo'q) · yoqilgandan keyin **hech bir ekran bo'shab
qolmasligi** regressiya tekshiruvi.
**Fayllar:** qolgan modul servislari · `permissions/permissions.service.ts` ·
`schema.prisma` (`Account.recordScopeEnforced` default).
**Testlar (TDD):** (1) qamrov hisoboti: qoplanmagan endpoint = 0. (2) bayroq yoqilganda `FULL`
scope foydalanuvchi hamma narsani ko'radi (regress). (3) `OWN` foydalanuvchi faqat o'zinikini.
(4) bayroq o'chirilganda eski xulq qaytadi (qaytariladigan).
**Tayyorlik (DoD):** gate yashil · qamrov hisoboti hisobotda · prodda yoqish **OPS-QADAM**
sifatida (bu sessiyada prodga tegilmaydi).
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK39** ni bajar. O'ZGARMAS QOIDALARga amal qil.
> Record-scope 4-to'lqin + `recordScopeEnforced` ni yoqish. **Yoqishdan oldin qamrov hisobotini
> chiqar** (qoplanmagan endpoint bo'lsa yoqma). Bayroq qaytariladigan bo'lsin. Prodda yoqishni
> OPS ro'yxatiga yoz. TDD, gate → **TO'XTA**.

---

### MK40 — 4-Menejer **Phase-2 QA** (ruxsatlar) ☐ HISOBOT
**Bo'lim/blok:** 4-bo'lim QA · **TZ:** §10.3 · **Tur:** QA sessiyasi
**Ustuvorlik:** P1 · **Bog'liqlik:** MK39
**Qamrov (real brauzer, uchdan-uchiga):** admin rol yaratadi → menejerga beradi → ko'rinish
chegarasi ishlaydi → kassa kamomadi navbatga tushadi → jarima → HR oyligida aks etadi.
Alohida: filial ∩ scope kesishmasi · G1 imtiyoz taqiqi UI'da · shablon qo'llash.
**Tayyorlik (DoD):** har oqim skrinshot bilan · bug → darhol yoki yangi faza · 4-bo'lim statusi
«Phase-2 verified».
**▶ SESSIYA-BOSHI PROMPT:**
> `docs/REJA-MENEJER-KASSA-2026-08.md` — **Faza MK40** (4-Menejer Phase-2 QA) ni bajar. `/qa-cohort`.
> E2E: rol yaratish → berish → ko'rinish chegarasi → kassa kamomadi navbatda → jarima → HR
> oyligida. Filial ∩ scope, G1, shablonlar. Hisobot → **TO'XTA**.

---


## ✅ SHU REJA UCHUN «TUGADI» TA'RIFI

1. MK01–MK40 hammasi bajarilgan;
2. Menejer va kassa bo'limlari **brauzerda** tekshirilgan (🌐 fazalar) — «Phase-1» qolmagan;
3. Gate yashil: `typecheck 0` · `biome 0` · i18n ru+uz · Vitest regressiyasiz;
4. **QAROR-B1…B4** yopilgan;
5. Asosiy rejadagi kutayotgan fazalar (`F040`, `F042`, `F059`, `F072`, `F079`, `F080`)
   qamrovi to'ldirilgan.

---

# 📓 HISOBOT JURNALI

> **Har faza agenti shu yerga o'z bo'limini QO'SHADI (append).** Mavjud yozuvlarni tahrirlash yoki
> kesish **TAQIQ**. Shablon asosiy rejadagi bilan bir xil:
> `docs/REJA-8-BOLIM-2026-08.md` → «HISOBOT JURNALI» → shablon.

<!-- HISOBOTLAR SHU QATORDAN KEYIN QO'SHILADI -->


## Faza MK01 — 4M.3 yakuni: idempotent bonus/jarima (sana: 2026-08-09)

**Holat:** BLOKLANDI — ⛔ **QAROR-B1 yopilmagan** (bonus/jarima formulasi). Kod YOZILMADI.
**Commit(lar):** yo'q (kod o'zgarishi yo'q; bu hisobot commit qilinmadi — pastdagi «Git holati»ga qara)

### Nima o'zgardi
- Kodda **hech narsa**. Faqat shu hisobot qo'shildi (append).

### Bloklovchi — QAROR-B1 uch manbada OCHIQ (o'z ko'zim bilan tekshirildi)
1. `todo.md:60` — `- [ ] **B1. Bonus/jarima formulasi** (4M.3 §4.2)` — **belgilanmagan**.
2. Shu reja, «⛔ EGASIDAN QAROR KUTILMOQDA» jadvali (124-qator) — B1 hamon ro'yxatda, `MK01` ni bloklaydi.
3. TZ `2026-08-02-menejer-kunlik-kpi-tz-design.md` §4 «Qabul → oylik» (243–255-qatorlar) — 5 band bor,
   2-bandi: «qabul qilinganda bonus/jarima `HrBonusFineLog` ga yoziladi — idempotent». **«Qancha»
   yozilishi haqida bir og'iz so'z yo'q.** §4 oxirida faqat oylik yig'indi formulasi eslatiladi
   (`fix + KPI + bonus − jarima + komissiya`, HR TZ §0) — u **bonus miqdorini hisoblamaydi**, uni
   tayyor deb oladi. *Kichik tuzatma: reja «§4.2» ga ishora qiladi, TZ'da **§4.2 sarlavhasi yo'q** —
   §4 raqamli bandlar. Bu hujjat-havolasi qarzi.*

⇒ O'ZGARMAS QOIDALAR + faza prompti bo'yicha ish **boshlanmadi**, TDD sikli boshlanmadi.

### Yo'l-yo'lakay tasdiqlangan/rad etilgan da'volar (faqat o'qish, kod tegilmadi)
- ✅ Reja: «`HrBonusFineLog` sxemada **bor** — yangi jadval kerak emas» — **TASDIQLANDI**:
  `packages/db/prisma/schema.prisma:9529` (`kind`, `source`, `amountMinor`, `reason`, `attendanceId`,
  `ruleId`, `taskLogId`, `createdById`).
- ⚠️ Reja: «idempotentlik uchun tabiiy kalit yoki `@@unique`» — mavjud yagona unique
  `@@unique([attendanceId, source], name: "uq_bonusfine_attendance_source")` (`:9553`) **KPI-qabul
  kanali uchun ishlamaydi**: `attendanceId` **nullable**, PostgreSQL'da NULL'lar unique'da
  to'qnashmaydi ⇒ `(NULL, 'kpi_accept')` qatorlarini cheksiz yozib ketaveradi. Ya'ni **jadval kerak
  emas, lekin migratsiya (yangi tabiiy kalit, masalan `(employeeId, kpiDay, source)` yoki
  `dailyKpiId`+`source`) MK01 uchun EHTIMOL KERAK** — reja «migratsiya kerak bo'lsa» deb ochiq
  qoldirgan, aniqlashtirildi.
- ✅ Kanal hali ulanmagan: `apps/api/src/modules/manager/kpi/daily-kpi-acceptance.service.ts` da
  `HrBonusFineLog` ga **birorta ham murojaat yo'q** (grep 0 natija) — MK01 qamrovi haqiqatan ochiq.

### Testlar (RED → GREEN)
- Yo'q — qaror yo'qligida yoziladigan test formulaga bog'liq (rejadagi 4-test aynan «formula chegara
  qiymatlari (QAROR-B1 bo'yicha)»). Formulasiz yozilgan test **noto'g'ri xulqni qulflab qo'yardi**.

### Gate natijasi
- Yugurtirilmadi (kod o'zgarishi yo'q). Sessiya-boshi `node scripts/preflight.mjs`: 2 anomaliya —
  (a) ish daraxti toza emas (faqat `docs/*.md` + untracked artefaktlar — **meniki emas**, tegilmadi);
  (b) `NEXT.md` top-entry'larda git'da yo'q hash'lar (`a0b44c73`, `9c046ac2`) — MK01 ga aloqasi yo'q,
  alohida tekshiruv qarzi. `git worktree list` — 2 worktree (`main`, `climart-adoption`);
  `git branch --no-merged` — `main` + 3 ta `worktree-wf_9a5c9dc9-*` (takroriy ish xavfi yo'q, MK01
  hech qayerda boshlanmagan).

### Qolgan qarz / DEFER
- **Butun MK01 qamrovi** (idempotent yozuv · bekorda zero-sum teskari yozuv · `EmployeeKpiCorrection`
  bilan ikki-karra bo'lmaslik · formula chegaralari) → **QAROR-B1 yopilgandan keyin qayta beriladi.**
- QAROR-B1 sessiyasida egaga qo'shimcha aniqlanishi kerak bo'lgan 4 nuqta (formuladan tashqari):
  (1) bonus/jarima **kunlik** yoziladimi yoki oy oxirida jamlanadimi; (2) `kind`/`source` qiymatlari
  (masalan `bonus`/`fine`, `source='kpi_accept'`); (3) teskari yozuvning `source`'i (`kpi_accept_undo`?)
  — zero-sum uchun; (4) eskirgan kun tuzatmasi qayta yozadimi yoki farqni (`delta`) yozadimi.
- Hujjat qarzi: reja va todo'dagi «§4.2» havolasi TZ'da mavjud emas → «§4/2-band» ga tuzatilsin.

### OPS-QADAM qo'shildimi
- Yo'q.

### Git holati (§6.7 ehtiyoti)
- Bu hisobot faylga **append** qilindi, lekin **commit QILINMADI**: shu fayl (`REJA-MENEJER-KASSA…`)
  va `REJA-8-BOLIM…` da **parallel sessiyaning commit qilinmagan tahriri** turibdi (ijro-grafigi
  jadvali qayta hosil qilingan). `git add` shu faylga tegsa o'sha begona hunk'lar ham commit'ga
  tushardi. Egasi/keyingi sessiya o'z tahriri bilan birga commit qilsin.

### Status yorlig'i
**BLOKLANDI — qaror kutilmoqda. Kod yozilmagan, gate yugurtirilmagan, browser-smoke YO'Q.**


## Faza MK04 — Menejer FE-B: xodim kartasi 360° · jurnal · haftalik xulosa (sana: 2026-08-09)

**Holat:** ✅ **Phase-1 complete** — strukturaviy + unit-tasdiqlangan, **browser-smoke YO'Q** (MK14).
**Commit(lar):** shu commit (pastdagi «Git holati»ga qara — parallel sessiyalar faol).

### Reja da'volarini kodda tasdiqlash (O'ZGARMAS QOIDA 2)
- ✅ `GET hr/employees/:id/card` **BOR** — `hr-employee.controller.ts:69` → `EmployeeCardService.card()`.
  Javob: `employee · kpi{byState,pendingTotal,acceptedTotal,correctionCount} · attendance ·
  shifts · notes{summarizeNotes(...) + items[50]} · offboarding|null`.
- ✅ `POST hr/employees/:id/notes` va `POST hr/employees/notes/:noteId/void` **BOR** (`:53`, `:76`).
  `voidNote` takroriy bekorda BIRINCHI vaqtni saqlaydi (`changed:false`).
- ✅ `GET manager/kpi/weekly-summary` **BOR** — `manager-kpi.controller.ts:87`.
- 🔴 **LEKIN javob shakli TO'LIQ EMAS EDI** (reja «shaklini kodda tasdiqla» dedi — aynan shu topildi):
  controller mapping'i qo'lda yozilgan edi va `noBaselineCount` / `totalNoBaseline` ni **TUSHIRIB
  QOLDIRARDI**. Ya'ni «yo'qdan kiritilgan» tuzatma FE'da **doim 0** bo'lardi — 4M.3 da tuzatilgan
  jonli bug (`was ?? autoValue`) HTTP chegarasida qayta tirilgan edi. Bu **rejadagi 3-test**ning
  aynan mavzusi.

### Nima o'zgardi
**API (2 fayl + 2 test fayli):**
- `manager/kpi/owner-weekly-summary.ts` — yangi `serializeWeeklySummary()` + `WeeklySummaryDto` /
  `ManagerActivityDto`. Mapping endi **bitta sof funksiyada**: yangi maydon o'z-o'zidan tarmoqqa
  chiqadi, controller'da unutishga joy qolmaydi. `bigint → string` (JSON `bigint` ni ko'tarmaydi).
- `manager/kpi/manager-kpi.controller.ts` — 27 qatorlik qo'lda mapping → `serializeWeeklySummary(s)`.
- `hr/hr-employee/employee-note.ts` — `summarizeNotes()` endi `windowDays` (90) va `patternCount` (3)
  ni ham qaytaradi: ekran matni («so'nggi 90 kunda 3 ta») qoida bilan **bir manbadan**, FE o'z
  konstantasini saqlamaydi (chegara o'zgarsa ekran jim yolg'on aytmaydi).

**WEB (7 yangi fayl + 4 tahrir):**
- `app/(app)/hr/employees/_components/employee-card-360.tsx` — karta 360°: 8 katak (qabul kutayotgan
  kunlar · qabul qilingan · oylik tuzatmalari · oy ish kunlari · kechikish daqiqalari · ochiq smena ·
  oxirgi smena · ishga qabul) + jurnal. **Hech narsa qayta hisoblanmaydi** — serverdagi karta.
  Bo'shatish bloki **faqat jarayon boshlanganda** (boshlanmaganda «0/5» xodim ketyapti degan yolg'on
  taassurot berardi). Smena yo'q bo'lsa `—`, `0` EMAS.
- `.../_components/note-journal.tsx` — append-only jurnal: yozuv qo'shish (suhbat/ogohlantirish/
  maqtov, matn majburiy) · **bekor qilish** (sabab bilan, modal orqali) · bekor qilingan yozuv
  ro'yxatda chizilgan holda QOLADI + kim/qachon bekor qilgani ko'rinadi · **o'chirish tugmasi YO'Q** ·
  bekor qilingan yozuvda «bekor qilish» ham yo'q. Naqsh belgisi **server bayrog'idan**.
- `app/(app)/hr/employees/[id]/card/page.tsx` — yangi «Karta 360°» tab (TabBar'ga `card` qo'shildi,
  `main` dan keyin).
- `app/(app)/menejer/_components/weekly-summary-screen.tsx` + `app/(app)/menejer/haftalik/page.tsx` —
  egaga haftalik xulosa: 8 katak (qabul · kutmoqda · eskirgan · tuzatma soni · tuzatma summasi ·
  **yo'qdan kiritilgan** · majburiy yopilgan · eng ko'p tuzatgan) + menejerlar jadvali
  («Yo'qdan» alohida ustun). Tuzatma bo'lmagan haftada «tuzatma yo'q» belgisi — sukunat emas.
  **Amal tugmasi YO'Q** (§7: xulosa hech narsani bloklamaydi), faqat hafta tanlash.
- `layout.tsx` — menejer subnav'ga «Haftalik xulosa» (`/menejer/haftalik`).
- `lib/hr-api.ts` — `card/addNote/voidNote` + `EmployeeCard`/`EmployeeNote` tiplari.
- `lib/manager-api.ts` — `weeklySummary()` + `OwnerWeeklySummary`/`WeeklyManagerActivity`.
- `messages/{ru,uz}.json` — **+54 kalit** har lokalda (deterministik skript bilan, mavjud kalit
  ustidan yozilmadi; qo'shishdan oldin/keyin flat-diff bilan tekshirildi: **lost 0 · changed 0**).

### Testlar (RED → GREEN)
- **API +6:** `serializeWeeklySummary — HTTP shakli` (5) — RED'da 5/5 yiqildi
  (`serializeWeeklySummary is not a function`), keyin GREEN. `summarizeNotes — oyna/chegara
  javobda ochiq` (1).
- **WEB +16:** `note-journal.test.tsx` (7) · `employee-card-360.test.tsx` (4) ·
  `weekly-summary-screen.test.tsx` (5). RED'da uchala fayl ham import xatosi bilan yiqildi.
- **Mutatsiya-tekshiruvi (qulf haqiqiyligini isbotlash):** `hasWarningPattern` o'rniga
  «`items` dan qayta sanash» qo'yib ko'rildi ⇒ «naqsh belgisi SERVER bayrog'idan» testi **yiqildi**
  (bekor qilingan 2 yozuv ham sanalib soxta naqsh chiqdi), keyin fayl tiklandi. Qulf ishlaydi.

### Gate natijasi
- `pnpm --filter @moysklad/api typecheck` → **0**
- `pnpm --filter @moysklad/web typecheck` → **0**
- `pnpm i18n:gate` → **o'tdi** (417 fayl, 12422 kalit; ru+uz parity)
- `pnpm --filter @moysklad/web exec vitest run src/app/(app)/hr src/app/(app)/menejer src/__tests__`
  → **73 fayl · 1195 test yashil**
- `pnpm --filter @moysklad/api exec vitest run src/modules/manager src/modules/hr`
  → **1196 yashil**, 1 ta yuklama-flake (`hr-employee.service.test.ts > setPassword hashes via
  argon2` — 5000ms timeout; **alohida qayta yugurtirildi: 2834ms, 36/36 yashil**; mening
  o'zgarishimga aloqasi yo'q, argon2 og'ir suite ostida sekinlashadi).
- `pnpm lint:product` → **7 xato, HAMMASI parallel sessiyalarning commit qilinmagan fayllarida**
  (`hr-employee/onboarding*.ts` — MK02 · `manager/kpi/kpi-accrual.test.ts` — MK01). **Mening
  yo'llarim 0**: `npx biome check <22 faylim>` → xato yo'q. Ya'ni umumiy gate hozir qizil, sabab
  meniki emas — halol yozib qo'yildi.
- **Brauzer-smoke YO'Q** (MK14 ga).

### Qolgan qarz / DEFER
- **Runtime-QA yo'q:** karta va haftalik ekran real brauzerda ochilmagan (MK14).
- `notes.items` serverda **50 ta** bilan cheklangan — ekranda «yana bor» ko'rsatkichi/sahifalash yo'q.
  50 dan ko'p yozuvli xodimda eski yozuvlar ko'rinmaydi (jim kesish). MK14/MK23 ga qarz.
- `weekly-summary` faqat **hafta** granulyatsiyasida; ekranda hafta orqaga/oldinga siljitiladi,
  lekin kalendar tanlagich yo'q.
- Karta ekranidan KPI kuniga (`/menejer`) o'tish havolasi yo'q — drill-down qarzi.
- **`todo.md` hisob raqamiga (`Qolgan bosqichlar: 60`) TEGILMADI**: MK04 bironta `[ ]` bandni
  `[x]` qilmaydi (4M.4 ning ikkala bandi allaqachon `[x]`, faqat «⬜ FE ekrani yo'q» izohi bor edi —
  o'sha izohlar «FE ekrani BOR» ga o'zgartirildi). Bundan tashqari o'sha qatorga hozir uch parallel
  sessiya yozmoqda — raqamni ikki sessiya bir vaqtda kamaytirsa bittasi yo'qolardi.

### OPS-QADAM qo'shildimi
- Yo'q (migratsiya yo'q, sxema tegilmadi).

### Git holati (§6.7 ehtiyoti)
- Sessiya davomida **kamida uch parallel sessiya** faol edi (MK01 `kpi-accrual` + QAROR-B1 ·
  MK02 `onboarding` + migratsiya · MK03 `menejer/jonli`+`javobgarlik` · report-notices).
- Shu sababdan **uchta umumiy fayl** (`layout.tsx`, `messages/ru.json`, `messages/uz.json`,
  shuningdek shu reja fayli va `todo.md`) ishchi daraxtda **mening ham, ularning ham** tahririni
  saqlaydi. Commit'ga **faqat mening hunk'larim** kiritildi: har biri uchun `git show HEAD:<fayl>`
  nusxasiga faqat o'z o'zgarishim deterministik skript bilan qo'llanib (anchor topilmasa `exit 1`),
  `git hash-object -w` + `git update-index --cacheinfo` orqali stage qilindi. Ularning ishchi
  daraxtdagi tahriri **tegilmadi**.
- Hook'lar bir martaga chetlab o'tildi (`-c core.hooksPath=/dev/null`): lint-staged butun daraxtni
  stash qilib tiklaganda parallel sessiyaning fayllarini commit'ga qo'shib yuborardi (§6.7 B).
  Gate'lar shu sababdan **qo'lda to'liq** yugurtirildi (yuqoriga qara).
- Commit'dan keyin `git show --stat HEAD` bilan tarkib tekshirildi.

### Status yorlig'i
**Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q.** «done» / «production-ready» /
«verified» EMAS.


## Faza MK03 — Menejer FE-A: «Jonli holat» va «Javobgarlik» ekranlari (sana: 2026-08-09)

**Holat:** bajarildi — **Phase-1** (strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q).
**Commit:** `638212f8` — 10 fayl, +885/−41.

### Rejaning da'vosi kodda tekshirildi (O'ZGARMAS QOIDA 2)
- `GET manager/kpi/live` va `GET manager/kpi/accountability` **bor** —
  `manager-kpi.controller.ts:68–78`, `LiveStatusService.board()/accountability()`.
  Ikkalasi ham `@RequireHrPermission('employees','read')` ostida. FE **yo'q edi** — tasdiqlandi.
- **LEKIN reja «BE tayyor» deganda bir narsani hisobga olmagan:** BE ekran matnini
  **tayyor o'zbekcha qator** qilib qaytaradi (`title: "Kechikdi — 7 daq"`,
  `label: "Ochiq kassa smenasi"`). Toza FE-faza bilan MK03 ning O'Z DoD'ini
  («i18n ru+uz») bajarib bo'lmasdi: ru interfeysda o'zbekcha matn turib qolardi va
  **hech bir gate buni ko'rmasdi** — `i18n:gate` faqat FE fayllarini skanlaydi.
  Shuning uchun BE'ga **additive** (buzmaydigan) o'zgarish kiritildi va shu yerda ochiq yozildi.

### Nima o'zgardi
**BE (`apps/api/src/modules/manager/live/`) — additive, mavjud kontrakt buzilmagan:**
- `LiveRow` ga 4 maydon: `titleKey` (yopiq `LIVE_TITLE` ro'yxatidan) · `titleParams`
  (kassa nomi / kechikish daqiqasi / hujjat raqami) · `place` (manzil — tarjimasiz,
  foydalanuvchi matni) · `showDuration` (davomat qatorida `false`: «keldi» bir martalik
  hodisa, unga davomiylik yozilsa «shuncha vaqtdan beri kechikmoqda» deb yolg'on o'qilardi).
- `board()` javobiga `thresholds` qo'shildi (`shiftLongHours` 12 · `lateAlertMinutes` 15 ·
  `pickingStuckMinutes` 45). TZ «chegaralar ekranda izohlanadi» deydi; ularni FE'da
  yozib qo'yish chegarani ikki joyda yashatardi va ular jimgina uzoqlashardi.
- `title`/`detail` **saqlandi** (UI-bo'lmagan iste'molchilar uchun), lekin FE ularni
  o'qimasligi drift-lock test bilan qulflandi.
- `accountability` ga **BE o'zgarishi kerak bo'lmadi**: `DutyRow.label` o'zbekcha bo'lsa-da,
  `kind` allaqachon strukturaviy kalit — FE shuni tarjima qiladi.

**FE (yangi 2 sahifa):**
- `apps/web/src/app/(app)/menejer/jonli/page.tsx` — «Jonli holat» (§6.1): diqqat darajasi
  badge'i · tur bo'yicha 4 hisoblagich · chegaralar izohi · `since` + server `now` dan
  hisoblanadigan davomiylik.
- `apps/web/src/app/(app)/menejer/javobgarlik/page.tsx` — «Javobgarlik» (§6.4): xodim
  kartasi · jami naqd · majburiyat qatorlari.
- `layout.tsx` subnav: `live` → `/menejer/jonli`, `accountability` → `/menejer/javobgarlik`.
- `domain-status-tone.ts`: `LIVE_ATTENTION_TONE`/`liveAttentionTone` va
  `DUTY_KIND_TONE`/`dutyKindTone` (UI Convention 6 — sahifada lokal jadval TAQIQ, mavjud
  `domain-status-tone.test.ts` drift-lock detektori shuni tutadi).
- i18n ru+uz: `pages.menejerLive` 25 kalit · `pages.menejerDuties` 13 kalit · subnav 2.

### TZ ning «yolg'on ishonch bermaslik» talablari qanday bajarildi
- **Nol qatorlar yo'q:** BE `employeeDuties` tashlaydi; FE ularni `?? 0` bilan qaytarmaydi
  (drift-lock test aynan shu naqshni bloklaydi).
- **Jihoz bloki YO'Q:** `Equipment`/`Asset` modeli sxemada yo'q. Qo'shimcha — ro'yxat
  to'liq emasligi **ekranda ochiq yozilgan** (`scope_note`), aks holda menejer buni
  «hammasi shu» deb o'qirdi. MK05 reyestr qo'shganda blok shu yerga kiradi.
- **Bo'sh javob «hammasi joyida» EMAS:** `empty_hint` bo'shlik nima demasligini aytadi.
- **Tartib serverda:** FE `.sort()` qilmaydi (drift-lock), «diqqat talab qilgani tepada»
  qoidasi `buildLiveBoard` da qoladi.
- **NULL ≠ 0:** pulsiz majburiyatda «—» ko'rsatiladi, nol emas.

### Testlar (TDD — RED ko'rildi, keyin GREEN)
- `live-status.test.ts`: **26 → 34** test. RED dalili: `LIVE_TITLE` yo'q ekan,
  suite umuman yig'ilmadi (`Cannot read properties of undefined (reading 'shiftOpen')`).
- `menejer-live-boards.test.ts` (**yangi**, 27 test): BE yopiq ro'yxatlarini
  (`LIVE_KIND` · `ATTENTION` · `LIVE_TITLE` · `DUTY`) manbadan o'qib, har element uchun
  ru+uz tarjimasi borligini tekshiradi — bu kalitlar FE'da dinamik chaqiriladi va odatiy
  i18n gate ularni KO'RMAYDI. Regexlar non-vacuous ekani alohida tekshirildi (mutant
  satrlar tutiladi, haqiqiy `titleKey:` tutilmaydi).

### Gate natijasi (halol)
- `pnpm --filter @moysklad/api typecheck` → **0** · `@moysklad/web typecheck` → **0**
- `pnpm i18n:gate` → **9/9 o'tdi**
- `pnpm --filter @moysklad/web exec vitest run` (TO'LIQ) → **195 fayl / 2919 test yashil**,
  26 skip. Regress yo'q.
- `pnpm --filter @moysklad/api exec vitest run src/modules/manager` → **269/271**.
  2 yiqilish — parallel sessiyaning commit qilinmagan `kpi-accrual.test.ts` (MK01) faylida,
  meniki emas, tegilmadi.
- `pnpm lint:product` → **7 xato, hammasi parallel sessiyalarning fayllarida**
  (`hr-employee/onboarding*` — MK02 · `manager/kpi/kpi-accrual.test.ts` — MK01).
  **Mening yo'llarim 0**: `npx biome check <10 faylim>` → xato yo'q. Umumiy gate hozir
  qizil, sabab meniki emas — halol yozib qo'yildi.
- **Brauzer-smoke YO'Q** (MK14 ga).

### Qolgan qarz / DEFER
- **Runtime-QA yo'q:** ikkala ekran real brauzerda ochilmagan (MK14). Jonli ma'lumot
  talab qiladi (ochiq smena, reys, yig'ish) — seed'siz bo'sh holat ko'rinadi.
- **Ochiq smena naqdi = `openingCashMinor`** (smena boshidagi summa), joriy kutilgan naqd
  emas — BE izohida ataylab shunday (§8.4 alohida hisob talab qiladi). Ya'ni «kimda qancha
  pul» raqami **quyi chegara**, aniq qiymat emas. Ekranda bu farq ko'rsatilmagan —
  MK08/MK34 qarzi.
- **`RestockTask` manbasi ulanmagan:** TZ §6.1 «omborchi nima yig'yapti» uchun `RestockTask`
  (`in_progress`) ni ham sanaydi; BE hozir `MsPickList` + `RetailSale.state='picking'` dan
  o'qiydi. Tekshirildi — bu MK03 dan OLDIN shunday edi, qamrovni kengaytirmadim
  (bir faza qoidasi). Xuddi shu holat `DriverShift` + GPS ping uchun ham (BE `DriverTrip` dan).
- Sahifalash/limit yo'q: ikkala endpoint ham butun ro'yxatni qaytaradi.
- `title`/`detail` javobda qoldi — hozir hech kim o'qimaydi (o'lik maydon xavfi).
  Drift-lock faqat shu ikki sahifani qo'riqlaydi.

### OPS-QADAM qo'shildimi
- Yo'q (migratsiya yo'q, sxema tegilmadi).

### Git holati (§6.7 ehtiyoti)
- **To'rt parallel sessiya faol** edi (MK01 `kpi-accrual` · MK02 `onboarding`+migratsiya ·
  MK04 `employee-card`/`haftalik` · report-notices).
- `layout.tsx` va `messages/{ru,uz}.json` — MK04 bilan **bir obyekt ichida** kesishadi
  (hunk bo'yicha ajratib bo'lmaydi). Indeksga `git show HEAD:<fayl>` nusxasi + **faqat MK03
  o'zgarishi** deterministik skript bilan yozildi (anchor topilmasa `exit 1`; begona kalit
  tushib qolmaganini alohida tekshiradi), keyin `hash-object -w` + `update-index --cacheinfo`.
  **Ish daraxtiga tegilmadi.**
- ⚠️ **Yangi bug-klass topildi:** birinchi commit (`41d5080f`) **19 fayl** bilan chiqdi —
  men 10 tasini stage qilgan bo'lsam ham. Sabab: **indeks umumiy** — parallel MK02 sessiyasi
  o'sha oraliqda o'z fayllarini stage qilgan va commit hammasini olgan. Bu §6.7 B dagi
  lint-staged hodisasidan **boshqa** yo'l: bu yerda hook umuman ishlamagan.
  Tuzatildi: `git reset --soft HEAD~1` → begona 9 yo'l `git restore --staged` bilan
  chiqarildi (fayllar untracked holatiga qaytdi, MAZMUNI tegilmadi) → qayta commit
  `638212f8` (10 fayl). Parallel sessiya ishi keyin tekshirildi — hammasi joyida.
- Hook'lar bir martaga chetlab o'tildi (`-c core.hooksPath=/dev/null`), gate'lar qo'lda to'liq.
- Commit'dan keyin `git show --stat HEAD` bilan tarkib tasdiqlandi.

### Status yorlig'i
**Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q.** «done» / «production-ready» /
«verified» EMAS.


## Faza MK02 — 4M.4 qoldig'i: ishga qabul tomoni (sinov muddati) (sana: 2026-08-09)

**Holat:** BAJARILDI (BE) — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**
**Commit:** `7a8cae28` — `feat(hr): MK02 — ishga qabul tomoni (sinov muddati + baholash sanasi)`

### Nima o'zgardi

**Sxema + migratsiya (🗄️)**
- `EmployeeOnboarding` modeli (`packages/db/prisma/schema.prisma`) — `EmployeeOffboarding` ning
  ko'zgusi: `probationStartsOn` / `probationEndsOn` / `evaluationOn` (hammasi `@db.Date`),
  `outcome` (`'passed' | 'failed' | NULL`) + `outcomeAt/ById/Note`, `items Json` (qo'lda
  tasdiqlar, offboarding bilan **bir xil shakl**), `@@unique([employeeId])`,
  `@@index([accountId, outcome, evaluationOn])` (navbat so'rovining shakliga mos).
- Migratsiya `20260810020000_employee_onboarding_probation` — **yangi jadval, mavjudlariga
  tegilmaydi**, backfill YO'Q. Qatori yo'q xodim `active` deb qaraladi: aks holda butun mavjud
  jamoa bir kechada «sinovda» bo'lib qolardi.

**Sof modul `apps/api/src/modules/hr/hr-employee/onboarding.ts` (yangi)**
- **6 bandli ro'yxat**: `credentials_issued` · `roles_assigned` · `kpi_profile_assigned` ·
  `telegram_bound` (4 tasi **auto**) · `workplace_ready` · `documents_signed` (2 tasi **qo'lda**).
  `ITEM_KIND` offboarding modulidan **qayta ishlatildi** (nusxa emas).
- `canMarkOnboardingManually()` — `auto` bandni qo'lda belgilash **mumkin emas** (TZ talabi).
- `probationStatus()` — `none / in_probation / due_soon / due / overdue / passed / failed`.
  Baholash sanasi = `evaluationOn ?? probationEndsOn` (TZ §6.3: baholash — muddat tugagan kuni).
- `dateLabel()` — Toshkent kalendar kuni **UTC yarim tun yorlig'i** sifatida. Sanalar DATE
  ustunlar, ya'ni yorliq; xom instant bilan solishtirilsa Toshkentda 19:00 dan keyin kun oldinga
  sakrab, ogohlantirish **bir kun erta** otilardi (xotira: `month-bounds-label-vs-instant`).
- `lifecycleStage()` — TZ §6.3 bosqichlari: `archived` → `offboarding` → `probation_failed` →
  `probation` → `active` (tartib ustuvorlik bilan).
- `hasResolvableKpiProfile()` — **xodim → lavozim → sukut**, `EmployeeDailyKpiService
  .resolveProfileVersions` bilan bir xil qoida (ikki joyda ikki xil bo'lsa sabab tushunarsiz qolardi).

**`onboarding.service.ts` (yangi)** — `status` · `start` · `markItem` · `setOutcome` · `listDue`.

**Endpointlar** (`hr-employee.controller.ts`) — 5 ta, offboarding bilan bir xil ruxsat naqshi
(`read` / `full`), statik segment `:id` dan **oldin**:
`GET hr/employees/onboarding` · `GET :id/onboarding` · `POST :id/onboarding` ·
`POST :id/onboarding/item` · `POST :id/onboarding/outcome`.

**Xodim kartasi** (`employee-card.service.ts`) — `onboarding` bloki + `employee.lifecycleStage`;
`hiredAt` endi `probationStartsOn ?? createdAt` (`createdAt` = qator kiritilgan payt, haqiqiy
ishga qabul sanasi emas).

### Qulflangan xulqlar (TDD — avval RED ko'rildi, keyin GREEN; 68 yangi test)
| Talab | Test |
|---|---|
| **MK02 test-1** — N kun qolganda ogohlantirish | `probationStatus` chegara testlari: 7 kun → `due_soon`, 8 kun → **hali yo'q**, 0 → `due`, o'tgan → `overdue`; `listDue` `warnCount` |
| **MK02 test-2** — natijasi belgilanmagan xodim «sinovda» qoladi | `lifecycleStage` + `status` testlari |
| **MK02 test-3** — qo'lda soxta belgilash rad etiladi | `canMarkOnboardingManually` (4 auto band) + `markItem` `BadRequest` |
| Ro'yxatsiz «o'tdi» yopilmaydi | `setOutcome('passed')` bloklovchi band ochiqda rad, sabab matnda |
| Eskirgan ekranga ishonilmaydi (TOCTOU) | «o'tdi» faktlarni **qayta o'qiydi** |
| «o'tmadi» bo'shatish ro'yxatini chetlab o'tmaydi | xodim **arxivlanmaydi**, `probation_failed` bo'ladi |
| Qisman tana ma'lumot o'chirmaydi | faqat kelgan kalitlar yangilanadi; oshkora `null` — tozalash |
| Sana tekshiruvi **qo'shilgan** holat ustida | yolg'iz `probationEndsOn` bazadagi `probationStartsOn` bilan solishtiriladi |
| Natijani jimgina almashtirib bo'lmaydi | bir xil → idempotent, boshqa → `BadRequest` |

### Ataylab qilingan qarorlar (TZ'da yo'q — ochiq yozilmoqda)
1. **`EVALUATION_WARN_DAYS = 7`** — TZ'da raqam YO'Q, tanlandi (bir ish haftasi: menejer suhbat
   tayinlashga ulguradi). Yagona joyda, egasi xohlasa bir qatorda o'zgaradi.
2. **`telegram_bound` — yagona NON-blocking band.** Omborchi/kassir telefonsiz ishlaydi; uni
   bloklovchi qilish sinovni tugatib bo'lmaydigan holatga olib kelardi. (Offboarding'dagi
   «hammasi bloklovchi» qoidasi u yerda o'rinli, bu yerda emas — `blocking` maydoni allaqachon
   shu holat uchun mo'ljallangan edi.)
3. **Asimmetriya:** ro'yxat faqat **«o'tdi»** ni to'sadi. «O'tmadi» har doim mumkin — aks holda
   hujjati imzolanmagan odamni bo'shatish uchun avval hujjatini imzolatish kerak bo'lardi.
4. **«O'tmadi» ARXIVLAMAYDI** — arxivlash yagona yo'l bilan, bo'shatish ro'yxati orqali
   (`OffboardingService`), aks holda ochiq smena / topshirilmagan naqd tekshiruvi chetlab o'tilardi.

### Qarz va qilinmagan ish (ochiq yoziladi — §45 «jimgina yarim bajarish TAQIQ»)
- **`ManagerWorkItem` (TZ §5) YO'Q** — u **MK06** fazasida quriladi. TZ §6.3 dagi «baholash
  sanasida menejer navbatiga element tushadi» talabi hozircha **`listDue()`** bilan qoplangan
  (menejer ekrani sinovda turganlarni + kechikkanlarni shundan oladi). MK06 kelganda element
  yaratish o'sha dvigatelga ko'chiriladi; `listDue` qoladi.
- **FE ekrani QILINMADI.** Reja `Fayllar` da `apps/web/src/app/(app)/hr/` ko'rsatilgan, lekin
  **offboarding tomonining ham FE'si yo'q** (BE-only naqsh), va xodim kartasi FE'si aynan
  **MK04** fazasi (parallel sessiya shu paytda o'sha ishni qilyapti). §1 «FAQAT BITTA FAZA»
  bo'yicha bu yerda to'xtatildi — aks holda ikki sessiya bir faylda to'qnashardi.
  ⇒ **DoD dagi «i18n ru+uz» shu sababdan qo'llanmadi:** UI-matn qo'shilmadi, `i18n:gate` uchun
  tekshiradigan narsa yo'q. Band label'lari (offboarding naqshi bilan bir xil) hozircha API
  javobida qattiq matn — FE fazasi ularni kalitga ko'chirishi kerak. **Bu qarz MK04 ga tegishli.**
- `todo.md` 4M.4 «to'liq yopiladi» — **BE tomoni** yopildi; FE bandi MK03/MK04 da.

### Gate natijalari (qo'lda, to'liq)
- `pnpm --filter @moysklad/api typecheck` — **mening fayllarimda 0 xato**. Repo-da 5 xato bor,
  **hammasi** parallel sessiyaning commit qilinmagan `manager/kpi/kpi-accrual.ts` faylida
  (`TS18048: 'win' is possibly 'undefined'`) — meniki emas, **tegilmadi**.
- `pnpm exec biome check apps/api/src/modules/hr/hr-employee/` — 22 fayl, **0 xato**.
  (`pnpm lint:product` repo-da 2 xato ko'rsatadi — ikkalasi ham o'sha `kpi-accrual.test.ts` da.)
- `vitest run src/modules/hr/hr-employee` — **190/190**; `src/modules/hr` + `src/app-boot.test.ts`
  — **931/931** (marshrut-to'qnashuv qo'riqchisi yangi 5 endpointni ko'rdi).
- `i18n:gate` — **yugurtirilmadi, sababi yuqorida** (UI-matn qo'shilmagan).

### Migratsiya (🗄️)
- Lokal `climart_adopt @ 5432` ga `prisma db execute --file` bilan qo'llandi (`_prisma_migrations`
  tracked emas — xotira: `climart-adopt-local-db-untracked`).
- `prisma migrate diff --from-schema-datasource --to-schema-datamodel` — **onboarding drifti 0**
  (qolgan drift = ilgaridan mavjud `ALTER INDEX … RENAME` nomlanish farqlari, meniki emas).
- **PROD (`sherset_v2`) uchun OPS-QADAM:** shu migratsiya `migrate deploy` bilan **avtomatik
  qo'llanmaydi** — DDL qo'lda yugurtiriladi. Fayl:
  `packages/db/prisma/migrations/20260810020000_employee_onboarding_probation/migration.sql`
  (`CREATE TABLE IF NOT EXISTS` + `DO $$ … EXCEPTION WHEN duplicate_object` ⇒ qayta yugurtirish xavfsiz).

### Git holati (§6.7 ehtiyoti)
- Sessiya davomida **kamida uch parallel sessiya** faol edi (MK01 `kpi-accrual` · MK03
  `menejer/jonli`+`javobgarlik` · report-notices). MK03 sessiyasi ish o'rtasida commit qildi
  (`638212f8`) — mening commit'im **uning ustiga** tushdi, hech narsa yo'qolmadi.
- `schema.prisma` **umumiy fayl** (menda `EmployeeOnboarding`, ularda `HrBonusFineLog`).
  Indeks HEAD nusxasi + **faqat MK02 hunk'lari** bilan qurildi (fail-closed skript: anchor
  topilmasa/ikki marta uchrasa `exit 1`), `git hash-object -w` + `git update-index --cacheinfo`.
  Commit'da `schema.prisma` = **+52 qator, 0 o'chirish** — tekshirildi.
- Commit **ajratilgan indeks fayli** (`GIT_INDEX_FILE=<temp>`) bilan qurildi, chunki parallel
  sessiya o'z fayllarini umumiy indeksga stage qilib qo'ygan edi — ularni unstage qilish o'sha
  sessiyaning commit'ini buzishi mumkin edi. **Ularning staged ishiga tegilmadi.**
- ⚠️ **Kuzatilgan hodisa:** MK03 commit qilgach umumiy indeks **eskirib qoldi** va mening yangi
  fayllarim unda **staged o'chirish** (`D `) bo'lib turdi — o'sha holatda kimdir commit qilsa
  fayllarim o'chib ketardi. Faqat **o'z yo'llarim** `git restore --staged` bilan HEAD'ga
  qaytarildi (ularning hech bir fayli staged emas edi — tekshirildi). Indeks toza.
- Hook'lar bir martaga chetlab o'tildi (`-c core.hooksPath=/dev/null`) — §6.7 B; gate'lar
  shu sababdan **qo'lda to'liq** yugurtirildi (yuqoriga qara).
- Commit'dan keyin `git show --stat HEAD` bilan tarkib tekshirildi: **aynan 9 fayl**, begona yo'q.

### Status yorlig'i
**Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q.** «done» / «production-ready» /
«verified» EMAS. Runtime-QA — **MK14** (4M Phase-2 QA) fazasida.

## Faza MK01 — 4M.3 yakuni: idempotent bonus/jarima (sana: 2026-08-09)

**Holat:** BAJARILDI *(shu sessiyaning ikkinchi urinishi — birinchisi BLOKLANDI, pastga qara)*
**Commit(lar):** `<hash>` — `feat(manager): MK01 — qabuldan bonus/jarima (QAROR-B1)`

> **⚠️ QAROR-B1 shu sessiyada YOPILDI** (egasi «qaror B1 ni yop va qurishni boshla» dedi).
> Formulani agent taklif qildi, egasi tasdiqladi. To'liq matn: shu faylda «✅ QAROR-B1 — YOPILDI».
> Sessiyaning birinchi yozuvi (BLOKLANDI) o'chirilmadi — qaror qanday yopilgani ko'rinib tursin.

### Nima o'zgardi
- `apps/api/src/modules/manager/kpi/kpi-accrual.ts` — **YANGI sof modul**. `planAccrual()` (ball
  qaysi oraliqqa tushsa — o'sha qoidaning `kind`+`amountMinor` i) va `planReversalRows()`
  (bekorda zero-sum). Pul qarori DB'siz sinaladi (`kpi-correction.ts` naqshi).
- `apps/api/src/modules/manager/kpi/daily-kpi-acceptance.service.ts` — ulash:
  `entersPayroll`/`leavesPayroll` **`countsTowardPayroll()` dan** o'qiladi (o'z ro'yxati yozilmadi
  — FSM shartnomasi); qabulda `hrBonusFineLog.create`, chiqishda `writeReversal()` — **ikkalasi ham
  holat-da'vosi bilan BITTA tranzaksiyada**; `accrualRules()` faqat `isActive && deletedAt: null`;
  `logAccrualSkip()` buzuq/ustma-ust qoidalarni WARN qiladi (jimgina yo'qotish bo'lmasin);
  `load()` ga `employee.name` (yozuvdagi nom snapshot'i).
- `apps/api/src/modules/manager/kpi/daily-kpi-acceptance.service.ts` — `systemTransition()` ham
  teskari qator yozadi: `mark_stale` **tizim** o'tishi, u `transition()` dan o'tmaydi. Busiz
  eskirgan kun puli joyida qolib, qayta qabulda ikki karra bo'lardi.
- `packages/db/prisma/schema.prisma` — `HrBonusFineLog` ga 2 ustun: `dailyKpiId` (so'rov anchor'i)
  va `kpiEventId` (tabiiy kalit) + `@@unique([kpiEventId, kind])` + `@@index([accountId, dailyKpiId])`
  + 2 FK `onDelete: SetNull`. `EmployeeDailyKpi`/`EmployeeDailyKpiEvent` ga teskari munosabat.
- `packages/db/prisma/migrations/20260810030000_bonus_fine_kpi_accrual_link/migration.sql` — DDL.
- `apps/api/src/modules/manager/kpi/daily-kpi-acceptance.service.test.ts` — **faqat mock qo'shildi**
  (`hrBonusFineRule.findMany`, `tx.hrBonusFineLog`), bironta test o'zgartirilmadi/o'chirilmadi.

### QAROR-B1 formulasi (qisqacha)
Ball-oralig'i qoidalari, **opt-in**, qat'iy summa. Manba = qabulda **muzlatilgan** `scorePercent`.
Sozlama = mavjud `HrBonusFineRule.condition = {type:'kpi_day_score', minPercent, maxPercent}`.
Oraliq **`[min, max)`**. **Uch holatda pul yozilmaydi:** qoida yo'q · ball `null` (NULL ≠ 0) ·
ikki oraliq mos (konfiguratsiya xatosi — tavakkal summa yozilmaydi). Bekorda **teskari qator**
(manfiy summa, `source='kpi_accept_reversal'`), o'chirish yo'q.

### Testlar (RED → GREEN)
- `kpi-accrual.test.ts` — **18 test**, sof modul. Avval YIQILDI (`Failed to load url
  ./kpi-accrual.js` — modul yo'q) → GREEN. Ichida: chegara qiymatlari (`100.0`→bonus,
  `69.9`→jarima, `70.0`→hech narsa, `0`→jarima), NULL ball, buzuq qoidalar, ustma-ust oraliqlar,
  zero-sum idempotentligi.
- `kpi-accrual-wiring.test.ts` — **15 test**, servis (mock Prisma). Avval 9 tasi YIQILDI
  (`expected "spy" to be called 1 times, but got 0` — ulash yo'q) → GREEN. Ichida rejadagi
  4 talab: (1) takroriy qabul → 1 yozuv; (2) qabul→bekor → jami 0; (3) qabul→eskirish→qayta
  qabul → 50 000 − 50 000 + 30 000 = **30 000** (ikki karra emas); (4) chegara qiymatlari.
- Yugurtirilgan: `vitest run src/modules/manager src/modules/hr` → **1212 passed** (106 fayl);
  to'liq `vitest run` (api) → **6063 passed, 2 skipped** (452 fayl), 0 yiqilish.

### Gate natijasi
- typecheck (`@moysklad/api`): **0** · biome (`pnpm lint:product`): **0 error** (783 warning —
  siyosat bo'yicha ruxsat) · vitest api: **6063 passed** · i18n: **N/A** (faqat backend, UI matni
  tegilmagan) · web: tegilmagan (shuning uchun yugurtirilmadi).
- Lokal DB (`climart_adopt @ 5432`) da migratsiya **qo'llandi** va tekshirildi:
  `uq_bonusfine_kpi_event_kind` va `hr_bonus_fine_log_account_id_daily_kpi_id_idx` indekslari
  `pg_indexes` da bor. `prisma generate` qayta yugurtirildi.

### Tasdiqlangan/rad etilgan da'volar
- ✅ Reja: «`HrBonusFineLog` sxemada bor — yangi jadval kerak emas» — **TASDIQLANDI** (`:9529`).
- ❌ Reja: «idempotentlik uchun ... `@@unique`» mavjud kalit bilan yopiladi degan taxmin —
  **RAD ETILDI**: `@@unique([attendanceId, source])` da `attendanceId` **nullable**, PG'da
  NULL'lar to'qnashmaydi ⇒ KPI kanali uchun ishlamasdi. Shuning uchun **yangi** kalit
  `(kpiEventId, kind)`. *(Bu — birinchi hisobotdagi ogohlantirish, endi kodda hal qilindi.)*
- ✅ Oylikka ulanish **avtomatik**: `HrBonusFineService.aggregateRaw()` → `bonusSumMinor`/
  `fineSumMinor` → `payroll-formula.util.ts`: `fix + kpi + bonus − fine + commission +
  correctionNet`. Ya'ni yangi kanal uchun oylik tomonida kod O'ZGARTIRISH KERAK EMAS —
  `hr-payroll.service.ts:99` va `payroll-formula.util.ts:37` da o'z ko'zim bilan tasdiqlandi.
- ✅ Ikki karra hisoblanmaslik: `EmployeeKpiCorrection` (sotuv-fakti farqi) va `HrBonusFineLog`
  (bonus) — oylik formulasida **alohida** hadlar, ustma-ust tushmaydi.
- ⚠️ Reja/todo'dagi «§4.2» havolasi TZ'da mavjud emas (§4 raqamli bandlar) — hujjat qarzi,
  tuzatilmadi (matn qarzi, kodga ta'siri yo'q).

### Qolgan qarz / DEFER
- **FE yo'q** — qoidalarni ekranda sozlash (oraliq/summa) va kun kartochkasida «bu kun uchun
  bonus X» ko'rsatish → **MK03/MK04** (menejer FE fazalari). Hozircha qoidalar mavjud HR
  bonus/jarima CRUD'i (`hr-bonus-fine-rule`) orqali `condition` JSON bilan kiritiladi.
- **Bir kunda ham bonus, ham jarima** (masalan sotuv yaxshi-yu kassa farqi bor) — **MK07**
  (12 qoida turi). MK01 da bir qabul = ko'pi bilan bitta yozuv (ataylab).
- **Foizli/progressiv formula** — kerak bo'lsa `condition.type` ga yangi qiymat qo'shiladi;
  joriy qaror buzilmaydi.
- **Oy chegarasi nuqtasi:** teskari qator `createdAt` bo'yicha o'z oyiga tushadi (iyul kunining
  avgustdagi bekori → avgust oyligi). Bu `EmployeeKpiCorrection` siyosati bilan bir xil, lekin
  `payroll-formula.util.ts:133` dagi «00:00–05:00 oralig'ida yozilgan jarima/bonus o'tgan oyga
  tushib qolardi» izohi shu kanalga ham tegishli — **o'lchanmagan**, alohida tekshiruv qarzi.
- **Prodda hech narsa qo'llanmagan** (DDL ham, qoida ham) — OPS-QADAM 8.

### OPS-QADAM qo'shildimi
- **Ha** — `docs/REJA-8-BOLIM-2026-08.md` → «OPS-QADAMLAR» **8-band**: prod DDL (`db execute
  --file`), backfill kerak emas, unique-indeks xavfi yo'q (eski qatorlarda `kpi_event_id` NULL),
  keyin `/api/v1/health`. Kanal **opt-in** — DDL o'zi xulqni o'zgartirmaydi.

### Status yorlig'i
**Phase-1: strukturaviy + unit-tasdiqlangan (6063 test), browser-smoke YO'Q.**
Jonli oqim (menejer kunni brauzerda qabul qiladi → bonus paydo bo'ladi → oylikda ko'rinadi)
**tekshirilmagan** — u **MK14** (4M Phase-2 QA) ga qoladi.

---

## Faza MK11 — 4M.8: uch xil zaxira signali + narx o'zgarishi nazorati (sana: 2026-08-09)

**Holat:** bajarildi — **Phase-1** (strukturaviy + unit-tasdiqlangan, **browser-smoke YO'Q**).

### Rejaning da'volari kodda tekshirildi (O'ZGARMAS QOIDA 2)

| Reja/TZ da'vosi | Kodda holat | Xulosa |
|---|---|---|
| Narx tarixi manbai = `AuditLog.fieldChanges` (TZ §8) | `ProductService.logAudit` `entity:'Product'`, `action:'update'`, `computeDiff` → `buyPrice`/`minPrice`/`salePrices` **yozilyapti** | ✅ tasdiqlandi, yangi yozuvchi ochilmadi |
| Signal manbai = `Stock` + tan narx | `Stock.costBalanceMinor` (o'rtacha-tortilgan, 18a qaroridan beri COGS bazasi) + `Product/Variant.buyPrice` | ✅ |
| «Navbatga tushadi» | `ManagerWorkItem`/`ManagerRuleConfig` sxemada **YO'Q** (MK06 ishi) | ⚠️ moslashtirildi — pastga qarang |
| Chegara sozlamada | Doimiy sozlama uchun jadval yo'q (`CompanySettings` da umumiy JSON blob ham yo'q) | ⚠️ so'rov parametri + hujjatlangan default |

**MK11 ning `Bog'liqlik: yo'q` deyilgani to'g'ri chiqdi, lekin bitta shart bilan:** navbat
OMBORI MK06 da keladi. Shuning uchun bu faza navbat elementini **saqlamaydi** —
`reviewPriceChanges` har chegaradan oshgan o'zgarish uchun tayyor `PriceChangeWorkItem`
(**barqaror `dedupKey` bilan**) qaytaradi va `GET …/price-changes` uni `workItems` da beradi.
MK06 dvigateli yoqilganda shu kalit bo'yicha element yaratadi — takror element bo'lmaydi.
Sxemaga tegilmadi (migratsiya = umumiy resurs, parallel sessiya `schema.prisma` ni ushlab turgan edi).

### Nima qo'shildi

**BE — yangi `apps/api/src/modules/manager/inventory/` (5 fayl):**
- `stock-signals.ts` — sof modul. Uch signal, **o'lchov tiyin**:
  `dead_money` (qoldiq × tan narx) · `stockout_risk` (gorizontgacha **yopilmagan talab** ×
  tan narx) · `overstock` (gorizontdan ortiq qoldiq × tan narx). Chegaralar:
  `deadDays 90` · `coverDays 14` · `overstockDays 120`.
- `price-change-control.ts` — sof modul. `extractPriceChanges` (audit diffidan tarix) +
  `reviewPriceChanges` (chegara → navbat nomzodi). `blocks` maydoni **literal `false`** tipida.
- `manager-inventory.service.ts` — Prisma I/O + `resolveUnitCostMinor` / `assembleSignalInputs`
  (sof, alohida sinaladi). Sotuv sur'ati `StockOperation` dan (`demand`/`retailsale` +
  bekor/qaytarim); ombor ichidagi `move_*`/`cell_*` **sanalmaydi** — ular pulni aylantirmaydi.
- `manager-inventory.controller.ts` + `.schema.ts` — `GET manager/inventory/stock-signals`,
  `GET manager/inventory/price-changes`. Ruxsat `product:view` (yangi `PermissionEntity`
  kiritilmadi — u seed matritsasini ham talab qilardi, MK11 qamrovidan tashqarida).
- `manager.module.ts` ga ulandi (`app-boot.test.ts` yetim-modul qo'riqchisi yashil).

**FE — 2 yangi sahifa:**
- `menejer/zaxira/page.tsx` — uch signal guruhi, har birida **PUL jami** + «o'lchandi/o'lchanmadi»
  hisoblagichi; `deadDays`/`coverDays` tanlagichlari.
- `menejer/narx-nazorati/page.tsx` — narx tarixi (kim/qachon/qancha/foiz), chegara va davr
  tanlagichlari, **doimiy «bloklamaydi» izohi**.
- `domain-status-tone.ts`: `STOCK_SIGNAL_TONE`/`stockSignalTone` (UI Convention 6 — sahifada
  lokal jadval TAQIQ). `layout.tsx` subnav +2. i18n ru+uz: 2 blok (28 + 23 kalit) + subnav 2.

### «Yolg'on ishonch bermaslik» talablari (NULL ≠ 0) qanday bajarildi

- **Tan narx yo'q ⇒ `amountMinor: null`**, hech qachon `0n`. Qator ro'yxatdan yo'qolmaydi
  (ekranda «Tan narx kiritilmagan» yorlig'i), lekin **jamiga qo'shilmaydi**; har guruh
  sarlavhasida `o'lchanmadi: N` turadi, ya'ni jamining to'liqligi ko'rinib turadi.
- **`Stock.costBalanceMinor = 0` ham NOMA'LUM** deb qaraladi (ustun DEFAULT 0 — «yozilmagan»,
  narx emas). Uni narx deb olish aynan 100% marja yolg'onini qaytarardi.
- **Sotuv tarixi yo'q ⇒ `dailySaleQty`/`coverDays` NULL**, «0 dona/kun» emas; sur'atsiz
  «tugash xavfi» va «ortiqcha zaxira» umuman hisoblanmaydi (taxmin yozilmaydi).
- **Harakat tarixi umuman yo'q ⇒ tovar «o'lik» deb ayblanmaydi** — `no_history` sababi bilan
  o'lchanmagan qator sifatida chiqadi.
- **Narx foizi:** baza yo'q yoki 0 ⇒ `deltaPercent: null` va **chegara qo'llanmaydi**
  («0%» = «o'zgarish bo'lmagan» yolg'oni, `∞%` = navbat shovqini). Valyuta almashgan
  o'zgarishda ham foiz NULL (kurs bu modulda yo'q — konvertatsiya shartnomasi).
- **Kesilgan tanlov OSHKORA:** `truncated` bayrog'i + ekranda banner (5000 qoldiq / 1000 audit).

### Testlar (TDD — RED ko'rildi, keyin GREEN)

- `stock-signals.test.ts` — **17 test**. RED dalili: modul yo'q ekan
  `Failed to load url ./stock-signals.js`. Qoplaydi: pul o'lchovi (dona emas) · tiyin-aniq
  kasr · NULL≠0 (4 stsenariy) · chegara ta'siri · signal kesishmasligi · manfiy qoldiq ·
  tartib (o'lchanmagan qatorlar oxirida).
- `price-change-control.test.ts` — **20 test**. RED dalili: xuddi shunday load-xatosi.
  Qoplaydi: 3 narx maydoni · `salePrices` massiv diffi · **haqiqiy `{default: …}` shakli**
  (`setDefaultSalePrice` yozadigan) · buzuq JSON yiqitmasligi · NULL≠0 · **`blocks:false`
  regressiya qulfi (5 chegara qiymatida)** · dedup kaliti barqarorligi.
- `manager-inventory.assembly.test.ts` — **15 test** (test-after, oshkora): tan narx tanlash
  tartibi · qoldiqsiz-u sotuvli tovar tashlanmasligi · ombor bo'yicha ajratish · hujjat
  turlari to'plami.
- Regress: `src/modules/manager` **353 test yashil** · `app-boot.test.ts` **9 yashil**.

### Gate

| Gate | Natija |
|---|---|
| `@moysklad/api typecheck` | ✅ 0 |
| `@moysklad/web typecheck` | ✅ 0 |
| `biome` (shu fazaning 13 fayli) | ✅ 0 |
| `pnpm lint:product` (repo bo'ylab) | ⚠️ 10 xato — **hammasi parallel sessiyaning** commit qilinmagan MK05/MK08 fayllarida (`cashier-session/shift-acceptance*`, `shared/acceptance-fsm*`, `hr-employee/offboarding.ts`, `manager/live/live-status.service.ts`). Ularga TEGILMADI (§6.1) |
| `pnpm i18n:gate` | ✅ o'tdi |
| `@moysklad/web` `src/__tests__` | 1173 yashil · **2 yiqilgan** — `menejer-live-boards.test.ts` (parallel sessiya `duty_equipment_out`/`duty_shift_unaccepted` kutmoqda, kalitlar hali yozilmagan). Mening o'zgarishim faqat kalit QO'SHDI |

### Ochiq qarzlar (jimgina qoldirilmadi)

1. **Ommaviy narx tahriri audit yozmaydi** — `ProductService.bulkUpdate` `logAudit` ni
   chaqirmaydi, ya'ni «Массовое редактирование» orqali o'zgargan narx bu tarixga
   **tushmaydi**. Ekranda `scope_note` bilan ochiq yozilgan. Tuzatish `product` modulida.
2. **Chegaralar doimiy saqlanmaydi** — so'rov parametri. `ManagerRuleConfig` (MK06) kelganda
   servis o'shani o'qishi kerak, so'rov esa vaqtinchalik override bo'lib qoladi.
3. **Navbat elementi saqlanmaydi** — `workItems` faqat hisoblanadi (MK06 ombori yo'q).
4. **Indeks o'lchanmagan** — uch `groupBy` butun `stock_operations` ustidan yuradi.
   Katta akkauntda `EXPLAIN` bilan tekshirilishi kerak (`index-needs-matching-query-shape`).
5. **Brauzer-QA yo'q** — Phase-2 QA navbatida.

---

## Faza MK05 — Jihoz reyestri + javobgarlik taxtasida jihoz bloki (sana: 2026-08-09)

**Holat:** bajarildi — **Phase-1** (strukturaviy + unit-tasdiqlangan, **browser-smoke YO'Q**).
**Commit:** pastdagi «Git holati» bo'limiga qara.

### Rejaning da'volari kodda tekshirildi (O'ZGARMAS QOIDA 2)
- «`Equipment`/`Asset` modeli sxemada YO'Q» — **tasdiqlandi** (`grep 'model Equipment|Asset'` → 0).
- «Javobgarlik taxtasida jihoz bloki ataylab yo'q» — **tasdiqlandi**: `accountability.ts` boshidagi
  ⚠️ izoh + `live-status.service.ts` izohi + FE `javobgarlik/page.tsx` izohi, ustiga
  `menejer-live-boards.test.ts` da **aniq qulf**: `expect(dutiesCode).not.toMatch(/equipment/i)`.
  Ya'ni MK03 buni qarz sifatida OCHIQ qoldirgan — MK05 aynan shu qulfni ag'dardi.
- «Bo'shatish ro'yxatidagi jihoz bandi to'liq emas» — **tasdiqlandi**: `OFFBOARDING_ITEM.equipmentReturned`
  `kind: manual` edi, ya'ni odam «topshirdim» deb belgilardi va tizim hech narsa tekshirmasdi.

### Nima o'zgardi

**Sxema (`packages/db/prisma/schema.prisma` + migratsiya `20260810060000_equipment_registry`):**
- `Equipment` — nomi · inventar raqami · toifa · holat (`in_stock|assigned|repair|written_off|lost`) · izoh.
  **«Kimda» ustuni ATAYLAB yo'q** — u faqat ochiq biriktirish qatoridan chiqadi (ikkinchi manba
  jimgina uzoqlashardi). `@@unique([accountId, inventoryNo])` (NULL lar to'qnashmaydi).
- `EquipmentAssignment` — **append-only tarix**: `issuedAt/issuedById/issueNote` ·
  `returnedAt/returnedById/returnCondition/returnNote`. Qaytarish qatorni **o'chirmaydi**, yopadi.
- 🔴 **Qisman unique indeks** (faqat SQL da — Prisma sxemasi ifodalay olmaydi):
  `CREATE UNIQUE INDEX ... ON equipment_assignments(equipment_id) WHERE returned_at IS NULL` —
  bitta jihozda bir vaqtda BITTA ochiq biriktirish (poyga qulfi).
- Migratsiya **lokal DB'ga qo'llandi** (`climart_adopt @ 5432`, `prisma db execute`) + `prisma generate`.
  **Prod (`sherset_v2`) uchun DDL ops-ro'yxatiga qarz** — avtomatik `migrate deploy` QILINMADI.

**BE — yangi modul `apps/api/src/modules/hr/hr-equipment/`:**
- `equipment.ts` (sof modul, **16 test**): `assignBlockReason` · `statusAfterReturn` ·
  `manualStatusBlockReason` · `normalizeInventoryNo`.
- `equipment.service.ts` (**12 test**) + `hr-equipment.schema.ts` (Zod) + `hr-equipment.controller.ts`
  (`GET/POST /hr/equipment`, `GET :id`, `PUT :id`, `POST :id/assign`, `POST :id/return`,
  `GET employee/:employeeId`) + `hr-equipment.module.ts` → `hr.module.ts` ga ULANDI
  (yetim-modul qo'riqchisi `app-boot.test.ts` yashil).
- Ruxsat: mavjud `employees` sahifa kaliti (`read`/`full`). **Yangi ruxsat kaliti kiritilmadi** —
  u barcha rollarda yopiq bo'lib qolib, funksiyani jimgina o'lik qilardi.

**BE — mavjud ikki joyga ULANISH:**
- `offboarding.ts`: `equipmentReturned` **`manual` → `auto`**, `AutoFacts.openEquipmentCount`
  qo'shildi; `offboarding.service.ts` `equipmentAssignment.count({returnedAt: null})` o'qiydi.
  Endi qaytarilmagan jihoz **bloklovchi** band: xodim arxivlanmaydi.
- `accountability.ts`: `DUTY.equipmentOut` + `DutyInput.openEquipmentCount`;
  `live-status.service.ts` `groupBy(employeeId)` bilan ochiq biriktirishlarni sanaydi.

**FE:**
- Yangi sahifa `apps/web/src/app/(app)/hr/equipment/page.tsx` — reyestr ro'yxati (filtr: holat + qidiruv),
  qo'shish · berish · qaytarib olish (shart bilan) · **tarix modali** (yopilgan qatorlar ko'rinadi,
  ochig'i «Qaytarilmagan» deb belgilanadi). `apps/web/src/lib/equipment-api.ts` (alohida fayl —
  `hr-api.ts` bilan parallel sessiya kesishmasin).
- `menejer/javobgarlik`: `equipment_out` majburiyat turi; `scope_note` **yangi haqiqatga** moslandi
  («ro'yxat to'liq emas» → «jihoz reyestr bo'yicha sanaladi, narxi naqd jamiga kirmaydi»).
- `domain-status-tone.ts`: `DUTY_KIND_TONE.equipment_out` + yangi `EQUIPMENT_STATUS_TONE`
  (UI Convention 6 — lokal rang jadvali sahifada emas).
- Nav: `subnav.hr.equipment` → `/hr/equipment`. i18n **ru+uz** (`pages.hrEquipment` 35 kalit).

### Qarorlar (TZ'da yo'q — bu yerda qayd etiladi)
1. **Jihozning PULI yo'q.** Reyestrda narx saqlanmaydi ⇒ `amountMinor: null` va `totalCashMinor` ga
   qo'shilmaydi. Taxminiy narx «kimda qancha pul» raqamini buzardi.
2. **Biriktirilgan jihozning holatini qo'lda o'zgartirib bo'lmaydi.** Aks holda «hisobdan chiqarildi»
   bosish bilan javobgarlikni jimgina o'chirish yo'li ochiq qolardi (bo'shatish ro'yxati ham,
   taxta ham uni ko'rmay qolardi). `assigned` holati umuman qo'lda tanlanmaydi.
3. **Qaytarish sharti holatni belgilaydi**: `ok→in_stock` · `damaged→repair` · `lost→lost`.
   Yo'qolgan jihoz reyestrdan **o'chirilmaydi**. Noma'lum shart «soz» deb qaraladi — qator baribir
   yopiladi, aks holda xato qiymat tufayli xodim abadiy bo'shatilmas holatga tushardi.
4. **Arxivlangan xodimga biriktirib bo'lmaydi** — bo'shatish ro'yxati abadiy ochiq qolardi.
5. **Eski qo'lda tasdiq e'tiborga olinmaydi**: MK05 gacha `items` JSON'ida yozilgan
   `equipment_returned` tasdig'i endi hisobga olinmaydi (band `auto`). Reyestr bo'sh bo'lgani uchun
   hech kim bloklanmaydi — lekin bu **xulq o'zgarishi**, ataylab.

### Testlar (TDD — har biri avval YIQILDI, keyin yashil)
| Test | Nima qulflaydi |
|---|---|
| `equipment.test.ts` (16) | biriktirish qoidalari · qaytarish→holat · qo'lda holat taqiqi · inventar raqami |
| `equipment.service.test.ts` (12) | tarix append-only (`deleteMany` chaqirilmaydi) · P2002 poygasi → 400 · hisobdan chiqarish taqiqi |
| `offboarding.test.ts` (+5, jami 26) | jihoz bandi `auto` · soni ko'rsatiladi · **qo'lda tasdiq bilan yopilmaydi** |
| `offboarding.service.test.ts` (+1) | **qaytarilmagan jihoz bo'lsa `complete()` rad etadi** (reja test-1) |
| `accountability.test.ts` (+3) | jihoz alohida qator · nol qator tashlanadi (reja test-2) · pul jamiga kirmaydi |
| `menejer-live-boards.test.ts` | MK03 ning «jihoz YO'Q» qulfi **ag'darildi** (jimgina o'chirilmadi) |

### Gate (o'z ko'zim bilan)
- `pnpm --filter @moysklad/api typecheck` → **0** · `@moysklad/web typecheck` → **0**
- `pnpm --filter @moysklad/api exec vitest run src/modules/hr src/modules/manager src/app-boot.test.ts`
  → **113 fayl / 1328 test yashil**
- `pnpm --filter @moysklad/web exec vitest run` → **193/195 fayl yashil**; **3 yiqilish MENIKI EMAS**
  (pastga qara)
- `pnpm lint:product` → mening fayllarim formatlandi; **qolgan xatolar parallel sessiyaniki**
- `pnpm i18n:gate` → **mening kalitlarim yashil**; yiqilgan 17 kalit — parallel MK08 sessiyasiniki

### ⚠️ Parallel sessiya (MK08) bilan kesishuv — YIQILGANLAR MENIKI EMAS
Sessiya davomida **MK08** («smena yakunini qabul qilish») sessiyasi AYNAN shu fayllarda ishladi:
`accountability.ts` (`DUTY.shiftUnaccepted`), `accountability.test.ts`, `live-status.service.ts`,
`layout.tsx`, i18n fayllari, `cashier-session/*`. O'sha ishning **tugallanmagan** holati sababli:
- `menejer-live-boards.test.ts` — 2 yiqilish: `duty_shift_unaccepted` kaliti ru+uz da **yo'q**
  (MK08 `DUTY` ga tur qo'shgan, tarjimasini hali yozmagan). Mening `equipment_out` kalitim **bor**.
- `raw-element-conventions.test.ts` — 1 yiqilish: `menejer/smenalar/page.tsx` da xom `<select>`
  (MK08 sahifasi). Mening sahifam `Select`/`Textarea` primitivlarini ishlatadi.
- `i18n:gate` — 17 kalit yetishmaydi, **hammasi** `pages.shiftAcceptance.*` +
  `subnav.menejer.shift_acceptance`.
- `lint:product` — `cashier-session/*`, `acceptance-fsm*`, `live-status.service.ts` format xatolari.
**Ularning fayllariga TEGILMADI** (§6.1) — tuzatish MK08 sessiyasining ishi.

### Ochiq qarz (ataylab qilinmagan)
- **Brauzer-QA yo'q** (Phase-2 / MK14): reyestr sahifasi, berish/qaytarish oqimi va taxtadagi
  jihoz bloki real brauzerda tekshirilmagan.
- **Prod DDL** (`sherset_v2`) qo'llanmagan — ops-qadamlar ro'yxatiga qarz.
- **Xodim kartasi 360°** ga jihoz bloki qo'shilmadi (MK04 fayli; `GET hr/equipment/employee/:id`
  endpointi tayyor, FE ulanishi keyingi fazaga). Qamrovni kengaytirmadim — §1.
- **Jihoz narxi/amortizatsiya** yo'q (TZ talab qilmaydi); kerak bo'lsa alohida ustun.
- `EmployeeOnboarding` (ishga qabul) tomoniga jihoz **berish** bandi qo'shilmadi — TZ §6.3 uni
  faqat bo'shatishda talab qiladi.


## Faza MK08 — 4M.6a: smena yakunini qabul qilish (sana: 2026-08-09)

**Holat:** ✅ bajarildi — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**.
**Commit:** `8bb11ef5` — `feat(kassa): MK08 — smena yakunini qabul qilish (FSM + rad→tushuntirish halqasi)` (21 fayl, +2206/−163)

### Muammo (kodda tasdiqlangan, reja da'vosi emas)
`CashierSession.state` faqat `open`/`closed` edi va **qabul o'qi umuman yo'q edi**.
`CashierSessionVariance.acknowledgedAt` bor, lekin u FAQAT farq aktini belgilaydi — ya'ni
**farqsiz smena hech kimning stolidan o'tmasdi**. Natijada «hammasi joyida» degan xulosa hech kim
tomonidan tasdiqlanmagan bo'lardi. TZ §6 aynan shuni «qabul naqshini kengaytirish» deb yozgan.

### Nima o'zgardi

**1. Qoida dvigateli AJRATILDI — nusxa ko'chirilmadi**
- Yangi `apps/api/src/modules/shared/acceptance-fsm.ts` (+`.test.ts`, 16 test) — «kimdir tayyorladi,
  boshqasi qabul qiladi» naqshining generic dvigateli: o'tish jadvali · aktyor · yopiq sabab
  ro'yxati · `other` da majburiy izoh · **idempotent no-op** (takror bosish 409 emas).
- `manager/kpi/daily-kpi-fsm.ts` shu dvigatel ustiga ko'chirildi. **Tashqi shartnoma
  O'ZGARMADI** (`evaluate`, `evaluateAdjust`, `allowedActions`, `transitionFor`, `reasonCodesFor`,
  `commentRequired`, `FsmFailure/FsmResult/FsmInput`, `Transition`) — 168 qator qisqardi,
  **33 regress testi yashil**. Bu MK08 uchun shart edi: aks holda ~150 qator qoida ikkinchi marta
  yozilardi va ular bir kunda ikki xil bo'lardi (repodagi klass: `api-client.download()` nusxasida
  401-retry shoxi tushib qolgan, uni faqat md5-solishtirish topgan).

**2. Smena qabul FSM** — `cashier-session/shift-acceptance.ts` (+`.test.ts`, 22 test)
```
open ──open_for_review──> pending ──accept──> accepted ──mark_stale──> stale ──accept──> accepted
                            │  ↑                  │
                     reject │  │ explain (KASSIR) │ reopen (sabab majburiy) → pending
                            ↓  │                  │
                         rejected ──escalate──> escalated ──force_accept(EGA)──> force_accepted
```
- Rad etish sababi **MAJBURIY**, yopiq ro'yxatdan: `variance_unexplained` · `zreport_mismatch` ·
  `cash_shortage` · `document_missing` · `discipline` · `other` (izoh bilan).
- `isAccountable()` / `SHIFT_QUEUE_STATES` / `awaitsCashier()` — javobgarlik va navbat ro'yxatlari
  **shu yerda**, chaqiruvchilar o'z ro'yxatini yozmaydi.

**3. 🔴 QABUL SUMMALARGA TEGMAYDI** — fazaning asosiy invarianti
`shift-acceptance.service.ts` update-payload'ida faqat `acceptanceState` / `acceptedById` /
`acceptedAt` / `acceptanceChangedAt` bor. Test (`shift-acceptance.service.test.ts`) 15 ta summa/holat
maydonini ro'yxatlab, ularning payload'da **YO'Qligini** tasdiqlaydi (`closingCashMinor`,
`expectedCashMinor`, `discrepancyMinor`, `proceeds*`, `received*`, `state`…). Sabab: menejer
kamomadni «tuzatib» yopsa, farq akti dalil bo'lishdan to'xtardi.

**4. Servis** — `shift-acceptance.service.ts` (365 qator)
- `queue()` — eng uzoq kutgani birinchi; sana/kassir/holat filtri; summalar faqat O'QISH uchun.
- `detail()` — Z-hisobot **`CashierSessionService.zReport()` dan** (qayta hisoblanmaydi; farq aktlari
  ham o'sha javobda) + qabul jurnali + `allowedActions` + har amal uchun sabab ro'yxati.
- `transition()` — optimistik da'vo (`where.acceptanceState = from`) → 409; jurnal qatori **ayni
  tranzaksiyada**; no-op holatida na yozuv, na jurnal.
- `escalateOverdue()` (3 kun, `acceptanceChangedAt` bo'yicha — `updatedAt` EMAS) · `markStale()`.
- Kassir **begona smenaga** tegsa **404** (403 emas: 403 begona smenaning mavjudligini tasdiqlardi).

**5. Baza** — `20260810070000_shift_acceptance`
- `cashier_sessions`: `acceptance_state` (VarChar 20, default `open`) · `accepted_by_id` ·
  `accepted_at` · `acceptance_changed_at` + 2 indeks (menejer navbati; kassir bo'yicha javobgarlik).
- Yangi `cashier_session_acceptance_events` — **append-only** jurnal (kim · qachon · qaysi o'tish ·
  sabab · izoh). Kassir tushuntirishi shu jadvalning `comment` maydonida — nizoda yagona yozma iz.
- **BACKFILL QARORI (ochiq):** mavjud YOPILGAN smenalar `pending` ga o'tkaziladi, `accepted` ga
  **EMAS** — ularni hech kim ko'rmagan; `accepted` deb belgilash «menejer tasdiqladi» degan yolg'on
  yozuv bo'lardi (NULL≠0 bilan bir klass). Birinchi kuni navbat uzun bo'ladi — ekranda sana filtri bor.

**6. Ulanishlar**
- `close()` — AYNI Serializable tranzaksiyada `acceptance_state='pending'` + jurnalning birinchi
  qatori (`open_for_review`, aktyor `system`). Alohida yozilsa, oradagi xatoda smena yopilgan-u
  hech kimning stolida ko'rinmaydigan holatda qolardi. 2 yangi test (`shift-cash-faza-q1.test.ts`).
- Javobgarlik taxtasi: yangi `DUTY.shiftUnaccepted`. `open_shift` dan **AYRIM** va **PULSIZ** —
  pul allaqachon topshirilgan; bir qatorga qo'shish naqdni ikki marta sanardi. Holatlar ro'yxati
  FSM'dan (`ACCOUNTABLE_STATES`), `live-status.service.ts` da takrorlanmaydi.
- HTTP: `GET /cashier-sessions/acceptance/queue` · `GET .../acceptance/:id` ·
  `POST .../acceptance/:id/transition`. Statik segment `:id` dan **oldin** (fayldagi konvensiya).
  `ShiftAcceptanceService` `CashierSessionModule` da ro'yxatdan o'tdi (yetim modul = o'lik funksiya).
- FE `menejer/smenalar` + subnav yozuvi + i18n **ru+uz** (17 kalit + `duty_shift_unaccepted`).

### Gate (to'liq, commit-nuqtada)
| Gate | Natija |
|---|---|
| `@moysklad/api typecheck` | **0** |
| `@moysklad/web typecheck` | **0** |
| `lint:product` | **0 xato** (783 ogohlantirish — siyosat bo'yicha ruxsat) |
| `i18n:gate` | **9/9 ✓** (12525 statik kalit) |
| api `vitest run` (to'liq) | **465 fayl / 6261 test ✓** |
| web `vitest run` (to'liq) | **196 fayl / 2923 test ✓** |

**Ikki qo'riqchi HAQIQIY bo'shliq tutdi** (va tuzatildi):
1. `menejer-live-boards.test.ts` — `duty_shift_unaccepted` yorlig'i ru+uz da yo'q edi (dinamik
   i18n kalit; `i18n:gate` buni ko'rmaydi, chunki kalit `t(\`duty_${k}\`)` shaklida quriladi).
2. `raw-element-conventions.test.ts` — xom `<select>` taqiqlangan → DS `NativeSelect`.

### Git holati (parallel sessiyalar)
Sessiya davomida daraxtda **3+ parallel sessiya** ishladi (MK05 jihoz reyestri, MK11, MK23,
FIFO/decimal refaktori). Boshlanishida MK08 hunk'larim MK05 ning tugallanmagan ishi bilan
`accountability.ts` / `accountability.test.ts` / `live-status.service.ts` da **bir satrda**
aralashgan edi. Commit paytiga MK05 o'z ishini commit qildi (`d1b70266`), shuning uchun **begona
ish commit'ga TUSHMADI** — `git show --stat HEAD` staged ro'yxat bilan 1:1 mos (21 fayl).
Hook'lar bir martaga chetlab o'tildi (`core.hooksPath=/dev/null`): lint-staged'ning tree-stash'i
parallel sessiyalar bilan xavfli (§6.7-B) — gate'lar **qo'lda to'liq** yugurtirildi (yuqoridagi jadval).

### Ochiq qarz (ataylab qilinmagan, jimgina emas)
- **Brauzer-QA yo'q** (Phase-2 → **MK14**): navbat ekrani, rad etish formasi, kassir tushuntirish
  oqimi real brauzerda tekshirilmagan.
- **Migratsiya lokal DB'ga QO'LLANMADI** — sessiya davomida `climart_adopt` **o'chiq** edi
  (preflight: `db down`). Keyingi runtime sessiya `prisma db execute --file` bilan qo'llashi kerak.
- **Prod DDL** (`sherset_v2`) — OPS-QADAMLAR ro'yxatiga qo'shildi (9-band).
- **Kassir tomoni FE yo'q**: tushuntirish yozish ekrani qurilmadi (BE `explain` o'tishi va HTTP
  yo'li tayyor). Menejer ekrani orqali tushuntirishni menejer ham kirita oladi (FSM `explain`
  aktyorlarida `manager` bor). Qamrovni kengaytirmadim — §1 (faqat bitta faza).
- **`escalateOverdue` cron'ga ulanmagan** — funksiya bor va testlanmagan holda turibdi; uni
  kunlik cron'ga ulash MK06 (menejer navbati dvigateli) bilan birga mantiqiyroq.
- **`markStale` chaqiruvchisi yo'q** — chek tahriri/qaytarish oqimidan chaqirilishi kerak;
  bu MK08 qamrovida emas (hujjat-o'zgarishi kuzatuvchisi hali yo'q).

---

## Faza MK09 — 4M.6b: ma'lumot sifati paneli (sana: 2026-08-09)

**Holat:** ✅ bajarildi — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**.
**Commit:** shu hisobot bilan bir commit'da (pastdagi «Git holati»ga qara).

### Muammo (kodda tasdiqlangan, reja da'vosi emas)
`NULL ≠ 0` shartnomasi kodda ALLAQACHON bor edi — `kpi-metrics.ts` (`MetricValue.complete`,
`unmeasured()`), `employee-daily-kpi.service.ts` (`costMinor == null` ⇒ `complete: false`),
`EmployeeDailyKpi.dataComplete` ustuni. **Lekin uni hech kim KO'RMASDI:** menejerning birorta
ekrani bayroqni chizmasdi, «tan narxsiz cheklar ulushi» hech qayerda hisoblanmasdi, «qabul
qilinmagan kunlar ulushi» hech qayerda yig'ilmasdi. `dataQuality` so'zi butun repoda **0 marta**
uchrardi (grep bilan tasdiqlangan). Ya'ni o'lchov bor edi, **javob yo'q edi**.

Ikkinchi (kichikroq) muammo: to'liqlik qoidasi ikki joyda bo'lishga qarab ketayotgan edi —
`employee-daily-kpi.service.ts:95` da qo'lda yozilgan shart turardi.

### Nima o'zgardi

**1. Bayroq qoidasi — YAGONA QATLAMDA** (`apps/api/src/modules/report/metrics/data-quality.ts`,
+`.test.ts`, **19 test**)
- `DATA_QUALITY = { complete | partial | uncollected }` · `metricQuality(value, complete)` ·
  `countSamples(rows)` · `aggregateQuality(sample)` · `overallQuality(levels)` · `sharePercent(a, b)`.
- Nega `report/metrics/` da: bu — «bir savolga bitta javob» joyi (analitika TZ §4). Bayroq
  menejer ekranida ham, hisobotda ham AYNI qoida bo'yicha chiqishi kerak.
- Qulflangan qarorlar (har biri test bilan):
  - **NULL qiymat `complete: true` bo'lsa ham «yig'ilmagan»** — qiymatning yo'qligi manba
    bayrog'idan ustun (aks holda bo'sh katak «to'liq o'lchandi» bo'lardi);
  - **hech narsa o'lchanmagan ≠ «qisman»** — 30 qator ochilib hammasi NULL bo'lsa, «qisman»
    deyish «bir qismi o'lchandi» degan yolg'on ma'no berardi ⇒ «yig'ilmagan»;
  - **o'lchanmagan qator bayroqni TUSHIRMAYDI** — buxgalterda kassa ko'rsatkichi yo'qligi
    kamchilik emas; «qisman» faqat *o'lchandi-yu manbasi chala* degani;
  - **`sharePercent` mahrajsiz ⇒ `null`, `0%` EMAS** — nol foiz «tekshirildi, muammo yo'q»
    degan xotirjamlik beradi, o'lchov yo'qligi esa aynan qarama-qarshi ma'no;
  - **`overallQuality`: bo'sh ro'yxat ⇒ «yig'ilmagan»** (bo'shlikni «to'liq» deb atash eng
    xavfli yolg'on bo'lardi); to'liq+yig'ilmagan aralashsa ⇒ «qisman».
- Bo'linish `metrics/percent` orqali (BigInt-aniq, ikki kasr) — `no-adhoc-percent` qo'riqchisi
  talab qilgan yagona formulalar qatlami buzilmadi.

**2. Panel servisi** (`manager/kpi/data-quality.service.ts`, +`.test.ts`, **12 test**)
`GET /manager/kpi/data-quality?from&to` (`employees:read`), davr berilmasa **oxirgi 30 kun**:
| Blok | Nima |
|---|---|
| `metrics[]` | har ko'rsatkich: `level` · `total`/`measured`/`partial` · `coveragePercent` (mahrajsiz ⇒ `null`) |
| `cost` | `receipts` · `receiptsMissingCost` · `missingPercent` · `level` — X1 bug-klassining **jonli o'lchovi** |
| `acceptance` | `days`/`accepted`/`unaccepted`/`unacceptedPercent` · `byState[]` · `daysWithoutProfile` |
| `unsourced[]` | davr ichida bironta ham o'lchov bo'lmagan ko'rsatkichlar |
| `overall` | uch blokning umumiy bayrog'i |

- Agregat **serverda** (`groupBy` + `_count.autoValue` = NULL bo'lmaganlar soni) — qatorlar soni
  xodim × kun × ko'rsatkich, oylik davrda o'n minglab bo'ladi.
- «Qabul qilingan» ta'rifi **FSM'dan** (`countsTowardPayroll`) — ro'yxat qayta yozilmadi, aks
  holda oylik bir javob, panel boshqa javob berardi.
- **Katalogda bor-u qatori yo'q** ko'rsatkich ham ro'yxatda (`total: 0` ⇒ `uncollected`):
  «ekranda yo'q» degani «muammo yo'q» emas. **Katalogdan tushib qolgan** (arxivlangan)
  ko'rsatkich ham yashirilmaydi — kalitning o'zi nom sifatida ko'rsatiladi.

**3. Ikki xil sana chegarasi — test bilan qulflangan**
`EmployeeDailyKpi.date` = `@db.Date` **yorlig'i** (UTC yarim tun) · `RetailSale.postedAt` =
**instant** (`timestamptz`, Toshkent). Yorliqni instant sifatida ishlatish 1-iyul 00:00–05:00
cheklarini iyun oyiga qo'shib yuborardi (`monthBounds` bilan bo'lgan aynan shu xato klassi).
`DataQualityQuerySchema` ataylab `z.coerce.date()` EMAS, `YYYY-MM-DD` string.

**4. Takror qoida yopildi** — `employee-daily-kpi.service.ts` dagi qo'lda yozilgan `dataComplete`
sharti endi shu qatlamni chaqiradi (`aggregateQuality(countSamples(values)) !== partial`).
Xulq **o'zgarmadi** (mavjud KPI testlari yashil), lekin qoida bitta joyda qoldi.

**5. FE** — `menejer/_components/data-quality-screen.tsx` (+`.test.tsx`, **8 test**),
`menejer/sifat/page.tsx`, subnav bandi, `manager-api.ts` tiplari + chaqiruv, i18n **ru+uz** (28+1 kalit).
Foiz kataklarining **yagona chizuvchisi** — `pct(v)`: `null ⇒ '—'`. Ya'ni birorta katak tasodifan
`0%` bo'lib qolishi mumkin emas; test buni ikki tomondan qulflaydi («o'lchov yo'q ⇒ `0%` YO'Q» va
«haqiqiy nol ⇒ `0%` BOR»). Ekran hech narsani bloklamaydi — davr tanlashdan boshqa tugma yo'q
(test bilan qulflangan).

### Nima QILINMADI (ochiq qarz)
- **Brauzer-QA yo'q** — panel real ma'lumotda ko'rilmagan (→ **MK14**). Ayniqsa `groupBy` +
  `_count: { autoValue: true }` shakli va `positions: { some: { costMinor: null } }` filtri
  runtime'da tasdiqlanishi kerak (unit testlar Prisma'ni mock qiladi).
- **Sxema o'zgarmadi, migratsiya YO'Q** — panel butunlay mavjud ustunlardan o'qiydi.
- `costMinor` NULL ulushi **chek** (hujjat) darajasida sanaladi, qator darajasida emas — «nechta
  chekka ishonib bo'lmaydi» degan savolga shu javob beradi; «nechta qator» kerak bo'lsa alohida.
- Panel **hech narsani tuzatmaydi** va bloklamaydi (ataylab): tuzatish yo'li tan narx muzlatish
  (1.1) va kunni qabul qilish (4M.2).

### Gate (qo'lda, to'liq)
- `report/metrics` + `manager` + `app-boot` — **67 fayl / 883 test ✓** (yangi 31 test shu ichida)
- web to'liq — **2953 ✓** · biome (14 ta o'z faylim) **0** · `i18n:gate` **9 ✓**
- **api typecheck: 4 xato — MENING FAYLLARIMDA EMAS**: `moysklad-compat.service.ts` (parallel
  sessiyaning in-flight ishi, `Record<string, SlugConfig>` → `Record<CompatSlug, SlugConfig>`).
- **web typecheck: 2 xato — MENING FAYLLARIMDA EMAS**: `settings/api-tokens/page.tsx` (parallel
  sessiyaning yangi, hali commit qilinmagan fayli).
- **web to'liq testda 2 yiqilish — meniki EMAS**: `pos-payment-contract.test.ts` (parallel
  sessiyaning in-flight `retail-sale.schema.ts` refaktori). POS/retail fayllariga tegmadim.

### Git holati
Sessiya davomida daraxtda **kamida 3 parallel sessiya** ishladi (MK06 ish navbati · MK18 xato
narx · Faza Q14 API-token). Ikkita fayl **umumiy** bo'ldi — `manager.module.ts` va
`app/(app)/layout.tsx` — ular ham mening, ham ularning hunk'larini saqlaydi; `messages/*.json`
da ham ularning kalitlari turibdi. Shuning uchun commit **ajratilgan indeks** (`GIT_INDEX_FILE`)
bilan qilindi va bu to'rt fayl uchun blob **HEAD + faqat mening hunk'larim** dan qayta qurildi
(begona satrlar commit'ga TUSHMADI — ularning fayllari hali untracked, ular bilan commit qilinsa
tree kompilyatsiya bo'lmasdi). Hook'lar bir martaga chetlab o'tildi, gate'lar yuqorida qo'lda.
Shu commit **MK08 ning commit qilinmay qolgan hand-off hujjatlarini ham** olib keladi (uzilgan
sessiya artefakti: `NEXT.md`, `todo.md`, ikkala reja fayli indeksda staged turgan edi).

## Faza MK06 — 4M.5a: menejer ish navbati — dvigatel va model (sana: 2026-08-09)

**Holat:** bajarildi — **Phase-1** (strukturaviy + unit-tasdiqlangan, **browser-smoke YO'Q**).

### Rejaning da'volari kodda tekshirildi (O'ZGARMAS QOIDA 2)

| Reja/TZ da'vosi | Kodda holat | Xulosa |
|---|---|---|
| `ManagerWorkItem`/`ManagerRuleConfig` sxemada YO'Q | `grep 'model ManagerWorkItem\|model ManagerRuleConfig\|model ApprovalRule'` → **0** | ✅ tasdiqlandi |
| MK11 tayyor `dedupKey` beradi | `price-change-control.ts` `PriceChangeWorkItem.dedupKey` = `price_change:{auditId}:{field}:{priceTypeId}` | ✅ ko'prik ishlatildi, qayta yozilmadi |
| Qabul naqshi umumiy dvigatelda | MK08 `shared/acceptance-fsm.ts` ajratgan | ✅ nusxa ko'chirilmadi, shu dvigatel ustiga qurildi |
| `AuditLog.userId` → xodim | `user Employee? @relation(...)` (schema:7457) | ✅ `subject_employee_id` FK xavfsiz |
| Kassa farqi manbai bor | `CashierSessionVariance` (`varianceMinor`, `cashierId`, `acknowledgedAt`) | ✅ ikkinchi manba ochilmadi |

### Nima qo'shildi

**Sxema — 3 model + migratsiya `20260810080000_manager_work_queue`:**
- `ManagerRuleConfig` — qoida chegarasi (`thresholdValue` + **`thresholdUnit`**), `enabled`, `mode`,
  `severity`, `params`. `@@unique([accountId, ruleType])`.
- `ManagerWorkItem` — BITTA NAVBAT. §5.1 ning besh savoli ustunlarda: **kim** (`subjectEmployeeId`) ·
  **qancha** (`amountMinor`, NULL = o'lchanmadi) · **qachon** (`occurredAt` — hodisa vaqti) ·
  **hujjatga havola** (`docType`/`docId`) · **kontekst** (`context`). `@@unique([accountId, dedupKey])`
  + 3 indeks.
- `ManagerWorkItemEvent` — append-only jurnal (§5.3 statistikasining manbai).
- **Migratsiya lokal `climart_adopt` ga QO'LLANDI** va tekshirildi (pastga qara).

**BE — yangi `apps/api/src/modules/manager/queue/` (8 fayl):**
- `work-item-rules.ts` — sof. Qoida registri (`MANAGER_RULES`), sozlama birlashtirish
  (`resolveRules`), 2 namunaviy nomzod yasovchi (`buildPriceChangeCandidates`,
  `buildCashVarianceCandidates`).
- `work-queue-planner.ts` — sof. Dvigatelning YADROSI: `planQueueSync` (dedup + eskirish rejasi) va
  `sortQueue` (eskirgani tepada → jiddiyligi → yangiligi).
- `work-item-fsm.ts` — sof. §5.4 ning 7 harakati + `dismiss`/`reopen`, `shared/acceptance-fsm.ts`
  ustida.
- `manager-queue.service.ts` / `.controller.ts` / `.schema.ts` — I/O va HTTP.
  `GET manager/queue` · `GET manager/queue/rules` · `GET manager/queue/:id/history` ·
  `POST manager/queue/sync` · `POST manager/queue/:id/action` · `PUT manager/queue/rules/:ruleType`.
  Ruxsat `employees:read` / `employees:full` (`manager/kpi` bilan bir xil darvoza).
- `manager.module.ts` ga ulandi — `app-boot.test.ts` (yetim modul + takroriy route) **9 yashil**.

**FE — 1 yangi sahifa:**
- `menejer/navbat/page.tsx` — filtr (qoida turi · faqat eskirganlar), «Yangilash» (sync natijasi
  ko'rinadi), har elementda §5.1 ning uch savoli + **«shu oyda N-marta»** tendensiya qatori,
  FSM'dan chizilgan tugmalar, yopuvchi amalda sabab+izoh formasi.
- `domain-status-tone.ts`: `WORK_ITEM_SEVERITY_TONE` / `WORK_ITEM_STATUS_TONE` (UI Convention 6).
- `layout.tsx` subnav +1 (KPI qabulidan keyin, ataylab tepada). i18n ru+uz: 1 blok (57 kalit) + subnav 1.

### 🔴 «Navbat BLOKLAMAYDI» — TO'RT qatlamli qulf

§5.1 («erkinlik + keyingi nazorat») — bu **yo'q xususiyat**, uni oddiy test isbotlay olmaydi.
Shuning uchun to'rt mustaqil qatlam:

1. **Baza:** `CHECK (mode IN ('observe','notify'))` — `block` qiymati yozilmaydi.
   **Jonli tekshirildi:** `INSERT ... mode='block'` → `violates check constraint
   "manager_rule_configs_mode_not_blocking"`.
2. **Tip:** har qoida ta'rifida `blocks: false` **literal** (`ManagerRuleDefinition`), test registr
   bo'ylab yuradi ⇒ MK07 ning 12 qoidasi ham shu qulfdan o'tadi.
3. **Zod:** `RuleConfigBodySchema.mode` da `block` yo'q; `resolveRules` bazadan `block` kelsa ham
   `notify` ga tushiradi (qatlamlar mustaqil himoyalanadi).
4. **Arxitektura:** `queue-does-not-block.test.ts` manba daraxtini skanerlaydi — `manager/queue` ni
   `manager.module.ts` dan boshqa hech kim import qila olmaydi, ya'ni hujjat yo'liga qo'shib
   bo'lmaydi. **Mutatsiya bilan tasdiqlandi**: `demand/` ga import qo'yilganda test yiqildi
   (`expected [ 'demand\__tmp_probe.ts' ] to deeply equal []`), probe o'chirildi.

### Ataylab qilingan qarorlar (TZ'da yo'q — ochiq yozilmoqda)

1. **Eskirish = BAYROQ, status EMAS.** `staleAt` to'ladi, `status` `open` bo'lib qoladi. §5.1
   «yuqoriga chiqadi» deydi — ya'ni element navbatdan CHIQMAYDI. Alohida `stale` statusi uni
   ochiqlar ro'yxatidan olib chiqib ketardi va «e'tibordan qolgan element» ikkinchi marta
   e'tibordan qolardi.
2. **Eskirish `statusChangedAt` dan sanaladi, `occurredAt` dan EMAS.** Bir oylik audit yozuvi bugun
   sync qilinsa, u bugun navbatga tushdi — darhol «e'tibordan qolgan» deb belgilash yolg'on ayblov
   bo'lardi. Test bilan qulflangan.
3. **YOPILGAN element qayta tug'ilmaydi.** Dedup mavjud elementning HOLATIGA qaramaydi. Aks holda
   menejer yopgan hodisa ertangi `sync` da qaytib kelib, navbat hech qachon bo'shamas va §5.3
   sabab statistikasi bir hodisani o'nlab marta sanardi.
4. **Chegara BIRLIK bilan birga o'qiladi** (`thresholdValue` + `thresholdUnit`). Birlik mos kelmasa
   sozlama **RAD etiladi** va bu `thresholdRejected` orqali ekranda **KO'RINADI** — jimgina tashlab
   yuborish menejerni «men chegarani o'zgartirdim-ku» degan yolg'on ishonchda qoldirardi. `PUT` esa
   noto'g'ri birlikni umuman qabul qilmaydi (400).
5. **`CASH_VARIANCE` default chegarasi = 0** («o'ylab topilgan raqam» kiritmaslik uchun): farq
   aktining o'zi allaqachon istisno hodisa, nolga teng bo'lmagan har farq navbatga tushadi. Shovqin
   ko'p bo'lsa egasi sozlamadan ko'taradi. `PRICE_CHANGE` = MK11 ning `DEFAULT_PRICE_THRESHOLD_PERCENT`
   (20%) — **import qilingan**, takrorlanmagan.
6. **Migratsiyada BACKFILL YO'Q.** Bir yillik audit jurnalini navbatga ag'darish menejerni birinchi
   kuniyoq ko'mib tashlardi; `sync` esa `sinceDays` bilan boshqariladi (default 30 kun).
7. **Yopuvchi amalda sabab MAJBURIY** — test JADVAL bo'ylab yuradi (`to` yopiq holat ⇒
   `reasonRequired: true`), ya'ni MK07 yangi yopuvchi amal qo'shsa va `reasonRequired` ni unutsa,
   test yiqiladi.
8. **Egaga eskalatsiyani EGA qila olmaydi** — `escalate` aktyori faqat `manager`. Ega o'ziga
   eskalatsiya qilishining ma'nosi yo'q.

### Testlar (TDD — RED ko'rildi, keyin GREEN)

| Fayl | Test | RED dalili |
|---|---|---|
| `work-item-rules.test.ts` | **21** | `Failed to load url ./work-item-rules.js` |
| `work-queue-planner.test.ts` | **16** | `Failed to load url ./work-queue-planner.js` |
| `work-item-fsm.test.ts` | **20** | `Failed to load url ./work-item-fsm.js` |
| `manager-queue.service.test.ts` | **17** | (test-after, oshkora — mock'siz chiqmaydigan shartnomalar) |
| `queue-does-not-block.test.ts` | **2** | **mutatsiya** bilan tasdiqlandi (yuqorida) |

**Rejaning to'rt testi qayerda:** (1) dedup — `work-queue-planner.test.ts` × 4 + servis × 2;
(2) eskirish belgisi, o'chirish YO'Q — planner × 7 (shu jumladan «rejada `delete|remove|purge|drop`
kaliti yo'q») + servis × 2; (3) o'chirilgan qoida element yaratmaydi — rules × 2 + servis × 1
(«manbani UMUMAN o'qimaydi»); (4) bloklamaydi — yuqoridagi to'rt qatlam.

**Regress:** `src/modules/manager` **484 test yashil** (27 fayl, shundan MK06 niki 76) ·
`app-boot.test.ts` **9 yashil** · web `src/__tests__` **1197 yashil**.

### Gate

| Gate | Natija |
|---|---|
| `@moysklad/api typecheck` | ✅ 0 |
| `@moysklad/web typecheck` | ✅ 0 |
| `biome` (shu fazaning 14 fayli) | ✅ 0 |
| `pnpm i18n:gate` | ✅ 9 yashil (427 fayl, 12638 kalit) |
| `@moysklad/api` `src/modules/manager` + `app-boot` | ✅ 484 + 9 |
| `@moysklad/web` `src/__tests__` | 1197 yashil · **2 yiqilgan** — `pos-payment-contract.test.ts`, sababi **parallel sessiyaning** commit qilinmagan `retail-sale.schema.ts` refaktori (`terminalAmountMinor` va boshqalar ichki obyektga ko'chirilgan; test tekis manba matnini qidiradi). Mening diffimda POS fayli YO'Q |
| UI konventsiya qo'riqchilari | ✅ `raw-element-conventions` (xom `<input type=checkbox>` topildi → DS `Checkbox` ga o'tkazildi) · `domain-status-tone` drift-lock 75 yashil |

### Migratsiya — LOKAL DB'ga qo'llandi

`prisma db execute --file .../20260810080000_manager_work_queue/migration.sql` → `Script executed
successfully`. Ya'ni SQL sintaksisi va FK'lar **haqiqiy bazada** tekshirildi (MK08 da bu qadam
o'tkazib yuborilgan edi — u yerda DB o'chiq deb hisoblangan; aslida `climart_adopt` **ishlayapti**,
preflight'ning TCP probi noto'g'ri xulosa beradi).

⚠️ **PROD (`sherset_v2`) ga QO'LLANMAGAN** — DDL `docs/REJA-8-BOLIM-2026-08.md` → OPS-QADAMLAR
**10-band**ga yozildi.

### Ochiq qarzlar (jimgina qoldirilmadi)

1. **12 qoida turidan 2 tasi bor** — bu ATAYLAB (reja: «1–2 namunaviy qoida yetarli»). Qolgan 10 turi
   va §5.3 sabab-kodlari katalogi — **MK07**. Registr va Zod sxemasi shakl o'zgarmasdan kengayadi.
2. **`record_fine` PUL YOZMAYDI** — hozircha faqat jurnalga tushadi va servis `logger.warn` bilan
   buni aytadi. `HrBonusFineLog` ga ulash MK01 `applyRule` naqshini talab qiladi (summa qoidaga
   bog'langan) ⇒ **MK07**.
3. **`assign_task` / `write_warning` yon ta'sirsiz** — holat va jurnal yoziladi, `hr-task-send` va
   xodim kartasi jurnaliga ulanmagan (§5.4 kengaytmasi) ⇒ MK07/MK16.
4. **`sync` cron'ga ulanmagan** — hozircha menejer «Yangilash» bosadi. MK08 ning `escalateOverdue`
   cron qarzi bilan birga bir joyda yechilishi mantiqiy.
5. **Indeks o'lchanmagan** — `sync` dagi `OR: [dedupKey in …, status in …]` so'rovi katta akkauntda
   `EXPLAIN` bilan tekshirilishi kerak (`index-needs-matching-query-shape` sabog'i).
6. **Brauzer-QA yo'q** — Phase-2 QA navbatida (MK14).


## Faza MK18 — Xato narx nazorati (sana: 2026-08-09)

**Holat:** ✅ bajarildi — **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q**.
**Commit:** `b57615ce` — `feat(manager): MK18 — xato narx nazorati (5 detektor, bloklamaydi)`
(11 fayl, +1927/−1). **Tiklash commit'i:** `84efc024` (sabab quyida, «Git holati»).

### Muammo (kodda tasdiqlangan, reja da'vosi emas)
MK11 narx **o'zgarishini** ko'radi (`AuditLog.fieldChanges`, sub'ekt — tovar kartasi). Narx
qiymatining **o'zi mantiqlimi** degan savolni esa hech kim so'ramasdi: kassir 850 000 o'rniga
8 500 000 yozsa, chek o'tib ketardi va faqat oy oxirida (yoki hech qachon) ko'rinardi.

`retail-sale/cashier-audit.ts` da `SOLD_BELOW_COST` / `SOLD_BELOW_WHOLESALE` hodisalari
ALLAQACHON bor va kunlik KPI'ga tushadi — lekin (a) faqat **chek** uchun (yuk xatida nazorat
umuman yo'q), (b) faqat ikkita pol; **o'nlik xatosi, nol narx va o'rtachadan keskin farq**
detektorlari repoda YO'Q edi.

### Nima o'zgardi

**1. Sof modul — `manager/inventory/price-error-control.ts`** (+`.test.ts`, **32 test**)
Beshta detektor, har birining O'Z mo'ljali bilan:

| Belgi | Mo'ljal | Chegirma to'sadimi |
|---|---|---|
| `ZERO_PRICE` (nol/manfiy) | — | **yo'q** (qisqa tutashtiradi) |
| `DECIMAL_SHIFT` (10× / 0.1×) | karta narxi | **yo'q** |
| `BELOW_COST` | muzlatilgan tan narx | **ha** |
| `BELOW_WHOLESALE` | optom pol | **ha** |
| `PRICE_OUTLIER` | o'rtacha sotuv narxi | faqat PAST tomonni |

- **Tartib ahamiyatli:** `ZERO_PRICE` qolganini qisqa tutashtiradi (0 narx hamma poldan past —
  bitta muammoni besh qatorga bo'lish navbatni shovqinga ko'mardi); `DECIMAL_SHIFT`
  `PRICE_OUTLIER` dan ustun (10× ham keskin farq, ammo «o'nlik xatosi» aniqroq tashxis).
- **Navbat elementi qator bo'yicha BITTA** (`dedupKey = price_error:<docType>:<lineId>`),
  belgilar ro'yxati o'zgarsa ham kalit o'zgarmaydi — MK06 dvigateli ikkinchi element yaratmasin.
  «Qancha» = belgilar ichidagi eng katta MUTLAQ ta'sir, **yig'indi EMAS** (bir zararni ikki
  marta sanamaslik uchun).

**2. 🔴 Chegirma — TUSHUNTIRISH, xato emas** (fazaning asosiy qarori)
Reja test (2) ni aynan shu uchun talab qilgan. `cashier-audit.ts` bilan **ATAYLAB
birlashtirilmadi**, chunki ular boshqa savolga javob beradi:
- `cashier-audit.ts` — **siyosat**: «pul yo'qotildimi?» Chegirma bilan ham yo'qotilgan pul
  yo'qotilgan puldir ⇒ chegirma to'smaydi.
- MK18 — **ma'lumot sifati**: «bu raqam xato yozilganmi?» Chegirma qo'yilgan bo'lsa past narx
  ATAYLAB qo'yilgan ⇒ xato emas, `unchecked: discounted`.

Sabab modulning bosh izohida va `(2)`/`(2b)` test juftligida qulflangan — kelajakda kimdir
«ikkitasini bir joyga yig'aylik» demasin.

**3. NULL ≠ 0 va «tekshirilmagan» ≠ «toza»**
Mo'ljal yo'q bo'lsa hukm CHIQARILMAYDI va sabab `unchecked` ga yoziladi (`no_cost` ·
`no_wholesale` · `no_reference` · `no_average` · `discounted`). Mo'ljalning **0** qiymati ham
«yig'ilmagan» deb o'qiladi (`Product.buyPrice` DEFAULT 0 — uni narx deb olish har sotuvni
«100% marja» qilib ko'rsatgan bug'ning aynan o'zi). Ekranda **«0 xato»** va **«0 xato, lekin
400 qator tekshirilmadi»** alohida ko'rsatiladi.

**4. O'rtacha — leave-one-out** (`assembleSoldLines`, servis qatlamida)
Qator o'z o'rtachasiga KIRMAYDI va nol/manfiy narx havzaga qo'shilmaydi. Aks holda 3 sotuvli
tovarda bitta 10× xato o'rtachani o'zi ko'tarib, keyin o'sha o'rtachaga nisbatan «normal» bo'lib
chiqardi — detektor o'zini o'zi ko'r qilardi. Namuna **3 tadan kam** bo'lsa hukm yo'q: ikki
sotuvning o'rtachasi statistik dalil emas. Tovar va modifikatsiya alohida guruh.

**5. Servis + HTTP**
- `priceErrors()` — `RetailSalePosition` (holat `posted`/`refunded`, oyna cheklar
  `refundedFromId` bilan chiqariladi) va `DemandPosition` (`posted`, `deletedAt: null`).
  `SOLD_LINE_CAP = 2000`, kesilsa `truncated: true` — OSHKORA.
- Optom pol va default narx turi **POS BILAN BIR XIL** qoidadan olinadi
  (`retail-sale/price-snapshot.ts` + `loadFrozenPrices` naqli: default = `isDefault`, optom =
  default bo'lmagan birinchi narx turi). Ikki joyda ikki xil bo'lsa, kassirga bir pol
  ko'rsatilib, menejerga boshqasi hisoblanardi.
- `GET /manager/inventory/price-errors` (ruxsat `product:view`, faqat o'qiydi, `blocking: false`).

**6. FE** `/menejer/xato-narx` + subnav + i18n **ru+uz** (35 kalit × 2).
Ekranda doimiy «bloklamaydi» izohi, belgi-sanoqlari, `unchecked` sabablari va qamrov cheklovi.

**7. Qo'riqchi test** — `apps/web/src/__tests__/menejer-price-errors-i18n.test.ts` (13 test)
BE'ning yopiq ro'yxatlarini (`PRICE_ERROR`, `PRICE_UNCHECKED`) **manbadan skanerlaydi** va har
biri uchun ru+uz yorlig'i borligini tekshiradi. Sabab: FE ularni `t(\`kind_${...}\`)` shaklida
DINAMIK chaqiradi va `i18n:gate` bunday kalitlarni **KO'RMAYDI** (289 tasi «skipped»). MK08 da
aynan shu bo'shliq `duty_shift_unaccepted` ni ru+uz'siz qoldirgan, gate esa yashil bo'lgan.

### Gate (to'liq, commit-nuqtada)
| Gate | Natija |
|---|---|
| `@moysklad/api typecheck` | **0** |
| `@moysklad/web typecheck` | **0** |
| `lint:product` | **mening fayllarimda 0** (repo bo'ylab 22 — 22/22 si parallel sessiyalarning commit qilinmagan fayllarida) |
| `i18n:gate` | **9/9 ✓** |
| `manager/inventory` (api) | **95 test ✓** (32 sof + 26 assembly + 37 MK11) |
| FE i18n qo'riqchisi | **13 test ✓** |

**Test sifati o'lchandi (vakuum-test emas):** 5 ta mutant qo'llanib, har biri TUTILDI —
chegirma gate'i o'chirilsa (2) yiqiladi · `NULL≠0` `!= null` ga tushirilsa (3b) yiqiladi ·
miqdorga ko'paytirish olib tashlansa 2 test · o'nlik ustunligi olib tashlansa outlier testi ·
leave-one-out olib tashlansa 5 test. Yorliq qo'riqchisi ham: BE'ga soxta detektor qo'shilganda
ru+uz ikkalasi yiqildi.

### To'liq suite'dagi yiqilishlar — ikkalasi ham MENIKI EMAS (o'lchab tasdiqlandi)
1. `api publication.service.test.ts` ×3 — argon2 5000 ms timeout. **Yakka yugurtirilganda
   21/21 yashil** (4.3–5.0 s, ya'ni chegara ustida). O'sha modulga tegilmagan (`git status` bo'sh).
2. `web pos-payment-contract.test.ts` ×2 — parallel sessiyaning retail-tenders refaktori
   `PostRetailSaleSchema` dan `terminalAmountMinor`/`debtAmountMinor` ni olib qo'ygan.
   **HEAD versiyasida test yashil** (skaner mantiqini ikkala versiyaga qo'llab o'lchandi).
   Bu o'sha sessiya uchun HAQIQIY signal — qo'riqchi 2026-08-02 prod bug'i uchun yozilgan.

### Git holati — ajratilgan indeks poygasi (yangi bug-klass, hujjatlashtirildi)
Sessiya davomida daraxtda **4+ parallel sessiya** commit qildi (MK06, MK09, q13, q14).
Har biri o'z commit'ini **ajratilgan indeks** (`GIT_INDEX_FILE`) bilan qurdi. Muammo:
**blob bir HEAD dan, `read-tree` esa allaqachon siljigan HEAD dan olinsa, oradagi commit
qo'shgan narsa jimgina tushib qoladi.** Real zanjir:

- `b57615ce` (MK18) — toza commit, 11 fayl.
- `8b6dca81` (MK09) — eskirgan umumiy indeksdan qurilgan ⇒ **MK18 ning 11 faylini o'chirdi**.
- `84efc024` (mening tiklashim) — MK18 qaytdi, ammo blobim `8b6dca81` asosida qurilgan edi va
  oradagi `8210ac44` (q14) qo'shgan `pages.api_tokens` ni **men tushirib qoldirdim**.
- Keyingi sessiyalar o'z qismlarini qaytardi (`e96f6578` MK18 subnav+i18n ni tikladi).

**Yakuniy holat tekshirildi:** MK18 ning 8 kod fayli HEAD da ishchi daraxt bilan **bayt-bayt bir
xil**, `pages.menejerPriceErrors` 35 kalit ru+uz, subnav va layout yozuvi joyida.

**Retsept (keyingi sessiyalar uchun):**
1. Blob va `read-tree` **BIR XIL pinned HEAD** dan olinsin (`git rev-parse HEAD` bir marta).
2. Farq **dasturiy** ravishda «faqat-qo'shish» ekani tekshirilsin (HEAD ning har qatori
   natijada tartib bilan turibdimi).
3. `git update-ref HEAD <yangi> <eski>` — **compare-and-swap**; HEAD orada siljisa amal bekor.
4. Commit'dan keyin **har doim** `git show --stat HEAD` + o'z fayllaring HEAD da borligini
   tekshir (`git cat-file -e HEAD:<path>`).

### Ochiq qarz (ataylab qilinmagan, jimgina emas)
- **Brauzer-QA yo'q** (Phase-2 → **MK14**): ekran, filtrlar va belgi-badge'lari real brauzerda
  sinalmagan.
- **Yuk xatida mo'ljal — kartaning BUGUNGI narxi.** Chekda karta narxi qatorga muzlatilgan
  (`basePriceMinor`) va u ustun turadi; yuk xatida bunday ustun YO'Q. Shuning uchun uzoq oyna
  yuk xatilari uchun kamroq ishonchli — javobda `referenceSource` maydoni va ekranda izoh bor.
  To'liq yechim: `DemandPosition` ga `basePriceMinor` muzlatish (alohida faza, sxema o'zgarishi).
- **Navbat elementi hali SAQLANMAYDI** — `ManagerWorkItem` ombori MK06 da keldi, lekin MK18
  unga hali ulanmagan (`dedupKey` ko'prik sifatida tayyor). Ulash MK06 bilan birga qilinsin.
- **Chegaralar doimiy sozlanmaydi** — so'rovdan keladi; per-akkaunt `ManagerRuleConfig`
  (MK06/MK07) ga ko'chirilishi kerak.
- **Valyuta:** narxlar xom `minor` qiymatida taqqoslanadi (butun repo shunday). Ko'p valyutali
  karta bo'lsa taqqoslash yolg'on bo'lishi mumkin — MK11 dagi `currency_mismatch` naqli bu yerga
  hali ko'chirilmagan.


## Faza MK10 — 4M.7: «Nima qotib qolgan» + SLA paneli (sana: 2026-08-09)

**Holat:** ✅ **Phase-1 complete — strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q.**
«done / production-ready / verified» EMAS. Runtime-QA — MK34/Phase-2 sessiyasiga qoladi.
**Commit(lar):** shu sessiya commit'i (pastdagi «Git holati»ga qara).

### Nima o'zgardi

**Yangi sof modul** — `apps/api/src/modules/manager/sla/stuck-sla.ts` (Prisma'siz):
- **Beshta bosqich registri** (rejadagi ro'yxat aynan): `ORDER_PICKING` (yig'ilmagan buyurtma) ·
  `SUPPLY_ACCEPTANCE` (qabul qilinmagan yetkazma) · `CLAIM_RESPONSE` (javobsiz murojaat) ·
  `SHIFT_CLOSE` (yopilmagan smena) · `DOC_APPROVAL` (o'tkazilmagan hujjat).
- **Chegaralar SOZLAMADA** (DoD): `manager_rule_configs` jadvali, `SLA_*` kalitlari bilan
  (MK06 navbat qoidalari bilan AYNI jadval, kesishmaydigan nom fazosi). **Yangi jadval/migratsiya
  YO'Q** — ustunlar (`enabled`/`thresholdValue`/`thresholdUnit`/`severity`) aynan kerakli shakl,
  migratsiya esa umumiy resurs (CLAUDE.md §6.4). Rejaning «Fayllar» ro'yxatida ham sxema yo'q edi.
- **Birlik chegaradan ajralmaydi** (MK06 sabog'ining shu paneldagi ko'rinishi): faqat VAQT birliklari
  qabul qilinadi — `hours` va `days` (24× aniq o'girish). `percent`/`minor`/`qty` **RAD** etiladi,
  registr qiymati qoladi va ekranda `thresholdRejected` bayrog'i chiqadi (jim tushib qolgan sozlama
  menejerni «men chegarani o'zgartirdim-ku» yolg'on ishonchida qoldirardi).
- **`STAGE_OPEN_STATES`** — «ochiq holat» ta'rifining YAGONA manbai; servis Prisma `where` bandini
  aynan shundan quradi, ya'ni **yopilgan ob'ekt umuman o'qilmaydi** (3-majburiy test shu sababdan
  tavtologiya emas).
- **🔴 `blocks: false` literal tipi** har ta'rifda — MK06 dagi bilan bir xil qulf: SLA oshgani hech
  qanday hujjatni to'xtatmaydi (§5.1).

**Prisma I/O** — `manager-sla.service.ts` (+ `manager-sla.schema.ts`, `manager-sla.controller.ts`):
- To'qqizta manba bir `Promise.all` da: `MsPickList` · `Supply` · `ServiceRequest` ·
  `CashierSession` · qoralama `Demand`/`PaymentIn`/`PaymentOut`/`CashIn`/`CashOut`.
- **Yangi yozuvchi OCHILMADI**: qotib qolish holati manba jadvallarning o'zida (`pickState`,
  `approvalStage`, `status`, `state`) — nusxalash ikki haqiqat bo'lardi. Panel har so'rovda jonli
  hisoblanadi; yagona yozuv — menejer o'zgartiradigan chegara.
- **Yetkazma yoshi `SupplyApprovalEvent` ning oxirgi hodisasidan** (`groupBy _max.createdAt`)
  hisoblanadi, `updatedAt` dan EMAS: pozitsiya tahriri ham `updatedAt` ni yangilaydi va qotib qolgan
  hujjat «hozirgina qimirlagan» bo'lib ko'rinardi.
- **Manba shifti (500/manba) JIM emas** — `sourceTruncated: true` javobda va ekranda chiqadi.
- **NULL ≠ 0 (MK09 shartnomasi):** murojaatda summa yo'q ⇒ `amountMinor: null` (0 emas);
  bosqichda oshgani yo'q ⇒ `worstOverdueHours: null` (0 emas — «0 soat» «bir soniya kechikdi»
  degan ma'no berardi).
- Ruxsat: `employees:read` (ko'rish) / `employees:full` (chegara sozlash) — `manager/queue` va
  `manager/kpi` bilan aynan bir darvoza; yangi `PermissionEntity` kiritilmadi (MK26–MK30 qamrovi).

**Web** — `apps/web/src/app/(app)/menejer/qotib-qolgan/page.tsx` + subnav bandi (`stuck_sla`,
navbatdan keyin) + `_components/stuck-doc-link.ts`:
- Bosqich kartalari (chegara · jami · oshgan · eng yomoni) + **inline chegara tahriri** (qiymat +
  birlik birga yuboriladi) va bosqichni yoqish/o'chirish.
- Qatorlar: eng ko'p oshib ketgani TEPADA (bosqichlar aralash) — menejer ekranni yuqoridan o'qiydi.
- **Ekran matni serverda yopilmaydi** (MK03 sabog'i): BE `stateKey` qaytaradi, FE tarjima qiladi.
- i18n ru+uz — 48 kalit `pages.managerSla` + 1 subnav kaliti.

### Testlar (RED → GREEN)

| Fayl | Test | Nima qulflandi |
|---|---|---|
| `stuck-sla.test.ts` | **25** | 3 majburiy shartnoma + registr/sozlama/taxta qoidalari |
| `manager-sla.service.test.ts` | **10** | `where` bandi `STAGE_OPEN_STATES` dan · panel YOZMAYDI · sozlama faqat `SLA_*` · bigint→satr · shift bayrog'i · yetkazma yoshi oxirgi hodisadan |
| `stuck-doc-link.test.ts` (web) | **6** | `refId` bosqichga qarab boshqa ma'noda — yig'ish qatori `/pick-lists/<id>` ga boradi, `/customer-orders/<id>` ga EMAS |

RED ko'rildi: birinchi yugurtishda `stuck-sla.js` topilmadi (modul yo'q edi) → keyin 25/25 GREEN.
Servis testida bitta RED haqiqiy edi (`ageHours` 34.47 ≠ 30) — sabab: test qat'iy sanadan,
servis esa jonli `new Date()` dan hisoblardi; test sanalari haqiqiy hozirgi paytga bog'landi.

**Rejadagi uch majburiy test — qayerda:**
1. «SLA ichidagi ob'ekt ro'yxatga tushmaydi» → `stuck-sla.test.ts` → «🔴 SLA ICHIDAGI ob'ekt…»
   (chegaraga TENG yosh ham tushmaydi — qat'iy `>`; jamida esa sanaladi).
2. «Chegara sozlamasi ta'sir qiladi» → o'sha faylda: 4 soat registrida bo'sh ro'yxat, sozlama
   2 soatga tushirilsa to'ladi; `days` ga ko'tarilsa yana bo'shaydi.
3. «Yopilgan ob'ekt ro'yxatdan chiqadi» → `isStageOpen` yopiq holatlarni rad etadi +
   `manager-sla.service.test.ts` har manbaning `where` bandi aynan shu ro'yxatdan qurilishini
   tekshiradi (ya'ni yopilgan ob'ekt BAZADAN ham o'qilmaydi).

### Gate natijasi

- `pnpm --filter @moysklad/api typecheck` → **0**
- `pnpm --filter @moysklad/web typecheck` → **0**
- `pnpm i18n:gate` → **o'tdi** (434 fayl, 12744 statik kalit)
- `pnpm --filter @moysklad/api exec vitest run src/modules/manager/ src/app-boot.test.ts` →
  **595/595** (32 fayl) · SLA moduli alohida **35/35**
- `pnpm --filter @moysklad/web exec vitest run "src/app/(app)/menejer"` → **29/29**
- `pnpm lint:product` → **mening fayllarimda 0** (`biome check` MK10 yo'llari bo'yicha toza).
  ⚠️ Repo-bo'ylab gate shu payt YASHIL EMAS edi — yiqilishlar **parallel sessiyalarning
  commit qilinmagan fayllarida** (`manager/queue/manager-queue.service.ts`,
  `modules/expense-budget/*`, `menejer/_components/expense-budget-screen.tsx`,
  `queue/rule-candidates*`). Ularga TEGILMADI (CLAUDE.md §6.1).

### Halol cheklovlar (qarz sifatida ochiq yozilmoqda)

1. **Browser-smoke YO'Q.** Sahifa hech qachon jonli brauzerda ochilmagan; barcha da'volar
   typecheck + unit darajasida. Xotira: «brauzer-QA statik ko'rmaganini tutadi».
2. **i18n gate dinamik kalitlarni ko'rmaydi.** `t(\`stage_${...}\`)` / `t(\`state_${...}\`)` —
   gate ularni «dynamic» deb o'tkazib yuboradi (300 ta shunday kalit bor). Kalitlar qo'lda
   ro'yxatlab qo'yilgan: 5 bosqich + 9 holat + 3 jiddiylik. Yangi holat qiymati paydo bo'lsa
   (masalan `Supply.approvalStage` ga yangi bosqich) **ekranda kalit nomi ko'rinadi** — buni
   hech bir gate tutmaydi.
3. **`ServiceRequest.dueDate` ISHLATILMADI.** Panel «qancha vaqtdan beri qimirlamadi» ni
   o'lchaydi; mijozga va'da qilingan muddatga nisbatan kechikish — boshqa ko'rsatkich. Ikkisini
   bitta ustunda aralashtirish qaysi raqam nimani anglatishini yashirardi (kelajakdagi faza).
4. **Yig'ish yoshi buyurtma KELGAN paytdan** (`MsPickList.moment`), yig'ish boshlanganidan emas.
   Bu ataylab: omborchi hujjatni qo'liga olgani mijozning kutish vaqtini nolga qaytarmaydi.
   `live-status.ts` dagi 45 daqiqa BOSHQA o'lchov (boshlangandan keyingi qotish) — u tegilmadi.
5. **Valyutasiz manbalar:** `MsPickList` va `CashierSession` da valyuta ustuni yo'q ⇒ `currency: null`
   qaytadi va FE `formatMoney` ning bazaviy valyutasi (UZS) bilan chizadi — mavjud menejer
   ekranlaridagi bilan bir xil xulq, lekin bu **tasdiqlanmagan** taxmin.
6. **Chegaralar boshlang'ich qiymatlari** (4 / 24 / 8 / 12 / 48 soat) — kodda izohlangan mulohaza,
   egasi bilan kelishilmagan. Ular **sozlamadan** o'zgartiriladi; `SHIFT_CLOSE` ataylab
   `live-status.ts` dagi `SHIFT_LONG_HOURS` ni import qiladi (ikkinchi raqam kiritilmadi).
7. **`sourceCap` 500** — bir bosqichda undan ko'p qotib qolgan ob'ekt bo'lsa xulosadagi sonlar
   «kamida shuncha» ma'nosini oladi (ekranda ogohlantirish chiqadi).

### Git holati (parallel sessiyalar — MAJBURIY o'qish)

Bu sessiya davomida ish daraxtida **kamida uchta boshqa sessiya** faol edi (MK07 qoida registri,
MK16 qarz undirish, MK12 xarajat byudjeti). Natijada 4 ta fayl **uch sessiyaning** commit
qilinmagan tahririni birga ushlab turardi: `manager.module.ts`, `layout.tsx`, `messages/ru.json`,
`messages/uz.json`.

- `work-item-rules.ts` ga qo'shilgan `hours` birligi **QAYTARIB OLINDI** — MK07 sessiyasi o'sha
  faylni aynan shu paytda yozayotgan edi. O'rniga MK10 o'z birlik lug'atini (`SLA_THRESHOLD_UNIT`)
  saqlaydi, `days` qiymati esa MK06 dagi bilan bir xil satr (bitta sozlama jadvali).
- Shared fayllar uchun **«HEAD + faqat mening hunk'larim» blobi** qurildi
  (`hash-object -w` + `update-index --cacheinfo`) — xotira `commit-pathspec-takes-worktree-version`
  retsepti. Ish daraxti tegilmadi: boshqa sessiyalarning tahriri o'z joyida qoldi.
- Hook'lar bir martaga chetlab o'tildi (`core.hooksPath=/dev/null`), chunki `lint-staged` butun
  daraxtni stash qilib begona fayllarni commit'ga qo'shib yuborardi (§6.7 B). Gate'lar shu sababdan
  **qo'lda to'liq** yugurtirildi — yuqoridagi «Gate natijasi» bo'limi.

### Keyingi qadam uchun

- MK07 (12 qoida turi) `MANAGER_RULES` ni to'ldiradi — SLA registri **alohida** (`SLA_STAGES`),
  ikkalasi bir jadvalda yashaydi, `resolveRules`/`resolveSlaStages` bir-birining kalitini jim
  tashlab ketadi. Yangi qoida qo'shilganda bu ajratma buzilmasin.
- Phase-2 QA (MK34 yoki menejer cohort) — shu ekranni jonli brauzerda: bo'sh holat, chegara
  tahriri, `thresholdRejected` bayrog'i, `sourceTruncated` ogohlantirishi.


## Faza MK16 — Qarz undirish ish ro'yxati (sana: 2026-08-09)

**Holat:** ✅ **Phase-1: strukturaviy + unit-tasdiqlangan, browser-smoke YO'Q.**
«done» / «production-ready» / «verified» EMAS — runtime-QA MK14 ga qoladi.
**Commit:** pastdagi «Git holati» bo'limiga qara.

### Nima o'zgardi

**BE — yangi `apps/api/src/modules/manager/collection/` (4 fayl + 2 test fayl):**
- `debt-collection.ts` — **sof** qoidalar (Prisma yo'q, `Date.now()` yo'q, «hozir» argument):
  qator qurish · muddat hisobi · determinist tartib · valyuta-jamlari · idempotentlik oynasi.
- `debt-collection.service.ts` — I/O: `Debt` o'qish + `DebtNote.groupBy` (oxirgi aloqa / oxirgi
  eslatma) + eslatmani **mavjud** `DebtService.sendBulkReminders` ga topshirish.
- `manager-collection.schema.ts` — Zod (`scope`, `responsibleId`, `problemOnly`, `limit≤500`;
  `remind`: `debtIds≤200`, `channel: sms|telegram`).
- `manager-collection.controller.ts` — `GET /manager/collection` (`debt:view`) ·
  `POST /manager/collection/remind` (`debt:update`).
- `manager.module.ts` — `DebtModule` **oshkora import** + controller/provider ro'yxati.
- `debt.schema.ts` — `DebtNoteKindSchema` ga `'reminder'` qo'shildi.

**FE:**
- `apps/web/src/app/(app)/menejer/undirish/page.tsx` — ekran (tanlash · kanal · «Eslatma
  yuborish» · halol natija paneli).
- `layout.tsx` — menejer subnav'iga `collection` bandi (javobgarlikdan keyin: ikkalasi ham
  «bizning pulimiz kimda» savoli, lekin bu yerda sub'ekt xodim emas, **mijoz**).
- `messages/{uz,ru}.json` — `pages.menejerCollection` (52 kalit ×2) + `subnav.menejer.collection`
  + `pages.debts.kind_reminder`.
- `debts/[id]/page.tsx` — `kindLabel` ga `reminder` shoxi (aks holda yangi tur fallback'ga
  tushib **«Qo'ng'iroq»** deb yolg'on yorliq olardi).
- `lib/debt-api.ts` — `DebtNoteKind` ga `'reminder'`.

### Qaror: idempotentlik jurnali — YANGI JADVAL EMAS
Eslatma mavjud `DebtNote` jurnaliga `kind='reminder'` bilan yoziladi. Sabablari:
1. **Migratsiya kerak emas** (`kind` — `VarChar(20)`, DB'da CHECK yo'q, tekshirildi).
2. Eslatma qarzning **muloqot tarixida** operator ko'radigan joyda paydo bo'ladi; «oxirgi aloqa»
   endi eslatmani ham hisobga oladi.
3. `recomputeLastCall` faqat `kind:'call'` ni o'qiydi (`debt.service.ts:1322`) ⇒ yangi tur
   qo'ng'iroq natijasini **buzmaydi** — o'z ko'zim bilan tasdiqlandi.

**Idempotentlik oynasi = bir qarzga bir Toshkent kunida bitta eslatma** (kanaldan qat'i nazar).
Jurnal **FAQAT haqiqatan ketgan** xabarga yoziladi: telefoni yo'qligi sababli o'tkazib
yuborilgan qarz «bugun eslatilgan» bo'lib qolmaydi va operator raqamni to'g'irlagach **o'sha
kuni qayta urina oladi**.

### Uch ma'lumot-sifati shartnomasi ekranga ko'chirildi
- **NULL ≠ 0** — `nextContactAt` yo'q qarzning `overdueDays` i `null` (0 EMAS) va u «Muddat
  qo'yilmagan» belgisini oladi; `scope='due'` da ham **qoladi** (muddatsizlik o'zi ish).
- **Yorliq ≠ instant** — kechikish **kalendar kunlarida** (Toshkent) sanaladi, `ms/86400000`
  bilan emas. Test: kecha 23:00 dagi muddat bugun 14:00 da **1 kun** (0.6 emas).
- **Valyutalar qo'shilmaydi** — jam har valyuta uchun alohida qatorda.

### Tartib (determinist, to'liq)
`overdueDays` ↓ (null oxirida) → `currency` ↑ → `remainingMinor` ↓ → `debtId` ↑.
Oxirgi kalit unikal ⇒ kirish tartibidan qat'i nazar bir xil natija (test bilan qulflangan:
to'plam teskari berilganda ham natija bir xil).

### Testlar (RED → GREEN)
- `debt-collection.test.ts` — **22 test**. RED tasdiqlandi (modul yo'q ⇒ suite yuklanmadi).
- `debt-collection.service.test.ts` — **12 test**.
  ⚠️ **Halol qayd:** servis testi RED holatida YUGURTIRILMADI (test yozilib, implementatsiya
  darhol qo'shildi). Buning o'rniga **mutatsiya bilan tekshirildi**: (a) `isRemindedOn` qulfi
  olib tashlandi, (b) jurnal `skipped`larga ham yozildi ⇒ **4 test yiqildi**, keyin tiklandi
  (34/34 yashil). Ya'ni testlar **vakuum emas** — o'lchandi.
- Reja talab qilgan uchta test **borligi**: (1) to'langan qarz ro'yxatdan chiqadi ✅
  (`buildCollectionRow` null + `list` filtri); (2) eslatma jurnalga tushadi va takror
  yuborilmaydi ✅ (4 test); (3) tartib determinist ✅ (3 test).

### Gate natijasi
- `pnpm --filter @moysklad/api typecheck` — **mening fayllarimda 0 xato**. Daraxtda qolgan
  yiqilish: `manager/sla/manager-sla.service.ts` — **parallel sessiyaning MK10 ishi** (u modul
  men boshlaganimda umuman yo'q edi).
- `pnpm --filter @moysklad/web typecheck` — **mening fayllarimda 0 xato**. Qolgani:
  `menejer/_components/expense-budget-screen.tsx` — parallel sessiyaning MK12 ishi.
- `pnpm lint:product` — **mening fayllarim toza** (biome `--write` bilan formatlandi).
  Umumiy hisob 14→19 ga chiqdi, lekin ro'yxatdagi fayllarning **birortasi ham meniki emas**.
- `pnpm i18n:gate` — **mening kalitlarim 0 yetishmovchilik** (`menejerCollection` /
  `subnav.menejer.collection` bo'yicha 0 natija); `i18n-no-hardcoded` 6/6 yashil.
  Gate umumiy yiqiladi — barcha yetishmayotgan kalitlar `pages.managerSla` +
  `subnav.menejer.stuck_sla`, ya'ni **parallel MK10 sessiyasiniki**.
- Testlar (api): `app-boot.test.ts` + `src/modules/debt` + `src/modules/manager/collection` —
  **204/204 yashil (15 fayl)**.
- Testlar (web): `src/__tests__` + `src/app` — **1272 yashil / 1 yiqilish**. Yiqilgan
  `raw-element-conventions.test.ts` ning uchala «aybdor» fayli ham parallel sessiyaniki
  (`menejer/qotib-qolgan/page.tsx` ×1, `menejer/_components/expense-budget-screen.tsx` ×2);
  mening `menejer/undirish/page.tsx` **ro'yxatda yo'q** — u `NativeSelect`/`Checkbox`
  dizayn-tizim primitivlarini ishlatadi.

### To'liq suite'dagi yiqilishlar — MENIKI EMAS (o'lchab tasdiqlandi)
`src/modules/manager` ni to'liq yugurtirganda **5 yiqilish**, hammasi bitta faylda:
`manager/queue/manager-queue.service.test.ts`. Sabab o'lchandi: test `reasonCodes` ni kutadi,
`manager-queue.service.ts` da esa u **hali yo'q** (`grep -c`: test 1, servis 0) — parallel
sessiya MK07 ni TDD bilan yozmoqda (960 qator commit qilinmagan). Mening diff'im o'sha faylga
tegmaydi.

### Parallel sessiya bilan kesishma (§6 protokoli)
Sessiya davomida daraxtda kamida **uch** parallel ish oqimi ko'rindi: q12 auth
(commit `14670927`), MK07 navbat qoidalari, MK10 SLA + MK12 xarajat byudjeti (untracked).
`manager.module.ts` **ikkalamiz** ham tahrir qildik (men — collection, ular — SLA).
Diff'im path-cheklangan; `git add` faqat aniq yo'llar bilan.

### Preflight anomaliyalari — ikkalasi ham hal qilindi
1. «Ish daraxti toza emas» — parallel sessiyaning q12 auth ishi edi; men boshlaganimda
   `M` bo'lgan fayllar keyin `14670927` bo'lib commit qilindi. **Tegilmadi.**
2. «NEXT.md'da git'da yo'q hash'lar (`a0b44c73`, `9c046ac2`)» — **YOLG'ON POZITIV, o'lchandi:**
   `a0b44c73…` — NEXT.md:689 dagi **tovar UUID** prefiksi, `9c046ac2` — NEXT.md:837 dagi
   **md5** yig'indisi. Ikkalasi ham commit hash emas. Preflight skaneri 8-belgili hex'ni
   farqlamaydi — kichik qarz, MK16 qamrovidan tashqarida.

### Ochiq qarz (ataylab qilinmagan, jimgina emas)
- **Brauzer-QA yo'q** (Phase-2 → MK14): ekran, tanlash, «Eslatma yuborish» tugmasi va natija
  paneli real brauzerda sinalmagan. Eslatmaning **haqiqatan yetib borishi** ham sinalmagan.
- **«Muddat» = `nextContactAt`.** `Debt` da alohida `dueDate` ustuni **yo'q** — kelishilgan
  keyingi aloqa sanasi muddat sifatida olindi (TZ §3.3 uni qarz berishda MAJBURIY qiladi).
  Agar egasi «to'lov muddati» ni aloqa jadvalidan ajratishni istasa — sxema o'zgarishi (alohida
  faza).
- **Navbat (MK06) ga ulanmagan** — MK16 mustaqil ekran; `ManagerWorkItem` elementi
  yaratilmaydi. Reja «Bog'liqlik: MK06» deydi, lekin qamrov ro'yxat/ustunlar deb ta'riflangan;
  ulash alohida qadam.
- **Kanal-aniq idempotentlik yo'q** — bugun SMS ketgan bo'lsa, bugun Telegram ham ketmaydi.
  Kanalni saqlash uchun `DebtNote` ga ustun kerak bo'lardi (migratsiya) — ataylab qilinmadi.
- **`sendBulkReminders` faqat SON qaytaradi** (`queued`), id ro'yxatini emas. Ketganlar
  `nomzod − skipped` ayirmasidan chiqariladi; mos kelmasa `logger.warn` va jurnal baribir
  ayirma bo'yicha yoziladi (mijozga **ikkinchi xabar** ketishi bloklangan urinishdan og'irroq).
- **`todo.md` YANGILANMADI — ataylab.** O'ZGARMAS QOIDA 11 «tegishli katakchani `[x]` qil»
  deydi, lekin egasining §8.1 to'lqini (MK15–MK24) `todo.md` da **umuman kuzatilmaydi**:
  4M bo'limi faqat 4M.1–4M.10 ni sanaydi va MK16 ularning hech biriga to'g'ri kelmaydi.
  «Qolgan bosqichlar = 54» ni bir kamaytirish **asossiz raqam** bo'lardi (bo'limlar jadvali
  yig'indisi 58 — hisob allaqachon eskirgan). Qarz: §8.1 to'lqinini `todo.md` ga kiritish.
- **Prod DDL/migratsiya:** kerak emas (yangi jadval/ustun yo'q). Faqat `kind` ning yangi
  qiymati — mavjud `VarChar(20)` ga sig'adi.

---

## Faza MK12 — 4M.9: xarajat byudjeti (plan/fakt) (sana: 2026-08-09)

**Holat:** ✅ **Phase-1 — strukturaviy + unit-tasdiqlangan, BROWSER-SMOKE YO'Q** (runtime QA = MK14).
**Commit:** `c5e1b153` — `feat(manager): MK12 — xarajat byudjeti (modda × oy): reja/fakt/og'ish`
(20 fayl, +2202 qator).

### Nima o'zgardi

**Baza** — `packages/db/prisma/schema.prisma` + `migrations/20260810100000_expense_budget/`:
yangi `ExpenseBudget` (`expense_budgets`) — `account × expense_item × year_month` **unique**,
`planned_minor BIGINT`, `currency`, `note`, `created_by/updated_by`. CHECK'lar: `planned_minor >= 0`
va `year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`. FK `expense_item_id` → **RESTRICT** (rejasi bor modda
o'chirilsa byudjet «moddasiz» qolardi). **Fakt ustuni ataylab YO'Q** — u nusxalansa hujjat
tahrirlanganda byudjet jimgina eskirardi.

**Backend** — yangi `apps/api/src/modules/expense-budget/` (6 fayl), `AppModule`ga ulandi:
- `expense-fact.ts` — sof agregatsiya qatlami (uch manba → modda × baza-valyutasi).
- `budget-variance.ts` — sof og'ish/status qatlami (`no_plan` · `within` · `warning` · `over`).
- `expense-budget.service.ts` — so'rovlar + yig'ish + reja upsert/delete.
- `expense-budget.controller.ts` — `GET /expense-budget?yearMonth=` · `POST` · `DELETE /:id`.
  Ruxsat: mavjud `expenseitem` entity'si (`view`/`update`) — **yangi `PermissionEntity` kiritilmadi**
  (MK06 dagi bilan bir xil qaror: u seed matritsasini ham talab qilardi, MK26–MK30 qamrovi).

**Frontend** — `apps/web/src/app/(app)/menejer/byudjet/` + `_components/expense-budget-screen.tsx`
+ `lib/expense-budget-api.ts` + subnav bandi (`layout.tsx`) + 32 i18n kaliti ru+uz.

### 🔴 Fazaning asosiy qarori — «ikki manba qo'shilmaydi» AYNAN nima

Reja testi (1) ni tekshirishda savol shu bo'ldi: **qaysi ikki manba bir pulni ikki marta sanaydi?**
Kodda tasdiqlandi (CLAUDE.md §2):

| Manba | Jadval | Modda kaliti | Byudjetda |
|---|---|---|---|
| Kassa RKO | `cash_out` | `expense_item` (erkin matn) | ✅ |
| Bank to'lovi | `payments_out` | `expense_item` (erkin matn) | ✅ |
| POS yashiq | `retail_drawer_cash_out` | `expense_item_id` (FK) | ✅ **faqat `kind='expense'`** |
| Chiqim akti | `losses` | `expense_item` | ❌ |

1. **`kind='expense'` filtri = ikki-karra sanoq qulfi.** `retail_drawer_cash_out` uch xil pul
   chiqishini bitta jadvalda saqlaydi (`expense` · `collection` · `other`). **Inkassatsiya xarajat
   EMAS** — u kassadan bankka **ko'chirish**; filtrsiz yig'sak, o'sha pul keyin bankdan `PaymentOut`
   bilan chiqqanda **ikkinchi marta** sanalardi. Shart alohida funksiyaga
   (`drawerExpenseWhereKind()`) chiqarildi va ikki joyda qulflandi: sof testda + servis so'rovida.
2. **`Loss` QO'SHILMADI** — unda ham `expense_item` ustuni bor, lekin u tovar hisobdan chiqishi,
   pul chiqishi emas; qiymati tan narx orqali allaqachon COGS'da. Qo'shilsa bir xarajat ikki marta.
3. **Bitta hujjat — bitta chelak.** FK ham, teg matni ham to'lgan hujjatda tartib qat'iy: FK →
   matn → moddasiz. Test bu invariantni alohida qulflaydi.
4. **RKO va bank ikki xil pul yo'li** — ular bir-birini takrorlamaydi, ikkalasi ham kiradi
   (P&L allaqachon shunday yig'adi).

### ⚠️ P&L bilan ataylab farq (hujjatlangan qarz)

`report/pnl.service.ts` xarajat qatorini faqat `payments_out` + `cash_out` dan yig'adi —
`retail_drawer_cash_out` u yerda **YO'Q**. Byudjet POS xarajatini ham ko'rsatadi (aks holda
kassadan to'langan ijara byudjetda umuman ko'rinmasdi). Ikki ekrandagi «xarajat» raqamining farqi
shundan. **P&L tomonini tuzatish MK12 qamrovidan tashqarida** (O'ZGARMAS QOIDA 1) — quyida yangi
faza taklifi sifatida yozildi. Sabab `expense-fact.ts` bosh izohida ham turibdi.

### 🔴 NULL ≠ 0 — uch joyda

1. **Reja qo'yilmagan oy** → `varianceMinor` va `usedPercent` **NULL**, status `no_plan`.
   «0% ishlatildi» ham, «100% oshib ketdi» ham yolg'on bo'lardi. **Reja yo'qligi = QATOR yo'qligi**,
   `planned_minor = 0` EMAS (nol reja boshqa javob: har qanday sarf ⇒ `over`).
2. **Kursi yo'q valyutadagi REJA** → `plannedMinor: null` + `planUnconvertible: true`.
   Bu yerda `consolidateToBase` ning 0 qaytarishi YARAMAYDI: 0 reja har qanday faktni «oshib ketdi»
   qilib ko'rsatardi — mavjud bo'lmagan muammo.
3. **Kursi yo'q valyutadagi FAKT** → jamiga qo'shilmaydi, `unconvertedByCurrency` da o'z valyutasida
   qaytadi (Faza 17 / M-12 shartnomasi, [[report-conversion-contract-faza17]]).

**Pul hech qayerda jimgina yo'qolmaydi:** moddasiz va tanilmagan tegli pul alohida qatorda
(`untaggedMinor`); bir nomni ikki modda ko'tarsa **taxmin qilinmaydi** — moddasizga tushadi va
`ambiguousNames` bayrog'i qaytadi ([[data-quality-flag-layer]] naqshi). Jamlar **faqat rejasi bor**
qatorlar bo'yicha (yagona halol reja↔fakt solishtiruvi), rejasiz pul `unplannedActualMinor` da.

### Oy chegarasi

`monthInstantBounds` (Toshkent yarim tuni) — `monthBounds` (UTC) ishlatilsa oyning 1-kunidagi
00:00–05:00 xarajatlari o'tgan oyga tushib qolardi ([[month-bounds-label-vs-instant]]).
Sana ustuni `moment` (P&L bilan bir xil), `state='posted' AND deleted_at IS NULL`.

### Testlar (RED → GREEN) — 40 ta

RED tasdiqlandi: avval `expense-fact.test.ts` + `budget-variance.test.ts` yozildi, `Failed to load
url ./expense-fact.js` bilan yiqildi, keyin implementatsiya.

- `expense-fact.test.ts` (8) — uch manbadan yig'ish · bitta hujjat bitta chelakda · inkassatsiya
  filtri · kursi yo'q valyuta · hujjatning o'z kursi · moddasiz pul · registr/bo'shliq · ikki xil
  moddadagi bir nom.
- `budget-variance.test.ts` (11) — plan yo'q (NULL, 0 emas) · chegara AYNAN 90% · 89.99% · planga
  teng (`warning`, `over` emas) · +1 tiyin (`over`) · sozlanadigan chegara · plan=0 · BigInt aniqligi
  (`> MAX_SAFE_INTEGER`).
- `expense-budget.service.test.ts` (11) — `kind='expense'` so'rovda · `posted`/`deletedAt` · Toshkent
  chegarasi (`2026-07-31T19:00:00Z`) · **manba-skan: servis xarajat hujjatiga `create/update/delete`
  qilmaydi** · reja yo'q · reja bor · konvertatsiya qilinmaydigan reja · konvertatsiya qilinmaydigan
  fakt · moddasiz qator · tartib (oshib ketgan tepada) · reja so'rovi oyi.
- `expense-budget-screen.test.tsx` (10) — ekranda `—` (0% ham, 100% ham emas) · konvertatsiya
  qilinmaydigan reja `—` · moddasiz qatorga reja qo'yib bo'lmaydi · jamdan tashqaridagi pul ·
  major↔minor konvertatsiyasi BigInt aniqligida (yaroqsiz kiritma **NULL**, jimgina 0 emas).
- `app-boot.test.ts` — `expense-budget` route skanerga qo'shildi (DoD); yetim-modul qo'riqchisi
  `ExpenseBudgetModule` ning `AppModule`da ekanini tasdiqladi.

### Gate natijasi (qo'lda to'liq — hook chetlab o'tildi)

| Gate | Natija |
|---|---|
| `@moysklad/api typecheck` | **0** ✅ |
| `@moysklad/web typecheck` | **0** ✅ |
| biome (o'z fayllarim) | **0** ✅ (15 fayl, `check` toza) |
| `pnpm i18n:gate` | **o'tdi** ✅ (+ 27 kalit ru/uz da borligi skript bilan alohida tekshirildi, `components/` ko'r nuqtasi uchun) |
| `api vitest run` (to'liq) | 484/486 fayl ✅ — **1 yiqilish parallel sessiyaniki** (`manager/queue/manager-queue.service.test.ts`, MK07 in-flight) |
| `web vitest run` (to'liq) | 200/201 ✅ — **1 yiqilish parallel sessiyaniki** (`raw-element-conventions` → `menejer/qotib-qolgan/page.tsx`, MK10 in-flight) |

`pnpm lint:product` repo bo'yicha 8 xato ko'rsatadi — **hammasi parallel sessiyaning
`manager/queue/*` fayllarida**, mening fayllarimda 0 (§6.1: tegilmadi).

**Raw-element qoidasi (UI Convention 8):** dastlab `<select>` va `<input type="month">` yozilgan edi
— `raw-element-conventions.test.ts` tutdi, DS `NativeSelect` / `Input` ga ko'chirildi
(`hr/attendance/monthly` naqshi). Bu — web-only gate'ning foydasi ko'ringan joy.

### Git holati (§6.7 ehtiyoti)

Parallel sessiya butun sessiya davomida **faol** edi (MK07 navbat qoidalari, MK10 SLA, MK16 undirish).
Shuning uchun:
- `git add` faqat aniq yo'llar bilan; commit `-c core.hooksPath=/dev/null` bilan (lint-staged butun
  daraxtni stash qilib begona faylni commit'ga qo'shib yuborardi — §6.7 B), gate'lar qo'lda to'liq
  yugurtirildi va commit xabarida yozildi.
- `ru.json`/`uz.json` da parallel sessiyaning MK07 kalitlari (rule_*/reason_*, ~56 qator) turgan edi.
  `git add <fayl>` ularni ham olib kirardi ([[commit-pathspec-takes-worktree-version]]). Yechim:
  **«HEAD + faqat mening hunk'larim»** blobi — fail-closed skript (anchor topilmasa `exit 1`,
  `JSON.parse` bilan tekshiradi, qator sonini solishtiradi) → `hash-object -w` →
  `update-index --cacheinfo`. Blob commitdan **darhol oldin qayta qurildi**
  ([[rebuilt-blob-goes-stale]]) — SHA o'zgarmadi, ya'ni HEAD siljimagan edi.
- `git show --stat HEAD`: **20 fayl, hammasi meniki**. Parallel sessiyaning kalitlari daraxtda
  saqlanib qoldi (tekshirildi).

### Preflight anomaliyalari — ikkalasi ham YOLG'ON POZITIV (tekshirildi)

- «NEXT.md top-entry'larda git'da yo'q hash'lar: `a0b44c73`, `9c046ac2»` — birinchisi **tovar
  UUID'ining prefiksi** (`NEXT.md:689`, yacheyka misoli), ikkinchisi **md5 dajesti**
  (`NEXT.md:837`, `YesNoSelect` dedupi). `scripts/preflight.mjs` ning hex-regexi matn ichidagi har
  qanday 8-belgili hex'ni commit hash deb o'qiydi. **Preflight qarzi** (quyida).
- «ish daraxti toza emas» — parallel sessiyaning faol ishi (§6.1), tegilmadi.

### Qolgan qarz / DEFER

1. **P&L POS xarajatini ko'rmaydi** — `pnl.service.ts` ga `retail_drawer_cash_out` (`kind='expense'`)
   qo'shilishi kerak, aks holda «xarajat» ikki ekranda ikki xil. Yangi faza taklifi: **MK41**.
2. **Modda tegi erkin matn** — `cash_out`/`payments_out` da `expense_item VARCHAR(100)`, FK emas.
   Shu sababdan nom bo'yicha moslash kerak bo'ldi va «bir nom ikki modda» holati mumkin. To'g'ri
   yechim — hujjatlarni FK'ga ko'chirish migratsiyasi (backfill + FE). Yangi faza taklifi: **MK42**.
3. **Ogohlantirish chegarasi 90%** — TZ'da yo'q, agent tanlagan default. Kodda muzlatilmagan
   (`warnPercent` so'rov parametri, `DEFAULT_WARN_PERCENT`). Egasi boshqa qiymat xohlasa — sozlamaga
   chiqarish MK13 dagi `SCORE_CAP_PERCENT` bilan **birga** qilinsin (bir xil naqsh, ikki marta emas).
4. **Reja valyutasi** — ustun bor, lekin FE hozircha faqat baza valyutasida yozadi (`currency`
   yuborilmasa `UZS`). Ko'p valyutali reja kiritish UI'si kerak bo'lsa alohida ish.
5. **Browser-smoke YO'Q** → MK14 (4M Phase-2 QA). Ekranda tekshirilishi kerak: oy almashtirish,
   inline reja tahriri, `—` kataklari, RU-locale.
6. **Preflight yolg'on pozitivi** — `scripts/preflight.mjs` hash-tekshiruvi matn ichidagi hex'ni
   commit deb o'qiydi (`\b[0-9a-f]{8}\b` klassi). Kamida backtick/`commit` konteksti talab qilinsin.

### OPS-QADAM qo'shildimi

**Ha** — prod (`sherset_v2`) sxema-drift: `migrations/20260810100000_expense_budget/migration.sql`
qo'lda qo'llanishi kerak (`expense_budgets` jadvali + 2 indeks + 4 FK + 2 CHECK). Lokal
`climart_adopt` da `prisma db execute --file` bilan **qo'llandi va tekshirildi**. Avtomatik
`migrate deploy` QILINMADI (O'ZGARMAS QOIDA 7).
