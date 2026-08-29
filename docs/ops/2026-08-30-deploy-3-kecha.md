# 3-KECHA DEPLOY · `cbc14723` → `46aee11f`

> **Nima uchun bu fayl:** egasi 2026-08-29 kechqurun «barcha deploy qilinmagan
> ishlarni top, bittasi ham qolmasin, hammasini deploy qilamiz» dedi. Quyida
> **to'liq inventarizatsiya** (nima qolgan edi, nima haqiqatda qoldi) va
> **ijro tartibi**.
>
> **Retsept manbai:** `2026-08-29-kunduzgi-deploy.md` — u JONLIDA ISHLAGAN
> (05:50–06:23 CEST, savdo ochiq holda, uzilishsiz). Bu yerda o'sha retsept
> **kechki oyna** va **kattaroq delta** uchun moslandi. Har qadamning «nega»si
> o'sha faylda; bu yerda takrorlanmaydi.

---

## 1. INVENTARIZATSIYA — «deploy qilinmagan» nima bor edi

Butun mashina bo'ylab qidirildi: ishchi daraxt, stash, barcha lokal branch'lar,
worktree'lar, remote'lar.

| # | Manba | Holat | Xulosa |
|---|---|---|---|
| 1 | `yacheyka-inventarizatsiya` HEAD, jonli `cbc14723` dan oldinda | **35 commit, 5 migratsiya** | 🔴 **DEPLOY QILINADI** |
| 2 | Ishchi daraxtdagi COMMIT QILINMAGAN o'zgarish (2026-08-28) | 12 fayl, 658+/59− — qarz xabari + outbox poygasi | 🔴 **`b43a7e27` bo'lib commit qilindi** |
| 3 | `apps/api/src/scripts/warehouse-state-core.test.ts` | gate 1-kechadan beri QIZIL (9931/9934) | 🔴 **`46aee11f` bilan tuzatildi** |
| 4 | `chiqarish-prod` / `chiqarish-tugmasi` branch'lari | «Chiqarish» tugmasi | 🟢 **kerak emas** — fayllar HEAD bilan **bayt-bayt bir xil** (`git diff HEAD 7cfaed90 -- <fayl>` bo'sh) |
| 5 | `kassa-qarzi-q1-q2` branch'i | Q1+Q2 cherry-pick'i | 🟢 **kerak emas** — mazmuni HEAD da, branch HEAD dan 51k qator ORQADA |
| 6 | `stash@{0}` — «G4 2-bosqich» (2026-08-25) | retail-sale simlari | 🟢 **kerak emas** — `spreadAllocationsToPositions`, `allocatedByPosition`, `CASCADE_ROWS_FRONT`, `balancesByStore`, `lockedStores` hammasi HEAD da bor (G4 tugagan) |
| 7 | `climart-adoption` | — | 🟢 HEAD dan 22 orqada, unikal commit YO'Q |

**Yakuniy delta: `cbc14723` → `46aee11f` = 37 commit, 5 migratsiya.**

### 1.1 Chiqadigan fazalar

| Faza | Commit | Migratsiya |
|---|---|---|
| **K1** bo'lak reyestri poydevori (`StockPiece`) + sverka | `bc92330a` | `20260825230000_stock_piece_registry` |
| **K2** bo'lak reyestri boshqaruvi + `BLK-` yorlig'i | `dc4a90d4` | — (lekin `topup-role-permissions.ts` MAJBURIY) |
| **Q4** undirishda qarz MANBASI, filtr, muddat sozlamasi | `7ddd4e21` | `20260825235000_company_settings_sale_debt_term` |
| **Q5** tarixiy kassa qarzlari backfill'i + teskari skript | `23426f15` | — |
| **K3** kassirga bo'lak tarkibi + 7.1 avto-taqsimot istisnosi | `6c458603` | — |
| **K4** omborchi kesim oqimi (picking) | `82169252` | `20260826000000_stock_piece_cut` |
| **Q6** jonli verify skripti + eskirgan premise qo'riqchisi | `4d294947` | — |
| **K5** ommaviy kiritish (sanash + priyomka + vozvrat) | `2c3bf228` | `20260826120000_stock_piece_intake` |
| **K6** bayroq siyosati + kunlik sverka signali (cron 20:00) | `a8c3afa4` | `20260826170000_piece_tracking_decision` |
| **E5** `warehouse-state` modeli G4-2a haqiqatiga | `9f05c712` | — |
| **B1/B2** 4 down skript lokal bazada isbotlandi | `5ecd24a0` | — |
| **fix** bitta to'lov = bitta xabar + outbox poygasi | `b43a7e27` | — |
| **fix** jonli reyestr gate'i | `46aee11f` | — |

