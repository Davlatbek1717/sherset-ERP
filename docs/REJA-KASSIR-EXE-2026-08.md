# REJA — kassir.exe (sensorli monoblok to'lqini) · 2026-08-11

> **Bu reja ko'p sessiyaga bo'lingan.** Har faza — ALOHIDA sessiya. Agent shu faylni o'qiydi,
> FAQAT o'z fazasini bajaradi, hisobotini shu faylning pastiga yozadi va **to'xtaydi**.

---

## 0. O'zgarmas qoidalar (har fazaga tegishli)

1. 🔴 **BIR SESSIYA = BIR FAZA.** Faza tugagach agent **keyingi fazani BOSHLAMAYDI** —
   ishni to'liq to'xtatadi. Sabab: kontekst o'sgan sari token sarfi ko'payadi.
   Keyingi fazani egasi yangi sessiyada o'zi boshlaydi.
2. 🔴 **Hisobot majburiy.** Faza oxirida agent shu faylning `## HISOBOTLAR` bo'limiga
   o'z fazasi shablonini to'ldiradi: nima o'zgardi · qaysi fayllar · qaysi testlar va
   natijalari · **nima qilinmadi** · ochiq xavf. Qisqartirish yo'q.
3. **Halol status** (`CLAUDE.md` §1): brauzerda sinalmagan ish «Phase-1, browser-smoke YO'Q»
   deb belgilanadi. «Done / production-ready» so'zlari ishlatilmaydi.
4. **Parallel sessiya xavfsizligi** (`CLAUDE.md` §6): `git add` faqat **aniq fayl yo'llari**
   bilan (`git add -A` TAQIQ); commitdan keyin `git show --stat HEAD` bilan tarkib tekshiriladi;
   `git reset --hard` / `stash` / `checkout -- .` — begona o'zgarish bor daraxtda TAQIQ.
5. **Model:** Opus. Sifat gate'lari qisqartirilmaydi.
6. Faza `davom et` protokolini (`/davom`, cohort-audit navbati) **ishlatmaydi** — bu reja ustun.

### Umumiy gate (har kod fazasida, commitdan oldin)

```
pnpm typecheck          # 0 xato
pnpm lint:product       # 0 xato
pnpm i18n:gate          # ru+uz kalit mavjudligi + hardcoded matn yo'q
pnpm --filter @moysklad/web exec vitest run <o'zgargan test yo'llari>
```

---

## 1. Kontekst — nima uchun bu reja

Egasi kassirlarga **sensorli monoblok** o'rnatdi. 11-avgust kuni real qurilmada birinchi marta
ishlatilganda bir necha bo'shliq ochildi. Quyidagi holat **kodda va jonli tekshirilgan**:

