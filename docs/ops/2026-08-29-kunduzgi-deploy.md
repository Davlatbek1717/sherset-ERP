# 2026-08-29 · KUNDUZGI deploy — savdo ketayotganda

> **Qaror (egasi, 2026-08-29 ~07:30):** deploy kechqurun emas, **hozir**, savdo
> ishlab turgan holda. Xavf aytildi va egasi qarorini takrorladi ⇒ bajariladi.
>
> **Bu fayl `2026-08-29-kecha-rejasi.md` ni ALMASHTIRMAYDI** — u kechki oyna
> uchun. Bu yerda faqat **kunduzgi farqlar** va ijro tartibi. Blok A/B matni,
> C2-7 drift jadvali, C3 qaytarish daraxti — kechki rejadan o'qiladi.
>
> **Qamrov:** `61780120` → `cbc14723` (14 commit, 1 migratsiya
> `20260825220000_drawer_cash_in_kind`, sof ff).
>
> **Egasi tanlagan tartib:** B (rol+xodim) → C (deploy) → A2 + A1-qoralama.

---

## 1. Kunduzi nima BOSHQACHA (kechki rejada YO'Q uchta xavf)

### 1.1 🔴 Web build jonli `.next` ni joyida qayta yozadi

`next start` aynan `.next` dan xizmat qiladi. `next build` esa uni **build
boshlanishida tozalaydi** ⇒ 10–20 daqiqa davomida sahifani yangilagan yoki
yangi sahifaga o'tgan kassir **buzuq chunk** oladi. Bu restartdan OLDIN
boshlanadi va kechki rejada umuman ko'rilmagan.

🟢 **Yechim — `NEXT_DISTDIR`.** `apps/web/next.config.mjs:28`:

    distDir: process.env.NEXT_DISTDIR || '.next'

⇒ build **`.next-new`** ichiga yuritiladi, jonli `.next` **tegilmaydi**.
Kassirlar butun build davomida hech narsa sezmaydi. Uzilish faqat `pm2 restart`
paytida — soniyalar.

🟢 **Yon foyda — qaytarish tubdan arzonlashadi.** Eski `.next` joyida
turgani uchun rollback = **restart**, qayta build YO'Q. Kechki rejaning C3 si
esa qaytarish uchun yana 10–20 daqiqa build talab qiladi.

### 1.2 🔴 OOM — build jonli API yoki Postgres'ni o'ldirishi mumkin

Kechki rejadagi `--max-old-space-size=3072` bo'sh serverga mo'ljallangan.
Kunduzi o'sha serverda API, web va Postgres savdoga xizmat qilyapti. Yadro
OOM-killer'i **eng semiz jarayonni** o'ldiradi — u build bo'lmasligi ham
mumkin.

**Shart:** D0 da `free -h` o'lchanadi. Bo'sh RAM (`available`) build uchun
ajratilgandan **kamida 1.5 GB ortiq** bo'lishi kerak. Bo'lmasa — build
qilinmaydi, kechqurunga qoldiriladi.

Build `nice`/`ionice` bilan yuritiladi, ya'ni CPU va diskda savdoga yo'l
beradi:

    nice -n 19 ionice -c3 <build>

### 1.3 🔴 Disk — `.next` ikki nusxa bo'ladi

`.next-new` qo'shimcha joy egallaydi. D0 da `df -h` o'lchanadi; **kamida 5 GB
bo'sh** bo'lishi kerak.

### 1.4 ⚠️ Jonli tanaffus faqat BITTA nuqtada

Butun jarayonda savdo to'xtaydigan yagona nuqta — **D6 (restart)**, bir necha
soniya. Undan oldingi hamma qadam (merge, migratsiya, build) jonli xizmatga
tegmaydi.

🔴 **D6 dan oldin kassirlarga ayting:** «joriy chekni yakunlang, ~1 daqiqa
yangi chek boshlamang». Ochiq SSE ulanishlari (kontrol navbati) uziladi va
o'zi qayta ulanadi.

---

