# Deploy dossieri — `62a27024..HEAD`

> **Maqsad:** deploy nuqtasidagi holatni bir joyga yig'ish. Bu fayl fazalar
> hisobotini ALMASHTIRMAYDI.
>
> **Yaratilgan:** 2026-08-25 (delta `62a27024..8d1f4a01`, 37 commit, 7 migratsiya).
> 🔴 **QAYTA YOZILDI: 2026-08-26** — delta o'shandan beri deyarli ikki baravar
> o'sdi (**69 commit, 12 migratsiya**) va eski raqamlar deploy'ni xato yo'lga
> boshlardi. Eski matn git tarixida (`17dc7f43`).
>
> **DEPLOY QILINMAGAN** (egasining 2026-08-25 dagi «C — hozir deploy YO'Q» qarori).

---

## 1. Xulosa bir qarashda (2026-08-26 o'lchovi)

| | |
|---|---|
| **Delta** | `62a27024..HEAD` — **69 commit** |
| **Migratsiya** | **12 ta** (2-bo'limdagi TARTIB majburiy) |
| **Push holati** | ✅ **2026-08-26 da push qilindi** (`61780120..9f05c712`). Ilgari 33 commit qolib ketgan edi — A1–A3, Q4–Q6, K1–K6 serverga yetib bormasdi |
| **Texnik gate (HEAD'da o'lchandi)** | ✅ typecheck 10/10 · ✅ lint 0 error / 1272 warning · ✅ api **684 fayl / 9907 passed / 0 failed** · ✅ web **339 fayl / 4427 passed / 0 failed** (i18n gate'lar ichida) |
| **Bloklovchi kamchilik** | **4 ta ochiq** (B1, B2, B4, B5) — B0 va B3 2026-08-26 da yopildi; hech biri KOD emas |
| **Jonli xulq o'zgaradimi** | **HA, uch joyda** (5-bo'lim) |

**Delta ichidagi ish oqimlari — UCHTA, hammasi «QISMAN»:**

| Oqim | Fazalar | Reja |
|---|---|---|
| Omborchi / TSD | G1, G2, G3, G4 (1+2a), G5, G6 | `docs/plans/2026-08-23-omborchi-tsd-mijozlar.md` |
| Kassa qarzi + avans | Q1…Q6, A1…A3 | `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md` |
| Bo'linadigan tovar | K1…K6 | `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md` |
| Hodisa qarzlari | H2, H5 (+ E5 tuzatishi) | `docs/plans/2026-08-24-split-kassa-hodisasi.md` |

🔴 **Bu deployning ENG KATTA xavfi texnik emas, HAJMIY:** 21 faza jonlida bir
marta ham tekshirilmasdan bir-birining ustiga qurildi (qoida 11 «bajarilmagan
qabul mezoni bilan keyingi faza boshlanmaydi» deydi — amalda buzilgan).
Nosozlik chiqsa «qaysi biri buzdi?» savoli juda qimmat bo'ladi — bu
2026-08-24 hodisasining IS-3 klassi, kattaroq masshtabda. Bosqichma-bosqich
chiqarish varianti — 7-bo'lim.

---

## 2. MIGRATSIYALAR — 12 ta, SHU TARTIBDA

Har biri (cwd = `packages/db`, `DATABASE_URL` ni `apps/api/.env` dan source qiling):

    pnpm exec prisma db execute --file prisma/migrations/<NOM>/migration.sql
    pnpm exec prisma migrate resolve --applied <NOM>

Oxirida BIR MARTA: `pnpm exec prisma generate`

| # | Migratsiya | Faza | Lokal dev bazada | down skript |
|---|---|---|---|---|
| 1 | `20260824120000_drawer_cash_out_sales_return` | G1 | ✅ 2× | ✅ (sinalmagan) |
| 2 | `20260824170000_sales_return_retail_sale` | G3 | ✅ 2× | ✅ (sinalmagan) |
| 3 | `20260825020000_retail_sale_position_allocation` | G4 | ✅ 2× | ✅ (sinalmagan) |
| 4 | `20260825120000_debt_source_doc` | Q1 | ✅ | ✅ (sinalmagan) |
| 5 | `20260825170000_tsd_device` | G5 | ✅ 2× | ✅ sinalgan |
| 6 | `20260825200000_tsd_work_screens` | G6 | ❌ **HECH QACHON** | ✅ (sinalmagan) |
| 7 | `20260825220000_drawer_cash_in_kind` | A1 | ✅ | ✅ |
| 8 | `20260825230000_stock_piece_registry` | K1 | ✅ UP×2→zond→DOWN×2→UP | ✅ |
| 9 | `20260825235000_company_settings_sale_debt_term` | Q4 | ❌ **HECH QACHON** (Q6 ning DRY yugurishi o'lchadi) | ✅ (sinalmagan) |
| 10 | `20260826000000_stock_piece_cut` | K4 | ✅ UP×2→zond→DOWN×2→UP | ✅ |
| 11 | `20260826120000_stock_piece_intake` | K5 | ✅ UP×2→zond→DOWN×2→UP | ✅ |
| 12 | `20260826170000_piece_tracking_decision` | K6 | ✅ UP×2→zond→DOWN×2→UP | ✅ |

**Qaytarish TARTIBI — teskarisi (12 → 1).** Skriptlar
`packages/db/scripts/rollback/*_down.sql`, buyrug'i har faylning boshida.
Hammasi ADDITIV migratsiya (yangi ustun/jadval), shuning uchun **kodni
qaytarishning o'zi yetadi** — eski kod yangi ustunlarni bilmaydi va ular bo'sh
turaveradi. Down skriptlar faqat tuzilmani ham tozalash kerak bo'lganda
yuritiladi, va o'shanda har faylning «ma'lumot yo'qoladi» bloki AVVAL o'qiladi
(G1 niki — PUL izi, alohida diqqat).

---

## 3. 🔴 DEPLOY'DAN OLDIN YOPILISHI SHART

### ✅ B0 — PUSH · **BAJARILDI 2026-08-26**

Muammo: `mirfayz/yacheyka-inventarizatsiya` = `61780120` (G6), HEAD esa undan
**33 commit** oldinda edi. Deploy retsepti aynan shu remote'dan `fetch` qiladi
⇒ push qilinmasa server ESKI kodni olardi, eng yomoni — 12 migratsiya berilib,
ularni ishlatadigan KOD yo'q bo'lib qolardi.

    git push mirfayz yacheyka-inventarizatsiya
    → 61780120..9f05c712  (pre-push: typecheck ✅ · guard ✅ · lint ✅)

Endi remote HEAD = lokal HEAD. **Keyingi commit'dan keyin QAYTA push kerak.**

### B1 — Ikki migratsiya lokal dev bazada YUGURTIRILMAGAN (qoida 7)

`20260825200000_tsd_work_screens` (G6) va
`20260825235000_company_settings_sale_debt_term` (Q4). Ikkalasining SQL'i
isbotlangan naqshda (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`,
`DO $$ … EXCEPTION WHEN duplicate_object`) va `prisma validate` yashil —
**lekin naqsh isbot emas**, qolgan 10 tasi lokal bazada yugurtirilgan.

**To'siq:** `packages/db/.env` bu mashinada yo'q, `sherset_v2_dev` paroli
foydalanuvchidan so'raladi (qoida 5).
**Kerak:** `db execute` → qayta `db execute` (no-op) → ustun/indeks/FK ni SQL
bilan tasdiqlash.

### B2 — To'rt down skript lokal bazada SINALMAGAN (qoida 12)

`20260824120000` (G1), `20260824170000` (G3), `20260825020000` (G4),
`20260825120000` (Q1) — retrospektiv yozilgan, hech biri yugurtirilmagan.
Qoida 12 «teskarisi yoziladi **VA sinaladi**» deydi. B1 bilan bir sessiyada
yopiladi: har biri uchun `DOWN → DOWN (no-op) → UP`.

> 2026-08-24 hodisasidan keyin kassaga tegadigan deploy'ni sinalgan qaytarish
> yo'lisiz chiqarish — aynan IS-4.

### B3 — 🔴 `/deploy` VA `deploy-smart.sh` BU DELTA UCHUN ISHLATILMAYDI

`deploy/deploy-smart.sh` → `git fetch origin climart-adoption` + **`git reset --hard`**.

2026-08-26 da qayta o'lchandi: `62a27024` **`origin/climart-adoption` ning
avlodi EMAS**, farq **8 commit** (F6, F7, F8 aynan o'sha 8 tada). Ya'ni skript
yurgizilsa **F6/F7/F8 produksiyadan o'chadi** — omborchi .exe va joylashtirish
dvigateli yo'qoladi.

⇒ **Faqat qo'lda retsept** (F-reja 2.8, 6-bo'limda ochilgan):
`git fetch <mirfayz-url> yacheyka-inventarizatsiya:tmp && git merge --ff-only tmp`.
`origin` ni ilgarilatish — alohida qaror (Davlatbek bilan kelishiladi).

✅ **2026-08-26: bu tuzoq endi PROZA emas, MEXANIK QO'RIQCHI.**
`deploy/deploy-smart.sh` ga `reset --hard` dan OLDIN orqaga-ketish tekshiruvi
qo'shildi: `git rev-list --count FETCH_HEAD..HEAD > 0` bo'lsa skript
**TO'XTAYDI** va yo'qoladigan commitlarni ro'yxat qilib ko'rsatadi. Shu
repoda haqiqiy holat bilan sinaldi — `LOST=8`, ro'yxatda aynan F6/F7/F8.
Ongli rollback: `DS_ALLOW_ROLLBACK=1`. Tarixlar bog'lanmagan bo'lsa
(shallow almashinuv) tekshiruv o'tkazib yuboriladi, lekin JIMGINA emas —
ogohlantirish bilan. ⚠️ Qo'riqchi VPS'dagi nusxada ishlaydi, ya'ni u
**deploy bilan birga yetib boradi** — hozircha jonlidagi skriptda YO'Q.

### B4 — Jonli VPS HEAD tasdiqlanmagan (Davlatbek reset tuzog'i)

Kutilishi: `62a27024` (F8 hisoboti). Tekshirilmagan — SSH paroli berilmagan.
HEAD boshqa bo'lsa butun delta hisobi noto'g'ri.

### B5 — Jonli holat 2026-08-24 dan beri O'LCHANMAGAN

`docs/ops/jonli-holat.md` reyestri o'sha kungi o'lchov. Deploy'dan OLDIN
qoida 8 talab qiladi: `cd packages/db && npx tsx scripts/warehouse-state.ts`
(faqat o'qish). Chiqish kodi 2 bo'lsa TO'XTA.

---

## 4. 🟠 DEPLOY'NI BLOKLAMAYDI, LEKIN OCHIQ QARZ

### ✅ D1 — E5 (`warehouse-state.ts` yolg'on qizil) — **2026-08-26 da YOPILDI**

Eski holat: `warehouse-state-core.ts` hamon «faqat kaskadning BIRINCHI ombori
yetadi» modelida edi, G4-2a esa tasdiq-to'sig'ini olib tashlagan ⇒ skript
deploy'dan keyin har kaskad omborini `needs_approval` deb belgilab, qoida 13
qo'riqchisini «bo'ri keldi» qilardi.

Tuzatildi: `needs_approval` bosqichi bekor qilindi; `reachable` = kaskaddagi
HAMMA ombor (BRAK istisno — `resolveAllocStores` bilan bir xil); reyestrga
`posFront` (`__posFrontStore`) maydoni va ikkita yangi drift qo'shildi;
«POS ombori kaskad BOSHI bo'lsin» sharti «kaskadda BO'LSIN» ga aylandi.
Testlar: `warehouse-state-core.test.ts` 24 → **29** (teskari nazorat: eski
model qaytarilganda 3 test yiqiladi).

### D2 — G4 2b: yig'ish topshirig'i hamon TAXMINDAN quriladi

`retail-sale.service.ts#createPickingTasksForSale` guruhlashni hamon
`product.attributes.__yacheyka` (tovarning UY yacheykasi) prefiksidan qiladi —
`retail_sale_position_allocations` dan EMAS. Rezerv va `post()` ajratmadan
ketadi, topshiriq esa taxmindan ⇒ ajratma boshqa omborni ko'rsatgan holatda
topshiriq NOTO'G'RI omborchiga tushadi. G4 dan OLDIN ham shunday edi (yangi
regressiya emas), lekin bo'linish holati paydo bo'lgach kuchayadi.
**POS UI («qayerdan olinadi» + kassir o'zgartirishi) ham qurilmagan.**

### D3 — `cancel()` ajratma qatorlarini o'chirmaydi

`retailSalePositionAllocation.deleteMany` faqat `post()` va `sendToPicking` da.
Zararsiz, lekin `store` FK RESTRICT ombor o'chirishni bloklashi mumkin.

### D4 — Ikkita test parallel yuklamada flake beradi (5 s timeout)

`auth/tsd-device.service.test.ts` (uchta argon2 hash) va
`sotuv/__tests__/chek-comment.test.tsx`. 2026-08-26 ning to'liq yugurishida
IKKALASI HAM yashil chiqdi, lekin sabab yo'qolmagan — `testTimeout` ni
oshirish kichik alohida ish.

### D5 — `scripts/guard-baseline.json` dagi `label-grounding.test.ts` qatori

Baseline yozuvi endi PASS bo'lib turibdi (bo'sh `visual-captures` korpusi).
Kichik tozalash (H6/5-band).

### D6 — 🔴 T1: `packages/db` skriptlari bo'lak reyestrini BILMAYDI (yangi)

`warehouse-split.ts` (H4), `stock-baseline-cleanup.ts` (H5) va
`warehouse-state.ts` — uchalasida «piece» so'zi NOL marta. `stock_pieces` da
esa `store_id` + `cell_id` bor. Bu **deployni bloklamaydi** (jadval bo'sh,
bayroq yoqilmagan), lekin **K-reja jonliga chiqqan kundan boshlab H4 va H5
uchun BLOKLOVCHI** bo'ladi. To'liq talab va yopish retsepti:
`docs/plans/2026-08-24-split-kassa-hodisasi.md` → H4 → «T1» bandi.

### D7 — `preflight.mjs` yolg'on anomaliya beradi

«NEXT.md top-entry'larda git'da YO'Q hash'lar: `ea8e779a`» — u commit emas,
`NEXT.md:486` dagi DB batch id'si. Har sessiyada anomaliya chiqarib qimmat
session-start-audit workflow'ini uyg'otadi. Heuristika toraytirilsin.

---

## 5. 🔴 JONLI XULQ O'ZGARISHI — egasi TASDIQLASHI kerak

### X1 — Kassa endi tasdiqsiz KO'P OMBORDAN sotadi (G4-2a)

`assertAvailableCascade` o'chirildi. 400 endi faqat haqiqiy defitsitda va matni
«tizimdagi hech bir omborda yetarli miqdor yo'q».

**Bugungi jonli topologiyada amaliy o'zgarish KICHIK:** kaskadda
`Taqsimlanmagan` (pp=1, ≈52,5 mln dona) va BO'SH `Ombor 02` (pp=2), ya'ni
taqsimot amalda bitta ombordan chiqadi.

**Ijobiy yon ta'sir:** yacheykasiz ajratmada `cellMode: 'store-only'` ⇒ sotuv
endi **sanalgan yacheykani buzmaydi** (H5 muammosi). Jonlida qoldiqning ~94 % i
yacheykasiz, ya'ni bu ko'pchilik sotuvga tegadi.

### X2 — «Omborchi» roli tovar kartasidagi ko'chirishni HAQIQATAN ishlata boshlaydi (G6)

`POST /products/:id/cell-move` va `/cell-place` bazaviy talabi `store.update`
dan `storecell.update` ga tushirildi. Web'dagi «Переместить» tugmasi ruxsat
bilan yashirilmagan ⇒ **ilgari 403 bergan tugma endi ishlaydi**. Ombor KARTASI
va omborlararo ko'chirish YOPIQ qoladi (istisno — hovuz ombori).

### X3 — Bo'linadigan tovar mexanikasi yoqiladi (K1…K6, yangi)

- yangi ruxsat-entity **`piecetracking`** (topup MAJBURIY);
- birligi «м» bo'lgan **YANGI** tovarda bo'lak bayrog'i **YOQILGAN** keladi
  (K-Q9) — mavjud 4583 tovarga tegmaydi (K-Q10, qo'lda);
- yangi **cron 20:00 da** (savdodan KEYIN) kunlik sverka signali — farq yo'q
  bo'lsa xabar ham yo'q;
- bayroq yoqilgan tovarda avto-taqsimotning 3-holati (bo'linish) O'CHADI: jami
  yetsa-yu bir bo'lakda bo'lmasa **400 `no-single-source`** — bu ATAYLAB
  (mijozga uzluksiz bo'lak kerak), lekin kassir uchun YANGI xulq.

⇒ **K1…K6 ni pilot bilan boshlash SHART** (K6/4): bayroq avval FAQAT kabel
guruhiga yoqilsin, bir kunda butun «м» katalogiga emas.

---

## 6. DEPLOY RETSEPTI (qadamma-qadam)

> Old shart: B0–B5 yopilgan. `/deploy` va `deploy-smart.sh` **ISHLATILMAYDI** (B3).

**0. Push** — `git push mirfayz yacheyka-inventarizatsiya` (B0).

**1. Deploy'dan OLDIN o'lchov** — `packages/db` ichida
`npx tsx scripts/warehouse-state.ts` (faqat o'qish). Chiqish kodi 2 bo'lsa
TO'XTA. Natija hisobotga ko'chiriladi.

**2. VPS HEAD tekshiruvi:** `git -C /var/www/sherset-v2 rev-parse HEAD` →
`62a27024` kutiladi. Farq bo'lsa TO'XTA (B4).

**3. Kodni olib kelish:**
`git fetch <mirfayz-url> yacheyka-inventarizatsiya:tmp && git merge --ff-only tmp`

**4. Migratsiyalar — 12 ta, 2-bo'limdagi TARTIBDA.** Oxirida bir marta
`prisma generate`.

**5. Build va restart:** `nohup corepack pnpm build:web` (BUILD_RC poll) →
`pm2 restart sherset-v2-web` **va** `sherset-v2-api`.

**6. 🔴 MAJBURIY — ruxsat topup:** `apps/api` ichida
`npx tsx src/scripts/topup-role-permissions.ts` → **api yana restart** (perm kesh).
Yangi entity'lar: **`retailcontrol`** (G2) + **`returnacceptance`** (G3) +
**`piecetracking`** (K2) — uchalasi ham `TOPUP_ENTITIES` da (tekshirildi).
Keyin follow-up commit: uchalasini `TOPUP_ENTITIES` dan olib tashlash.

**7. Egasi qo'lda:**

1. «Omborchi» rolidan **`Ta'minot` (supply)** qatorlarini olib tashlash —
   shablon o'zgarishi jonli rolga o'z-o'zidan ko'chmaydi (topup faqat QO'SHADI).
2. **BRAK ombori** yaratish, yacheykalarini raqamlash, kartada «BRAK ombori»
   belgilash, **POS prioritetini BO'SH qoldirish**. Yaratilgach
   `docs/ops/jonli-holat.md` reyestriga qator qo'shiladi.
3. **«Kassa oldidagi ombor» checkbox'i** — 07 ombori jonlida HALI YO'Q, bu
   qadam amalda **H4 (split qayta) dan keyin** ma'noga kiradi. Bayroq
   qo'yilganda reyestrga `"posFront": true` yozilishi SHART — aks holda
   `warehouse-state.ts` darhol qizil beradi (yangi drift, D1).
4. **X1, X2, X3 ni tasdiqlash.**
5. **K pilotining birinchi kuni:** bayroq FAQAT kabel guruhiga.

**8. Uchma-uch smoke (qoida 13 — «sahifa 200» buni ALMASHTIRMAYDI):**
sinov sotuv (post → tekshir → cancel) + yacheyka sanash + ko'chirish +
`npx tsx scripts/warehouse-state.ts` (natijasi hisobotga). Qo'shimcha zanjirlar:

* **G1** — sinov vozvrat → POS mijoz profilida qaytim → to'lov → expected-cash
  aynan shu summaga kamayadi → ikkinchi to'lov RAD etiladi;
* **G2** — 2 skladli chek → omborchilar «Tayyor» → kontrol navbati → bitta qator
  o'chirilganda kassir ekranida summa o'zgaradi (SSE) → «To'liq» → post;
* **G3** — chekdan qabul → yorliq chop → post → kassirda qaytim;
* **G5/G6** — TSD juftlash → PIN → o'z tasklari → `GET /products` **403**;
* **Q1–Q6** — `apps/api/src/scripts/ops-q6-live-verify.ts` (avval DRY, so'ng `--live`);
* **A1–A3** — avans qabuli → avansdan to'lash → naqd qaytarish;
* **K1–K6** — bayrog'i O'CHIQ tovar bilan oddiy sotuv (xulq o'zgarmasin), so'ng
  pilot tovarida kesim → yorliq → to'lov;
* **ruxsat** — storekeeper bilan `/omborchi/kontrol`, `/omborchi/vozvrat` va
  `/omborchi/hal-qilinmagan` → **403**.

**9. Qaytarish yo'li:** kod — `git reset --hard 62a27024` + build + restart.
Baza — `packages/db/scripts/rollback/*_down.sql`, 12 → 1 tartibida.

---

## 7. Deploy qamrovi — egasining qarori kerak

### A yo'li — butun branch (G + Q/A + K birga)

* Delta `62a27024..HEAD`, 12 migratsiya, bitta build, bitta smoke.
* **Ustunligi:** branch chiziqli — ff-merge ishlaydi, kod aynan test qilingan
  holida boradi.
* **Kamchiligi:** 21 faza bir kechada jonliga chiqadi. Nosozlikda «qaysi biri
  buzdi?» savoli juda qimmat (IS-3).

### B yo'li — tor branch (`kassa-qarzi-q1-q2` @ `456e53af`)

* Q2 sessiyasi tayyorlagan, lekin unda Q3–Q6, A1–A3, G5/G6 va K1–K6 YO'Q
  ⇒ qayta yig'ish kerak.
* **Kamchiligi:** qayta yig'ilgan branch **HECH QACHON to'liq test qilinmagan
  kombinatsiya** bo'ladi — bu ham IS-3. Eng yomon variant.

### C yo'li — BOSQICHMA-BOSQICH, oraliq commit'largacha (yangi, 2026-08-26)

Branch CHIZIQLI, ya'ni uni bo'lish uchun cherry-pick KERAK EMAS — har kecha
`merge --ff-only <oraliq commit>` bilan AYNAN test qilingan nuqtaga to'xtaladi:

| Kecha | To'xtash nuqtasi | Nima chiqadi | Migratsiya |
|---|---|---|---|
| 1 | `61780120` | G1–G6 + Q1–Q3 + H2/H5 | 1, 2, 3, 4, 5, 6 |
| 2 | `cbc14723` | A1–A3 (avans oqimi) | 7 |
| 3 | HEAD | Q4–Q6 + K1–K6 + E5 | 8, 9, 10, 11, 12 |

⚠️ **Halol qayd:** branch tartibi Q va K fazalarini ARALASHTIRGAN (Q4 ↔ K2,
Q5 ↔ K3, Q6 ↔ K4), shuning uchun 3-kecha ikkala oqimni birga olib keladi.
Uni ham ajratish kerak bo'lsa branch qayta tartiblanishi (rebase) shart — bu
esa «test qilingan kombinatsiya» kafolatini yo'qotadi, ya'ni B yo'lining
kamchiligini qaytaradi.

**Tavsiya — C yo'li**, chunki 21 fazani bitta oynada tekshirib bo'lmaydi va
2026-08-24 hodisasining butun sabog'i shu. C imkonsiz bo'lsa — A (B emas).