| Fakt | Dalil |
|---|---|
| PIN kirish + ekran raqamlari | `apps/web/src/app/kassa-kirish/page.tsx` → `components/pos/pin-keypad.tsx` — **bor, prodda** |
| Kassadan kontragent + kam to'lov → qarz | `components/pos/rasmilashtirish-modal.tsx` — **bor, prodda** (B5 to'lqini) |
| Qobiq ekran klaviaturasi | `desktop/preload.js:149` `installTouchKeyboard()` — **bor** (faqat lotin, faqat QWERTY) |
| Savatda soni/narx tahriri | `sotuv/page.tsx:2474` −/+ (24×24px) va 96px narx inputi — **bor, lekin sensor uchun qulay emas** |
| Avtoyangilanish kanali | `GET https://erp.sherset.uz/downloads/desktop/latest.yml` → **200**, `version: 1.2.0`; `.exe` → 200 (81 950 347 b) |
| Serverga so'rov vaqti | `Test-Connection` o'rtacha **142 ms**; `/api/v1/health` ×3 → 155/113/113 ms |
| **11 commit push qilinmagan** | `git log sherset/climart-adoption..HEAD` — F8 (zakazni to'lash), F9 (mijoz kartasi), xodim PIN modali |

**Bu rejadan ATAYLAB chiqarilgan:** offline rejim (internetsiz savdo) va tarmoq strategiyasi —
egasining qarori bo'yicha alohida ko'riladi.

---

## 2. Fazalar xaritasi

| Faza | Nomi | Tegadigan joy | Deploy bormi | Holat |
|---|---|---|---|---|
| **F1** | Kutayotgan 11 commit prodga (F8 · F9 · PIN modali) | — (yangi kod yo'q) | ✅ ha | ☐ |
| **F2** | Savat qatori tahrir oynasi (sensorli soni/narx) | `apps/web` | ✅ ha | ☐ |
| **F3** | Qobiq klaviaturasi: raqamli layout + kirill | `desktop/` | ❌ yo'q (F4 da chiqadi) | ☐ |
| **F4** | exe **v1.3.0** relizi + avtoyangilanish oqimini jonli sinash | `desktop/` + VPS | ✅ ha | ☐ |

Tartib sababi: F1 **avval** — allaqachon yozilgan ish prodda bo'lmasa, F2 uning ustiga qurilib
deploy'ni katta va xavfli to'plamga aylantiradi. F3 va F4 ajratilgan: kod o'zgarishi va
reliz+jonli sinov — ikki xil ish, ikkalasi ham to'liq e'tibor talab qiladi.

---

## FAZA 1 — Kutayotgan ish prodga chiqadi

**Maqsad:** `sherset/climart-adoption..HEAD` dagi **11 commit** ni erp.sherset.uz ga chiqarish va
jonli tasdiqlash. Bu fazada **yangi kod yozilmaydi** — faqat gate, push, deploy, verify.

**Nima chiqadi:** F8 — POS'da zakazni to'lash (chek zakazga bog'lanadi) · F9 — POS mijoz kartasi
paneli (telefon bo'yicha qidirish, umumiy qarz + reyestr, xarid tarixi, zakazlar) ·
xodim kartasida PIN qo'yish modali (admin uchun) · savat kasr-miqdor tuzatishlari.

### Vazifalar

1. `git status --short` + `git log sherset/climart-adoption..HEAD --stat` — **faqat o'z ishing**
   ekanini tasdiqla. Begona o'zgarish bo'lsa TEGMA va hisobotda yoz.
2. To'liq gate: `pnpm typecheck` · `pnpm lint:product` · `pnpm i18n:gate` ·
   `pnpm --filter @moysklad/web exec vitest run` · `pnpm --filter @moysklad/api exec vitest run`
   (api'ning to'liq suite'i uzoq — kamida `retail-sale`, `customer-order`, `debt` modullarini yugurtir).
3. **Deploy oldidan tekshiruv** (ma'lum tuzoqlar, `NEXT.md` 2026-08-11b dan):
   - `apps/api/.env.example` bilan VPS'dagi `apps/api/.env` ni solishtir — **yangi majburiy env**
     bo'lsa qo'shilmaguncha API boot'da yiqiladi (POS_PIN_PEPPER hodisasi, sayt 502).
   - Migratsiya bormi: `git diff --name-only sherset/climart-adoption..HEAD -- packages/db/prisma/migrations`
   - VPS disk: `/` bo'sh joyi (oxirgi o'lchov 93% band) va backup papkasi hajmi.
4. Push: `git push sherset climart-adoption`.
5. Deploy — `.claude/commands/deploy.md` bo'yicha, **`DS_TARGET=v2`** (erp.sherset.uz = FAOL PROD):
   `nohup env DS_TARGET=v2 bash /var/www/sherset-v2/deploy/deploy-smart.sh > /tmp/deploy.log 2>&1 &`
   → `/tmp/deploy.log` ni poll qil.
6. **Jonli verify (dalil bilan, «200 qaytdi» yetarli emas):**
   - `/api/v1/health` 200 · `erp.sherset.uz` 200 · pm2 `sherset-v2-api` uptime va err.log'da yangi xato yo'q
   - `git rev-parse HEAD` box'da = lokal HEAD (`deploy-verify-against-local-not-remote` xotirasi)
   - F9: `GET /debts/pos/summary/:id` marshruti **401** (bor va qo'riqlangan, 404 emas)
   - Yangi i18n kalitlari serverdagi JS chunk ichida borligini grep bilan tasdiqla
7. `NEXT.md` ning yuqorisiga qisqa `✅ DEPLOYED` entry'si (sana+harf kolliziyasini tekshirib).
8. Hisobotni shu faylga yoz → **TO'XTA**.

### Tugash mezoni
Prodda F8/F9 marshrutlari javob beradi, HEAD box'da lokal HEAD ga teng, `NEXT.md` yangilangan,
hisobot yozilgan. **Brauzerda POS ekranini bosib ko'rish bu fazaga kirmaydi** (egasi qiladi) —
hisobotda «browser-QA YO'Q» deb ochiq yoziladi.

### Sessiya prompti (nusxa ol)

```
docs/REJA-KASSIR-EXE-2026-08.md faylini o'qi va FAQAT «FAZA 1 — Kutayotgan ish prodga chiqadi»
ni bajar. Rejaning §0 «O'zgarmas qoidalar» bo'limi majburiy.

Bu fazada yangi kod yozilmaydi: gate → push → deploy (DS_TARGET=v2) → jonli verify → NEXT.md
entry → hisobot. Deploy tartibi .claude/commands/deploy.md da.

Bloker chiqsa (env yetishmasa, migratsiya yiqilsa, begona o'zgarish ko'rsang) — ORQAGA QAYTARMA,
to'xta va hisobotda aniq yoz.

Faza tugagach rejaning «HISOBOTLAR» bo'limiga F1 hisobotini yoz va ISHNI TO'XTAT — keyingi fazani
boshlama. /davom protokolini ishlatma.
```

---

## FAZA 2 — Savat qatori tahrir oynasi (sensorli)

**Muammo:** monoblokda savat qatoridagi −/+ tugmalar 24×24px, narx maydoni 96px. 12 dona tovar =
12 marta bosish; sonni to'g'ridan-to'g'ri kiritib bo'lmaydi.

**Yechim:** savat qatori bosilganda ochiladigan **katta modal**: tovar nomi · **soni** ·
**narx** · «O'chirish» · «Saqlash» → savatga qaytish. Kiritish — katta numpad bilan.

### Vazifalar

1. Yangi komponent: `apps/web/src/components/pos/cart-line-edit-modal.tsx`
   (🔴 `sotuv/page.tsx` ichiga YOZMA — u 2000+ satr, MK33 bo'linishi hali qarz).
2. **Mavjud narsalarni qayta ishlat, yangidan yozma:**
   - Numpad naqshi + «Aniq summa» xulqi: `components/pos/rasmilashtirish-modal.tsx` (`NUMPAD_KEYS`)
   - Miqdor: `lib/pos/cart-math.ts` → `normalizeQtyDecimal`, `addQtyDecimal` (kasr miqdor SATR bo'lib qoladi —
     `BigInt(quantity)` qilish RangeError beradi, izohlar sahifada bor)
   - Pul parse/format: `lib/pos/parse-amount.ts` → `parseAmountToMinor`, `formatAmountInput`
   - Narx tasmasi: `classifyPrice`, `cartLineMarkdownMinor` (qatorda allaqachon ishlatilyapti) —
     oynada ham zarar/optdan past holati **jonli** ko'rinsin
3. **Sahifaga ulash** (`apps/web/src/app/(app)/sotuv/page.tsx`): qator bosilishi oynani ochadi,
   `updateQty`/`updatePrice` o'rniga oyna natijasi qo'llanadi. Mavjud −/+ va inline input
   **qolsin yoki olib tashlansin** — qaroringni hisobotda asosla.
   🔴 `cartLocked` (zakazga bog'langan savat) holatida oyna **faqat ko'rish** rejimida bo'lsin yoki
   umuman ochilmasin — hozirgi qulf mantiqi buzilmasin.
4. **Parse birlashtirish:** `page.tsx:1197` `updatePrice` o'z parse'ini yozgan
   (`Number.parseFloat × 100`), to'lov oynasi esa `parseAmountToMinor(input, currency)` ishlatadi.
   Ikkisi bitta funksiyaga keltirilsin. Agar valyuta ko'lami (scale) farq qilsa — **avval o'lchab**,
   keyin o'zgartir; farqni hisobotda yoz.
5. **Testlar:** yangi `components/pos/__tests__/cart-line-edit-modal.test.tsx` +
   mavjudlari yashil qolsin: `app/(app)/sotuv/__tests__/sales-screen-cart.test.tsx`,
   `sales-screen-order-payment.test.tsx`, `lib/pos/cart-math.test.ts`, `__tests__/pos-cart-profit.test.ts`.
   Qamrov: soni 0 ga tushsa qator o'chadimi · kasr miqdor (1.5) · narx bo'sh qoldirilsa 0 bo'ladimi
   (hozirgi shartnoma: bo'sh → `0n`, eski narx EMAS) · `cartLocked` da tahrir bloklanadimi.
6. i18n: yangi matnlar `apps/web/src/messages/ru.json` + `uz.json` (ikkalasi ham — gate tekshiradi).
7. Gate → commit (`feat(kassa): ...`, kichik harf bilan — commitlint bosh harfni rad etadi) →
   `git show --stat HEAD` → push → deploy (`DS_TARGET=v2`) → jonli 200 verify.
8. `NEXT.md` entry + hisobot → **TO'XTA**.

### Tugash mezoni
Oyna ishlaydi (testlar yashil), gate 0, prodga chiqdi. Brauzer/qurilma sinovi — egasida;
hisobotda «browser-smoke YO'Q» deb yoziladi.

### Sessiya prompti (nusxa ol)

```
docs/REJA-KASSIR-EXE-2026-08.md faylini o'qi va FAQAT «FAZA 2 — Savat qatori tahrir oynasi» ni
bajar. Rejaning §0 «O'zgarmas qoidalar» majburiy.

Muhim: yangi kod alohida komponentga (components/pos/cart-line-edit-modal.tsx), sotuv/page.tsx
ichiga emas. Numpad, cart-math va parse-amount funksiyalari MAVJUD — ularni qayta ishlat.
Avval testni yoz (TDD), keyin implementatsiya.

Gate: pnpm typecheck · pnpm lint:product · pnpm i18n:gate · web vitest (o'zgargan + POS suite'lari).

Faza tugagach rejaning «HISOBOTLAR» bo'limiga F2 hisobotini yoz va ISHNI TO'XTAT — keyingi fazani
boshlama.
```

---

## FAZA 3 — Qobiq klaviaturasi: raqamli layout + kirill

**Hozir** (`desktop/preload.js:139–270`): lotin QWERTY + raqam qatori + `@ . - _ / :` + ⌫ +
ABC(shift) + «Yashirish». Har `input`/`textarea` fokusida chiqadi.

**Bo'shliqlar:** (a) pul/miqdor maydonida ham to'liq QWERTY chiqadi — katta numpad kerak;
(b) **kirill/o'zbek harflari yo'q** (mijoz nomi, izoh yozib bo'lmaydi); (c) balandligi ~300px.

### Vazifalar

1. `installTouchKeyboard()` da **layout tanlash**: maydon `type="number"` yoki
   `inputMode="decimal|numeric|tel"` bo'lsa → **numpad layout** (katta 0–9, `.`, ⌫, «Yashirish»),
   aks holda harf layout.
2. Harf layoutiga **RU/UZ almashtirgich** (kirill qatori). Klaviatura holati sahifa
   navigatsiyasidan keyin ham tiklanadigan bo'lsin (preload har navigatsiyada qayta ishlaydi).
3. 🔴 **Ikki shartnomani buzma** (ikkalasi ham izohda sababi bilan yozilgan):
   - Kalit **`ipcRenderer.send('kbd:key')` → `main.js:598` → `sendInputEvent`** orqali boradi.
     `input.value = ...` qilish React holatini yangilamaydi — matn keyingi render'da yo'qoladi.
   - Uslublar **faqat CSSOM** orqali (`el.style.x = ...`). `<style>` tegi sahifaning `style-src`
     CSP siyosatiga tushadi.
4. Tinglovchilar **passiv** qolsin (`preventDefault` chaqirilmasin) — aks holda haqiqiy tugmalar
   bosilmay qoladi (chiqish imosi hodisasi).
5. **Qo'riqchi testlar** (`apps/web/src/__tests__/`): `electron-bridge-contract.test.ts` va
   `kassa-installer-config.test.ts` yashil qolsin; yangi xulq uchun qo'riqchi qo'sh —
   lekin **niyatni** qulfla, bitta implementatsiyani emas (eski `kiosk: true` literal sharti sabog'i).
   Test regexlari CHAQIRUVga tor bo'lsin (`\.preventDefault\s*\(`), izohdagi so'zdan yiqilmasin.
6. Lokal sinov: `cd desktop && pnpm run dev` (Electron ochiladi) — server manzili so'ralsa
   erp.sherset.uz kiritiladi. **Agar Electron'ni ishga tushirib bo'lmasa — buni hisobotda
   ochiq yoz, «ishlaydi» deb taxmin qilma.**
7. Gate (web vitest qo'riqchilar) → commit → **TO'XTA**. Bu fazada exe yasalmaydi va deploy yo'q.

### Tugash mezoni
`preload.js` yangi layout bilan, qo'riqchi testlar yashil, commit qilingan. Qurilmaga chiqishi — F4.

### Sessiya prompti (nusxa ol)

```
docs/REJA-KASSIR-EXE-2026-08.md faylini o'qi va FAQAT «FAZA 3 — Qobiq klaviaturasi» ni bajar.
Rejaning §0 «O'zgarmas qoidalar» majburiy.

Faqat desktop/preload.js (kerak bo'lsa main.js dagi kbd:key ishlovchisi) o'zgaradi. Ikki shartnoma
buzilmasin: kalit sendInputEvent orqali, uslublar faqat CSSOM orqali (CSP). Tinglovchilar passiv.

Qo'riqchi testlar: apps/web/src/__tests__/electron-bridge-contract.test.ts va
kassa-installer-config.test.ts yashil qolsin.

Bu fazada exe YASALMAYDI va deploy YO'Q — u F4 da. Faza tugagach «HISOBOTLAR» ga F3 hisobotini
yoz va ISHNI TO'XTAT.
```

---

## FAZA 4 — exe v1.3.0 relizi + avtoyangilanish oqimini jonli sinash

**Nima uchun:** F3 dagi klaviatura qurilmaga faqat yangi exe bilan yetadi. Ayni paytda
avtoyangilanish oqimi (topish → yuklash → o'rnatish) **hech qachon jonli sinalmagan** —
shu fazada birinchi marta o'lchanadi.

### Vazifalar

1. Versiya: `desktop/package.json` `1.2.0` → **`1.3.0`**.
   🔴 Gotcha: `kassa-installer-config.test.ts` `desktop/README.md` dagi **fayl nomini** ham
   talab qiladi — README'dagi `Sherset-Kassa-Setup-<versiya>.exe` yozuvlari yangilansin.
2. Yig'ish (Windows'da): `cd desktop && pnpm install --ignore-workspace && pnpm run dist`
   → `dist/Sherset-Kassa-Setup-1.3.0.exe` + `latest.yml` + `.blockmap`.
3. Serverga yuklash: `deploy/nginx-erp.sherset.uz.conf` dagi `location /downloads/` **alias yo'lini
   o'qib**, aynan o'sha katalogga (`/var/www/kassa-downloads/desktop/`) `latest.yml` va `.exe` ni qo'y.
   🔴 Katalog **repo tashqarisida** — deploy `git reset --hard` qiladi.
4. Kanalni tekshir: `curl -I https://erp.sherset.uz/downloads/desktop/latest.yml` → 200 va ichida
   `version: 1.3.0` · `.exe` → 200 va `Content-Length` yasalgan fayl hajmiga teng.
5. **Jonli oqim sinovi (egasi bilan, bitta qurilmada):** 1.2.0 li monoblokda ilovani qayta ishga
   tushirish → `[updater]` logi «yangi versiya yuklab olindi» deyishini kutish → kassir «Chiqish»
   (chap yuqori burchakni 2s ushlash) → **UAC «Ha»** → qayta ochilganda versiya 1.3.0.
   Har qadam natijasi hisobotga yoziladi; birortasi bo'lmasa — «sinalmadi» deb yoziladi.
6. `desktop/README.md` + `NEXT.md` yangilanadi (versiya, o'lchangan oqim, qolgan cheklovlar).
7. Hisobot → **TO'XTA**.

### Ma'lum cheklovlar (hisobotda takrorlansin, "tuzatildi" deb yozilmasin)
- O'rnatish **faqat «Chiqish»** yo'lida (`main.js:273` `quitShell`). Kompyuter shunchaki
  o'chirilsa yangilanish keyingi safarga qoladi.
- `perMachine: true` ⇒ **UAC** kerak. Kassirda admin huquqi bo'lmasa yangilanish o'rnatilmaydi.
  Per-user (`perMachine: false`) ga o'tish qayta o'rnatishni talab qiladi — bu **alohida qaror**,
  bu fazada qilinmaydi.
- Pul yashigi impulsi Electron API'sida yo'q (eski qarz).

### Sessiya prompti (nusxa ol)

```
docs/REJA-KASSIR-EXE-2026-08.md faylini o'qi va FAQAT «FAZA 4 — exe v1.3.0 relizi» ni bajar.
Rejaning §0 «O'zgarmas qoidalar» majburiy.

Tartib: versiya 1.3.0 (README fayl nomlari ham) → pnpm install --ignore-workspace + pnpm run dist
→ latest.yml va .exe ni nginx conf ko'rsatgan katalogga yuklash → curl bilan 200 va versiyani
tasdiqlash → egasi bilan bitta qurilmada 1.2.0 → 1.3.0 o'tishini kuzatish.

«O'rnatish faqat Chiqish da» va «UAC kerak» cheklovlari TUZATILMAYDI — faqat hisobotda qayd etiladi.
Jonli sinov qilinmasa «sinalmadi» deb yoz, «ishlaydi» deb taxmin qilma.

Faza tugagach «HISOBOTLAR» ga F4 hisobotini yoz va ISHNI TO'XTAT.
```

---

## HISOBOTLAR

> Har faza agenti o'z bo'limini shu yerda to'ldiradi. Shablon o'zgartirilmaydi, bo'limlar
> o'chirilmaydi. «Nima qilinmadi» bo'limi bo'sh qolmasin — bo'sh bo'lsa sabab yoziladi.

### Shablon

```
### F<n> — <nom> · <sana> · <commit hash(lar)>
**Holat:** ✅ tugadi / ⚠️ qisman / ❌ bloklandi
**Nima o'zgardi:** (2–5 qator, xulq tilida — «X endi Y qiladi»)
**Fayllar:** (yo'l → nima qilindi)
**Testlar:** (buyruq → natija, raqam bilan: «142 passed»)
**Gate:** typecheck ... · lint:product ... · i18n:gate ... · vitest ...
**Deploy:** qilindi / qilinmadi — sabab; jonli verify dalillari
**Nima QILINMADI:** (ataylab qoldirilgani + sababi; sinalmagani)
**Ochiq xavf / keyingi fazaga eslatma:**
```

### F1 — Kutayotgan ish prodga chiqadi · 2026-08-11 · `eb5dee41 → 992fff98` (11 commit)

**Holat:** ✅ tugadi — **lekin push/deploy'ni bu sessiya QILMADI: ular allaqachon bajarilgan edi.**
Bu sessiya to'liq gate'ni yugurtirdi va deploy'ning haqiqatan tirikligini mustaqil dalil bilan tasdiqladi.

**🔴 Rejaning premisasi eskirgan edi.** Reja «11 commit push qilinmagan» der edi (`git log
sherset/climart-adoption..HEAD`). Aslida lokal **remote-tracking ref eskirgan** edi: `git fetch sherset
climart-adoption` dan keyin `eb5dee41..992fff98` yangilanib, unpushed ro'yxat **bo'sh** chiqdi.
Box'dagi qattiq dalil — `/tmp/deploy.log` oxirgi qatori:
`▶ Deploy done: eb5dee41b646e56d0cd550ea37b90a8bfa7ad29c → 992fff9850e5e79d8a4be406e8088051b9cf4550`
(fayl mtime **2026-08-11 06:54 +0200**), box reflog: `992fff98 HEAD@{2026-08-11 06:50:19 +0200}: reset:
moving to FETCH_HEAD`. Ya'ni oxirgi commit (06:49 +0200) yaratilganidan **1 daqiqa keyin** o'sha sessiya
push+deploy qilgan. Shuning uchun push va deploy **qayta bajarilmadi** — bajarilsa ma'nosiz risk bo'lardi.

**Nima o'zgardi (kodda):** hech nima — bu fazada yangi kod yozilmaydi. O'zgargan yagona fayl `NEXT.md`
(11c entry). Prodda esa F8 (POS'da zakazni to'lash, chek zakazga bog'lanadi) · F9 (POS mijoz kartasi:
telefon qidiruvi, umumiy qarz + reyestr, xarid tarixi, zakazlar) · xodim kartasida PIN qo'yish modali —
uchalasi ham jonli.

**Fayllar:**
- `NEXT.md` → yuqoriga `2026-08-11c` entry qo'shildi (harf kolliziyasi tekshirildi: 11a/11b band, `c` bo'sh)
- `docs/REJA-KASSIR-EXE-2026-08.md` → shu hisobot
- (kod fayllari **tegilmadi**)

**Testlar:**
- `pnpm typecheck` → **10 successful, 10 total** (0 xato)
- `pnpm lint:product` → **0 errors**, 848 warnings (skript siyosati: warning ruxsat)
- `pnpm i18n:gate` → **9 passed** (2 fayl); key-existence 475 fayl, 13003 static `t()` kaliti
- `pnpm --filter @moysklad/web exec vitest run` → **3514 passed | 26 skipped (3540)**, 248 fayl, **0 failed**
- `pnpm --filter @moysklad/api exec vitest run` → **7970 passed | 2 skipped (7972)**, 570 fayl, **0 failed**
  *(reja «kamida retail-sale/customer-order/debt» degan edi — to'liq suite yugurtirildi, chunki diff
  auth · counterparty · permissions · retail-sale · debt · cashier-session ga tegadi)*

**Gate:** typecheck ✅ 0 · lint:product ✅ 0 error · i18n:gate ✅ 9/9 · web vitest ✅ 3514 · api vitest ✅ 7970

**Deploy oldidan tekshiruv (reja §3):**
- Migratsiya: `git diff --name-only sherset/climart-adoption..HEAD -- packages/db/prisma/migrations` → **BO'SH**
- Env: `.env.example` diff'da **yo'q**; qo'shimcha o'lchov — 11 commitda **yangi `process.env.*` o'qishi 0 ta**
  ⇒ POS_PIN_PEPPER klassidagi «jim 502» takrorlanish yo'li yopiq edi
- Ish daraxti: `git status --short` — faqat **untracked** fayllar, begona `modified` yo'q
- Worktree/branch: `git branch --no-merged HEAD` → `main` (alohida deployment) + 3 workflow-worktree shoxi;
  barcha `kassa-f*` shoxlari merge qilingan ⇒ takroriy-ish xavfi yo'q

**Jonli verify (dalillar, «200 qaytdi» dan tashqari):**
| Tekshiruv | Natija |
|---|---|
| Box `git rev-parse HEAD` = lokal HEAD | `992fff98` = `992fff98` ✅ |
| `https://erp.sherset.uz/` | **200** |
| `https://erp.sherset.uz/api/v1/health` | **200** |
| F9: `GET /api/v1/debts/pos/summary/<uuid>` | **401** (bor + qo'riqlangan, 404 EMAS) |
| pm2 `sherset-v2-api` / `sherset-v2-web` | ikkalasi `online`, uptime **309 daqiqa** (deploy restartidan beri uzluksiz) |
| `api.err.log` | oxirgi yozuv **03:37 UTC** = muvaffaqiyatli bootdan (04:55 UTC) OLDINGI POS_PIN_PEPPER hodisasi; undan keyin yangi xato YO'Q |
| `web.err.log` | oxirgi yozuv **2026-08-08** (yangi xato yo'q) |
| Build yangiligi | `.next/BUILD_ID` mtime **06:53 +0200** > oxirgi commit **06:49 +0200** |
| F9 kodi build ichida | `customer_card_title` → `static/chunks/app/(app)/sotuv/page-ef837f5b….js` + `server/app/(app)/sotuv/page.js` |
| F8 kodi build ichida | `orders_pay_no_positions` → o'sha `sotuv` chunk'i + `server/chunks/1099.js` |
| PIN modali build ichida | `pos_pin_title` → `static/chunks/338-57f3e167….js` — ya'ni **oxirgi commit `992fff98` ning FE kodi ham build'da** |

**Nima QILINMADI:**
1. **Push va deploy bajarilmadi** — allaqachon bajarilgani yuqoridagi dalillar bilan tasdiqlangani uchun.
   Qayta deploy = 93% to'lgan diskda keraksiz `next build` riski.
2. **BROWSER-QA YO'Q** — F8/F9/PIN ekranlari brauzerda bosib ko'rilmagan. Reja shuni ataylab fazadan
   tashqarida qoldirgan (egasi qiladi). Ya'ni «marshrut javob beradi + kod build ichida» tasdiqlangan,
   «ekran to'g'ri ishlaydi» **tasdiqlanmagan**.
3. **DB ma'lumot-darajasida tekshirilmadi** — masalan F8 chekining zakazga haqiqatan bog'langani
   prod DB'da o'qib ko'rilmadi (prodda ortiqcha yozuv qoldirmaslik uchun savdo qilinmadi).
4. **`.env.example` tozalanmadi** (quyida) — F1 da yangi kod/o'zgarish yozilmaydi.

**Ochiq xavf / keyingi fazaga eslatma:**
- 🔴 **Disk `/` = 93% band, 7.2G bo'sh** (`/root/sherset-v2-backups` 2.7G / 6 fayl). **F2 va F4 da deploy
  bor va F2 FE build talab qiladi** — deploy'dan oldin eski backup'larni tozala, aks holda `next build`
  joy yetmasligidan yiqilishi mumkin.
- ⚠️ **`apps/api/.env.example` eskirgan.** Box `.env` da yo'q 9 kalit — `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `PASSWORD_HASH_ROUNDS`, `CBRU_API_BASE`,
  `TZ`, `LOG_LEVEL`, `LOG_PRETTY`. **O'lchandi: 0 tasi kodda o'qilmaydi** (`LOG_LEVEL`/`LOG_PRETTY` da
  1 tadan o'quvchi bor, lekin default bilan). Ya'ni auth zaifligi EMAS (JWT sirlarining chinakam
  o'quvchisi yo'q). Lekin bu POS_PIN_PEPPER retseptini (`.env.example` ni box `.env` bilan `comm`
  qilish) **yolg'on-pozitivga to'ldiradi** — keyingi safar farq ko'ringanda «yana o'lik kalit» deb
  o'tkazib yuborish xavfi bor. Tozalash — alohida mayda ish.
- ⚠️ **Lokal remote-tracking ref eskirishi** shu sessiyaning asosiy sabog'i: `git log <remote>..HEAD`
  **`git fetch` siz** ishonchsiz. Keyingi fazalar deploy'dan oldin avval `git fetch` qilsin.
- Prod DB'da **test kassirlari va qoldiq 1000** turibdi (11b entry + xotira) — F2/F4 jonli sinovida
  bu ma'lumotlar sun'iy ekanini yodda tut.

### F2 — Savat qatori tahrir oynasi (sensorli) · 2026-08-11 · `913e3c2a`

**Holat:** ✅ tugadi — kod, gate, deploy va jonli verify bajarildi. **Phase-1: browser-smoke YO'Q.**

**Nima o'zgardi:**
- Savat qatorining **nomini bosish** endi katta numpadli oynani ochadi: soni · narx · «O'chirish» ·
  «Saqlash». Monoblokda 24×24px −/+ tugmalarini 12 marta bosish o'rniga son to'g'ridan-to'g'ri kiritiladi.
- Oyna narx tasmasini (ZARAR / optomdan past / «tushirildi») va qator jamisini **jonli** ko'rsatadi —
  kassir narxni oynada tushirsa, ogohlantirish savatda qolib ketmaydi.
- Savat narxining parse'i **yagona** bo'ldi: sahifa endi to'lov oynasi bilan bir xil
  `parseAmountToMinor(input, tillCurrency)` ishlatadi.
- Zakazga bog'langan (qulflangan) savatda oyna **faqat ko'rish** — qulf mantiqi o'zgarmadi.

**Fayllar:**
| Yo'l | Nima qilindi |
|---|---|
| `apps/web/src/components/pos/cart-line-edit-modal.tsx` | **YANGI** (412 satr) — oyna. `sotuv/page.tsx` ichiga yozilmadi (MK33 qarzi o'smasin) |
| `apps/web/src/components/pos/__tests__/cart-line-edit-modal.test.tsx` | **YANGI** — 18 test (TDD, avval yozildi) |
| `apps/web/src/app/(app)/sotuv/page.tsx` | trigger tugmasi + `editingProductId` holati + `applyLineEdit` + oynani ulash; `updatePrice` parse'i birlashtirildi |
| `apps/web/src/app/(app)/sotuv/__tests__/sales-screen-cart.test.tsx` | +7 test (6 ta ulanish + 1 ta parse-birlashtirish) |
| `apps/web/src/app/(app)/sotuv/__tests__/sales-screen-order-payment.test.tsx` | qulflangan-savat testi niyat darajasiga ko'tarildi (quyida) + 1 yangi test |
| `apps/web/src/__tests__/raw-element-conventions.test.ts` | yangi fayl EXEMPT reyestriga sabab bilan qo'shildi |
| `apps/web/src/messages/{ru,uz}.json` | 4 yangi kalit ×2 til (`line_edit_title/qty/locked/open`) |
| `NEXT.md` · `docs/REJA-KASSIR-EXE-2026-08.md` | `2026-08-11d` entry + shu hisobot |

**Qayta ishlatilgan (yangidan YOZILMAGAN):** `lib/pos/cart-math.ts` → `normalizeQtyDecimal`,
`cartLineRevenueMinor`, `cartLineMarkdownMinor` · `lib/pos/parse-amount.ts` → `parseAmountToMinor` ·
`@moysklad/money` → `classifyPrice` · numpad naqshi `rasmilashtirish-modal.tsx` dan. Ya'ni oynadagi
raqam savat qatoridagi raqam bilan **bir manbadan** keladi.

**Testlar:**
- `vitest run src/components/pos/__tests__/cart-line-edit-modal.test.tsx` → **18 passed**
  (RED avval o'lchangan: modul yo'qligidan yiqildi, keyin har qadam)
- POS to'plami (`sotuv/__tests__` + `components/pos/__tests__` + `lib/pos` + `pos-cart-profit`) →
  **305 passed** (20 fayl)
- To'liq web suite → **3540 passed | 26 skipped (3566)**, 249 fayl, **0 failed**

**Gate:** typecheck ✅ **10/10** · lint:product ✅ **0 error** (849 warning, siyosat bo'yicha ruxsat) ·
i18n:gate ✅ **9/9** (475 fayl, 13004 kalit) · web vitest ✅ **3540**

**Deploy:** ✅ qilindi — `git push sherset climart-adoption` (`3a3aadec..913e3c2a`) →
`DS_TARGET=v2 deploy-smart.sh` → `Deploy done: 992fff98… → 913e3c2a…`.

Jonli verify dalillari:
| Tekshiruv | Natija |
|---|---|
| Box `git rev-parse HEAD` = lokal HEAD | `913e3c2a` = `913e3c2a` ✅ |
| `.next/BUILD_ID` mtime | **2026-08-11 13:22:26 +0200** (deploy'dan keyin) |
| `https://erp.sherset.uz/` · `/api/v1/health` | **200** · **200** |
| Yangi kod **ochiq xizmatda** | `GET /_next/static/chunks/app/(app)/sotuv/page-9052463d….js` → **200, 117 406 b**, ichida `pos-line-edit` |
| Yangi i18n kalitlari build ichida | `line_edit_title` + `line_edit_locked` → sotuv chunk'i + `server/chunks/{1099,5153}.js` + `server/app/(app)/sotuv/page.js` |
| pm2 | `sherset-v2-web` online (restart bo'ldi, uptime 337s) · `sherset-v2-api` online (uptime 23 707s — **restart YO'Q va to'g'ri**: bu commitda backend o'zgarmagan) |
| `api.err.log` / `web.err.log` | oxirgi qatorlar bo'sh — deploy'dan keyin yangi xato yo'q |
| Migratsiya | `No pending migrations to apply` |
| Disk | deploy oldidan **12G bo'sh (88%)** — F1 ogohlantirgan bloker parallel sessiya tomonidan yopilgan (`3a3aadec`) |

**Qabul qilingan qarorlar (reja so'ragan asoslar):**

1. **Mavjud −/+ va ichki narx maydoni QOLDIRILDI** (reja §3 tanlovi). Sabablari: (a) MK32 ularni
   ataylab **xarakteristika** sifatida qulflagan — olib tashlash 8+ testni qayta yozishni talab qilardi
   va MK33 bo'linishining qabul mezonini buzardi; (b) bu ekran sichqonchali ish o'rnida ham ishlatiladi;
   (c) yo'qotish riski real, foyda esa kosmetik. Oyna — **qo'shimcha yo'l**, almashtiruvchi emas.
2. **Trigger = qator NOMI, butun qator EMAS.** Butun qator bosiladigan bo'lsa, ichidagi narx maydoniga
   yoki ± tugmasiga tegish ham oynani ochib yuborardi.
3. **Numpadning birinchi bosishi maydonni ALMASHTIRADI** (kassa terminallarining odatiy xulqi).
   Aks holda kassir avval ⌫ bilan tozalashi kerak bo'lardi — ya'ni oyna hal qilayotgan muammoning
   o'zi qaytardi. `⌫` bu rejimni uzadi (u aynan mavjud qiymatni tahrirlash uchun).
4. **Miqdor maydoni `type="text"`** (`number` EMAS): `number` oraliq «1.» holatini yeydi va kasr
   miqdor kiritib bo'lmasdi (FE-02 sabog'i).

**Parse birlashtirish — O'LCHANGAN farq (reja §4: «avval o'lchab, keyin o'zgartir»):**

Eski: `BigInt(Math.round(Number.parseFloat(input…) * 100))` · Yangi: `parseAmountToMinor(input, tillCurrency)`

| Kiritma | Eski | Yangi | |
|---|---|---|---|
| `10000` · `10.5` · `1 000` · `10,50` · `10.999` · `abc` · `''` · `-5` · `00012` | bir xil | bir xil | 9 holat mos |
| `12abc` | **1 200** | **0** | ekranda «12abc», chekka 12 so'm ketardi |
| `.5` | 50 | 0 | |
| `15,000.50` | 1 500 | 0 | aralash guruh-ajratgich |
| 0 kasrli valyuta (JPY) `10000` | **1 000 000** | **10 000** | `× 100` qattiq scale — narx 100× shishardi |

Uch farqning hammasi **qat'iyroq** yo'nalishda va K-3 shartnomasining ruhiga mos («ko'ringan narsa =
yuboriladigan narsa»). Scale farqi hozir uxlab yotgan bug: `tillCurrency` `session.cashDesk.currency`
dan keladi va u istalgan `CurrencyCode` bo'lishi mumkin.

**🔴 O'LCHANGAN FAKT — qulflangan savat erishilmas:** `payingOrderId` FAQAT `setCheckoutOpen(true)`
bilan birga qo'yiladi (`page.tsx:1416/1420`) va rasmiylashtirish oynasi yopilganda darhol tozalanadi
(`page.tsx:2889-2893`). Ya'ni **qulflangan savat har doim ochiq modal ortida turadi** — Radix fon
ustiga `pointer-events: none` qo'yadi va qatorni bosib bo'lmaydi. Shuning uchun:
- oynaning `readOnly` shartnomasi **komponent darajasida** qulflandi (2 test), sahifa darajasida esa
  faqat trigger mavjudligi tekshiriladi — «bosib ochish» testi jismonan imkonsiz edi va uni majburlash
  yolg'on-yashil test bo'lardi;
- `readOnly={cartLocked}` ulanishi — **himoya qatlami** (hozir erishilmas yo'l), qulfning ikkinchi
  eshigi ochilib qolmasligi uchun.

**Nima QILINMADI:**
1. **BROWSER-SMOKE / QURILMA SINOVI YO'Q.** Oyna real monoblokda (yoki umuman brauzerda) bosib
   ko'rilmagan — hammasi jsdom testlari va prod chunk grep'i. «Marshrut javob beradi + kod build
   ichida» tasdiqlangan; «kassir barmog'i bilan ishlaydi» **tasdiqlanmagan**. Egasi sinaydi.
2. **Chegirma oynaga chiqarilmadi** — qator-darajasidagi chegirma hozir savatda ham yo'q (u chek
   darajasida), ya'ni bu yangi funksiya bo'lardi. Reja so'ramagan.
3. **Miqdor uchun «Aniq summa» ekvivalenti (qoldiq bo'yicha auto-to'ldirish) qo'shilmadi** — savat
   qatori uchun ma'nosiz (qoldiq tushunchasi yo'q).
4. **`sotuv/page.tsx` bo'linmadi (MK33)** — F2 doirasidan tashqarida; yangi kod ataylab tashqariga
   chiqarildi, ya'ni qarz **o'smadi** (sahifa +102 satr: trigger, holat, ulanish, izohlar).
5. **API testlari yugurtirilmadi** — bu commitda `apps/api` ga tegilmagan (0 fayl). Web-only gate
   yetarli (`web-only-gate-misses-api-guards` xotirasi teskari yo'nalishda: bu yerda API diff YO'Q).
6. **Sahifadagi eski inline narx maydoni saqlanib qoldi** — yuqoridagi 1-qaror bo'yicha ataylab.

**Ochiq xavf / keyingi fazaga eslatma:**
- ⚠️ **Rasmiylashtirish oynasi yopilganda savat pozitsiyalari QOLADI, zakaz bog'lanishi esa uziladi**
  (`page.tsx:2889-2893`). Ya'ni zakazdan yuklangan tovarlar oddiy chek bo'lib sotilishi mumkin
  (zakazga bog'lanmagan holda). Bu **qulf chetlab o'tilishi EMAS** (chek zakazga umuman ulanmaydi),
  lekin xulq hujjatlashtirilmagan edi — F2 da o'lchandi, o'zgartirilmadi.
- ⚠️ Oyna narx maydonida **12 belgi chegarasi** bor (`MAX_LEN`). 12 xonali narx = 10 mlrd so'm;
  amalda yetarli, lekin bu jim chegara — kassir 13-raqamni bossa hech nima bo'lmaydi.
- 🔴 **F3 (qobiq klaviaturasi) uchun to'g'ridan-to'g'ri bog'liqlik:** bu oynadagi maydon
  `inputMode="decimal"` — F3 rejasining 1-bandi aynan shu atributga qarab **numpad layout** tanlaydi.
  Ya'ni F3 dan keyin monoblokda bu maydonga fokus tushganda qobiqning QWERTY klaviaturasi emas,
  numpad chiqishi kerak. F3 sinovida shu ekranni tekshirish arzon va aniq mezon.
- Prod DB'da hamon **test kassirlari va qoldiq 1000** turibdi (11b/11c entry) — qurilma sinovida
  bu ma'lumotlar sun'iy ekanini yodda tut.

### F3 — ☐ hali bajarilmagan

### F4 — ☐ hali bajarilmagan