## 2. D0 · O'LCHOV — faqat O'QISH, hech narsa o'zgartirmaydi

    # 1) HEAD va toza daraxt
    git -C /var/www/sherset-v2 rev-parse HEAD          # kutilgan: 61780120
    git -C /var/www/sherset-v2 status --short

    # 2) RAM va disk (1.2 va 1.3 shartlari)
    free -h
    df -h /var/www

    # 3) web qanday ishga tushirilgan (NEXT_DISTDIR shu yerga kiradi)
    pm2 describe sherset-v2-web | sed -n '1,40p'
    pm2 list --no-color

    # 4) hozirgi .next hajmi (nusxa uchun joy yetadimi)
    du -sh /var/www/sherset-v2/apps/web/.next

🔴 **TO'XTASH shartlari:**

| Nima | To'xtash sababi |
|---|---|
| HEAD ≠ `61780120` | Reja boshqa nuqtadan yozilgan — delta noto'g'ri bo'ladi |
| `git status` da untracked to'qnashuv | `merge --ff-only` yiqiladi (C1/3) |
| `free -h` → `available` < (build + 1.5 GB) | OOM-killer jonli API yoki Postgres'ni o'ldirishi mumkin |
| `df -h` → 5 GB dan kam | `.next-new` sig'maydi, build yarmida yiqiladi |
| `pm2 describe` da web `next start` EMAS (standalone/boshqa) | `NEXT_DISTDIR` yo'li boshqacha ishlaydi — qayta o'ylash kerak |

---

## 3. D1 · BLOK B — omborchi roli va xodimi (UI, additiv)

Matn to'liq kechki rejada: `2026-08-29-kecha-rejasi.md` → **BLOK B** (B0/B1/B2).
Kunduzi ham xavfsiz — rol yaratish mavjud oqimlarga tegmaydi.

