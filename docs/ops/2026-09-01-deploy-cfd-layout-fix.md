# 2026-09-01 (kecha, 2-deploy) — mijoz-ekran layout regressiyasi tuzatildi (`aa7ad8ce`)

**Nima chiqdi:** `04d5410c` bilan chiqqan mijoz-ekran televizorda kesilib
ko'rinardi. Sabab topildi, tuzatildi, 7 ta ekran o'lchamini qamraydigan e2e
qo'riqchi qo'shildi. Migratsiya YO'Q.

**Nega shoshilinch:** jonli ekran mijozlar oldida buzuq turgan edi — bu mening
oldingi deployimda kiritilgan regressiya.

---

## Regressiya — sabab

Ekran 1920×1080 «sahna» qilib qurilgan va `transform: scale()` bilan
televizorga moslashtiriladi. Uch narsa birga xato bergan:

1. `transform: scale()` elementning **layout** o'lchamini o'zgartirmaydi —
   sahna brauzer uchun hamon 1920×1080 joy egallaydi.
2. `grid place-items-center` konteynerdan **katta** elementni markazlashtira
   olmaydi — uni `(0,0)` ga qo'yadi.
3. Sukutdagi `transform-origin` element markazi (`960px 540px`) — kichrayish
   o'sha nuqta atrofida bo'lgani uchun vizual quti o'ngga-pastga suriladi.

Quti `(960 − 960s, 540 − 540s)` ga tushadi. **Bashorat formulasi o'lchov bilan
pikselga mos keldi** (1280×720: bashorat `left=320 top=180`, o'lchov
`left=320 top=180`).

| Ekran | scale | Yo'qolgan maydon |
|---|---|---|
| 1920×1080 (masshtab 100%) | 1.0 | **0%** |
| 1536×864 (masshtab 125%) — egasining televizori | 0.8 | **~24%** |
| 1280×720 (masshtab 150%) | 0.667 | **44%** |

**Egasining televizori o'lchandi:** `Разрешение 1920×1080` + `Масштаб 125%`
⇒ CSS viewport **1536×864**.

## Tuzatish

`absolute` + `left/top: 50%` layout qutisining chap-yuqori burchagini viewport
markaziga qo'yadi, `translate(-50%, -50%)` esa uni o'z (masshtablanmagan) yarim
o'lchamiga qaytaradi. Natija matematik jihatdan har doim markazda:
quti `[W/2 − 960s, W/2 + 960s]`.

Ikkinchi nuqson: `useFitScale` boshlang'ich qiymati `1` edi va har yuklanishda
bir kadr davomida AYNI buzuq holat ko'rinardi (server oyna o'lchamini bilmaydi).
Endi `null` = «o'lchanmagan», sahna o'lchanmaguncha `visibility: hidden`.

## Qo'riqchi

`apps/web/tests/e2e/customer-display-fit.spec.ts` — 7 ta o'lchamda sahna
ekranga sig'ishi, markazda turishi, nisbati saqlanishi va bir o'qni to'liq
to'ldirishini tekshiradi. **Tuzatish orqaga qaytarilganda 5 tada QIZIL
bo'lishi tasdiqlangan** — ya'ni bu haqiqiy qo'riqchi.

1920×1080 ataylab ro'yxat **o'rtasida** turadi: nuqson matematik jihatdan
faqat o'sha o'lchamda ko'rinmaydi (`scale=1`), ya'ni u yolg'iz o'zi hech
narsani isbotlamaydi.

---

## 🔴 BIRINCHI BUILD YIQILDI — sentinel ishladi

```
BUILD_TUGADI rc=1
ENOENT: .next-new/build-manifest.json
Failed to collect page data for /icon.svg
```

Kompilyatsiya `✓ Compiled successfully in 3.0min` deb tugagan, lekin
`.next-new` ichida FAQAT `cache`, `types`, `trace` bor edi — `server/`,
`static/` va manifestlar YO'Q.

