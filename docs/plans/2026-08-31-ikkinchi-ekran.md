# Ikkinchi ekran (mijoz-ekran / CFD) — E-REJA

> **Tuzildi:** 2026-08-31 · **Muallif:** Claude (Opus) · **Egasi:** Davlatbek
> **Holat:** E1 bajarildi · E0 va E2+ egasining qaroriga qarab
> **Qamrov:** kassaning orqasidagi mijoz monitori. Marketplace ALOHIDA reja
> (8-bo'limga qara) — lekin ma'lumot modeli shu yerda ikkalasi uchun quriladi.

---

## 0. BU REJA NEGA SHU SHAKLDA — o'qishdan oldin

Egasi aniq talab qo'ydi: *«reja xato bo'lsa kod ham xato bo'ladi; bitta xato
yozilgan so'z katta xatolarga olib kelishi mumkin»*. Shuning uchun bu hujjat
uch qoidaga bo'ysunadi:

1. **Har bir da'vo o'lchangan.** «Ehtimol», «odatda», «bo'lsa kerak» — bu
   hujjatda fakt sifatida yozilmaydi. 3-bo'limdagi har bir raqamning yonida
   uni qaysi buyruq bergani turadi. O'lchanmagan narsa 4-bo'limga (SAVOLLAR)
   tushadi, faza ichiga EMAS.
2. **Har faza qaytariladigan.** Har fazada «qaytarish nuqtasi» bandi bor.
   Qaytarib bo'lmaydigan qadam (masalan migratsiya) alohida belgilangan va
   uning teskarisi O'SHA fazada yoziladi (loyiha qoidasi §5.5/12-band).
3. **Kengaytirish arzon bo'lsin.** Har texnik qaror yonida «kelajakda X
   qo'shmoqchi bo'lsak nima qilinadi» javobi turadi. Javob «jadvalni qayta
   loyihalash kerak» bo'lsa — qaror NOTO'G'RI va qayta o'ylangan.

---

## 1. O'ZGARMAS QOIDALAR (har sessiya, har agent uchun)

> Bu bo'lim `CLAUDE.md` ni ALMASHTIRMAYDI — uni shu ish uchun aniqlashtiradi.
> Ziddiyat bo'lsa `CLAUDE.md` ustun turadi.

### 1.1 Agent NIMA QILISHI MUMKIN

- ✅ Repoda **o'qish** — har qanday fayl, git tarixi, testlar.
- ✅ **Lokal** kod yozish/tahrirlash `D:\projects\sherset\erp` da.
- ✅ Lokal darvozalarni yugurtirish: `pnpm -s typecheck`,
  `node scripts/check-lint.mjs`, `node scripts/check-guards.mjs`, `vitest`.
- ✅ Prod bazasidan **FAQAT O'QISH** — `erp-backup/pq.sh` orqali (u sessiyani
  `READ ONLY` ga majburlaydi va `statement_timeout=25s` qo'yadi).
- ✅ Prod serverda **o'qish** buyruqlari — `erp-backup/rsh.sh` (`ls`, `cat`,
  `grep`, `df`, `git log`).
- ✅ Aniq yo'llar bilan stage qilish: `git add apps/api/src/...`.

### 1.2 Agent NIMA QILISHI MUMKIN EMAS — TAQIQ

