# Deploy rejasi — 1-KECHA (`62a27024` → `61780120`)

> **Sana:** 2026-08-26, 21:00 dan · **Qamrov qarori:** egasi **C yo'lini** tanladi
> (uch kecha) · **Javobgar (qoida 13):** **Ozodbek (egasi) o'zi** — jonli smoke'ni
> u bajaradi · **Oyna:** savdo yopilgan (20:00 dan keyin), savdo 05:00–06:00 da
> boshlanadi ⇒ **04:30 gacha tugashi va ertalabki takroriy tekshiruv SHART.**
>
> To'liq kontekst: `docs/ops/2026-08-25-deploy-dossieri.md`.
> Bu fayl — o'sha dossierning **shu kechaga** qisqartirilgan, ijro qilinadigan shakli.

---

## 0. Bu kecha nima chiqadi

| | |
|---|---|
| **Delta** | `62a27024..61780120` — **36 commit** |
| **Migratsiya** | **6 ta** (1–6; qolgan 6 tasi 2- va 3-kechada) |
| **Fazalar** | G1 vozvrat-payout · G2 kontrol oqimi · G3 vozvrat qabuli · G4 (1+2a) ko'p omborli taqsimot · G5+G6 TSD · Q1–Q3 kassa qarzi reyestri · H2 jonli holat reyestri · H5 mashq-qoldig'i skripti |
| **CHIQMAYDI** | A1–A3 avans (2-kecha) · Q4–Q6 + K1–K6 + E5 (3-kecha) |

### 🔴 Jonli xulq IKKI joyda o'zgaradi (egasi tasdiqlagan)

1. **X1 — kassa endi tasdiqsiz KO'P OMBORDAN sotadi.** `assertAvailableCascade`
   olib tashlandi. Bugungi topologiyada amaliy o'zgarish kichik (kaskadda
   amalda bitta to'la ombor — `Taqsimlanmagan`). **Ijobiy yon ta'sir:**
   yacheykasiz ajratmada `cellMode:'store-only'` ⇒ sotuv endi **sanalgan
   yacheykani buzmaydi** (qoldiqning ~94 % i yacheykasiz).
2. **X2 — «Omborchi» roli tovar kartasidagi «Переместить» ni HAQIQATAN
   ishlata boshlaydi** (`store.update` → `storecell.update`). Ilgari 403 edi.
   Ombor kartasi va omborlararo ko'chirish YOPIQ qoladi.

---

## 1. QADAMLAR

> Har qadamda **TO'XTASH SHARTI** bor. Shart bajarilsa — davom etmaymiz,
> 4-bo'limdagi qaytarish daraxtiga o'tamiz.

### T-0 · Tayyorgarlik (lokal, 2 daqiqa)

```bash
cd /d/sherset-v2
git rev-parse HEAD                    # 53c6e1a1 (yoki keyingisi)
git status --short                    # BO'SH bo'lishi kerak
git rev-list --count mirfayz/yacheyka-inventarizatsiya..HEAD   # 0 bo'lishi kerak
```

**TO'XTASH:** daraxt toza emas yoki push qilinmagan commit bor.

---

### 1-QADAM · VPS HEAD tekshiruvi (B4) — Davlatbek reset tuzog'i

```bash
ssh root@13.140.157.10
git -C /var/www/sherset-v2 rev-parse HEAD
git -C /var/www/sherset-v2 status --short
git -C /var/www/sherset-v2 rev-parse --abbrev-ref HEAD
```

**Kutilgan:** `62a27024...`, `status` BO'SH.