🔴 **Kassirni omborchi QILMANG** (cheklar `ready` ga o'tmay qotib qoladi).
🔴 **`sklad_keepers` ga TEGMANG** — M4 ning ishi.

---

## 4. D2 · ZAXIRA (migratsiyadan oldin, MAJBURIY)

    cd /var/www/sherset-v2
    set -a; . apps/api/.env; set +a
    PGURL="${DATABASE_URL%%\?*}"          # ← `?schema=public` tuzog'i: usiz 0 baytli fayl
    nice -n 19 ionice -c3 pg_dump "$PGURL" -Fc --exclude-table-data=attachments \
      -f /root/sherset_v2-pre-deploy-20260829.dump
    ls -lh /root/sherset_v2-pre-deploy-20260829.dump

🔴 **TO'XTASH:** fayl yo'q yoki **1 MB dan kichik**.
ℹ️ `nice`/`ionice` — kunduzgi qo'shimcha: dump disk I/O sini savdodan o'g'irlamasin.

---

## 5. D3 · ff-merge (jonli xizmatga TEGMAYDI)

    cd /var/www/sherset-v2
    git status --short
    git fetch https://github.com/Mirfayz1993/sherset-ERP.git yacheyka-inventarizatsiya:tmp2
    git merge --ff-only cbc14723
    git rev-parse HEAD                    # cbc14723...

**Nega bu jonliga tegmaydi:** web `.next` dan xizmat qiladi (manbadan emas), API
esa modullarni bootstrap paytida xotiraga yuklab bo'lgan. Diskdagi manba
o'zgarishi ishlab turgan jarayonlarga ta'sir qilmaydi.

⚠️ **Lekin shu daqiqadan boshlab manba va ishlayotgan kod AJRALADI.** Agar API
shu oraliqda qandaydir sababga ko'ra qayta ishga tushsa (crash → pm2 auto-restart),
u YANGI kodni yuklaydi. Shuning uchun **D4 (migratsiya) darhol keyin** yuritiladi —
yangi kod migratsiyasiz bazaga tushmasin.

🔴 **TO'XTASH:** ff-merge yiqilsa — TEGMANG.

---

## 6. D4 · Migratsiya (BITTA, additiv)

    cd /var/www/sherset-v2/packages/db
    set -a; . ../../apps/api/.env; set +a
    M=20260825220000_drawer_cash_in_kind
    pnpm exec prisma db execute --file "prisma/migrations/$M/migration.sql"
    pnpm exec prisma migrate resolve --applied "$M"
    pnpm exec prisma generate

**Kutilgan:** `Script executed successfully` + `generate` yashil.
Migratsiya **additiv** (1 ustun + 2 indeks) ⇒ hozir ishlab turgan ESKI kod uni
bilmaydi va u bo'sh turaveradi. Savdo shu payt ham davom etaveradi.

---

## 7. D5 · Build — `.next-new` ichiga (jonli `.next` TEGILMAYDI)

    cd /var/www/sherset-v2

    # 7.1 cache'ni ko'chirish — busiz build SOVUQ bo'ladi va ancha uzayadi
    mkdir -p apps/web/.next-new
    cp -r apps/web/.next/cache apps/web/.next-new/cache

    # 7.2 money paketi (web undan import qiladi)
    nice -n 19 ionice -c3 pnpm --filter @moysklad/money build

    # 7.3 web — FONDA (SSH uzilsa ham davom etadi, C1/2 saboqi)
    setsid nohup nice -n 19 ionice -c3 env \
      NEXT_DISTDIR=.next-new NODE_OPTIONS="--max-old-space-size=<D0 dan>" \
      corepack pnpm build:web > /root/deploy-d5.log 2>&1 &

Keyin alohida ulanishda kuzating:

    tail -5 /root/deploy-d5.log
    free -h                    # RAM siqilmayaptimi

🟢 **Shu 10–20 daqiqa davomida savdo TO'LIQ ishlayveradi** — jonli `.next`
tegilmagan.

🔴 **TO'XTASH:** build yiqilsa — **hech narsa qilinmagan**, jonli holat toza.
`.next-new` ni o'chirib tashlang, kod diskda yangi bo'lsa ham eski `.next`
xizmat qilaveradi. Migratsiya additiv bo'lgani uchun bazada ham muammo yo'q.

---

## 8. D6 · 🔴 FLIP — yagona uzilish nuqtasi (soniyalar)

**Oldin:** kassirlarga «joriy chekni yakunlang, ~1 daqiqa yangi boshlamang».

    cd /var/www/sherset-v2
    grep -c . /root/deploy-d5.log && tail -3 /root/deploy-d5.log   # build muvaffaqiyatli?

    # web — yangi build'ga o'tish (fayl KO'CHIRILMAYDI, faqat env)
    NEXT_DISTDIR=.next-new pm2 restart sherset-v2-web --update-env

    # api — tsx, build yo'q, soniyalar
    pm2 restart sherset-v2-api --update-env

    pm2 list --no-color | head

### 8.1 Agar web ko'tarilmasa — DARHOL qaytarish (soniyalar)

    NEXT_DISTDIR=.next pm2 restart sherset-v2-web --update-env

Eski `.next` joyida, hech qanday fayl ko'chirilmagan ⇒ **bir zumda eski holat**.

### 8.2 Agar `--update-env` env ni olmasa (pm2 ecosystem'dan yurgan bo'lsa)

Zaxira yo'l — katalog almashtirish:

    cd /var/www/sherset-v2/apps/web
    mv .next .next-old && mv .next-new .next
    pm2 restart sherset-v2-web

Qaytarish:

    mv .next .next-new && mv .next-old .next
    pm2 restart sherset-v2-web

⚠️ Bu yo'l ikkinchi navbatda — u fayl ko'chiradi, birinchisi esa yo'q.

---

## 9. D7 · Verify

    # 9.1 sahifalar
    for p in / /login /stores /sotuv /inventories /reports/stock-balance \
             /omborchi /omborchi/kontrol /omborchi/vozvrat; do
      printf "%-32s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://erp.sherset.uz$p)"
    done

    # 9.2 jonli holat
    cd /var/www/sherset-v2/packages/db
    set -a; . ../../apps/api/.env; set +a
    npx tsx scripts/warehouse-state.ts; echo "EXIT=$?"

**Kutilgan kesim — kechki rejaning C2-7 jadvali AYNAN o'sha:**
`EXIT=2`, **1 ta `xato`** (`split-holati`) + **6 ta `ogohlantirish`**
(`reyestrda-yoq`: Ombor 03–07 va 99).

🔴 Boshqa `xato`, yoki `yetib-bolmaydigan-qoldiq` chiqsa — to'xtang.
«POS yeta olmaydigan qoldiq» **0 bo'lishi SHART**.

⚠️ **Kunduzgi qo'shimcha:** savdo ketayotgani uchun `warehouse-state.ts`
raqamlari (qoldiq) D0 dagidan farq qiladi — bu **normal**, skript raqamlarni
tekshirmaydi, tuzilma va yetuvchanlikni tekshiradi.

---

## 10. D8 · Smoke (qoida 13) — kunduzgi cheklov bilan

- **Sotuv:** alohida sinov sotuv YARATMANG — kunduzi haqiqiy sotuvlar ketyapti.
  Birinchi haqiqiy sotuvni kuzating: chek post bo'ldimi, kassa balansi aynan
  chek summasiga oshdimi.
- **A1 · yacheyka sanash** — faqat **QORALAMA**, **POST QILMANG**. Post qoldiqni
  o'zgartiradi va savdo bilan to'qnashishi mumkin. Posti kechqurunga.
- **A2 · ko'chirish** — bitta tovarni `Taqsimlanmagan` ichida bir yacheykadan
  boshqasiga. 🔴 **Ombor 03–07 ga ko'chirmang** (POS kaskadida yo'q).
