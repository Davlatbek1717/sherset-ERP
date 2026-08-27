# Bu kecha — 2026-08-27 · uch blok (A · B · C)

> **Qaror (egasi, 2026-08-27):** bu kecha **qolgan smoke + 2-kecha deploy'i**
> birga bajariladi, va **omborchi ROLI hamda XODIMI yaratiladi.**
>
> **Oyna:** savdo 20:00 da yopiladi, 05:00–06:00 da boshlanadi ⇒
> **04:30 gacha tugashi va ertalabki takroriy tekshiruv SHART** (qoida 13).
>
> **Old kontekst:** 1-kecha `83027bc2 → 61780120` deploy qilingan
> (`docs/ops/2026-08-26-deploy-reja-1-kecha.md` — §5 jurnal va §5.2 mustaqil
> tekshiruv). Jonli HEAD hozir **`61780120`**.

---

## 0. Tartib NEGA shunday

**A → B → C** tartibi ataylab:

- **A (qolgan smoke)** 1-kechaning KODI ustida yuriladi. Agar u C dan keyin
  qilinsa va nosozlik chiqsa, «1-kechami yoki 2-kechami?» degan qimmat savol
  tug'iladi — bu aynan **IS-3** klassi.
- **B (rol + xodim)** C dan OLDIN, chunki u G2/G3 zanjirlarini **1-kecha
  kodida** sinash imkonini beradi. Rol yaratish — additiv, xavfsiz.
- **C (2-kecha deploy)** oxirida, chunki yagona blok bo'lib build va restart
  talab qiladi.

**Har blok mustaqil.** Vaqt yetmasa **C ni keyingi kechaga qoldiring** — A va B
o'z-o'zicha qiymat beradi. Teskarisi TO'G'RI EMAS (C ni A siz qilmang).

---

# BLOK A — 1-kechaning qolgan smoke bandlari

> **Nega:** qoida 13 uchta bandni talab qiladi — sotuv, **yacheyka sanash**,
> **ko'chirish**. Birinchisi 2026-08-27 07:12 da haqiqiy sotuv bilan yopildi
> (`ТРН-2026-01765`). Qolgan ikkitasi **hamon ochiq** ⇒ 1-kecha rasman
> yakunlanmagan.
>
> **Javobgar:** Ozodbek (egasi) — ikkalasi ham UI amali.

### A1 · Yacheyka SANASH

1. `/inventories` → yangi inventarizatsiya hujjati (yoki mavjud qoralama).
2. Bitta yacheyka tanlang — **`Taqsimlanmagan` omboridan, tovari BOR** biri.
3. Sanang va hujjatga yozing.

**Kutilgan:** hujjatda kiritilgan son to'g'ri ko'rinadi; qoldiq hisobotida
o'zgarish mantiqiy.

🔴 **TO'XTASH:** son noto'g'ri tushsa yoki hujjat saqlanmasa — **post
QILMANG**, qoralama holida qoldiring va menga ayting.

⚠️ **Post qilishdan oldin o'ylang:** sanash qoldiqni O'ZGARTIRADI. Sinov uchun
**qoralama darajasida to'xtash yetarli**. Post qilishni xohlasangiz — aynan
qancha o'zgarganini yozib qo'ying.

### A2 · KO'CHIRISH (X2 ni ham tekshiradi)

1. Tovar kartasi → **«Переместить»** (yoki `/stores` → yacheyka ichidagilar →
   ko'chirish).
2. Bitta tovarni **bitta yacheykadan boshqasiga** ko'chiring (ikkalasi ham
   `Taqsimlanmagan` ichida).

**Kutilgan:** ko'chirish o'tadi; manba yacheyka kamayadi, nishon oshadi;
**jami qoldiq O'ZGARMAYDI**.

🔴 **TO'XTASH:** 403 chiqsa yoki jami qoldiq o'zgarsa — darhol ayting.

> **Eslatma (X2):** «Омборчи» roli uchun bu tugma 1-kechadan beri ochiq
> (`store.update` → `storecell.update`). Hozir sizda o'sha rol yo'q, ya'ni
> siz admin sifatida sinaysiz. Rol yaratilgach (Blok B) **omborchi bilan ham**
> takrorlansa — X2 to'liq tasdiqlanadi.

