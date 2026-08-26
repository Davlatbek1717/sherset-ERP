# Deploy dossieri — 2026-08-25 · `62a27024..8d1f4a01`

> **Maqsad:** G-reja (`docs/plans/2026-08-23-omborchi-tsd-mijozlar.md`) fazalarining
> hisobotlari tekshirildi, kamchiliklar ro'yxatga olindi, deploy qadamlari
> tayyorlandi. **DEPLOY QILINMADI** (egasining ko'rsatmasi).
> Bu fayl fazalar hisobotini ALMASHTIRMAYDI — u faqat deploy nuqtasidagi
> holatni bir joyga yig'adi.

---

## 1. Xulosa bir qarashda

| | |
|---|---|
| **Delta** | `62a27024..8d1f4a01` — **37 commit** |
| **Migratsiya** | **7 ta** (G-reja sarlavhasi «beshta» deydi — ESKIRGAN, pastda) |
| **Texnik gate** | ✅ typecheck 4/4 · ✅ lint gate 0 error · ✅ api 9160 passed · ✅ web 4296 passed (ikkala «xato» — parallel-yuklama flake'i, yolg'iz yugurtirilganda yashil) |
| **Bloklovchi kamchilik** | **6 ta** (2-bo'lim) — hech biri KOD emas, hammasi jarayon/dalil/tasdiq. **B4 shu tekshiruvda qisman yopildi** (4 ta yangi down skript) |
| **Jonli xulq o'zgaradimi** | **HA, ikki joyda** (4-bo'lim: G4-2a kassa taqsimoti, G6 omborchi ruxsati) |

**Fazalar holati (hisobotlardan olingan, kod bilan qayta tekshirilgan):**

| Faza | Hisobotdagi holat | Kod tekshiruvi |
|---|---|---|
| G1 vozvrat-payout | TAYYOR, deploy kutmoqda | ✅ tasdiqlandi |
| G2 kontrol oqimi | TAYYOR, deploy kutmoqda | ✅ tasdiqlandi |
| G3 vozvrat qabuli | TAYYOR, deploy kutmoqda | ✅ tasdiqlandi (`assertNotPaid` bor — G1 ning ochiq bandi haqiqatan yopilgan) |
| G4 1-bosqich | QISMAN | ✅ yadro + jadval + `__posFrontStore` bayrog'i bor |
| G4 2a-bosqich | QISMAN (backend) | ✅ `assertAvailableCascade` o'chirilgan, `post()` ajratmadan quriladi |
| **G4 2b** | **BOSHLANMAGAN** | ❌ tasdiqlandi — 3-bo'lim D2 |
| G5 TSD auth | QISMAN | ✅ tasdiqlandi |
| G6 TSD ekranlari | QISMAN | ✅ tasdiqlandi, **APK fayl bor** (7,1 MB, `android/tsd-app/app/build/outputs/apk/debug/`) |

---

## 2. 🔴 DEPLOY'DAN OLDIN YOPILISHI SHART (bloklovchi)

### B1 — G6 migratsiyasi lokal dev bazada YUGURTIRILMAGAN (qoida 7)

`20260825200000_tsd_work_screens` — G6 hisoboti buni o'zi halol qayd etgan.
SQL idempotent naqshda (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`,
`DO $$ … EXCEPTION WHEN duplicate_object`) va `prisma validate` yashil, lekin
**naqsh — isbot emas**. Qolgan migratsiyalardan G3/G4/G5 lokal bazada 2 martadan
yugurtirilib isbotlangan edi.

**To'siq:** `packages/db/.env` bu mashinada YO'Q, `sherset_v2_dev` paroli
sessiyaga berilmagan (postgres 18 `localhost:5432` da tinglayapti — tekshirildi).
**Kerak:** parol → `db execute` → qayta `db execute` (no-op chiqishi) →
ustun/indeks/FK ni SQL bilan tasdiqlash.

### B2 — Jonli VPS HEAD tasdiqlanmagan (Davlatbek reset tuzog'i)

Kutilishi: `62a27024` (F8 hisoboti). **Tekshirilmagan** — SSH paroli berilmagan.
HEAD boshqa bo'lsa butun delta hisobi noto'g'ri.

### B3 — 🔴 `/deploy` VA `deploy-smart.sh` BU DELTA UCHUN ISHLATILMAYDI

`deploy/deploy-smart.sh` → `git fetch origin climart-adoption` + **`git reset --hard`**.
O'lchandi: `origin/climart-adoption` = `6533f173`, u jonlidagi `62a27024` dan
**8 commit ORQADA** (F6, F7, F8 aynan o'sha 8 tada). Ya'ni skriptni yurgizish
**F6/F7/F8 ni produksiyadan o'chirib tashlaydi** — omborchi .exe va joylashtirish
dvigateli yo'qoladi.

⇒ **Faqat qo'lda retsept** (F-reja 2.8, 5-bo'limda ochilgan):
`git fetch <mirfayz-url> yacheyka-inventarizatsiya:tmp && git merge --ff-only tmp`.
`origin` ni ilgarilatish — alohida qaror (Davlatbek bilan kelishiladi;
F-reja 552–558-qatorlardagi saboq).

### B4 — QAYTARISH (down) skriptlari — qoida 12 · 🟡 QISMAN YOPILDI

| Migratsiya | Faza | down | Holat |
|---|---|---|---|
| `20260824120000_drawer_cash_out_sales_return` | G1 | ✅ | **shu tekshiruvda yozildi** (retrospektiv) |
| `20260824170000_sales_return_retail_sale` | G3 | ✅ | **shu tekshiruvda yozildi** (retrospektiv) |
| `20260825020000_retail_sale_position_allocation` | G4 | ✅ | **shu tekshiruvda yozildi** (retrospektiv) |
| `20260825120000_debt_source_doc` | Q1 | ✅ | **shu tekshiruvda yozildi** (retrospektiv) |
| `20260825170000_tsd_device` | G5 | ✅ | o'z sessiyasida, lokal bazada sinalgan |
| `20260825200000_tsd_work_screens` | G6 | ✅ | o'z sessiyasida (lokal sinov B1 bilan birga kutmoqda) |
| `20260825220000_drawer_cash_in_kind` | A1 | 🟡 | teskarisi A1 HISOBOTI ichida matn bilan yozilgan (`253fe105`), **alohida `.sql` fayl YO'Q** — o'z sessiyasiga qoldirildi |

G1/G3 qoida 12 dan OLDIN yozilgan (qoida `902643a9` da kiritilgan) — ular uchun bu
qarz edi, buzilish emas. **G4 va Q1 esa qoidadan KEYIN** ⇒ haqiqiy buzilish edi.
Hammasi additiv (yangi ustun/jadval), shuning uchun teskarisi sodda:
`DROP COLUMN IF EXISTS` / `DROP TABLE IF EXISTS`.

**Yangi to'rt skript `packages/db/scripts/rollback/` da**, mavjud G5/G6 naqshi
bo'yicha: buyrug'i fayl boshida, har biri idempotent, va har birida
**«qaysi ma'lumot yo'qoladi + qaytarishdan oldin nimani eksport qilish kerak»**
bloki bor (G1 niki pul izi — alohida diqqat).

⚠️ **YANGI SKRIPTLAR LOKAL BAZADA SINALMAGAN** — B1 dagi o'sha to'siq (parol).
Qoida 12 «teskarisi yoziladi VA sinaladi» deydi ⇒ bu band B1 bilan birga yopiladi:
har biri uchun DOWN → DOWN (no-op) → UP zanjiri yugurtiriladi.

**2026-08-24 hodisasidan keyin kassaga tegadigan deploy'ni qaytarish yo'lisiz
chiqarish — aynan IS-4.**

### B5 — Delta endi «G-reja» EMAS: ichida Q1–Q3 va A1 ham bor

37 commit ichida: G1–G6 + **Q1, Q2, Q3** (kassa qarzi undirish reyestri) +
**A1** (mijozdan avans) + H2 + H5 + yacheyka skriptlari.
Q1/Q2/Q3/A1 to'rttasi ham «QISMAN — jonli tasdiq kutilmoqda» (qoida 11).

**A1 shu tekshiruv davomida yakunlandi:** kod `8d1f4a01`, hisobot `253fe105`
(`docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md`). Uning O'Z qabul
mezoni ham **B1 dagi AYNAN o'sha to'siqda turibdi** — «migratsiya lokal dev
bazada ikki marta xatosiz ❌ PAROL KUTILMOQDA».

⚠️ **Eslatma:** A1 hisoboti deploy branch'i sifatida `kassa-qarzi-q1-q2` @
`456e53af` ni ko'rsatadi va o'zi ham «Q3 ham, A1 ham unda YO'Q — qayta
yig'ilishi kerak» deydi. Ya'ni **ikkita raqobatchi deploy yo'li bor**:
(a) butun `yacheyka-inventarizatsiya` branch'i — G+Q+A birga (bu dossier shuni
hisoblaydi); (b) G4siz tor branch. Qaysi biri — egasining qarori (7-bo'lim).

### B6 — Ishchi daraxt toza emas (boshqa sessiyaning qoldig'i)

```
 M apps/web/src/components/stores/cell-contents-modal.tsx   (+224/−62)
 M docs/plans/2026-08-23-ombor-restrukturizatsiya.md         (K-reja 10-qoida qatori)
?? apps/web/src/components/stores/cell-contents-modal.test.tsx
?? docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md   (K-reja fayli)
```

G5 VA G6 hisobotlari ikkalasi ham buni «boshqa sessiyaning qoldig'i» deb qayd
etgan. Commit qilinmagani uchun **deploy'ga TUSHMAYDI** — lekin 6-bo'limdagi test
raqamlari SHU daraxtda o'lchangan, ya'ni ular toza HEAD niki emas.

---

## 3. 🟠 DEPLOY'NI BLOKLAMAYDI, LEKIN OCHIQ QARZ

### D1 — E5: `warehouse-state.ts` deploy'dan keyin YOLG'ON natija beradi

Qoida 13 ombor/kassaga tegadigan har deploy'dan keyin `warehouse-state.ts` ni
majburiy qiladi. Lekin `packages/db/scripts/warehouse-state-core.ts:242`:

```ts
const reachableIds = cascadeConfigured
  ? new Set(firstCascadeId ? [firstCascadeId] : [])   // ← faqat BIRINCHI ombor
  : sessionStoreIds;
```

G4-2a dan keyin POS **hamma** kaskad omboriga o'zi yetadi ⇒ birinchidan keyingi
har bir ombor `needs_approval` deb belgilanadi, bu esa endi YOLG'ON.
`__posFrontStore` bayrog'i ham reyestrda (`docs/ops/jonli-holat.md`) yo'q.
**Bugungi jonli topologiyada zarari kichik** (kaskadda amalda bitta to'la ombor —
`Taqsimlanmagan`), lekin **H4 (split qayta) dan OLDIN yopilishi shart**, aks holda
H3 qo'riqchisi «bo'ri keldi» qilib qoladi.

### D2 — G4 2b: yig'ish topshirig'i hamon TAXMINDAN quriladi

`retail-sale.service.ts:3591 createPickingTasksForSale` guruhlashni hamon
`product.attributes.__yacheyka` (tovarning UY yacheykasi) prefiksidan qiladi —
`retail_sale_position_allocations` dan EMAS. Rezerv va `post()` ajratmadan ketadi,
topshiriq esa taxmindan ⇒ ajratma boshqa omborni ko'rsatgan holatda topshiriq
NOTO'G'RI omborchiga tushadi. Bu G4 dan OLDIN ham shunday edi (yangi regressiya
emas), lekin bo'linish holati paydo bo'lgach kuchayadi.

**POS UI («qayerdan olinadi» + kassir o'zgartirishi) ham qurilmagan** —
`manual` ustuni tayyor turibdi, `apps/web/src/components/pos/` da ajratmaga
birorta murojaat yo'q (tekshirildi).

### D3 — `cancel()` ajratma qatorlarini o'chirmaydi

`retailSalePositionAllocation.deleteMany` faqat `post()` va `sendToPicking` da bor,
`cancel()` da yo'q. Zararsiz, lekin `store` FK RESTRICT ombor o'chirishni bloklashi mumkin.

### D4 — Ikkita test 5 s timeout'da flake beradi (parallel yuklama)

* `apps/api/src/modules/auth/tsd-device.service.test.ts` — to'liq yugurishda 21 s
  (timeout), yolg'iz **1394 ms** ✅. Sabab: uchta argon2 hash + `testTimeout: 5000`.
* `apps/web/src/app/(app)/sotuv/__tests__/chek-comment.test.tsx` — yolg'iz **627 ms** ✅.
  (G3 hisobotidagi `sales-screen-shift` flake'i bilan bir klass.)

Deploy'ni bloklamaydi, lekin gate'ni tasodifan qizil qiladi. Tuzatish: shu ikki
faylga `testTimeout` oshirish (alohida kichik ish).

### D5 — `scripts/guard-baseline.json` dagi `label-grounding.test.ts` qatori

G2 hisobotidagi eslatma kuchda — baseline yozuvi endi PASS bo'lib turibdi
(bo'sh `visual-captures` korpusi). Kichik tozalash.

---

## 4. 🔴 JONLI XULQ O'ZGARISHI — egasi TASDIQLASHI kerak

### X1 — Kassa endi tasdiqsiz KO'P OMBORDAN sotadi (G4-2a)

`assertAvailableCascade` o'chirildi. 400 endi faqat haqiqiy defitsitda va matni
«tizimdagi hech bir omborda yetarli miqdor yo'q» («bosh omborchi tasdig'i» yo'q).

**Bugungi jonli topologiyada amaliy o'zgarish KICHIK** (`docs/ops/jonli-holat.md`,
2026-08-24 o'lchovi): kaskadda `Taqsimlanmagan` (pp=1, ≈52,5 mln dona) va BO'SH
`Ombor 02` (pp=2). Ya'ni taqsimot amalda bitta ombordan chiqadi.

**Ijobiy yon ta'sir:** yacheykasiz ajratmada `cellMode: 'store-only'` ⇒ sotuv endi
**sanalgan yacheykani buzmaydi** (H5 muammosi). Jonlida qoldiqning ~94 % i
yacheykasiz, ya'ni bu ko'pchilik sotuvga tegadi.

### X2 — «Omborchi» roli tovar kartasidagi ko'chirishni HAQIQATAN ishlata boshlaydi (G6)

`POST /products/:id/cell-move` va `/cell-place` bazaviy talabi `store.update` dan
`storecell.update` ga tushirildi (TSD foydalanuvchisi kichik omborchi bo'lgani uchun
majburiy edi). Web'dagi «Переместить» tugmasi ruxsat bilan yashirilmagan ⇒
**ilgari 403 bergan tugma endi ishlaydi**. Ombor KARTASI (`store.update`) va
omborlararo ko'chirish YOPIQ qoladi (istisno — hovuz ombori).

---

## 5. DEPLOY RETSEPTI (qadamma-qadam)

> Old shart: B1–B6 yopilgan. `/deploy` slash-buyrug'i va `deploy-smart.sh`
> **ISHLATILMAYDI** (B3).

**0. Deploy'dan OLDIN** — `packages/db` ichida `npx tsx scripts/warehouse-state.ts`
(faqat o'qish). Chiqish kodi 2 bo'lsa TO'XTA. Natija hisobotga ko'chiriladi.

**1. VPS HEAD tekshiruvi:** `git -C /var/www/sherset-v2 rev-parse HEAD` → `62a27024`
kutiladi. Farq bo'lsa TO'XTA (B2).

**2. Kodni olib kelish:**
`git fetch <mirfayz-url> yacheyka-inventarizatsiya:tmp && git merge --ff-only tmp`

**3. Migratsiyalar — 7 ta, shu TARTIBDA.** Har biri:
`pnpm exec prisma db execute --file prisma/migrations/<NOM>/migration.sql`
→ `pnpm exec prisma migrate resolve --applied <NOM>`

```
20260824120000_drawer_cash_out_sales_return    (G1)
20260824170000_sales_return_retail_sale        (G3)
20260825020000_retail_sale_position_allocation (G4)
20260825120000_debt_source_doc                 (Q1)
20260825170000_tsd_device                      (G5)
20260825200000_tsd_work_screens                (G6)
20260825220000_drawer_cash_in_kind             (A1)
```

Oxirida BIR MARTA: `pnpm exec prisma generate`
*(cwd = `packages/db`; `DATABASE_URL` ni `apps/api/.env` dan source qiling.)*

**4. Build va restart:** `nohup corepack pnpm build:web` (BUILD_RC poll) →
`pm2 restart sherset-v2-web` **va** `sherset-v2-api` (api ham o'zgargan).

**5. 🔴 MAJBURIY — ruxsat topup:** `apps/api` ichida
`npx tsx src/scripts/topup-role-permissions.ts` → **api yana restart** (perm kesh).
Yangi entity'lar: `retailcontrol` (G2) + `returnacceptance` (G3) — ikkalasi ham
`TOPUP_ENTITIES` da turibdi (tekshirildi).
Keyin follow-up commit: ikkalasini `TOPUP_ENTITIES` dan olib tashlash.

**6. Egasi qo'lda:**

1. «Omborchi» rolidan **`Ta'minot` (supply)** qatorlarini olib tashlash — shablon
   o'zgarishi jonli rolga o'z-o'zidan ko'chmaydi (topup faqat QO'SHADI).
2. **BRAK ombori** yaratish, yacheykalarini raqamlash, kartada «BRAK ombori»
   belgilash, **POS prioritetini BO'SH qoldirish**. Shu qilinmaguncha
   `/omborchi/vozvrat` dagi «Brak» tugmasi o'chiq turadi (ataylab, test bilan).
   Yaratilgach `docs/ops/jonli-holat.md` reyestriga qator qo'shiladi — aks holda
   birinchi brak qabulidan keyin har deploy «yetib bo'lmaydigan qoldiq» deb bloklanadi.
3. **«Kassa oldidagi ombor» checkbox'i** — 07 ombori jonlida HALI YO'Q (reyestrda
   faqat `Taqsimlanmagan` / `Ombor 01` / `Ombor 02`). Bu qadam amalda **H4 (split
   qayta) dan keyin** ma'noga kiradi.
4. **X2 ni tasdiqlash** — omborchi endi yacheykadan yacheykaga ko'chira oladi.

**7. Uchma-uch smoke (qoida 13 — «sahifa 200» buni ALMASHTIRMAYDI):**
sinov sotuv (post → tekshir → cancel) + yacheyka sanash + ko'chirish +
`npx tsx scripts/warehouse-state.ts` (natijasi hisobotga).
Qo'shimcha zanjirlar:

* **G1** — sinov vozvrat → POS mijoz profilida qaytim → to'lov → expected-cash
  aynan shu summaga kamayadi → ikkinchi to'lov RAD etiladi;
* **G2** — 2 skladli chek → omborchilar «Tayyor» → kontrol navbati → bitta qator
  o'chirilganda kassir ekranida summa o'zgaradi (SSE) → «To'liq» → post;
* **G3** — chekdan qabul → yorliq chop → post → kassirda qaytim;
* **ruxsat** — storekeeper bilan `/omborchi/kontrol` va `/omborchi/vozvrat` → **403**.

**8. Qaytarish yo'li:** kod — `git reset --hard 62a27024` + build + restart.
Baza — `packages/db/scripts/rollback/*_down.sql`, buyrug'i har faylning boshida.
Endi **7 tadan 6 tasida** down skript bor (A1 niki o'z sessiyasidan kutilmoqda, B4).
Qaytarish TARTIBI — migratsiya tartibiga TESKARI:

```
20260825220000_drawer_cash_in_kind             (A1 — skript YO'Q)
20260825200000_tsd_work_screens                (G6 — ikki SHART bilan, fayl boshida)
20260825170000_tsd_device                      (G5)
20260825120000_debt_source_doc                 (Q1)
20260825020000_retail_sale_position_allocation (G4)
20260824170000_sales_return_retail_sale        (G3)
20260824120000_drawer_cash_out_sales_return    (G1 — PUL izi, avval eksport)
```

Hammasi additiv migratsiya bo'lgani uchun **kodni qaytarishning o'zi yetadi**
(eski kod yangi ustunlarni bilmaydi va ular bo'sh turaveradi). Down skriptlar
faqat baza tuzilmasini ham tozalash kerak bo'lganda yugurtiriladi — va o'shanda
har faylning «ma'lumot yo'qoladi» bloki AVVAL o'qiladi.

---

## 6. Bugungi gate o'lchovi (2026-08-25, `8d1f4a01` + toza bo'lmagan daraxt)

| Gate | Natija |
|---|---|
| `turbo typecheck` (api 8G, web, db) | ✅ 4/4 successful |
| `node scripts/check-lint.mjs` | ✅ 0 error, 1182 warning (siyosat: warning ruxsat) |
| api vitest | 651 fayl · **9160 passed** / 1 failed / 2 skipped — xato = `tsd-device.service` flake'i (yolg'iz ✅) |
| web vitest | 326 fayl · **4296 passed** / 1 failed / 26 skipped — xato = `chek-comment` flake'i (yolg'iz ✅) |
| i18n gate'lar | ✅ (web vitest ichida) |
| `prisma validate` | ✅ sxema yaroqli |
| APK | ✅ `app-debug.apk` 7,1 MB mavjud |

---

## 7. Deploy qamrovi — egasining qarori kerak

Branch'da endi uchta ish oqimi aralashgan. Ikki yo'l bor:

### A yo'li — butun branch (G1–G6 + Q1–Q3 + A1) · **tavsiya etiladi**

* Delta `62a27024..HEAD`, 7 migratsiya, bitta build, bitta smoke.
* **Ustunligi:** branch chiziqli — ff-merge ishlaydi, hech nima cherry-pick
  qilinmaydi, kod aynan test qilingan holida boradi.
* **Kamchiligi:** bir deployda uchta yangi oqim jonliga chiqadi; nosozlikda
  «qaysi biri buzdi?» degan savol qimmatlashadi.

### B yo'li — tor branch (`kassa-qarzi-q1-q2` @ `456e53af`, G4siz)

* Q2 sessiyasi tayyorlagan, **lekin unda Q3 ham, A1 ham, G5/G6 ham YO'Q**
  ⇒ qayta yig'ish kerak (cherry-pick).
* **Ustunligi:** G4-2a (kassa taqsimoti) jonliga chiqmaydi ⇒ X1 xavfi qoladi.
* **Kamchiligi:** qayta yig'ilgan branch **HECH QACHON to'liq test qilinmagan
  kombinatsiya** bo'ladi — bu 2026-08-24 hodisasining IS-3 klassi
  («xavfsiz yoqish» xulosasi noto'g'ri bazaga qurilgan).

**Tavsiya — A yo'li**, chunki:

1. G4-2a ning bugungi jonli topologiyada amaliy xavfi kichik (4-bo'lim X1:
   kaskadda amalda bitta to'la ombor bor);
2. cherry-pick qilingan, sinalmagan kombinatsiya bir deploydan ko'ra xavfliroq;
3. G4-2a `cellMode: 'store-only'` bilan H5 muammosini TUZATADI — ya'ni uni
   ushlab turishning o'z narxi bor (sanash ishi sotuvlardan buzilaverad).

Agar egasi baribir G4 ni ushlab turishni istasa — u alohida faza sifatida
QAYTARIB olinishi kerak (kod darajasida), cherry-pick bilan emas.