Qolgani — hujjat (`docs/**`), jonli xulqqa ta'siri yo'q.

### 1.2 Gate (lokal, deploy'dan oldin o'lchandi)

| Nima | Natija |
|---|---|
| `pnpm typecheck` | ✅ 10/10 paket |
| `node scripts/check-lint.mjs` | ✅ 0 xato (1274 ogohlantirish — siyosat bo'yicha ruxsat) |
| api `vitest run` | ✅ **9934 / 9934** (tuzatishdan oldin 9931 + 1 yiqilish) |
| web `vitest run` | ✅ **339 / 339** fayl |
| `git push mirfayz` | ✅ `67202a09..46aee11f` |

---

## 2. Kechki oynaning kunduzgidan FARQI

🟢 **Oyna: 20:00–04:30 CEST. Savdo 05:00–06:00 da boshlanadi.** Ya'ni kunduzgi
retseptning uchta qattiq cheklovi (OOM, savdoga xalaqit, «test sotuv
yaratmang») **bu safar YO'Q**.

Shunga qaramay **`.next-new` + katalog almashtirish yo'li SAQLANADI**, chunki u
kunduzi emas, **qaytarish uchun** ham foydali: eski `.next` joyida turadi ⇒
rollback = `mv` + `restart`, qayta build YO'Q.

🔴 **`--update-env` YO'LI ISHLATILMAYDI** (kunduzgi ijroning sabog'i, IS-5
naqshi): pm2 `ecosystem.v2.config.cjs` da `NEXT_DISTDIR` YO'Q ⇒ env faqat
`--update-env` bilan yashaydi va server qayta yuklansa **jimgina eski build'ga
qaytadi**. Faqat **katalog almashtirish**.

