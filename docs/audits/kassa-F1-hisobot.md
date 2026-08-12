# Faza F1 — Yangilanish yetkazish kanali · 2026-08-13 · efae4c5f

Reja: `docs/superpowers/plans/2026-08-13-kassa-exe-barqarorlik.md` → «F1».

**Holat:** ✅ to'liq (Phase-1: strukturaviy, runtime-tasdiqlanmagan)

**Yopilgan ID'lar:** K01, K02, K03

**Nima o'zgardi:**
- **K01** — o'rnatish endi «Chiqish» yo'lidan tashqari **boot oynasida** ham bo'ladi:
  `app.whenReady` ilova ochilgach `updater.waitForPending(25000)` bilan yuklab olingan
  yangilanishni kutadi va oyna **hamon kirish ekranida** (`onEntryScreen()` —
  URL `/kassa-kirish` bilan tugaydi) tursagina `installOnBoot()` chaqiradi. Kassir PIN
  kiritib savdoga o'tgan bo'lsa — keyingi bootga qoladi. Sabab: kassir «Chiqish» ni hech
  qachon bosmaydi (monoblok tugmadan o'chiriladi), yangilanish qurilmaga yetmasdi.
- **K02** — boot yo'lida `quitAndInstall(true, **true**)` (`isForceRunAfter=true`) —
  o'rnatgach kassa **o'zi qaytadi**. «Chiqish» yo'lida `false` qoladi (kassir yopishni
  so'ragan). Ikkala yo'l yagona `runInstaller(relaunchAfter)` nuqtasidan o'tadi —
  manbada `quitAndInstall` AYNAN BIR marta (qo'riqchi shuni qulflaydi).
- **K03** — `build.nsis.perMachine: false` (per-user, `%LOCALAPPDATA%`) — UAC butunlay
  yo'qoladi; kassirda admin huquqi yo'q edi, per-machine o'rnatish amalda doim to'xtab
  qolardi. 🔴 Narxi: 1.4.0 → 1.5.0 o'tishi avtomatik BO'LMAYDI — har qurilmada bir marta
  qo'lda (README'da alohida bo'lim).
- Boot-o'rnatishda kassir qora ekran o'rniga `updating.html` («Yangilanish
  o'rnatilmoqda… kassa o'zi qaytadi») ko'radi; 1.2 s dan keyin `allowQuit=true`,
  mijoz-ekran yopiladi, o'rnatuvchi ishga tushadi.
- Versiya `1.4.0` → `1.5.0` (faqat `desktop/package.json` — yagona manba).

**Fayllar:**

| Yo'l | Nima qilindi |
|---|---|
| `desktop/updater.js` | `installOnQuit` → yagona `runInstaller(relaunchAfter)` + `installOnQuit`/`installOnBoot` o'ramlari; yangi `waitForPending(ms)`; exports yangilandi; bosh-izoh va log matni yangi ikki-yo'lli shartnomaga moslandi |
| `desktop/main.js` | `BOOT_UPDATE_WAIT_MS=25000`, `onEntryScreen()`, `app.whenReady` async boot-o'rnatish oqimi (kutish → kirish-ekrani sharti → updating.html → installOnBoot) |
| `desktop/package.json` | `version: 1.5.0`, `build.nsis.perMachine: false` — boshqa maydonlarga tegilmadi |
| `desktop/updating.html` | YANGI — «yangilanmoqda» ekrani (CSP `default-src 'none'; style-src 'unsafe-inline'`) |
| `desktop/README.md` | holat-sarlavha 1.5.0; installer nomi `Sherset-Kassa-Setup-1.5.0.exe`; yangi «1.4.0 → 1.5.0 qo'lda o'tish» bo'limi; eskirgan perMachine/UAC/«faqat Chiqishda» da'volari tuzatildi; reliz jadvaliga 1.5.0 qatori; fayllar jadvaliga updating.html |
| `apps/web/src/__tests__/kassa-installer-config.test.ts` | 2 test niyat-izohi bilan QAYTA yozildi (perMachine=false; quitAndInstall bir marta + runInstaller ostida), 3 yangi test (ikkala yo'l runInstaller orqali; boot qayta ochadi; boot faqat kirish ekranida). Hech biri o'chirilmadi/skip qilinmadi |
| `docs/progress.json` | ⚠️ MEN STAGE QILMAGANMAN — pre-commit hook o'zi qayta generatsiya qilgan, diff faqat `generatedAt` vaqt muhri (2 qator). Zararsiz, parallel sessiya ishi emas (commit oldi `git status` da toza edi) |

**Testlar:** 3 yangi + 2 qayta yozilgan; RED **ko'rildi** — qayta yozishdan keyin 5 FAIL
(perMachine=true; runInstaller yo'q; installOnBoot yo'q ×2; waitForPending yo'q), implementatsiyadan
keyin 33/33 PASS. Qo'riqchining boshqa 28 testi o'zgarmagan holda yashil.

**Gate:** typecheck ✅ 0 · lint:product ✅ 0 xato (1042 warn — siyosat ruxsat beradi) ·
i18n:gate ✅ 19/19 · web vitest ✅ 267 fayl, 3792 pass / 26 skip. API/db ga tegilmagan.
Commit `efae4c5f`, `git show --stat HEAD` tekshirildi (yuqoridagi progress.json qaydi bilan).

**O'LCHANGAN vs O'LCHANMAGAN:**
- ✅ o'lchangan: qo'riqchi test RED→GREEN sikli (5 FAIL → 33 PASS, aynan yugurtirildi);
  to'liq gate to'rttala buyrug'i shu daraxtda yugurtirildi va yashil.
- ⚠️ o'lchanmagan (OCHIQ): **boot-o'rnatish oqimi hech qanday qurilmada
  yugurtirilmagan** — `waitForPending` → `updating.html` → `installOnBoot` → «o'zi qaytdi»
  zanjiri jonli KO'RILMAGAN; **per-user (perMachine=false) o'rnatma sinalmagan**;
  **`.exe` yig'ilmagan**, kanalga hech narsa qo'yilmagan; `updating.html` ekrani hech
  qayerda renderlab ko'rilmagan; electron-updater'ning keshdan `update-downloaded`
  otish tezligi (25 s yetadimi) o'lchanmagan; `getURL().endsWith('/kassa-kirish')`
  sharti real navigatsiyada (query/trailing-slash holatlari) tekshirilmagan — mos kelmasa
  xavfsiz tomonga og'adi (o'rnatilmaydi, keyingi bootga qoladi).

**Nima QILINMADI va nega:**
- `.exe` yig'ilmadi, deploy/kanalga yuklash yo'q — faza-taqiq (F8 da, operator ruxsati bilan).
- `preload.js`, `device-store.js`, `preload-customer.js` ga tegilmadi — faza-taqiq.
- `package.json` → `build.publish[0].url` (build-vaqt default domeni) ga tegilmadi —
  ruxsat ro'yxatidan tashqari maydon; runtime'da baribir qurilma serveri ishlatiladi.
- Rejadagi 1.10 «`docs/REJA-KASSA-EXE-2026-08.md` yarat» o'rniga protokolning
  «har fazaga O'Z fayli» qoidasi va dispatch-prompt bo'yicha shu fayl yozildi
  (REJA fayli — F8 yig'ma hisoboti).

**Keyingi fazaga eslatma / ochiq xavf:**
- 🔴 **Birinchi hop qo'lda:** 1.4.0 (per-machine) turgan qurilmalar 1.5.0 ni avto
  OLMAYDI — NSIS per-machine↔per-user almasha olmaydi. Har qurilmada: 1.4.0 ni
  o'chirish → 1.5.0 ni qo'lda o'rnatish (README «1.4.0 → 1.5.0» bo'limi). F8 rejasida bor.
- F2 `updater.isUpdateReady()` ni iste'mol qiladi — interfeys o'z joyida, o'zgarmadi.
- Boot kutish oynasi 25 s: yangilanish katta bo'lsa birinchi bootda ulgurmasligi mumkin —
  u holda fon-yuklab olish tugaydi va KEYINGI bootda keshdan o'rnatiladi (dizayn shu).
- `updating.html` dan keyin o'rnatish muvaffaqiyatsiz bo'lsa (runInstaller false qaytarsa)
  oyna updating ekranida qoladi — kassir uchun chiqish yo'li: qurilmani qayta yoqish
  (keyingi boot normal `loadApp`). Bu holat ham qurilmada o'lchanmagan.

**TO'XTADIM.** Keyingi faza — F2 (qurilma ko'rinuvchanligi). Uni boshlash uchun yangi sessiya kerak.