### A3 · Natijani qayd etish

Ikkalasi bajarilgach menga ayting — men `2026-08-26-deploy-reja-1-kecha.md`
§5 jurnalining 10-qatorini yangilayman va G fazalarining holatini
aniqlashtiraman (qoida 11).

---

# BLOK B — omborchi ROLI va XODIMI

> **Nega bloklovchi:** jonlida `warehouse_manager` ham, `storekeeper` ham
> **umuman yo'q** (8 rol bor, hammasi kassir/admin/menejer turkumida). Shuning
> uchun **G2, G3, G5, G6 ning qabul mezonlari printsipial ravishda yopilmaydi**
> va «oddiy omborchi bilan 403» sinovi qilinmaydi.

## B0 · 🟢 «Ta'minot qatorlarini olib tashlash» KERAK EMAS

1-kecha rejasining 9/1-bandi «Omborchi rolidan `Ta'minot` (supply) qatorlarini
olib tashlang» der edi. **U band MAVJUD jonli rol uchun edi.** Bunday rol
jonlida yo'q, biz esa uni **shablondan** yaratamiz — `storekeeper` shablonida
`supply` **allaqachon olib tashlangan** (G3, 2026-08-24; sabab kodda yozilgan:
«ombor xodimlari kirim narxini ko'rmaydi, kirim narxi faqat katta omborchida»).

⇒ **Shablondan yaratilsa narx muammosi tug'ilmaydi.** Qo'lda tozalash yo'q.

## B1 · Ikki rolni SHABLONDAN yarating (UI orqali, SQL YO'Q)

Manzil: **`/analitika/sozlamalar/rollar`** → «Yangi rol».

Formada **shablon tanlanadi** — bu MUHIM: shablonsiz yaratilgan rolning
matritsasi bo'sh qoladi va `uiMode` ham to'g'ri tushmaydi.

| # | Shablon | Tavsiya etilgan nom | Vazifasi |
|---|---|---|---|
| 1 | **`warehouse_manager`** («Ombor menejeri») | Katta omborchi | Kontrol, vozvrat qabuli, ombor raqamlash |
| 2 | **`storekeeper`** («Omborchi») | Omborchi | Yig'ish, joylashtirish, sanash |

**Shablonlar nima beradi (koddan o'qildi — `role-templates.ts`):**

| Huquq | Katta omborchi | Omborchi |
|---|---|---|
| `retailcontrol` (G2 kontrol navbati) | ✅ view + update | ❌ **ataylab yo'q** |
| `returnacceptance` (G3 vozvrat qabuli) | ✅ view + create | ❌ **ataylab yo'q** |
| `warehousenumbering` (F3 ombor raqamlash) | ✅ | ❌ |
| `storecell` (yacheyka bog'lash/sanash) | ✅ view + update | ✅ view + update |
| `store` (ombor kartasi) | ✅ view + update | ✅ **faqat view** |
| `retailsale` (chek yig'ish) | view (default) | ✅ view + update + print |
| Kirim narxi (PURCHASE_DOCS / `supply`) | ✅ ko'radi | ❌ **ko'rmaydi** |

⇒ «Oddiy omborchi `/omborchi/kontrol` va `/omborchi/vozvrat` da **403**»
sinovi aynan shu assimetriya tufayli ishlaydi.

ℹ️ **Kutilgan zararsiz holat:** `warehouse_manager` shabloni `piecetracking`
huquqini ham beradi, lekin bu entity jonliga faqat **3-kecha** (K2) bilan
keladi. Rol matritsasida qator paydo bo'ladi, amalda hech nimaga tegmaydi —
**nosozlik emas**.

🔴 **TO'XTASH:** shablon ro'yxatida `warehouse_manager` / `storekeeper`
ko'rinmasa — davom etmang, menga ayting.

## B2 · Xodimlarni biriktiring

Manzil: **`/settings/employees`** (yoki `/hr/employees`).

- kamida **bitta** «Omborchi» — busiz G6/G5 va «403» sinovi qilinmaydi;
- kamida **bitta** «Katta omborchi» — busiz G2/G3 zanjiri qilinmaydi.

🔴 **KASSIRNI OMBORCHI QILMANG.** Sabab o'lchangan (1-kecha, 9-qadam):
`markReady` da `assigneeId = userId` bo'lsa kassirning «tayyor» tugmasi chekni
`ready` ga **flip qilmaydi** ⇒ **cheklar qotib qoladi**.

**Menga ayting:** kimni omborchi, kimni katta omborchi qildingiz — men
`sklad_keepers` ni (hozir uchala sklad ham «Admin User» da) haqiqiy odamga
o'tkazish kerakmi-yo'qmi, shuni hisoblab beraman.

## B3 · Endi sinash MUMKIN bo'lgan zanjirlar (1-kecha kodida)

| Faza | Sinov |
|---|---|
| **Ruxsat** | Oddiy omborchi bilan kiring → `/omborchi/kontrol` va `/omborchi/vozvrat` → **403** kutiladi |
| **G2** | Chek yig'ilsin → omborchi «Tayyor» → chek **kontrol navbatida** → katta omborchi bitta qatorni o'chirsa kassir ekranida summa o'zgaradi (SSE) → «To'liq» → post |
| **G3** | `/omborchi/vozvrat` → chekdan qabul → **«Brak» tugmasi endi YOQILGAN** (Ombor 99 yaratilgan) → yorliq chop → post |
| **G1** | G3 dan keyin: POS mijoz kartasida qaytim summasi → to'lash → smena «kutilgan naqd» AYNAN shu summaga kamayadi → **ikkinchi to'lov RAD etiladi** |

⚠️ **Halol chegara:** `restock_tasks` jonlida **0 qator** — G2 zanjiri hech
qachon yurmagan. Birinchi yurishda kutilmagan narsa chiqishi normal; chiqsa —
**post qilmang**, menga ayting.

---

# BLOK C — 2-KECHA DEPLOY (A1–A3 avans oqimi)

> **Faqat savdo yopilgach.** A va B tugagach, 20:00 dan keyin.

## C0 · Qamrov

| | |
|---|---|
| **Delta** | `61780120` → **`cbc14723`** — **14 commit** (ff-merge mumkinligi tekshirilgan) |
| **Migratsiya** | **1 ta** — `20260825220000_drawer_cash_in_kind` |
| **Chiqadi** | **A1** kassada avans qabuli · **A2** avansdan to'lash (PREPAY tenderi) · **A3** avansni ko'rsatish, tarix, naqd qaytarish · **G1 tuzatishi** (`9fe25d15` — vozvrat juftligining yorliqlari + rollback skripti) · yacheykadan «Chiqarish» tugmasi |
| **CHIQMAYDI** | Q4–Q6 + K1–K6 + E5 (3-kecha) |
| **Ruxsat topup** | 🟢 **KERAK EMAS** — yangi entity yo'q (`piecetracking` 3-kechada) |

## C1 · 🔴 O'TGAN KECHADAN OLINGAN UCH SABOQ (majburiy o'qing)

**1. `pg_dump` rejadagi shaklda ISHLAMAYDI.** `DATABASE_URL` da Prisma'ning
`?schema=public` qismi bor, libpq uni rad etadi va **0 baytli fayl** qoldiradi —
ya'ni «zaxira oldim» degan yolg'on tuyg'u beradi. To'g'risi:

    PGURL="${DATABASE_URL%%\?*}"

**2. SSH aloqasi tasodifiy uziladi (TCP RST), lekin serverdagi jarayon DAVOM
ETAVERADI.** O'tgan kecha `merge` biz ko'rmagan holda bajarilib bo'lgan edi.
⇒ Har qadam **fonda** yuritilsin va log alohida o'qilsin:

    setsid nohup bash -c '<buyruqlar>' > /root/deploy-<teg>.log 2>&1 &
    # keyin alohida ulanishda:
    cat /root/deploy-<teg>.log

🔴 **Buzuvchi qadamni KO'R-KO'RONA QAYTA YURITMANG** — avval log o'qing.

**3. Serverdagi untracked fayllar `merge --ff-only` ni yiqitadi.** O'tgan kecha
`create-cells.ts` va `warehouse-split-revert.ts` to'qnashgan edi. Merge'dan
oldin `git status --short` bilan tekshiring.

## C2 · Qadamlar

### C2-1 · VPS HEAD

    git -C /var/www/sherset-v2 rev-parse HEAD     # kutilgan: 61780120
    git -C /var/www/sherset-v2 status --short

🔴 **TO'XTASH:** HEAD `61780120` emas.

### C2-2 · 🔴 ZAXIRA (migratsiyadan OLDIN — MAJBURIY)

    cd /var/www/sherset-v2
    set -a; . apps/api/.env; set +a
    PGURL="${DATABASE_URL%%\?*}"          # ← C1/1 saboqi
    pg_dump "$PGURL" -Fc --exclude-table-data=attachments \
      -f /root/sherset_v2-pre-deploy-20260827.dump
    ls -lh /root/sherset_v2-pre-deploy-20260827.dump

🔴 **TO'XTASH:** fayl yo'q yoki **1 MB dan kichik** (0 bayt = C1/1 tuzog'i).

### C2-3 · ff-merge

    cd /var/www/sherset-v2
    git status --short                    # untracked to'qnashuvi (C1/3)
    git fetch https://github.com/Mirfayz1993/sherset-ERP.git yacheyka-inventarizatsiya:tmp2
    git merge --ff-only cbc14723
    git rev-parse HEAD                    # cbc14723... bo'lishi kerak

🔴 **TO'XTASH:** ff-merge yiqilsa — TEGMANG, menga ayting.

### C2-4 · Migratsiya (BITTA)

    cd /var/www/sherset-v2/packages/db
    set -a; . ../../apps/api/.env; set +a
    M=20260825220000_drawer_cash_in_kind
    pnpm exec prisma db execute --file "prisma/migrations/$M/migration.sql"
    pnpm exec prisma migrate resolve --applied "$M"
    pnpm exec prisma generate

**Kutilgan:** `Script executed successfully` + `generate` yashil.
**Lokal dev bazada `DOWN → DOWN (no-op) → UP` zanjiri bilan isbotlangan.**

### C2-5 · Build va restart

    cd /var/www/sherset-v2
    setsid nohup bash -c 'NODE_OPTIONS="--max-old-space-size=3072" corepack pnpm build:web; echo BUILD_RC=$?' \
      > /root/deploy-c25.log 2>&1 &
    # ~6–20 daqiqadan keyin:
    tail -20 /root/deploy-c25.log
    pm2 restart sherset-v2-web && pm2 restart sherset-v2-api

🔴 **TO'XTASH:** `BUILD_RC` ≠ 0.

### C2-6 · Texnik verify

    for p in / /login /stores /sotuv /inventories /reports/stock-balance \
             /omborchi /omborchi/kontrol /omborchi/vozvrat; do
      printf "%-32s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://erp.sherset.uz$p)"
    done

⚠️ «Sahifa 200» qoida 13 dagi smoke'ni ALMASHTIRMAYDI (IS-3).

### C2-7 · Jonli holat

    cd /var/www/sherset-v2/packages/db
    set -a; . ../../apps/api/.env; set +a
    npx tsx scripts/warehouse-state.ts; echo "EXIT=$?"

🟢 **`EXIT=2` KUTILGAN — bu nosozlik EMAS**, va sabab o'lchangan: yangilangan
reyestr (`Ombor 99` + `split: qisman`) `58771056` commitida, u esa `cbc14723`
dan **KEYIN** turadi ⇒ reyestr serverga faqat **3-kecha** bilan boradi.

**AYNAN IKKI farq bo'lishi shart:**

1. «Ombor 99 reyestrda yo'q»;
2. «split kutilgan `qaytarilgan`, jonlida `qisman`».

🔴 **UCHINCHI farq — HAQIQIY muammo, to'xtang.**
Shuningdek **«POS yeta olmaydigan qoldiq» 0 bo'lishi SHART.**

### C2-8 · Uchma-uch smoke (qoida 13)

- sinov **sotuv** (post → tekshir → cancel), yoki haqiqiy sotuvni kuzatish;
- **A1** — kassada mijozdan avans qabuli;
- **A2** — avansdan to'lash (PREPAY tenderi);
- **A3** — mijoz kartasida avans qatori + tarix + naqd qaytarish.

### C2-9 · 🔴 ERTALAB (04:00–05:00, savdo boshlanishidan OLDIN)

    cd /var/www/sherset-v2/packages/db
    set -a; . ../../apps/api/.env; set +a
    npx tsx scripts/warehouse-state.ts; echo "EXIT=$?"   # yana EXIT=2 kutiladi
    pm2 list --no-color | head

+ bitta sinov sotuv. **Bu bandsiz deploy YAKUNLANGAN hisoblanmaydi.**

---

## C3 · QAYTARISH DARAXTI

**Qoida: avval KOD, keyin BAZA.** Migratsiya ADDITIV (bitta ustun + 2 indeks)
⇒ eski kod uni bilmaydi va u bo'sh turaveradi.

Nosozlik deploy'dan keyin (kassa ishlamayapti):

    cd /var/www/sherset-v2
    git reset --hard 61780120
    corepack pnpm build:web && pm2 restart sherset-v2-web sherset-v2-api
    # Bazaga TEGMANG.

Bazani ham tozalash kerak bo'lsa (kamdan-kam):
`packages/db/scripts/rollback/20260825220000_drawer_cash_in_kind_down.sql` —
buyrug'i faylning boshida. 🔴 Fayl boshidagi «ma'lumot yo'qoladi» bloki AVVAL
o'qiladi: `kind` yo'qoladi (avansni oddiy kirimdan ajratib bo'lmaydi), **lekin
PUL va BALANS yo'qolmaydi** — bu lokal dev bazada zond bilan o'lchangan
(`777000 → 777000`).

Eng oxirgi chora:

    pg_restore -d "$PGURL" --clean /root/sherset_v2-pre-deploy-20260827.dump

🔴 **Oradagi SAVDO YO'QOLADI.** Faqat baza buzilgan holatda.

---

## 5. Jurnal (bajarilgan sari to'ldiriladi)

| Blok / qadam | Vaqt | Natija |
|---|---|---|
| A1 · yacheyka sanash | | |
| A2 · ko'chirish | | |
| B1 · ikki rol yaratildi | | |
| B2 · xodimlar biriktirildi | | |
| B3 · ruxsat sinovi (403) | | |
| B3 · G2 zanjiri | | |
| B3 · G3 zanjiri | | |
| B3 · G1 zanjiri | | |
| C2-1 · VPS HEAD | | |
| C2-2 · zaxira | | |
| C2-3 · ff-merge | | |
| C2-4 · migratsiya | | |
| C2-5 · build + restart | | |
| C2-6 · texnik verify | | |
| C2-7 · warehouse-state | | |
| C2-8 · smoke (A1–A3) | | |
| C2-9 · ertalabki tekshiruv | | |

---

## 6. Tugagandan keyin (majburiy)

- `docs/ops/jonli-holat.md` — «O'zgarishlar jurnali» ga qator (qoida 14);
  rol yaratish ombor TUZILMASIGA tegmaydi, lekin **rol/xodim o'zgarishi**
  yozilsin;
- `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md` — A1/A2/A3
  hisobotlariga deploy natijasi va qabul mezonining qaysi bandi JONLIDA
  bajarilgani;
- `docs/plans/2026-08-23-omborchi-tsd-mijozlar.md` — G1/G2/G3 (va rol
  yaratilgach G5/G6) holatini aniqlashtirish;
- `NEXT.md` — hand-off yozuvi;
- 🔴 **QOIDA 11:** qabul mezonining biror bandi jonlida bajarilmasa faza
  «TUGADI» deb YOPILMAYDI — «QISMAN» bo'lib qoladi. **Halol yozing.**