| # | Taqiq | Nega (real sabab) |
|---|---|---|
| T1 | **Prod DB'ga YOZISH** — `INSERT/UPDATE/DELETE/ALTER/migrate deploy` | 5133 mahsulot, 5141 chek qatori jonli. `pq.sh` o'qish uchun; uni aylanib o'tish taqiq |
| T2 | **Prod serverda fayl o'zgartirish/o'chirish** | Serverda 116 commit GitHub'da YO'Q (o'lchandi). Bitta noto'g'ri buyruq = bir haftalik ish |
| T3 | **`git reset --hard`, `checkout -- .`, `clean -fd`, `stash`** umumiy daraxtda | `CLAUDE.md` §6.7A — bu bir marta boshqa sessiyaning 7 fayl tahriri + commit'ini o'chirgan. Sinxronlash faqat `merge` / `pull --rebase` |
| T4 | **`git add -A` / `git add .` / `commit -a`** | `CLAUDE.md` §6.2; hook mexanik bloklaydi. lint-staged begona faylni commit'ga qo'shib yuborgan real hodisa bor (§6.7B) |
| T5 | **`--no-verify` bilan push** | `pre-push` = typecheck + guard + lint. Chetlab o'tish taqiq; xato bo'lsa TUZATILADI |
| T6 | **Prod'da typecheck/build yugurtirish** | 2026-08-31 o'lchandi: `apps/api` typecheck standart heap'dan oshib OOM (`exit 134`). Serverda jonli API+web shu 11 GB da. Darvozalar LOKALDA yuriydi |
| T7 | **Savdo soatida deploy / `pm2 restart`** | 2026-08-23 ombor-split kassani eng shiddatli soatda 46 daqiqa to'xtatgan (`docs/plans/2026-08-24-split-kassa-hodisasi.md`) |
| T8 | **Video/rasmni Postgres `Bytes` ustuniga solish** | O'lchandi: `attachments` = 4733 qator / 1.7 GB, DB 2 GB. 3000 video DB'ga tushsa `pg_dump` gigabaytlarga chiqadi va `erp-backup/fetch.sh` zaxira quvuri ishlamay qoladi |
| T9 | **`/var/www/sherset-akademiya` va boshqa loyihalarga tegish** | Serverda 10 ta ilova bor, ular boshqa loyihalar. 66 ta video o'sha yerda — BIZNIKI EMAS |
| T10 | **Natijani «done» / «production-ready» deb atash** | `CLAUDE.md` §1 — faqat «Phase-1 complete», va «browser-smoke YO'Q» ochiq yoziladi |
| T11 | **Egasidan so'ralmagan qamrovni kengaytirish** | 4-bo'limdagi savollar javobsiz turgan fazani BOSHLAMA |

### 1.3 Model va agent siyosati — ⚠️ ZIDDIYAT, EGASI HAL QILADI

Ikki qoida bir-biriga zid va bu **hal qilinmaguncha subagent ishlatilmaydi**:

- `CLAUDE.md` §0.1 (loyiha): *«OPUS'da ishla — Sonnet EMAS. Subagent va
  Workflow fan-out agentlari ham Opus»*. Ayni faylning boshida:
  *«global `~/.claude/CLAUDE.md` MAVJUD EMAS — unga ishora qilma»*.
- Global `~/.claude/CLAUDE.md` (aslida MAVJUD, sessiyaga yuklangan):
  *«implementer subagentlarda Sonnet ishlat»* — foydalanuvchi ishora bersa.

**Vaqtinchalik yechim (egasi boshqacha aytmaguncha):** subagent ishlatilmaydi;
mexanik ish uchun **deterministik skript** yoziladi (`CLAUDE.md` §0.1 —
«extractor > fan-out», 0 token). Bu ikkala qoidani ham buzmaydi.

### 1.4 Har faza uchun MAJBURIY darvozalar

Faza «tugadi» deyilishi uchun **hammasi** yashil:

```
1. pnpm -s typecheck                → 10/10, EXIT=0
2. node scripts/check-lint.mjs      → product scope: 0 error
3. node scripts/check-guards.mjs    → guard gate OK
4. o'zgargan modulning vitest'i     → yashil, MAVJUD testlar soni kamaymagan
5. yangi kodga yangi test           → qo'shilgan (yo'qsa faza yopilmaydi)
6. git add <aniq yo'llar> + Conventional Commit
7. commit'dan keyin git show --stat HEAD → tarkib kutilganidek (§6.7B)
```

**Darvoza yashil ≠ ishlaydi.** Runtime tasdiq alohida (10.5/2-band).

---

## 2. Maqsad-arxitektura — ikkinchi ekran nima bo'lishi kerak

```
┌────────────────────── MIJOZ MONITORI (HDMI, 2-ekran) ─────────────────────┐
│                                    │                                      │
│   CHAP YARIM — jonli savat         │   O'NG YARIM — media                 │
│   ─────────────────────────        │   ──────────────────                 │
│   • qator: miqdor × nom … summa    │   • 6s VIDEO (avto, ovozsiz, loop)   │
│   • pozitsiyalar soni              │   • video yo'q → RASM                │
│   • chegirma                       │   • rasm ham yo'q → logo             │
│   • TO'LOV (katta, yashil)         │   • nom + tavsif                     │
│                                    │   • «N donadan — X so'm» (optom)     │
│   ── to'lov bosqichida ──          │   • karusel indikatori               │
│   • to'landi / QAYTIM              │                                      │
│   • «Rahmat!»                      │   savat bo'sh → IdlePanel            │
└────────────────────────────────────┴──────────────────────────────────────┘
```

Bugungi holatdan farqi: **video yo'q · to'lov bosqichi yo'q · optom narx yo'q**.

### 2.1 Ma'lumot oqimi (bugun — o'lchangan, taxmin emas)

```
sotuv/page.tsx  cfdPayload (useMemo)
      │  window.electronAPI.pushCart(payload)      ← preload.js:49
      ▼
main.js  ipcMain.on('cfd:push') → normalizeCart() → lastCart
      │  cfdWin.webContents.send('cfd:cart', …)    ← main.js:658 sendCart()
      ▼
preload-customer.js  customerDisplay.onCart(cb)
      ▼
customer-display/page.tsx  setPayload(p)
```

Brauzer zaxira yo'li: `BroadcastChannel('sherset-cart')` (Electron'siz sinov).

### 2.2 🔴 Loyihalashda hal qiluvchi cheklov — `normalizeCart` oq ro'yxati

`desktop/main.js:650` payload'ni **qayta quradi**:

```js
return {
  lines: Array.isArray(payload?.lines) ? payload.lines : [],
  discountPct: Number.isFinite(Number(payload?.discountPct)) ? Number(payload.discountPct) : 0,
};
```

Ya'ni **payload'ga qo'shilgan HAR QANDAY yangi maydon eski qobiqda
YO'QOLADI**. Bu bitta narsani anglatadi va u butun E2 fazasining shaklini
belgilaydi:

> To'lov holatini ekranga chiqarish uchun **qobiqning yangi versiyasi shart** —
> buni web tomonda aylanib o'tish yo'li YO'Q.

Qobiq hozir **v1.9.0**, avtoyangilanish serverdan (`/downloads/desktop/`) va
**savdo o'rtasida o'rnatilmaydi** — faqat boot'da yoki «Chiqish» bosilganda
(`desktop/updater.js` shartnomasi). Demak yangi qobiq kassirlarga **darhol
yetmaydi** va web eski qobiqda ham buzilmasligi SHART.

---

## 3. 🔴 BOSHLANG'ICH JONLI HOLAT (2026-08-31, 18:00–22:30 da o'lchandi)

### 3.1 Kontent — ekranning o'ng yarmi bo'sh

| O'lchov | Qiymat | Manba |
|---|---|---|
| Mahsulot | **5133** | `SELECT count(*) FROM products` |
| Tavsifi bor | **1** | `... WHERE description IS NOT NULL AND description <> ''` |
| `product_images` qatori | **0** | `SELECT count(*) FROM product_images` |
| Video (sxemada) | **yo'q** | `grep -i video schema.prisma` → 0 mos |
| Optom miqdor chegarasi | **yo'q** | sxemada `PriceTier`/`minQty` yo'q |

**Xulosa:** mijoz-ekran bugun prod'da o'ng yarmida FAQAT logotip ko'rsatadi.
Bu «buzilgan» emas — **ko'rsatadigan narsa yo'q**.