- **A1–A3 avans oqimi** (yangi funksiya): kassada avans qabuli → avansdan
  to'lash (PREPAY) → mijoz kartasida avans qatori va tarix.

---

## 11. QAYTARISH DARAXTI (kunduzgi — kechkidan ARZON)

**Qoida: avval KOD, keyin BAZA.**

| Bosqich | Buyruq | Vaqt |
|---|---|---|
| 1. Faqat frontend buzuq | `NEXT_DISTDIR=.next pm2 restart sherset-v2-web --update-env` | soniyalar |
| 2. Kod butunlay qaytadi | `git reset --hard 61780120` + yuqoridagi restart + `pm2 restart sherset-v2-api` | soniyalar |
| 3. Baza ham (kamdan-kam) | `packages/db/scripts/rollback/20260825220000_drawer_cash_in_kind_down.sql` | daqiqalar |
| 4. Eng oxirgi chora | `pg_restore -d "$PGURL" --clean /root/sherset_v2-pre-deploy-20260829.dump` | 🔴 **oradagi SAVDO YO'QOLADI** |

ℹ️ 1 va 2-bosqichda **qayta build KERAK EMAS** — eski `.next` joyida turibdi.
Kechki rejada bu 10–20 daqiqa build talab qilardi.

🔴 3-bosqich fayl boshidagi «ma'lumot yo'qoladi» bloki AVVAL o'qiladi: `kind`
yo'qoladi (avansni oddiy kirimdan ajratib bo'lmaydi), **PUL va BALANS
yo'qolmaydi** (lokal dev bazada zond bilan o'lchangan: `777000 → 777000`).

---

## 12. Jurnal

| Qadam | Vaqt | Natija |
|---|---|---|
| D0 · o'lchov (HEAD/RAM/disk/pm2) | | |
| D1 · B — rol + xodim | | |
| D2 · zaxira | | |
| D3 · ff-merge | | |
| D4 · migratsiya | | |
| D5 · build (.next-new) | | |
| D6 · flip (restart) | | |
| D7 · verify (1 xato + 6 ogohlantirish) | | |
| D8 · smoke (A2, A1-qoralama, avans) | | |

---

## 13. Tugagandan keyin (qoida 14)

- `docs/ops/jonli-holat.md` → «O'zgarishlar jurnali» ga qator: deploy
  `61780120 → cbc14723`, 1 migratsiya, **kunduzi bajarilgan** (bu muhim — keyin
  «nega kunduzi?» savoli tug'ilmasin), rol/xodim o'zgarishi;
  ⚠️ Ombor 03–07 ni reyestrga **bu yerda qo'shmang** — M1 ning ishi;
- `.next-old` / `.next-new` qoldiqlarini bir necha kundan keyin tozalash
  (darhol emas — u tez qaytarish yo'li);
- `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md` — A1/A2/A3 holati;
- `docs/plans/2026-08-23-omborchi-tsd-mijozlar.md` — G1/G2/G3/G5/G6 holati;
- 🔴 **QOIDA 11:** jonlida bajarilmagan mezon bo'lsa faza «QISMAN» bo'lib qoladi.