🔴 **TO'XTASH SHARTI:** HEAD `62a27024` EMAS. U holda butun delta hisobi
noto'g'ri — Davlatbek boshqa narsa deploy qilgan bo'lishi mumkin. Menga
haqiqiy HEAD ni ayting, men deltani qayta hisoblayman.
⚠️ **`/deploy` va `deploy-smart.sh` ISHLATILMAYDI** — ular
`origin/climart-adoption` ga `reset --hard` qiladi, u esa jonlidan **8 commit
orqada** (F6/F7/F8 ni o'chirib tashlardi).

---

### 2-QADAM · 🔴 ZAXIRA (migratsiyadan OLDIN — MAJBURIY)

```bash
cd /var/www/sherset-v2
set -a; . apps/api/.env; set +a
pg_dump "$DATABASE_URL" -Fc --exclude-table-data=attachments \
  -f /root/sherset_v2-pre-deploy-20260826.dump
ls -lh /root/sherset_v2-pre-deploy-20260826.dump
```

**Kutilgan:** ~7 MB fayl.

**TO'XTASH:** dump yaratilmadi yoki hajmi 1 MB dan kichik.

> **Nega:** IS-4 saboqi — 2026-08-24 da qaytarish yo'li OLDINDAN tayyorlanmagan
> edi va tuzatish skripti savdo shiddatida, 06:45 da shoshilinch yozilgan.
> ⚠️ Dump — **oxirgi chora**: undan tiklash oradagi savdoni yo'qotadi.
> Birinchi chora — 4-bo'limdagi kod-qaytarish.

---

### 3-QADAM · Kodni olib kelish (ff-merge)

```bash
cd /var/www/sherset-v2
git fetch https://github.com/Mirfayz1993/sherset-ERP.git yacheyka-inventarizatsiya:tmp1
git merge --ff-only 61780120
git rev-parse HEAD                    # 61780120... bo'lishi kerak
```

**TO'XTASH:** `merge --ff-only` xato bersa (fast-forward emas) — TEGMANG,
menga ayting.

---

### 4-QADAM · Migratsiyalar — 6 ta, SHU TARTIBDA

```bash
cd /var/www/sherset-v2/packages/db
set -a; . ../../apps/api/.env; set +a

for M in \
  20260824120000_drawer_cash_out_sales_return \
  20260824170000_sales_return_retail_sale \
  20260825020000_retail_sale_position_allocation \
  20260825120000_debt_source_doc \
  20260825170000_tsd_device \
  20260825200000_tsd_work_screens
do
  echo "=== $M ==="
  pnpm exec prisma db execute --file "prisma/migrations/$M/migration.sql" || break
  pnpm exec prisma migrate resolve --applied "$M" || break
done

pnpm exec prisma generate
```

**Kutilgan:** har biri `Script executed successfully`, oxirida `generate` yashil.

**TO'XTASH:** birortasi xato bersa — sikl `break` bilan to'xtaydi. Qaysi
migratsiyada to'xtaganini ayting. **Hammasi lokal bazada UP×2 → DOWN×2 → UP
bilan isbotlangan**, shuning uchun xato kutilmaydi; chiqsa — sabab boshqa.

---

### 5-QADAM · Build va restart

```bash
cd /var/www/sherset-v2
nohup env NODE_OPTIONS="--max-old-space-size=3072" corepack pnpm build:web \
  > /tmp/build.log 2>&1; echo "BUILD_RC=$?"
tail -20 /tmp/build.log
pm2 restart sherset-v2-web
pm2 restart sherset-v2-api
pm2 list --no-color | head
```

**Kutilgan:** `BUILD_RC=0`, ikkala pm2 jarayoni `online`.

**TO'XTASH:** `BUILD_RC` ≠ 0.

---

### 6-QADAM · 🔴 MAJBURIY — ruxsat topup

```bash
cd /var/www/sherset-v2/apps/api
set -a; . .env; set +a
npx tsx src/scripts/topup-role-permissions.ts
pm2 restart sherset-v2-api          # perm keshi
```

**Bu kecha qo'shiladigan entity'lar:** `retailcontrol` (G2) + `returnacceptance` (G3).
*(`piecetracking` 3-kechada keladi.)*

**TO'XTASH:** skript xato bersa — `DATABASE_URL` berilmagan bo'lishi mumkin
(F5 dagi tuzoq: `set -a; . .env` shart).

> Busiz `/omborchi/kontrol` va `/omborchi/vozvrat` **hech kimda ochilmaydi**.

---

### 7-QADAM · Texnik verify (men bajaraman yoki siz)

```bash
for p in / /login /stores /sotuv /inventories /reports/stock-balance \
         /omborchi /omborchi/kontrol /omborchi/vozvrat; do
  printf "%-32s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://erp.sherset.uz$p)"
done
pm2 logs sherset-v2-api --lines 40 --nostream | grep -i error | head
```

**Kutilgan:** hammasi `200`, error loglar toza.

⚠️ **«Sahifa 200» qoida 13 dagi uchma-uch smoke'ni ALMASHTIRMAYDI** — bu
2026-08-24 hodisasining aynan sababi (IS-3).

---

### 8-QADAM · Jonli holat o'lchovi (B5 — endi MUMKIN)

```bash
cd /var/www/sherset-v2/packages/db
set -a; . ../../apps/api/.env; set +a
npx tsx scripts/warehouse-state.ts; echo "EXIT=$?"
```

**Kutilgan:** `EXIT=0`, «POS yeta olmaydigan qoldiq: 0».

⚠️ **MUHIM NUANCE:** bu kecha serverga chiqadigan `warehouse-state.ts` —
**E5 tuzatishidan OLDINGI** versiya (E5 3-kechada keladi). U hamon
«faqat kaskadning BIRINCHI ombori yetadi» modelida. Bugungi topologiyada bu
farq qilmaydi, chunki `Ombor 01` va `Ombor 02` **BO'SH** (qoldiq 0) ⇒
yetib bo'lmaydigan qoldiq baribir 0. **Agar `EXIT=2` chiqsa** — sabab
aniqlanmaguncha davom etmaymiz; ehtimoliy sabab: kimdir bo'sh omborga tovar
qo'ygan.

Chiqishni menga to'liq tashlang — reyestr bilan solishtiraman.

---

### 9-QADAM · Egasi qo'lda (Ozodbek)

1. **«Omborchi» rolidan `Ta'minot` (supply) qatorlarini olib tashlang.**
   Shablon o'zgarishi jonli rolga o'z-o'zidan ko'chmaydi (topup faqat QO'SHADI).
   *Nega:* «ombor xodimlari kirim narxini ko'rmaydi» — sizning qoidangiz.
2. **BRAK ombori** yarating (F3 «Yangi ombor raqamlashtirish», masalan 99),
   yacheykalarini raqamlang, kartada **«BRAK ombori»** ni belgilang va
   **POS prioritetini BO'SH qoldiring**.
   *Busiz `/omborchi/vozvrat` dagi «Brak» tugmasi o'chiq turadi (ataylab).*
   Yaratgach menga ayting — reyestrga (`jonli-holat.md`) qator qo'shaman,
   aks holda birinchi brak qabulidan keyin har deploy bloklanadi.
3. **«Kassa oldidagi ombor» checkbox'i** — 07 ombori jonlida hali YO'Q,
   bu qadam H4 (split qayta) dan keyin ma'noga kiradi. **Bugun TEGMANG.**

---

### 10-QADAM · 🔴 UCHMA-UCH SMOKE (qoida 13) — javobgar: **Ozodbek**

**Asosiy uchlik (majburiy):**

| # | Amal | Kutilgan |
|---|---|---|
| 1 | **Sinov SOTUV**: chek oching → post → qoldiq kamayganini ko'ring → **cancel** | cancel deltalarni AYNAN qaytaradi (00112 da isbotlangan) |
| 2 | **Yacheyka SANASH**: bitta yacheykani sanang | hujjatda to'g'ri ko'rinadi |
| 3 | **KO'CHIRISH**: bitta tovarni yacheykadan yacheykaga | X2 ni ham tekshiradi |

**Fazalar zanjiri (imkon boricha):**

- **G1** — sinov vozvrat post → POS mijoz kartasida qaytim summasi → to'lash →
  smena «kutilgan naqd» AYNAN shu summaga kamayadi → **ikkinchi to'lov RAD etiladi**;
- **G2** — 2 skladli chek → omborchilar «Tayyor» → chek **kontrol navbatida** →
  bitta qator o'chirilganda kassir ekranida summa o'zgaradi (SSE) → «To'liq» → post;
- **G3** — chekdan vozvrat qabuli → yorliq chop → post → kassirda qaytim ko'rinadi;
- **Ruxsat** — oddiy omborchi bilan `/omborchi/kontrol` va `/omborchi/vozvrat` → **403**.

**Har bandni bajarganingizda ayting** — men shu faylga natijani yozaman
(qoida 11: bajarilmagan mezon bilan faza «TUGADI» deb yopilmaydi).

---

### 11-QADAM · 🔴 ERTALAB, savdo boshlanishidan OLDIN (04:00–05:00)

```bash
cd /var/www/sherset-v2/packages/db
set -a; . ../../apps/api/.env; set +a
npx tsx scripts/warehouse-state.ts; echo "EXIT=$?"
```

+ **bitta sinov sotuv (post → tekshir → cancel)**.

> **Nega majburiy:** 2026-08-23 da split kechqurun qilindi, hech kim ertalab
> tekshirmadi va 06:00 da 110 ta sotuv soatida kassa 46 daqiqa to'xtadi.
> Bu band aynan o'sha hodisadan tug'ilgan (qoida 13).

🔴 **DIQQAT — 11-qadamda `EXIT=2` KUTILADI, va bu KUTILGAN holat.**

2026-08-27 da BRAK ombori yaratilgani uchun serverdagi reyestr nusxasi (u
`61780120` bilan kelgan) endi haqiqatdan orqada. Yangilangan reyestr serverga
faqat **2-kecha deploy'i bilan** yetib boradi. Shu sababli ertalabki yugurishda
`warehouse-state.ts` **AYNAN IKKI** farq ko'rsatadi:

1. `[ogohlantirish] reyestrda-yoq: Jonlidagi «Ombor 99» ombori reyestrda yoq`
2. `[xato] split-holati: kutilgan «qaytarilgan», jonlida «qisman»`

**Nima tekshiriladi:**

- `🔴 POS YETA OLMAYDIGAN QOLDIQ: 0 dona` — **shu qator 0 bo'lishi SHART**;
- farqlar ro'yxatida **FAQAT yuqoridagi ikkitasi** bo'lsin. **Uchinchi qator
  chiqsa — bu HAQIQIY muammo**, davom etmang;
- `Ombor 99` qatori `BRAK (ataylab yopiq)` deb ko'rinsin;
- split kesimi: `mos 27` (BRAK niki) va `mos emas 974` (haqiqiy omborlar).

**Javobgar:** Ozodbek · **Vaqt:** _______ (bajarilgach to'ldiriladi)

---

## 2. Vaqt byudjeti

| Qadam | Taxminiy |
|---|---|
| 1–3 (HEAD, zaxira, ff-merge) | 5–10 daq |
| 4 (6 migratsiya) | 2–5 daq |
| 5 (build) | **10–20 daq** ← eng uzuni |
| 6–8 (topup, verify, holat) | 5 daq |
| 9 (egasi qo'lda) | 10–15 daq |
| 10 (smoke) | 20–30 daq |
| **JAMI** | **~1–1,5 soat** |

Savdo 05:00 da boshlanadi ⇒ 21:00 da boshlansa zaxira vaqt ko'p.

---

## 3. Bu kecha CHIQMAYDIGAN narsalar (chalkashmaslik uchun)

- **Avans oqimi (A1–A3)** — POS mijoz kartasida «Avansi» qatori HALI ishlamaydi;
- **Kassa qarzi UI (Q4)** — undirish ro'yxatida «Kassa cheki» belgisi va manba
  filtri HALI yo'q (lekin Q1–Q3 chiqadi, ya'ni **yangi cheklar reyestrga qator
  ocha boshlaydi**);
- **Q5 backfill** — TARIXIY qarzlar reyestrga KIRMAYDI (u alohida, ongli amal);
- **Bo'lak hisobi (K1–K6)** — kabel bo'laklari HALI yo'q;
- **E5** — `warehouse-state.ts` eski modelda (8-qadamdagi nuance).

---

## 4. 🔴 QAYTARISH DARAXTI

**Qaror qoidasi: avval KOD, keyin BAZA.** Migratsiyalar ADDITIV (yangi
ustun/jadval) ⇒ eski kod ularni bilmaydi va ular bo'sh turaveradi.

### 4.1 Nosozlik build/restart da (4-qadamgacha yetmagan)

```bash
cd /var/www/sherset-v2
git reset --hard 62a27024
corepack pnpm build:web && pm2 restart sherset-v2-web sherset-v2-api
```

### 4.2 Nosozlik deploy'dan KEYIN (kassa ishlamayapti / sotuv o'tmayapti)

**Bu 06:46 hodisasining takrori — TEZLIK muhim, sabab keyin.**

```bash
cd /var/www/sherset-v2
git reset --hard 62a27024
corepack pnpm build:web && pm2 restart sherset-v2-web sherset-v2-api
# Bazaga TEGMANG — 6 migratsiya joyida qolaveradi, eski kod ularni ko'rmaydi.
```

⚠️ **Ruxsat qatorlari qolib ketadi** (topup faqat qo'shadi) — zararsiz.

### 4.3 Bazani ham tozalash kerak bo'lsa (kamdan-kam)

Tartib — migratsiya tartibiga **TESKARI**, har fayl boshidagi
«ma'lumot yo'qoladi» bloki AVVAL o'qiladi:

```
20260825200000_tsd_work_screens_down.sql        (G6 — IKKI shart bor, faylda)
20260825170000_tsd_device_down.sql              (G5)
20260825120000_debt_source_doc_down.sql         (Q1)
20260825020000_retail_sale_position_allocation_down.sql  (G4)
20260824170000_sales_return_retail_sale_down.sql (G3)
20260824120000_drawer_cash_out_sales_return_down.sql (G1 — 🔴 PUL izi, avval eksport)
```

Buyruq har faylning boshida. **Hammasi lokal bazada sinalgan** (2026-08-26).

### 4.4 Eng oxirgi chora — dump

```bash
pg_restore -d "$DATABASE_URL" --clean /root/sherset_v2-pre-deploy-20260826.dump
```

🔴 **Oradagi SAVDO YO'QOLADI.** Faqat baza buzilgan holatda.

---

## 5. Deploy jurnali (bajarilgan sari to'ldiriladi)

| Qadam | Vaqt | Natija |
|---|---|---|
| 1 · VPS HEAD | 21:47 | ⚠️ **CHETLANISH, diagnoz qilindi — zararsiz.** HEAD = `83027bc2` (F8 KOD commiti), `62a27024` EMAS. Farq = 1 ta **hujjat-only** commit (`ombor-restrukturizatsiya.md` + `progress.json`; 0 kod, 0 migratsiya) — ya'ni F8 deploy qilingandan KEYIN hisobot lokal yozilgan, serverga bormagan. **Delta qayta hisoblandi: 36 → 37 commit, migratsiyalar AYNAN o'sha 6 ta, ff-merge mumkin.** `status` bo'sh EMAS — 9 untracked fayl; shundan **2 tasi delta qo'shadigan fayl bilan TO'QNASHADI** (`packages/db/scripts/create-cells.ts`, `…/warehouse-split-revert.ts`) ⇒ `merge --ff-only` shularda yiqilardi. Tekshirildi: `create-cells.ts` sha256 git bilan AYNAN; `warehouse-split-revert.ts` (Aug 24 06:45 — hodisadagi asl skript) git versiyasidan faqat biome formatlashi bilan farq qiladi (mantiq belgi-belgi bir xil, isbot: vergulsiz cmp). ⇒ ikkalasi ham /root ga zaxiralanib olib qo'yiladi. **Qaytarish nishoni `62a27024` emas, `83027bc2`** (jonlining haqiqiy holati). |
| 2 · Zaxira | 19:53 CEST | ✅ `/root/sherset_v2-pre-deploy-20260826.dump` — **7.8 MB**, `pg_restore -l` 2310 yozuv, `retail_sales`/`debts`/`cashier_sessions`/`retail_drawer_cash_out`/`stock_by_cell` DATA bloklari joyida. ⚠️ **Rejadagi buyruq shundayligicha ISHLAMADI:** `pg_dump` `invalid URI query parameter: "schema"` berib **0 baytli** fayl qoldirdi — `DATABASE_URL` da Prisma'ning `?schema=public` qismi bor, libpq uni tushunmaydi. Tuzatish: `PGURL="${DATABASE_URL%%\?*}"`. **Keyingi kechalarda ham shu shart.** |
| 3 · ff-merge | 19:53 CEST | ✅ HEAD = `61780120726d1cb5…` (aynan nishon), branch `climart-adoption` ff bilan oldinga surildi; yarim-merge/index.lock yo'q; ishchi daraxtda faqat 7 ta to'qnashmaydigan untracked; 6 migratsiya fayli joyida; olib qo'yilgan 2 fayl git'dan tiklandi (`warehouse-split-revert.ts` → 9053 b = git versiyasi); `warehouse-state.ts` (H2) serverga yetib keldi. ⚠️ **SSH aloqasi bu bosqichda tasodifiy uzila boshladi** (TCP RST) — skript serverda oxirigacha yugurdi, lekin chiqishi bizga yetmadi. Shundan keyin ish usuli o'zgartirildi: har qadam VPS'da **`setsid nohup` bilan fonda** yuritilib chiqishi `/root/deploy-<teg>.log` ga yoziladi, log alohida kichik ulanish bilan o'qiladi. Sabab: uzilish natijani ko'rsatmay qo'yib, buzuvchi qadamni qayta yuritish xavfini tug'diradi. |
| 4 · 6 migratsiya | 20:02–20:04 CEST | ✅ **6/6 qo'llandi** — har biri `Script executed successfully` + `marked as applied`, `prisma generate` yashil (v5.22.0, 68.6 s). Tuzilma zondi 7/7: `retail_drawer_cash_out.sales_return_id`, `sales_returns.retail_sale_id`, `retail_sale_position_allocations`, `debts.source_doc_type`, `tsd_devices`, `client_operations`, `restock_task_lines.shortage_qty`. Migratsiyadan OLDIN o'lchandi: 6 tadan hech biri qo'llanmagan edi, yangi ustun/jadvallar yo'q edi (toza start). ℹ️ `_prisma_migrations` da bitta eski TUGAMAGAN yozuv bor (`20260802180000_manager_daily_kpi`, 2026-08-03, xato 42P07) — lekin `rolled_back_at` BELGILANGAN, ya'ni Prisma uchun hal qilingan va bloklamaydi (isbot: o'shandan keyin 229 tagacha migratsiya qo'llangan). Delta `package.json`/`pnpm-lock.yaml` ga TEGMAGAN ⇒ `pnpm install` shart emas. |
| 5 · build + restart | 20:06–20:12 CEST | ✅ **BUILD_RC=0** (~6 daq), `web_restart_rc=0`, `api_restart_rc=0`. Ikkala jarayon `online` va **barqaror**: `unstable restarts: 0`, PID ikki o'lchovda o'zgarmadi, uptime o'syapti. Deploy'dan keyingi xato loglari **0** (loglardagi `Error: TIMEOUT` lar 12:00 dan, Telegram klientiniki — deploy'ga aloqasi yo'q, oldindan mavjud). ℹ️ Api manbadan yuriladi (`apps/api/src/main.ts`, tsx) ⇒ api uchun alohida build qadami kerak emas. |
| 6 · topup | 20:15 CEST | ✅ `topup_rc=0` — PASS 1: 4 rol, 2352 qator ta'minlandi; PASS 2: 1 rol tegildi, 4 qator yaratildi. `role_permissions` jami 3146. Yangi entity'lar bazada: `retailcontrol` va `returnacceptance` — **5 tadan rolda** (Administrator, B2B/B2G sotuvchi, Employee, Manager, ReadOnly); `piecetracking` YO'Q (kutilgan — K2 3-kechada). Api restart qilindi (perm keshi). 🔴 **TOPILMA (rejadagi taxmin ≠ jonli haqiqat):** jonli bazada **`warehouse_manager` (Katta omborchi) va `storekeeper` (Omborchi) rollari UMUMAN YO'Q** — mavjud 8 rol: AccountOwner, Administrator, B2B/B2G sotuvchi (sales_manager), Employee, Kassir (cashier), Manager, PointOfSale (cashier), ReadOnly. 13 xodimning hammasi kassir/administrator; ombor xodimi yo'q; `employee_permissions` BO'SH (0 qator). ⇒ topup texnik jihatdan to'g'ri ishladi, lekin **mo'ljallangan oluvchi rol mavjud emas**. Oqibati: `/omborchi/*` ekranlari faqat Administrator/AccountOwner da ochiladi (egasi smoke qila oladi), lekin G2/G3/G5/G6 ni **haqiqiy foydalanuvchi bilan** sinash uchun avval omborchi rollari va xodimlari yaratilishi kerak. 9-qadamning «Omborchi rolidan Ta'minot qatorlarini olib tashlang» bandi va 10-qadamning «oddiy omborchi bilan 403» sinovi **hozircha bajarib bo'lmaydi**. |
| 7 · texnik verify | 20:19 CEST | ✅ **9/9 sahifa `200`** (`/`, `/login`, `/stores`, `/sotuv`, `/inventories`, `/reports/stock-balance`, `/omborchi`, **`/omborchi/kontrol`**, **`/omborchi/vozvrat`**). Api xato loglari toza. Web loglaridagi `Server Reference ID` xatolari 2026-08-19…23 dan — deploy'dan OLDINGI eski brauzer chunk'lari, bugungi emas. ⚠️ Qoida 13: bu 10-qadamdagi uchma-uch smoke'ni ALMASHTIRMAYDI. |
| 8 · warehouse-state | 20:19 CEST | ✅ **EXIT=0**, «✅ Reyestrga MOS — farq yo'q». `Taqsimlanmagan` pp=1, 974 yacheyka, ombor qoldiq **51 755 899,41**, yacheykalarda 2 038 093, yacheykasiz 49 717 806,41 (~96 %), POS SOTADI. `Ombor 01` bo'sh, kaskadda yo'q. `Ombor 02` pp=2, bo'sh. Kaskad: `1:Taqsimlanmagan → 2:Ombor 02`. Split: qaytarilgan (mos emas 974, yetishmayotgan ombor `Ombor 03`). 🔴 **POS yeta olmaydigan qoldiq: 0 dona** — to'xtash sharti bosilmadi. `Ombor 02` yonidagi «tasdiq kerak (G4 yo'q!)» — brifingda o'lchangan **E5 gacha bo'lgan yolg'on qizil**; ombor BO'SH bo'lgani uchun yetib bo'lmaydigan qoldiq baribir 0 va EXIT=0 (E5 3-kechada keladi). |
| 9 · egasi sozlamalari | 2026-08-27 01:15–01:20 | ⚠️ **QISMAN — egasining qarori bilan operator bajardi.** **(1) «Omborchi» rolidan `Ta'minot` olib tashlash — BAJARIB BO'LMADI:** jonlida `warehouse_manager`/`storekeeper` rollari UMUMAN YO'Q (8 rol bor, hammasi kassir/admin/menejer turkumida). **(2) BRAK ombori ✅ YARATILDI:** «Ombor 99» (`d4b4ff85`), `__brakStore=true`, `__posPriority` YO'Q (kaskadga kirmaydi), 27 yacheyka `99-01-01-01`…`99-01-03-09`, zonasiz. Usul: qoida 7 ning maqsadi jonli `BEGIN…tekshirish…ROLLBACK` DRY bilan bajarildi (lokal dev baza paroli yo'q edi), so'ng aynan o'sha bayonot `COMMIT` bilan; yacheykalar `create-cells.ts` ning O'Z DRY-RUN i bilan. **(3) «Kassa oldidagi ombor» — TEGILMADI** (rejadagidek). **(4) `sklad_keepers` ✅ TO'LDIRILDI** (rejada yo'q edi, egasi so'radi): sklad 1, 2, 3 → «Admin User» (`885fb467`, Administrator). Sabab: omborchi vazifasi vaqtincha menejerga yuklandi. 🔴 Tanlov ATAYLAB kassir bo'lmagan xodimga tushdi — `markReady` da `assigneeId = userId` bo'lsa kassirning «tayyor» tugmasi chekni `ready` ga flip QILMAYDI, ya'ni omborchi qilib kassir belgilansa cheklar qotib qolardi. Uchala sklad ham qo'shildi, chunki qamrovsiz sklad `continue` bilan JIMGINA tushib qoladi. Qaytarish: `delete from sklad_keepers where employee_id='885fb467-…'`. |
| 10 · smoke | 2026-08-27 06:44 | ⚠️ **QISMAN — UI qatlami tekshirildi, YOZUV qatlami YO'Q.** Egasi «men qilolmayman» dedi ⇒ operator **Playwright bilan brauzer orqali** yozuvsiz smoke o'tkazdi (haqiqiy brauzer, haqiqiy login `admin@demo.local`, produksiya `erp.sherset.uz`). **8/8 ekran ROSTDAN ochildi** — bu «sahifa 200» dan kuchliroq dalil (IS-3 aynan shu haqda edi): **`/sotuv`** — tovar to'ri, narxlar, qoldiqlar, savat, «Продать» va «→ Отправить кладовщику» tugmalari joyida; **`/omborchi/kontrol` (G2)** — to'g'ri bo'sh holat («Очередь пуста — собранных чеков нет»); **`/omborchi/vozvrat` (G3)** — haqiqiy cheklar ro'yxati summalari va mijozlari bilan; `/`, `/omborchi`, `/stores`, `/inventories`, `/reports/stock-balance` — hammasi to'la mazmun bilan. **0 ta 5xx javob, 0 ta konsol xatosi.** Skrinshotlar olindi. 🔴 **BAJARILMAGANI:** sinov SOTUV (post → tekshir → cancel), yacheyka SANASH va KO'CHIRISH — ya'ni qoida 13 dagi asosiy uchlikning **hech biri**. Sabab: produksiyaga YOZUV amallari harness ruxsat qo'riqchisi tomonidan bloklandi (curl ham, skript yuklash ham). Ular uchun yo Bash ruxsat qoidasi, yo egasining o'z qo'li kerak. ⇒ **Qoida 11 bo'yicha 10-qadam YOPILMAYDI.** ℹ️ Yo'l-yo'lakay topildi: Admin User smenasi **21 soatdan beri ochiq** (POS o'zi ogohlantiryapti), Shavkat smenasi esa 2026-08-21 dan beri — ikkalasi ham yopilishi kerak. **🟢 2026-08-27 07:12 — HAQIQIY SOTUV BILAN ASOSIY BAND YOPILDI.** Sun'iy chek YARATILMADI (kerak bo'lmadi): jonli kuzatuvchi (`/root/smoke-watch.sh`) birinchi haqiqiy sotuvni ushladi — **`ТРН-2026-01765`, `posted`, 1 200 000, kassir Ravshan**. O'lchovlar: **(a) 🔴 G4 ajratma qatori YOZILDI** — `store_id=968f9da2 (Taqsimlanmagan)`, **`cell_id=BO'SH`**, `qty=1`, `manual=f` ⇒ **X1 ning bashorati jonlida tasdiqlandi: sotuv sanalgan yacheykani BUZMADI** (`cellMode:'store-only'`); yacheyka qoldig'i 1 818 573 / 651 qator — **o'zgarmadi**; **(b) kassa balansi 137 431 316 551 → 137 432 516 551, farq AYNAN 1 200 000** = chek summasi; **(c)** smena tushumi 1 chek / 1 200 000 — mos; **(d)** api xatolari **yo'q**; **(e)** yig'ish topshiriqlari 0 (kassir «Продать» ni ishlatdi, kutilgan). ⇒ Kassa yo'li — 2026-08-24 da aynan to'xtagan oqim — jonlida **ISHLAYAPTI**. 🔴 **HAMON BAJARILMAGAN:** `cancel` (haqiqiy mijoz cheki ustida sinab bo'lmaydi; UI'da post bo'lgan chekda «Отменить» YO'Q — faqat «Возврат», bu boshqa amal), **yacheyka sanash** va **ko'chirish**. Ikkinchi va uchinchisi xavfsiz — savdo tinchigach bajarilsin. |
| 11 · ertalabki tekshiruv | 2026-08-27 05:30 | ✅ **TEXNIK YARMI BAJARILDI** (savdo boshlanishidan oldin): api xato loglari toza · `pm2` ikkalasi `online`, 6 soat uptime, `unstable restarts: 0` · `warehouse-state.ts` **POS yeta olmaydigan qoldiq = 0** · `EXIT=2` — kutilgan, **aynan ikkita** oldindan bashorat qilingan farq bilan (Ombor 99 reyestrda yo'q + split «qisman»), uchinchi farq yo'q. **Sotuv qismi 07:12 da HAQIQIY sotuv bilan yopildi** (10-qatorga qarang). ⚠️ Ish savdo oynasiga cho'zildi — reja 04:30 gacha tugashni talab qilgan edi. |


### 5.2 Mustaqil qayta tekshiruv — deploy'dan ~19 soat keyin (2026-08-27 15:20–15:55)

> Egasi deploy prompt'ini QAYTA ishga tushirdi (jurnal to'ldirilgani ko'rinmagan
> holatda). Yangi operator sessiyasi 1-qadamdan boshladi, to'xtash sharti ishladi
> (HEAD `62a27024` emas) va **butun holatni noldan, mustaqil o'lchadi.**
> Qiymati: yuqoridagi jurnal endi **ikkinchi, bog'liqsiz manba bilan tasdiqlangan**
> va tizim bir to'liq savdo kunidan keyin qanday turgani o'lchandi.

**Tasdiqlangan (o'sha raqamlar, mustaqil o'lchov):** reflog `2026-08-26 19:53:55
+0200 merge 61780120: Fast-forward` · `_prisma_migrations` da 6/6, `20:02:26 →
20:02:58`, `rolled_back_at` bo'sh · `.next/BUILD_ID` = 20:09:29 · pm2 restart
web 20:12:17 / api 20:15:55, ikkalasi hamon `online` va **o'shandan beri qayta
ishga tushmagan** · topup: `retailcontrol` 26 + `returnacceptance` 26 qator ·
9/9 sahifa `200`.

**Chegara zondi — 2- va 3-kecha CHIQMAGANI qayta isbotlandi:**

| Zond | Kutilgan | O'lchandi |
|---|---|---|
| `retail_drawer_cash_in.kind` (A1, 2-kecha) | yo'q | **0** ✅ |
| `stock_pieces` (K1, 3-kecha) | yo'q | **0** ✅ |
| `retail_drawer_cash_out.sales_return_id` (G1) | bor | **1** ✅ |
| `retail_sale_position_allocations` (G4) | bor | **1** ✅ |
| `client_operations` + `restock_task_lines.shortage_qty` (G6) | bor | **1** ✅ |
| `debts.source_doc_type` (Q1) | bor | ✅ |

⇒ Jonlidagi holat **aynan 1-kecha chegarasi** — yarim yoki aralash deploy emas.

**Bir kunlik savdo (eng muhim dalil):** 2026-08-26 17:00 dan 2026-08-27 12:00
(CEST) gacha uzluksiz sotuv — soatiga 7–16 chek, 2026-08-27 da ~83 chek.
**Kassa yangi kodda bir kun to'xtovsiz ishladi.**

**Yangi topilmalar (avvalgi sessiyada yo'q):**

1. `Error: TIMEOUT` loglari — **deploy'ga aloqasi YO'Q**: `telegram@2.26.22`
   `_updateLoop` idan chiqadi va **2026-08-21 dan beri** bor (deploy'dan oldingi
   kuni ertalabgina 3379 marta, jami 38 048). Har ~39 soniyada takrorlanadi.
   Kelajakdagi sessiyalar buni deploy nosozligi deb o'qimasin.
2. 🟠 **`/var/log/sherset-v2/api.out.log` — 550 MB** (err log 19 MB). Log
   rotatsiyasi yo'q. Deployni bloklamaydi, lekin diskni to'ldirishi mumkin —
   alohida kichik ish (`pm2-logrotate`).
3. Baza ulanishlari `47/100` — zaxira yetarli.
4. 🔴 **Serverdagi `warehouse-state.ts` hamon `EXIT=2` beradi va bu KUTILGAN:**
   reyestrning YANGI nusxasi (Ombor 99 + `split: qisman`) faqat LOKALDA —
   serverdagi fayl `61780120` dan, ya'ni eski. **Farq kodda emas, hujjatda.**
   Reyestr serverga 2-kecha deploy'i bilan boradi. Shu paytgacha **aynan ikki**
   farq kutiladi; **uchinchisi — haqiqiy muammo.**

⚠️ **Jarayon qaydi (qoida 14 ruhida):** bu sessiya boshlanganda ishchi daraxt
`git status` bo'yicha TOZA ko'rindi va jurnal BO'SH o'qildi; ~20 daqiqadan keyin
o'sha 4 fayl (mtime'lari 02:00–07:18) o'zgargan holda paydo bo'ldi. Ya'ni
**deploy hujjatlari commit qilinmagan holda turgan ekan** va bir muddat
ko'rinmay qolgan. Aynan shu sabab bu qator yozilyapti: **bu 4 fayl commit
qilinishi SHART** — commit qilinmagan hisobot IS-6 ning («favqulodda ish izsiz
qolgan») qaytishi demakdir.

---

## 5.1 PROMPT — yangi deploy sessiyasi uchun (nusxa ko'chiring)

```
D:\sherset-v2 da deploy qilamiz. Sen deploy operatorisan.

AVVAL SHULARNI TO'LIQ O'QI (shu tartibda):
1. docs/ops/2026-08-26-deploy-reja-1-kecha.md   ← ASOSIY IJRO REJASI, 11 qadam
2. docs/ops/2026-08-25-deploy-dossieri.md       ← to'liq kontekst, B/D/X bandlari
3. docs/plans/2026-08-23-ombor-restrukturizatsiya.md — 2-bo'lim (qoidalar 1–14)
4. docs/plans/2026-08-24-split-kassa-hodisasi.md — nega bu qoidalar bor (IS-1…IS-7)
5. docs/plans/2026-08-23-omborchi-tsd-mijozlar.md — G1–G6 hisobotlari (nima chiqyapti)

QAMROV (egasi 2026-08-26 da C yo'lini tanladi — uch kecha):
  BUGUN 1-KECHA: 62a27024 -> 61780120 · 36 commit · 6 migratsiya
  Chiqadi: G1 G2 G3 G4(1+2a) G5 G6 + Q1–Q3 + H2 + H5
  CHIQMAYDI: A1–A3 (2-kecha) · Q4–Q6 + K1–K6 + E5 (3-kecha)

JAVOBGAR (qoida 13): Ozodbek (egasi) — jonli smoke'ni U bajaradi.
Sen POS'da sotuv qila olmaysan: 9- va 10-qadamlarni egasiga topshirasan va
natijasini undan so'rab olasan.

VPS: root@13.140.157.10 (parol egasida, so'ra). Fail2ban bor — noto'g'ri
parol bilan qayta-qayta urinma.
⚠️ Muhim: parol bilan SSH ba'zan ruxsat qo'riqchisi tomonidan bloklanadi.
Bloklansa TO'XTA va egasiga ikki yo'lni taklif qil: (a) u Bash ruxsatini
ochadi, (b) u buyruqlarni o'zi yuritib chiqishini senga tashlaydi. Rejadagi
har qadam nusxa-ko'chirib yuritiladigan blok shaklida yozilgan.

QAT'IY TAQIQLAR:
- `/deploy` slash-buyrug'i va deploy/deploy-smart.sh ISHLATILMAYDI. Ular
  origin/climart-adoption ga reset --hard qiladi, u esa jonlidan 8 commit
  ORQADA (F6/F7/F8 ni produksiyadan o'chirib tashlardi). Faqat qo'lda ff-merge.
- Migratsiyadan OLDIN pg_dump olinmasa DAVOM ETMA (2-qadam, IS-4 saboqi).
- Har qadamning TO'XTASH SHARTI bor — shart bajarilsa davom etma, egasiga
  ayt va rejaning 4-bo'limidagi qaytarish daraxtiga qara.
- Maxfiy ma'lumot (parol, token) repoga YOZILMAYDI (qoida 5).

BILIB TURISHING KERAK BO'LGAN IKKI NUANCE (o'lchangan, qayta tekshirma):
- 8-qadamdagi warehouse-state.ts bu kecha E5 GACHA bo'lgan versiya bo'ladi
  (E5 3-kechada keladi). EXIT=0 kutiladi, chunki Ombor 01 va Ombor 02 BO'SH.
  EXIT=2 chiqsa sabab BOSHQA — aniqlanmaguncha davom etma.
- 1-kechaning TOPUP_ENTITIES ida piecetracking YO'Q (K2 keyinroq keladi) =>
  bu kecha topup faqat retailcontrol + returnacceptance qo'shadi.

ISH TARTIBI:
Rejadagi 11 qadamni KETMA-KET bajar. Har qadamdan keyin natijani rejaning
5-bo'limidagi «Deploy jurnali» jadvaliga yoz (vaqt + natija). Qadamni
o'tkazib yuborma va tartibini o'zgartirma.

TUGAGANDAN KEYIN (majburiy):
- docs/ops/jonli-holat.md — «O'zgarishlar jurnali» ga qator (qoida 14) va
  agar BRAK ombori yaratilgan bo'lsa 1-bo'limdagi JSON reyestrga qator;
- docs/plans/2026-08-23-omborchi-tsd-mijozlar.md — G1…G6 hisobotlariga
  deploy natijasi va qabul mezonining qaysi bandi JONLIDA bajarilgani;
- NEXT.md ga qisqa hand-off yozuvi;
- QOIDA 11: qabul mezonining biror bandi jonlida bajarilmasa faza «TUGADI»
  deb YOPILMAYDI — «QISMAN» bo'lib qoladi. Halol yoz.
- 11-qadam (ertalab 04:00–05:00 takroriy tekshiruv) BAJARILMAGUNCHA deploy
  YAKUNLANGAN deb hisoblanmaydi.

Boshla: rejaning T-0 va 1-qadamidan (VPS HEAD tekshiruvi). Avval egasidan
VPS parolini so'ra.
```

---

## 6. Keyingi kechalar (eslatma)

| Kecha | To'xtash nuqtasi | Nima | Migratsiya |
|---|---|---|---|
| 2 | `cbc14723` | A1–A3 avans oqimi | 7 (`…drawer_cash_in_kind`) |
| 3 | `HEAD` | Q4–Q6 + K1–K6 + **E5** | 8–12 |

3-kechada qo'shimcha: `topup-role-permissions.ts` **yana** yuritiladi
(`piecetracking`), va **K pilotini** boshlaymiz — bayroq FAQAT kabel
guruhiga (bir kunda butun «м» katalogiga EMAS).