### 3.2 Ruxsat — rasm 403 olardi (E1 da tuzatildi)

| Rol | `product:view` | `attachment:view` | Xodim |
|---|---|---|---|
| Kassir | ✅ ALL | ❌ | **8** |
| PointOfSale | ✅ ALL | ❌ | **1** |

`GET /images/:id/raw` `attachment:view` talab qilardi → 403 →
`fetchMainImageUrl` uni `return null` bilan JIM yutardi.

🔴 **Ruxsatni kassirga berish YECHIM EMAS EDI:** o'sha bayroq bir qatorda
`GET /attachments/all` — akkaunt-bo'ylab fayl arxivini ochadi:

| entity | mime | soni | hajm |
|---|---|---|---|
| TelegramChatMessage | image/jpeg | 2433 | 381 MB |
| TelegramChatMessage | audio/ogg | 1601 | 411 MB |
| TelegramChatMessage | video/mp4 | 253 | 850 MB |
| TelegramChatMessage | application/pdf | 189 | 66 MB |

### 3.3 Infratuzilma — joy tugayapti

| O'lchov | Qiymat | Manba |
|---|---|---|
| Disk | **87% band, 14 GB bo'sh** | `df -h /` (22:20) |
| Ertalab (18:50) | 81% band, 19 GB bo'sh | o'sha buyruq |
| `.next-old*` (5 katalog) | **8.6 GB** | `du -sh apps/web/.next-old*` |
| DB hajmi | 2000 MB | `pg_database_size('sherset_v2')` |
| RAM | 11 GB (5.0 band) | `free -h` |

**Har deploy ~1.7 GB yangi `.next` qoldiradi.** 3000 video ~3 GB talab qiladi.
Tozalamasdan video fazasini boshlash — diskni yorish demak.

### 3.4 Zaxira — 116 commit GitHub'da YO'Q

| O'lchov | Qiymat | Manba |
|---|---|---|
| Origin `climart-adoption` | `6533f173` (2026-08-23) | `git ls-remote --heads origin` |
| Server/lokal HEAD | `bb6d2edb` | `git rev-parse HEAD` |
| Farq | **116 commit** | `git rev-list --count origin/…..HEAD` |
| `f9bd15c6` remote'da | **yo'q** | `git branch -r --contains f9bd15c6` → bo'sh |