🔴 **`deploy/deploy-smart.sh` NI YURGIZMANG.** Uning `prisma migrate deploy`
qadami `_prisma_migrations` dagi tugallanmagan `20260802180000_manager_daily_kpi`
(bo'sh `finished_at`) ga urilib yiqiladi. Biz `db execute` + `migrate resolve`
ishlatamiz — bu tuzoqni aylanib o'tadi.

---

## 3. E0 · O'LCHOV (faqat o'qish)

```
ssh root@13.140.157.10
git -C /var/www/sherset-v2 rev-parse HEAD          # kutilgan: cbc14723...
git -C /var/www/sherset-v2 status --short
free -h; df -h /var/www
pm2 list --no-color
du -sh /var/www/sherset-v2/apps/web/.next /var/www/sherset-v2/apps/web/.next-old
```

🔴 **TO'XTASH shartlari:** HEAD ≠ `cbc14723` · untracked to'qnashuv ·
disk < 5 GB · pm2 da web `next start` EMAS.

ℹ️ `.next-old` (2-kecha deploy'idan qolgan) endi kerak emas — keyin
o'chirilib joy bo'shatilsa bo'ladi, lekin **E7 verify tugagunicha TEGILMAYDI**.

---

## 4. E1 · ZAXIRA (MAJBURIY)

```
cd /var/www/sherset-v2
set -a; . apps/api/.env; set +a
PGURL="${DATABASE_URL%%\?*}"          # <- `?schema=public` tuzogi: usiz 0 baytli fayl
pg_dump "$PGURL" -Fc --exclude-table-data=attachments \
  -f /root/sherset_v2-pre-deploy-20260830.dump
pg_restore -l /root/sherset_v2-pre-deploy-20260830.dump | grep -c 'TABLE DATA'
```

🔴 **TO'XTASH:** fayl yo'q, yoki `TABLE DATA` soni **259 dan sezilarli kam**.
Hajmga QARAMANG — `attachments` (1.7 GB) ataylab chiqarilgan, shu sababli
dump ~8 MB bo'ladi va bu NORMAL.

---

## 5. E2 · ff-merge

```
cd /var/www/sherset-v2
git fetch https://github.com/Mirfayz1993/sherset-ERP.git yacheyka-inventarizatsiya:tmp3
git merge --ff-only 46aee11f
git rev-parse HEAD                    # 46aee11f...
```

🔴 **TO'XTASH:** ff-merge yiqilsa — TEGMANG, hech narsa qilinmagan.

⚠️ Shu daqiqadan manba va ishlayotgan kod AJRALADI ⇒ **E3 darhol keyin**.

---

## 6. E3 · Migratsiyalar — 5 ta, HAMMASI ADDITIV

```
cd /var/www/sherset-v2/packages/db
set -a; . ../../apps/api/.env; set +a
for M in 20260825230000_stock_piece_registry \
         20260825235000_company_settings_sale_debt_term \
         20260826000000_stock_piece_cut \
         20260826120000_stock_piece_intake \
         20260826170000_piece_tracking_decision; do
  echo "== $M"
  pnpm exec prisma db execute --file "prisma/migrations/$M/migration.sql" || break
  pnpm exec prisma migrate resolve --applied "$M" || break
done
pnpm exec prisma generate
```

🔴 **TARTIB SHART** — `stock_piece_cut` va `_intake` `stock_pieces` jadvaliga
ustun qo'shadi, ya'ni `_registry` dan KEYIN yurishi kerak.

🟢 **Nega jonli xavfsiz:** hammasi `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE
IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`. Yangi ustunlarning deyarli
hammasi **NULL bo'lishi mumkin**, yagona `NOT NULL` — `products.piece_tracked
BOOLEAN NOT NULL DEFAULT false`, va PG 11+ da `DEFAULT` bilan `ADD COLUMN`
jadvalni QAYTA YOZMAYDI. Indekslar esa yo BO'SH yangi `stock_pieces` da, yo
`restock_task_lines` da (jonlida 0 qator).

Har biri lokal dev bazada `UP×2 → zond → DOWN×2 → UP` bilan isbotlangan
(`5ecd24a0`), down skriptlari `packages/db/scripts/rollback/` da — **beshtasi
ham bor**.

---

## 7. E4 · 🔴 ROL RUXSATLARI (K2 — UNUTILSA EKRAN 403 BERADI)

```
cd /var/www/sherset-v2/apps/api
set -a; . .env; set +a
npx tsx src/scripts/topup-role-permissions.ts
```

K2 yangi `piecetracking` entity'sini kiritadi. Busiz katta omborchining bo'lak
reyestri ekrani va K6 bayroq tugmasi **403** qaytaradi. Ruxsat keshi API
restartida (E6) yangilanadi — shuning uchun bu qadam restartdan OLDIN.

---

## 8. E5 · Build → `.next-new`

```
cd /var/www/sherset-v2
rm -rf apps/web/.next-new
mkdir -p apps/web/.next-new
cp -r apps/web/.next/cache apps/web/.next-new/cache      # sovuq build ~14 daq, issiq ~5
pnpm --filter @moysklad/money build
setsid nohup env NEXT_DISTDIR=.next-new \
  NODE_OPTIONS="--max-old-space-size=3072" \
  corepack pnpm build:web > /root/deploy-e5.log 2>&1 &
```

Kuzatish (SSH uzilsa ham jarayon davom etadi — C1/2 sabog'i):

```
tail -5 /root/deploy-e5.log; free -h
```

🟢 Butun shu vaqt jonli sayt ishlaydi — `.next` tegilmagan.
🔴 **TO'XTASH:** build yiqilsa — `rm -rf apps/web/.next-new`, tamom. Migratsiya
additiv, eski kod ular haqida bilmaydi ⇒ jonli holat toza qoladi.

---

## 9. E6 · FLIP — yagona uzilish nuqtasi

```
cd /var/www/sherset-v2/apps/web
tail -3 /root/deploy-e5.log                 # build muvaffaqiyatlimi
rm -rf .next-old2 && mv .next .next-old2 && mv .next-new .next
pm2 restart sherset-v2-web
pm2 restart sherset-v2-api --update-env
pm2 list --no-color | head
```

**Qaytarish (soniyalar, build YO'Q):**

```
cd /var/www/sherset-v2/apps/web
mv .next .next-new && mv .next-old2 .next && pm2 restart sherset-v2-web
```

---

## 10. E7 · VERIFY

### 10.1 Sahifalar

```
for p in / /login /stores /sotuv /inventories /reports/stock-balance \
         /omborchi /omborchi/kontrol /omborchi/vozvrat \
         /omborchi/bolaklar /omborchi/hal-qilinmagan; do
  printf "%-32s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://erp.sherset.uz$p)"
done
```

Oxirgi ikkitasi **YANGI** (K2/K6) — 200 qaytarishi bu deploy'ning o'ziga xos
belgisi.

### 10.2 Jonli holat — 🔴 KUTILGAN KESIM O'ZGARADI

```
cd /var/www/sherset-v2/packages/db
set -a; . ../../apps/api/.env; set +a
npx tsx scripts/warehouse-state.ts; echo "EXIT=$?"
```

**Deploy'dan OLDIN skript kodidan hisoblangan kutilma:**

| | 2-kechadan keyin (o'lchangan) | **3-kechadan keyin (kutilma)** |
|---|---|---|
| `EXIT` | 2 | **0** |
| `xato` | 1 (`split-holati`) | **0** |
| `ogohlantirish` | 6 (`reyestrda-yoq`: Ombor 03–07, 99) | **5** (`reyestrda-yoq`: Ombor 03, 04, 05, 06, 07) |

**Nega o'zgaradi:** reyestr fayli (`docs/ops/jonli-holat.md`) shu deploy bilan
serverga YETIB BORADI. Unda (a) `split` allaqachon `"qisman"` ⇒ `split-holati`
xatosi yo'qoladi, (b) «Ombor 99» reyestrga kiritilgan ⇒ uning ogohlantirishi
yo'qoladi. Ombor 03–07 esa hamon reyestrda YO'Q — ular **M1** ning ishi.

🔴 **TO'XTASH shartlari:**
- `split-holati` xatosi HAMON chiqsa ⇒ reyestr fayli serverga yetmagan (E2 ni
  tekshiring), yoki jonli split HAQIQATAN o'zgargan.
- `yetib-bolmaydigan-qoldiq` chiqsa ⇒ **darhol qaytaring**, bu 06:46
  hodisasining shakli.
- **«POS yeta olmaydigan qoldiq» 0 dan farq qilsa.**

### 10.3 Q6 — jonli verify (yangi, DRY)

```
cd /var/www/sherset-v2/apps/api
set -a; . .env; set +a
npx tsx src/scripts/ops-q6-live-verify.ts        # DRY — default, yozmaydi
```

Q6 ning butun maqsadi shu: **jonlida undirish reyestri haqiqatga mos keladimi.**
Bu 2026-08-26 dan beri yugurtirilmagan.

### 10.4 API jurnali

```
pm2 logs sherset-v2-api --lines 60 --nostream | grep -iE "error|warn" | head
```

🔴 `StockPieceDigest` cron'i (K6/5) **20:00 Asia/Tashkent** da yuriladi va
faqat SIGNAL beradi — hech narsani tuzatmaydi. Farq bo'lmasa xabar ham yo'q.

---

## 11. E8 · SMOKE (qoida 13) — kechqurun TO'LIQ bajariladi

Kunduzi bajarib bo'lmagan bandlar endi ochiq (savdo yo'q):

1. **Yacheyka SANASH — POST bilan** (kunduzi faqat qoralama edi).
2. **Yacheyka KO'CHIRISH** — `Taqsimlanmagan` ichida. 🔴 Ombor 03–07 ga
   ko'chirmang (POS kaskadida yo'q ⇒ qoldiq sotilmay qoladi).
3. **A1–A3 avans oqimi** — kassada avans qabuli → PREPAY bilan to'lash →
   mijoz kartasida avans qatori.
4. **K-oqimi (yangi):** bo'linadigan tovarga bayroq → rulon priyomkasi
   (`250x3`) → kassada bo'lak tarkibi → omborchi kesimi → `Σ tarkib === miqdor`.
5. **Qarz to'lovi xabari (yangi `b43a7e27`):** FIFO bo'yicha **2+ qarzga**
   bo'linadigan to'lov qiling va mijozga ketgan xabarni tekshiring —
   summa **to'liq to'lov** bo'lishi va qolgan qarz **yakuniy** bo'lishi kerak.
   Bu aynan tuzatilgan nuqson.

🔴 Smoke bajarilmasa fazalar **«QISMAN»** bo'lib qoladi (qoida 11) — kod
jonlida bo'lsa ham.

---

## 12. QAYTARISH DARAXTI

| Bosqich | Buyruq | Vaqt |
|---|---|---|
| 1. Faqat frontend buzuq | `mv .next .next-new && mv .next-old2 .next && pm2 restart sherset-v2-web` | soniyalar |
| 2. Kod butunlay | `git reset --hard cbc14723` + yuqoridagi + `pm2 restart sherset-v2-api` | soniyalar |
| 3. Baza (kamdan-kam) | `packages/db/scripts/rollback/*_down.sql` — **TESKARI tartibda**: `piece_tracking_decision` → `stock_piece_intake` → `stock_piece_cut` → `company_settings_sale_debt_term` → `stock_piece_registry` | daqiqalar |
| 4. Oxirgi chora | `pg_restore -d "$PGURL" --clean /root/sherset_v2-pre-deploy-20260830.dump` | 🔴 **oradagi SAVDO YO'QOLADI** |

ℹ️ 3-bosqich odatda KERAK EMAS: beshta migratsiya ham additiv, eski kod yangi
ustunlarni ko'rmaydi va ular bo'sh turaveradi. Kerak bo'lsa har `_down.sql`
faylning boshidagi «ma'lumot yo'qoladi» bloki AVVAL o'qiladi.

---

## 13. Deploy'dan KEYIN yopilishi kerak bo'lgan qarzlar

| # | Nima | Nega hozir emas |
|---|---|---|
| **T1** | `packages/db` skriptlari bo'lak reyestrini BILMAYDI ⇒ `stock_pieces` bo'sh bo'lmagan kundan H4/H5 (split qayta yuritilishi) YURITILMAYDI | kod ishi, deploy'ni bloklamaydi — lekin **K6 piloti boshlanishidan oldin** yopilishi shart |
| **M1** | Ombor 03–07 reyestrga kiritilsin + `__posPriority` berilsin | ayrim reja: `docs/plans/2026-08-27-kop-omborli-tuzilma.md`. **Hozircha ular BO'SH va qoldiqsiz** ⇒ xavf yo'q; tovar tushsa 06:46 hodisasi qaytadi |
| — | `_prisma_migrations` da `20260802180000_manager_daily_kpi` `finished_at` BO'SH | `deploy-smart.sh` ni yiqitadi; biz uni ishlatmaymiz |
| — | `.next-old` (2-kechadan) o'chirilsin | E7 tugagach |

---

## 14. JURNAL

> Vaqtlar server soatida (**CEST**). Toshkent = CEST + 3.

| Qadam | Vaqt | Natija |
|---|---|---|
| lokal gate | 2026-08-29 23:0x | ✅ typecheck 10/10 · lint 0 xato · api 9934/9934 · web 339/339 |
| lokal commit + push | 2026-08-29 23:1x | ✅ `b43a7e27`, `46aee11f` → `mirfayz` |
| E0 · o'lchov | | ⏳ |
| E1 · zaxira | | ⏳ |
| E2 · ff-merge | | ⏳ |
| E3 · 5 migratsiya | | ⏳ |
| E4 · rol ruxsatlari | | ⏳ |
| E5 · build | | ⏳ |
| E6 · flip | | ⏳ |
| E7 · verify | | ⏳ |
| E8 · smoke | | ⏳ |