**Sabab:** `cp -r .next/cache .next-new/cache` bilan ko'chirilgan kesh endi
**boshqa sessiyaning boshqa commit'idan** qolgan edi (`d029d952` build'i).
Next o'sha keshni ishlatib manifestlarni yozmay qolgan.

**Yechim:** `rm -rf .next-new` + keshsiz **sovuq build** ⇒ `rc=0`.

🟢 **Prod buzilmadi** — flip qilinmagan, `.next` tegilmagan, sayt ishlashda
davom etgan.

**Saboq:** oldingi deploy jurnalida sentinel `plink` escaping'ida buzilgan edi
(`rc=\0`). Bu safar sentinel **alohida skript faylga** yozildi
(`/root/build-cfd-fix.sh`) va `rc=$?` to'g'ri ishladi — **va aynan shu tufayli
buzuq build prod'ga chiqmadi**. Bundan keyin build har doim skript-fayl orqali.

**Ikkinchi saboq:** boshqa commit'ning `.next/cache` ini ko'chirmaslik kerak.
Yoki keshsiz build, yoki kesh AYNI commit'niki bo'lsin.

---

## Deploy yo'li

```
lokal fix cb52978f
  → serverdan fetch (ular d029d952 + 14471da8 ni qo'shgan, deploy ham qilgan)
  → merge aa7ad8ce   (yagona konflikt docs/progress.json — generatsiya qilindi)
  → gate: typecheck 10/10 · lint 0 · guards OK · 579 test (47 fayl) yashil
  → push origin  a7c9ad56..aa7ad8ce
  → serverda merge --ff-only → aa7ad8ce
  → 1-build rc=1 (yuqoriga qara) → .next-new o'chirildi
  → 2-build (sovuq) rc=0, BUILD_ID nIjQgqk8lKyEVYDZEWttN
  → FLIP: .next → .next-old-cfdfix, .next-new → .next
  → pm2 restart sherset-v2-web   (API tegilmadi — kodi o'zgarmagan)
```

## Verify

| Tekshiruv | Natija |
|---|---|
| `/login` `/sotuv` `/customer-display` `/omborchi` `/counterparties` | **200 (5/5)** |
| `api/v1/health` | **200** |
| Jonli sahifada `translate(-50%` | ✅ bor |
| Jonli sahifada eski `cfd-theme grid h-screen` | ✅ **0** |
| Jonli o'lchov (1500×550) | `SIGADI: true`, markazda, nisbat 1.778 |
| pm2 web / api | ikkalasi `online` |

## Qaytarish nuqtasi

```bash
cd /var/www/sherset-v2/apps/web
mv .next .next-new && mv .next-old-cfdfix .next && pm2 restart sherset-v2-web
```

---

## 🔴 DISK — endi jiddiy

```
92% band, 8.1 GB bo'sh
.next-old*  →  8 katalog, ~13.7 GB
```

Ertalab 87% / 14 GB edi. Bugun ikki deploy bo'ldi (meniki + parallel
sessiyaniki) va har biri ~1.7 GB qoldirdi. **Yana 3–4 deploy va disk to'ladi** —
u holda Postgres va API ham xavf ostida qoladi.

Eski buildlar egasining ruxsatisiz **o'chirilmadi** (reja `T2`). Tavsiya —
oxirgi ikkita qaytarish nuqtasini qoldirib qolganini o'chirish:

```bash
cd /var/www/sherset-v2/apps/web
ls -d .next-old*            # avval ro'yxatni ko'r
# .next-old-cfdfix (bugungi qaytarish nuqtasi) va eng oxirgi bittasi QOLADI
```

---

## Status

**Phase-1.** Darvozalar yashil, jonli smoke 5/5, jonli o'lchov `SIGADI: true`.
**Egasining televizorida ko'z bilan tasdiqlangan** (`localhost:3100` orqali,
tuzatishdan keyingi surat) — lekin Electron kioskda va kassirning hisobi bilan
hali sinalmagan.