**Sabab (o'lchandi):** `pre-push` → `pnpm -s typecheck` → `apps/api` Node'ning
standart heap'ida OOM (`exit 134`). Ya'ni 23-avgustdan beri push **texnik
jihatdan mumkin bo'lmagan**. E1 da tuzatildi (heap 4096).

### 3.5 Qobiq va deploy

| Narsa | Qiymat | Manba |
|---|---|---|
| Kassa qobig'i | **v1.9.0** | `desktop/package.json:3` |
| Yangilanish kanali | `<server>/downloads/desktop/` | `desktop/updater.js` |
| O'rnatish payti | boot yoki «Chiqish» — savdo o'rtasida EMAS | o'sha fayl |
| Nosozlik | JIM (log'ga yoziladi, savdo davom etadi) | o'sha fayl |
| API deploy | build TALAB QILMAYDI (`pm2` `src/main.ts` ni yuritadi) | `docs/ops/2026-08-31-deploy-tolov-oynalari.md` |
| Web deploy | `NEXT_DISTDIR=.next-new` build → katalog flip → `pm2 restart` | o'sha |

🔴 **2026-08-31 hodisasi sabog'i (hujjatlangan):** `«✓ Compiled successfully»`
va `BUILD_ID` fayli **build tugaganini BILDIRMAYDI** — flip erta qilinib web
~4 daqiqa crash-loop bo'lgan. **Tugash belgisi = faqat jarayonning o'z
exit-kodi** (`…build; echo BUILD_TUGADI rc=$?`).

---

## 4. ❓ EGASIGA SAVOLLAR — javobsiz boshlanmaydigan fazalar

| # | Savol | Bloklaydi | Nega muhim |
|---|---|---|---|
| S1 | **Optom narx** mijoz-ekranda hammaga ko'rinsinmi, yoki faqat tanlangan kontragentgami? | **E6** | Ochiq bo'lsa chakana mijoz «menga ham shunday bering» deydi. Yopiq bo'lsa payload'ga kontragent konteksti kerak — boshqa dizayn |
| S2 | **Optom chegarasi** mahsulotga qarab turlichami (kabel 10 m, lampa 20 dona), yoki global qoidami? | **E6** | Turlicha bo'lsa `PriceTier` jadvali; global bo'lsa sozlama. Butunlay boshqa migratsiya |
| S3 | **Tavsif** (5132 ta bo'sh) kim va qanday to'ldiradi? | **E5** qiymati | Video bo'lib tavsif bo'lmasa ekranning pastki yarmi bo'sh qoladi |
| S4 | Mijoz-ekran matnlari **o'zbek + rus** bo'lsinmi? | **E2** | Hozir qattiq o'zbek. Rus kerak bo'lsa `t()` ga o'tkazish E2 da arzon, keyin qimmat |
| S5 | To'lov tugagach «Rahmat» ekrani **necha soniya** tursin? | **E2** | 3s? 5s? Keyingi mijozgacha? UX qarori — taxmin qilmayman |
| S6 | Video **ovozli** bo'lsinmi? | **E5** | Do'konda 8 ta kassa = 8 ta ovoz. Default: ovozsiz |
| S7 | Kassada **ikkinchi monitor bormi** (sinov uchun)? | **E2** runtime tasdiq | `?demo=1` faqat layoutni ko'rsatadi, IPC'ni EMAS |

> **Qoida:** javobsiz savolga bog'liq fazani BOSHLAMA (T11). Javob kelgach shu
> jadvalga javob va sanasi yoziladi.

---

## 5. FAZALAR — bog'liqlik tartibi

```
E0  Zaxira va joy  ──────────────┐   (hech narsaga bog'liq emas, HAMMASINI bloklaydi)
                                 │
E1  ✅ Ruxsat + bug + qo'riqchi   │   (bajarildi 2026-08-31)
                                 │
E2  To'lov holati (stage) ───────┤   S4, S5, S7 javobini kutadi
    + qobiq v1.10.0              │
                                 │
E3  Media fundamenti ────────────┤   E0 dan KEYIN (disk joyi)
    (ProductMedia + disk + nginx)│
                                 │
E4  Import quvuri ───────────────┤   E3 dan keyin · egasining videolarini kutadi
                                 │
E5  CFD'da video ────────────────┤   E3 + E4 dan keyin
                                 │
E6  Optom narx ──────────────────┘   S1, S2 javobini kutadi
```

**E2 va E3 bir-biriga bog'liq EMAS** — texnik jihatdan parallel borishi mumkin,
lekin `CLAUDE.md` §0.3 (sessiya = 1 flagship ish) bo'yicha KETMA-KET qilinadi.

---

## 6. FAZALAR — batafsil

### E0 — Zaxira va disk joyi 🔴 BIRINCHI

**Nega birinchi:** 116 commit bitta server diskida, disk 87% to'lgan va har
deploy 1.7 GB qo'shadi. Video fazasi 3 GB talab qiladi. Bu ikkisi hal
bo'lmasdan qolgan hamma ish xavf ostida.

**E0.1 — GitHub'ga push (LOKALDAN, prod'dan EMAS)**

```bash
# LOKALDA (D:\projects\sherset\erp) — prod'da EMAS (T6)
pnpm -s typecheck                 # 10/10 kutiladi (E1 tuzatgan)
node scripts/check-guards.mjs
node scripts/check-lint.mjs
git push origin climart-adoption
```

- Qaytarish nuqtasi: push — qo'shuvchi amal, hech narsani o'chirmaydi.
- ⚠️ Sessiya davomida chatda **uchta token** ochiq yuborilgan, biri admin
  huquqli (`ghp_ucrC…`). **Push tugagach egasi ularni O'CHIRADI.** Bu faza
  qabul mezoniga kiradi.

**E0.2 — `.next-old*` tozalash (FAQAT egasining ruxsati bilan)**

```bash
# TAKLIF — ruxsatsiz BAJARILMAYDI (T2)
du -sh /var/www/sherset-v2/apps/web/.next-old*
# rm -rf .next-old .next-old2 .next-old3 .next-old31aug   → ~6.9 GB bo'shaydi
```

🔴 `.next-old-tolov2` **O'CHIRILMAYDI** — u 2026-08-31 deployining qaytarish
nuqtasi (`docs/ops/2026-08-31-deploy-tolov-oynalari.md`).

**Qabul mezoni:** origin `climart-adoption` = `bb6d2edb` · disk < 80% ·
tokenlar o'chirilgan.

---

### E1 — ✅ BAJARILDI (2026-08-31)

| O'zgarish | Fayl | Nega |
|---|---|---|
| Rasm o'qish marshrutlari `attachment:view` → `product:view` | `apps/api/src/modules/image/image.controller.ts` | Kassir rasmni ko'ra olsin, fayl arxivi yopiq qolsin (3.2) |
| Miqdor hisoblagichi → pozitsiyalar soni | `apps/web/src/app/customer-display/page.tsx` | `1.5 kg + 1 dona = «2.5 dona»` edi |
| `apps/api` typecheck heap 4096 MB | `apps/api/package.json` | `pre-push` OOM (3.4) |
| Qo'riqchi test (4 ta) | `image.permissions.test.ts` (yangi) | Ruxsat qaytib buzilmasin |

**Darvozalar:** typecheck 10/10 ✓ · lint 0 xato ✓ · guards OK ✓ · 15+89 test ✓
**Status:** Phase-1 · **browser-smoke YO'Q** · prod'ga chiqarilmagan
**Ko'rinadigan ta'sir:** HOZIRCHA YO'Q — bazada 0 ta rasm bor (3.1).

---

### E2 — To'lov holati (`stage`) + qobiq v1.10.0

**Muammo (o'lchangan):** `sotuv/page.tsx:859` savat o'zgarganda `pushCart`
chaqiradi, xolos. Checkout ochilishi, to'lov, chek yopilishi — **hech biri
mijoz-ekranga bormaydi**. Mijoz qaytimini ekranda ko'rmaydi.

**E2.1 · Protokol qarori — bitta kanal, versiyalangan payload**

| Variant | Tanlandimi | Sabab |
|---|---|---|
| Yangi `cfd:state` kanali | ❌ | Ikki kanal → ikki normalizator, ikki holat manbasi. Uchinchi narsa (loyalti, QR, reklama) qo'shilsa uchinchi kanal kerak bo'lardi |
| Mavjud payload'ga `stage` maydoni | ✅ | Bitta manba, bitta normalizator. Keyingi qo'shimcha = yangi MAYDON, yangi kanal emas |

**Muhim:** ikkala variant ham qobiq yangilanishini talab qiladi (2.2 —
`normalizeCart` oq ro'yxati). Shart bir xil bo'lgach, kelajakda arzonrog'i
tanlandi.

```ts
// `stage` va `payment` IXTIYORIY — eski qobiq ularni yutadi
interface CartPayload {
  lines: CartLineDTO[];
  discountPct: number;
  stage?: 'cart' | 'payment' | 'done';   // yo'q bo'lsa → 'cart'
  payment?: { paidMinor: string; changeMinor: string };
}
```

🔴 **Version-tolerance qoidasi (majburiy):** CFD sahifasi `stage` YO'Q
bo'lganda ham to'g'ri ishlashi shart (`stage ?? 'cart'`). Eski qobiqdagi
kassir yangi web'ni ochganda ekran bugungidek ishlaydi — to'lov bosqichi
ko'rinmaydi, xolos. **Buzilmaydi, kamayadi.**

**E2.2 · Tegiladigan fayllar**

| Fayl | O'zgarish |
|---|---|
| `desktop/main.js:650` | `normalizeCart` — `stage`, `payment` ni validatsiya bilan o'tkazsin |
| `desktop/package.json` | `1.9.0` → `1.10.0` |
| `apps/web/src/lib/print-agent.ts:57` | `pushCart` payload tipiga ixtiyoriy maydonlar |
| `apps/web/src/app/(app)/sotuv/page.tsx` | `cfdPayload` ga `stage` + `payment` |
| `apps/web/src/components/pos/payment-dialog.tsx` | `change` ni yuqoriga uzatish (`onConfirm` da allaqachon bor) |
| `apps/web/src/app/customer-display/page.tsx` | `PaymentPanel` + `ThanksPanel` |
| `apps/web/src/__tests__/electron-bridge-contract.test.ts` | Shartnoma qo'riqchisini yangilash |

**E2.3 · Matn siyosati (S4 javobiga qadar)**

Barcha mijozga ko'rinadigan matnlar faylning boshida **bitta `const` blokda**:

```ts
const UI = { thanks: 'Rahmat!', change: 'Qaytim', paid: "To'landi" } as const;
```

Sabab: `i18n-no-hardcoded` qo'riqchisi bu faylni qamramaydi (tekshirildi — u
faqat `app/(app)` hujjat formalarini registr bo'yicha ko'radi), lekin S4 javobi
«rus ham kerak» bo'lsa `t()` ga o'tkazish **bitta mexanik almashtirish**
bo'lishi kerak, 20 joyni qidirish emas.

**E2.4 · Testlar (yozilishi SHART)**

1. `stage` yo'q payload → ekran savat rejimida (eski qobiq regressiyasi)
2. `stage: 'payment'` → to'lov paneli, savat ko'rinib turadi
3. `stage: 'done'` + `changeMinor` → qaytim ko'rsatiladi
4. `normalizeCart` noto'g'ri `stage` ni ('hacked') → `'cart'` ga tushiradi
5. Shartnoma qo'riqchisi: `preload.js` va CFD sahifa tiplari mos

**E2.5 · Qaytarish nuqtasi**

- Web: `git revert <commit>` + oldingi `.next` katalogiga flip
- Qobiq: v1.10.0 chiqarilgach eski `.exe` kanalda qoldiriladi; qaytarish =
  `latest.yml` ni eskisiga qaytarish. **Qobiq qaytarilishi web'dan MUSTAQIL
  bo'lishi shart** — shuning uchun E2.1 dagi ixtiyoriy maydon qoidasi.

**Qabul mezoni:** 1.4 darvozalari + 5 ta yangi test + eski qobiqda regressiya
yo'qligi test bilan isbotlangan.

---

### E3 — Media fundamenti (`ProductMedia` + disk + nginx)

**E3.1 · Model qarori — nega `ProductVideo` EMAS**

| Variant | Tanlandimi | Sabab |
|---|---|---|
| `ProductVideo` jadvali | ❌ | Ertaga «ikkinchi video», «360° aylanma», «marketplace galereyasi» kerak bo'lsa — yana jadval. Uchta jadval, uchta servis, uchta endpoint |
| `ProductImage` ni kengaytirish | ❌ | U `content Bytes` — DB ichida. Disk bilan aralashsa `content` ham, `storageKey` ham nullable bo'ladi: ikki saqlash strategiyasi bitta jadvalda = doimiy chalkashlik |
| **`ProductMedia` (`kind` diskriminatori, DISKDA)** | ✅ | Yangi tur qo'shish = yangi `kind` qiymati. `ProductImage` tegilmaydi. Kelajakda rasmlarni DB'dan diskka ko'chirish uchun ham tayyor yo'l |

```prisma
model ProductMedia {
  id         String   @id @default(uuid()) @db.Uuid
  accountId  String   @map("account_id") @db.Uuid
  productId  String   @map("product_id") @db.Uuid
  kind       String   @db.VarChar(20)   // 'video' (keyin: 'image', 'spin360')
  storageKey String   @map("storage_key") @db.VarChar(300)  // diskdagi nisbiy yo'l
  posterKey  String?  @map("poster_key")  @db.VarChar(300)
  mime       String   @db.VarChar(100)
  sizeBytes  Int      @map("size_bytes")
  durationMs Int?     @map("duration_ms")
  position   Int      @default(0)
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz()
  // account/product relation + @@index([accountId, productId, kind, position])
  @@map("product_media")
}
```

🔴 **`content Bytes` YO'Q** — bu ataylab (T8).

**E3.2 · Saqlash joyi — git checkout'dan TASHQARIDA**

```
/var/www/sherset-media/videos/<accountId>/<productId>.mp4
```

Sabab — loyihada **allaqachon isbotlangan naqsh**: `deploy/DEPLOY-sherset.md`
§7 yangilanish kanalini `/var/www/kassa-downloads/` ga qo'yadi va izohda aynan
shunday deydi: *«OUTSIDE the git checkout on purpose, so `git pull` /
`deploy-smart.sh` never touch it»*. Media ham xuddi shunday: deploy media'ni
o'chirmasligi KAFOLATLANGAN bo'lishi kerak.

**E3.3 · Berish — nginx, Node EMAS**

`location /media/` nginx'da. Sabab: `<video>` tegi **Range (206 Partial
Content)** so'raydi; nginx buni tug'ma qiladi, hozirgi `image.controller.ts`
`raw()` esa butun buferni qaytaradi va video bilan ishonchsiz ishlaydi.

⚠️ **Xavfsizlik savoli — E3 boshlanishidan oldin hal qilinadi:** `/media/`
autentifikatsiyasiz bo'lsa, URL'ni bilgan har kim video ko'radi. Marketplace
baribir publik bo'ladi (egasining javobi: «mijozlar uchun»), ya'ni bu qabul
qilinarli bo'lishi MUMKIN — lekin bu **ochiq qaror bo'lishi kerak**, jimgina
emas. Fayl nomi `productId` (UUID) — taxmin qilib bo'lmaydi.

**E3.4 · Migratsiya va uning teskarisi (§5.5/12-band)**

- Oldinga: `prisma migrate dev` → yangi jadval (mavjud jadvallarga TEGMAYDI)
- Teskari: `DROP TABLE product_media` — hech qanday mavjud ma'lumot yo'qolmaydi
- 🔴 Prod'ga migratsiya **egasining ruxsati bilan, savdo yopiq paytda** (T1, T7)

**Qabul mezoni:** 1.4 darvozalari · migratsiya lokalda oldinga va teskari
sinalgan · `/media/` nginx konfigi `deploy/` ga qo'shilgan.

---

### E4 — Import quvuri (egasining 3000 videosi)

**E4.1 · Nomlash — kod bo'yicha, nom bo'yicha EMAS**

O'lchangan (2026-08-31):

| Fakt | Qiymat |
|---|---|
| Mahsulot | 5133 |
| Noyob `code` | **5133** (100%) |
| Format | 5 xonali, `00003`…`05193`, hammasi raqamli |
| Nomi Windows fayl nomi bo'la OLMAYDI (`/ * " : ? < > \|`) | **293** |
| Takrorlanuvchi nom | **73** |

Misollar: `shit 100*100 padez`, `profil 2/10 sm vn qora`, `Ampermetr 600/5`.

**Qaror:** fayl nomi = `<code>.mp4` (`04714.mp4`). Skript boshidagi raqamni
ajratadi, ya'ni `04714 - shit 100x100.mp4` ham ishlaydi (egasi eslash uchun
nom qo'sha oladi).

**E4.2 · DRY-RUN majburiy**

Skript **avval hech narsa yozmasdan** hisobot beradi:

```
topildi:        2841
kod topilmadi:    102   ← ro'yxat CSV'ga
takroriy fayl:      7   ← ro'yxat CSV'ga
6s dan uzun:      340   ← qisqartiriladi, ro'yxat CSV'ga
jami hajm:      3.1 GB   (diskda bo'sh: 14 GB)
```

Egasi tasdiqlagandan keyingina yozadi. Sabab: 3000 faylni noto'g'ri bog'lash —
sement olayotgan mijozga shokolad videosi.

**E4.3 · Idempotentlik**

Skript ikkinchi marta ishga tushsa dublikat yaratmaydi (`productId + kind`
bo'yicha upsert). Sabab: import uzilib qolsa qaytadan yugurtirish xavfsiz
bo'lishi kerak.

**E4.4 · `MAX_VIDEO_SECONDS = 6` — BITTA joyda**

Konstanta bitta modulda (`media-policy.ts`). Egasi ertaga «8 soniya qilaylik»
desa — bitta qator o'zgaradi. Kod bo'ylab tarqalgan `6` raqami TAQIQ.

**Qabul mezoni:** dry-run hisoboti egasi tomonidan tasdiqlangan · skript
idempotent (ikki marta yugurtirilib tekshirilgan) · teskarisi bor
(`storageKey` bo'yicha o'chirish).

---

### E5 — CFD'da video

| Ish | Tafsilot |
|---|---|
| `<video>` | `autoPlay muted loop playsInline poster={posterUrl}` (S6 gacha ovozsiz) |
| Karusel taymeri | Rasm → 5s. **Video → `onEnded`**, taymer EMAS. Hozir `CAROUSEL_MS` qat'iy 5000 va 6s video oxirigacha o'ynamasdi |
| Fallback zanjiri | video → rasm → logo |
| Yagona endpoint | `GET /products/:id/display` — hozir har mahsulotga 2 so'rov |

⚠️ **Halol tuzatish:** sessiyada «10 qatorli savat = 20 so'rov» deganman —
NOTO'G'RI. `media` state va `inFlight` guard tufayli har **yangi** mahsulotga
2 so'rov ketadi va keshlanadi. Birlashtirish foydali, lekin men aytganchalik
shoshilinch emas.

---

### E6 — Optom narx

**S1 va S2 javobisiz BOSHLANMAYDI.** Sabab: «hammaga ochiq» va «faqat
optomchiga» butunlay boshqa payload va boshqa xavfsizlik modeli. Bo'sh faza
halol, noto'g'ri faza xavfli.

---

## 7. Xavflar reyestri

| # | Xavf | Ehtimol | Ta'sir | Yumshatish |
|---|---|---|---|---|
| X1 | Disk to'ladi (87%, har deploy +1.7 GB, video +3 GB) | **Yuqori** | Prod to'xtaydi | E0.2 birinchi; E4 dan oldin `df -h` qayta o'lchanadi |
| X2 | Yangi qobiq eski web bilan (yoki teskari) mos kelmaydi | O'rta | Mijoz-ekran o'ladi | E2.1 ixtiyoriy maydon qoidasi + regressiya testi |
| X3 | 3000 video noto'g'ri mahsulotga bog'lanadi | O'rta | Mijozga yolg'on ko'rsatiladi | E4.2 dry-run + kod bo'yicha nomlash |
| X4 | Prod migratsiya savdoni to'xtatadi | Past | 46 daq. to'xtash (tarixda bor) | T7 + savdo yopiq payt + teskarisi tayyor |
| X5 | 116 commit yo'qoladi | Past, lekin **qaytarib bo'lmaydi** | Bir haftalik ish | E0.1 birinchi |
| X6 | Chatdagi tokenlar suiiste'mol qilinadi | O'rta | Repo egallanadi | Egasi darhol o'chiradi (E0.1) |
| X7 | Video ovozi 8 ta kassada bir vaqtda | O'rta | Do'konda shovqin | Default `muted`; S6 |

---

## 8. Bu reja QAMRAMAYDIGAN ishlar

- **Marketplace** (mijozlar uchun publik katalog) — alohida reja.
  Bugungi holat o'lchandi: `apps/marketing` bu ERP'ning reklama sayti
  (about/pricing/blog/legal), marketplace EMAS; API'da **bitta ham publik
  route yo'q** (`JwtAuthGuard` + `PermissionsGuard` `APP_GUARD` sifatida
  hammasini qamragan). Yagona tayyor eshik —
  `POST /webhooks/online-orders/:channelId` (HMAC imzo, JWT'siz).
  ➜ E3 dagi `ProductMedia` va E6 dagi narx modeli marketplace uchun ham
  ishlaydi — shuning uchun ular shu yerda to'g'ri loyihalanmoqda.
- Rasmlarni DB'dan diskka ko'chirish (`ProductImage` → `ProductMedia`).
  E3 buni MUMKIN qiladi, lekin BAJARMAYDI.
- Tavsiflarni to'ldirish (5132 ta bo'sh) — S3.
- Mijoz-ekranda reklama/aksiya slaydlari (bo'sh savat rejimi).
- `.next-old-tolov2` ni o'chirish — u qaytarish nuqtasi.

---

## 9. HISOBOTLAR (har faza o'z hisobotini shu yerga yozadi)

### E1 — Ruxsat, miqdor bug'i, heap · ✅ · 2026-08-31

**Nima qilindi:** 6-bo'lim E1 jadvalida.
**Darvozalar:** typecheck 10/10 · lint 0 · guards OK · 15+89 test yashil.
**Status:** Phase-1 · browser-smoke YO'Q · prod'ga CHIQARILMAGAN.
**«Bu nimani buzishi mumkin?» (§5.5/10-band):** o'lchandi — jonli bazada
**10 ta rolning HAMMASIDA `product:view = true`**, `attachment:view` esa faqat
7 tasida. Ya'ni bu o'zgarish rasm ko'ra oladiganlar doirasini **faqat
kengaytiradi** (Kassir, PointOfSale, Omborchi yutadi) va **hech bir rol
yo'qotmaydi** — `attachment:view` bor-u `product:view` yo'q rol MAVJUD EMAS.
Yozish yo'llari tegilmagan, ya'ni kim rasm yuklashi o'zgarmadi.

```
             product_view | attach_view
Kassir            t       |     f        ← yutadi
PointOfSale       t       |     f        ← yutadi
Omborchi          t       |     f        ← yutadi
qolgan 7 rol      t       |     t        ← o'zgarishsiz
```
**Qolgan qarz:** prod'ga chiqarilmagan; ko'rinadigan ta'siri yo'q (0 rasm).

### E2′ — Navbat taxtasi + egasining dizayni · ✅ · 2026-09-01

**Egasining talabi:** mijoz-ekranda «otlijit» qilingan buyurtmalar holati
ko'rinsin (yig'ilyapti / tayyor) — mijoz zalda kutib, o'z buyurtmasi tayyor
bo'lganini ko'rsin. Dizayn `Kassa Ekrani v2.dc.html` maketi bo'yicha.

**Qamrov qarorlari (egasi, 2026-09-01):** navbat FAQAT shu kassaniki ·
kartada summa YO'Q (yonidagi odam ko'rmasin) · navbat savat TEPASIDA ·
til uz+ru, kassir tanlaydi · «Rahmat» ekrani 5s · optom narx hammaga ochiq ·
optom chegarasi kategoriya bo'yicha · video ovozli · tavsif Excel'dan.

**🔴 Arxitektura yutug'i:** navbat IPC payload'i orqali EMAS, sahifaning O'Z
so'rovi bilan keladi (`/cashier-sessions/current` → `/retail-sales`). Sabab:
`normalizeCart()` oq ro'yxati yangi maydonni yutardi va **yangi `.exe` kerak
bo'lardi**. Bu yo'l bilan bugungi qobiqda (v1.9.0) ishlaydi — kassirlarga
hech narsa o'rnatilmaydi.

**Maketdan OLINDI:** palitra · to'ldirilgan yashil TAYYOR kartasi (kichik
chiroq zaldan ko'rinmasdi) · to'lov bloki (ko'k gradient karta) · tepa panel
(logo · tagline · soat) · mahsulot kartasi (pozitsiya · nom · narx ·
progress) · savat avto-aylanishi · bo'sh savat va salomlashuv ekranlari.

**Maketdan OLINMADI (sabab bilan):**
- Google Fonts (`Golos Text`) — kassa PC'sida tashqi so'rovga bog'liqlik va
  serverda build-vaqti bog'liqligi. Tizim shrifti qoldi.
- «Kassa №1» qotirilgan matn — o'rniga haqiqiy `cashDesk.name`.
- 94px jami summa — `formatMoney` tiyin bilan chiqadi va kartadan oshib
  ketardi. **Tiyin QOLDIRILDI** (chegirma bo'linishi qoldiq berishi mumkin;
  ekranda chekdan boshqa summa turishi bu ekranning maqsadini buzardi),
  o'lcham 60px ga tushirildi — 8 xonali summa ham sig'adi.
- Karta prefiksi «TRN-2026-» — har kartada bir xil, zaldan ma'lumot bermaydi
  va raqamni kichraytirardi. Olib tashlandi, raqam 58px.

**Qo'shildi (maketda yo'q):** sahna 1920×1080 da quriladi va ekranga
masshtablanadi (`useFitScale`) — 4K televizorda maket o'lchamlari kichrayib
o'qilmay qolmasligi uchun.

**Darvozalar:** typecheck 10/10 ✓ · lint 0 xato ✓ · guards OK ✓ ·
98 web + 15 api test yashil ✓ (9 tasi yangi).
**Status:** Phase-1 · **browser-smoke QILINDI** (demo, 1920×1080, 3 holat) ·
jonli qurilmada SINALMAGAN · prod'ga CHIQARILMAGAN.
**Qolgan qarz:** E2 (to'lov/qaytim ekrani) hali qilinmadi — `stage` maydoni
va yangi qobiq talab qiladi.

---

---

## 10. O'Z-O'ZINI BAHOLASH — bu reja va bugungi sessiya

Egasi so'radi: *«shunday qilsam bo'lar ediku, nimaga bunaqa qilmadim?»*.

### 10.1 Eng xavfli yaqin-xato

**«Kassirga `attachment:view` bering» deb tavsiya qildim.** Egasi buni
bajarganida 9 ta kassa xodimi butun kompaniya fayl arxiviga — 2433 Telegram
rasmi, 1601 ovozli xabar, qarz kvitansiyalari — kirish huquqini olardi.

Nega bunday bo'ldi: ruxsat bayrog'ining **nomiga** qarab xulosa chiqardim
(«attachment = biriktirma = rasm»), o'sha bayroq **yana qayerda
ishlatilishini** tekshirmasdan. Bir qator `grep` yetarli edi va men uni faqat
bir necha xabardan keyin qildim.

**Nima qilishim kerak edi:** ruxsat/rol/guard haqida har qanday tavsiyadan
OLDIN «bu bayroq yana qayerda?» degan grep — istisnosiz. Bu qoida 1.2/T
jadvaliga shu tarzda kirdi.

### 10.2 Tasdiqlamasdan aytilgan gaplar

| Aytdim | Haqiqat | Qanday tutildi |
|---|---|---|
| «Karusel indeks bug'i bor» | Bug **yo'q** — `prevLen` naqshi qo'shish/o'chirish/bo'shatishni to'g'ri qamragan | Kod yozishdan oldin qayta o'qidim |
| «10 qatorli savat = 20 so'rov» | Har **yangi** mahsulotga 2 so'rov, keyin keshlanadi | O'sha qayta o'qishda |
| «Push'lar 23-avgustdan to'xtagan» | To'g'ri, lekin sababni bilmasdan aytdim; sabab (OOM) keyin o'lchandi | Push'ni haqiqatan yugurtirganda |

Ikkitasi kod yozishdan oldin tutildi — tartib ishladi. Lekin **ular umuman
aytilmasligi kerak edi**: men ularni «topilma» sifatida taqdim etdim,
«tekshirilishi kerak gumon» sifatida emas. `CLAUDE.md` §2 aynan shu haqda.

### 10.3 Ketma-ketlik xatosi

Kodni lokalga olishdan **oldin** serverdan o'qib tahlil qildim va reja tuza
boshladim. Keyin ma'lum bo'ldiki 4 ta muhim fayl serverda boshqacha edi. O'sha
tahlil asosida kod yozganimda — bir haftalik prod ishini yo'qotardim.

**Nima qilishim kerak edi:** «kod qayerda va u haqiqiy manbami?» birinchi savol
bo'lishi kerak edi, oltinchi emas.

Bitta narsani tasodifan to'g'ri qildim: `git merge --ff-only` ishlatdim,
`reset --hard` emas. Keyin `CLAUDE.md` §6.7A ni o'qib bildimki `reset --hard`
bu loyihada bir marta boshqa sessiyaning ishini o'chirgan va TAQIQLANGAN. Ya'ni
bu **intizom emas, omad** edi. Shuning uchun T3 alohida yozildi.

### 10.4 Token bilan bo'lgan ish

Egasiga «tokenni chatda yubormang» dedim, keyin uchta token chatda keldi va men
ularni ishlatdim. To'g'rirog'i: **birinchi token kelganidayoq to'xtab**,
buyruqni egasiga berib, o'zim ishlatmasligim kerak edi. Endi uchta token
yozishmada turibdi, biri admin huquqli. E0.1 qabul mezoniga «tokenlar
o'chirilgan» shuning uchun kiritildi.

### 10.5 Bu rejaning o'zi haqida — nima yaxshi emas

1. **E4 (import) eng noaniq faza.** 3000 video hali ko'rilmagan — formati,
   hajmi, davomiyligi noma'lum. Serverda ham, egasining diskida ham topilmadi
   (ikkalasi qidirildi; serverda topilgan 66 ta video boshqa loyihaniki). Reja
   ularni «~1 MB, mp4» deb faraz qiladi. **Bu faraz noto'g'ri bo'lishi mumkin**
   va E4 hisob-kitobini buzadi. Shuning uchun E4.2 (dry-run) shart qilib
   qo'yildi — faraz sinovdan o'tadi, ishga aylanmaydi.
2. **E2 uchun runtime tasdiq yo'li aniq emas.** Ikkinchi monitorsiz mijoz-ekran
   to'liq sinalmaydi; `?demo=1` faqat layoutni ko'rsatadi, IPC'ni emas. Bu
   S7 savoli sifatida ochiq qoldirildi — yashirilmadi.
3. **E6 deyarli bo'sh.** Ataylab: S1/S2 javobisiz uni to'ldirish — taxminni
   rejaga aylantirish bo'lardi.

### 10.6 Nega fazalar aynan shu tartibda

E0 birinchi, chunki u **qaytarib bo'lmaydigan yo'qotishning** oldini oladi
(116 commit, disk). Qolganlarining hammasi qaytariladi.

E2 E3 dan oldin, chunki E2 **kontentsiz ham mijozga ko'rinadigan foyda beradi**
(qaytim ekrani), E3–E5 esa egasining videolarini kutadi. Video kechiksa E2
baribir qiymat bergan bo'ladi. Teskari tartibda — video kechiksa hech narsa
chiqmaydi.

E6 oxirida, chunki u yagona faza bo'lib **biznes qarorini** talab qiladi,
texnik ishni emas.
