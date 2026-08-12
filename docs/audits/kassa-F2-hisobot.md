# Faza F2 — Qurilma ko'rinuvchanligi (qobiq tomoni) · 2026-08-13 · `7feea9d2`

Reja: `docs/superpowers/plans/2026-08-13-kassa-exe-barqarorlik.md` → F2 (2.1–2.11)

**Holat:** ✅ to'liq (Phase-1: strukturaviy, runtime-tasdiqlanmagan)

**Yopilgan ID'lar:** K05, K06

**Nima o'zgardi:**
- **K05 — fayl-log.** `desktop/logger.js` (yangi): `%APPDATA%/<app>/kassa.log`, 0.5 MB da
  `kassa.log.1` ga rotatsiya, yozuv xatosi jim yutiladi (log yordamchi, mahsulot emas).
  `updater.js` ning barcha `log()` chaqiruvlari endi faylga boradi; `main.js` uch nuqtada yozadi:
  offline sabab, chop xatolari (ikkala `catch`), ishga tushish versiyasi.
- **K06 — versiya ekranda.** Yangi IPC `shell:status` (main) + `electronAPI.shellStatus()` (preload)
  `{version, updateReady, defaultPrinter}` qaytaradi. `<ShellVersionBadge />` kirish ekranining
  burchagida versiya · sukut printer (yo'q bo'lsa OCHIQ «printer tanlanmagan») · «yangilanish
  tayyor» belgisini chizadi. Brauzerda (qobiqsiz) hech narsa chizilmaydi; eski 1.4.0 qobiqda
  (`shellStatus` yo'q) faqat versiya ko'rinadi, qulamaydi (`shellStatus?` optional).
- `offline.html` pastida qobiq versiyasi — aloqa yo'q paytda ham operator versiyani so'ray oladi.

**Fayllar:**

| Yo'l | Nima qilindi |
|---|---|
| `desktop/logger.js` | YANGI — faylga log + rotatsiya (K05) |
| `desktop/updater.js` | `log()` → `logger.write('updater', …)` |
| `desktop/main.js` | logger ulandi (shell/print), `shell:status` IPC |
| `desktop/preload.js` | `shellStatus()` ko'prigi |
| `desktop/offline.html` | versiya qatori (`electronAPI.version`) |
| `apps/web/src/components/pos/shell-version-badge.tsx` | YANGI — K06 belgisi |
| `apps/web/src/components/pos/__tests__/shell-version-badge.test.tsx` | YANGI — 6 test, RED ko'rilgan |
| `apps/web/src/app/kassa-kirish/page.tsx` | `<ShellVersionBadge />` ulandi |
| `apps/web/src/lib/print-agent.ts` | `ElectronBridge.shellStatus?` (optional) |
| `apps/web/src/__tests__/electron-bridge-contract.test.ts` | +5 logger qo'riqchisi (K05); `shellStatus`/`shell:status` avtomatik qamrovga kirdi (73→75) |
| `apps/web/src/__tests__/i18n-no-hardcoded.test.ts` | ⚠️ ruxsat-ro'yxatdan TASHQARI, 1 qator (pastda) |
| `apps/web/src/messages/{ru,uz}.json` | `pages.pos.shell_printer_missing` / `shell_update_ready` |

**Testlar:** yangi 11 (5 logger-qo'riqchi + 6 badge). Ikkala guruh ham avval RED ko'rilgan:
logger-qo'riqchilar 5 FAIL (68 pass fonida), badge testi «Cannot find module» bilan yiqilgan,
keyin implementatsiya bilan GREEN. Kontrakt qo'riqchisi manbadan o'qigani uchun `shellStatus`
a'zosi va `shell:status` kanali testlari o'zi paydo bo'ldi (75/75).

**Gate:** typecheck ✅ · lint:product ✅ (0 xato) · i18n:gate ✅ (19/19) · web vitest ✅
(268 fayl, 3805 passed, 26 skipped — regress yo'q). api vitest yugurtirilmadi (apps/api ga tegilmagan).

**Rejadan chetlanishlar (3, hammasi majburiy):**
1. **`i18n-no-hardcoded.test.ts` +1 qator** — ruxsat etilgan fayllar ro'yxatida YO'Q edi. Sabab:
   p8 (`615ca8a0`) qo'shgan registr qo'riqchisi `components/pos/` dagi HAR yangi faylni
   `POS_DONE_FILES` ga yozishni talab qiladi, aks holda i18n:gate qizil — commit mumkin emas.
   Reja p8 dan oldin yozilgan, ro'yxat buni ko'zda tutmagan. Qo'riqchi o'chirilmagan/yumshatilmagan,
   faqat yangi fayl registrga qo'shilgan (qo'riqchining o'z talabi).
2. **Namespace `pos` → `pages.pos`** — rejadagi `useTranslations('pos')` bu repoda mavjud emas;
   barcha POS komponentlari `pages.pos` ishlatadi, kalitlar ham o'sha yerga qo'yildi.
3. **Badge testi `NextIntlClientProvider` bilan o'raldi** (repo konvensiyasi, `pin-keypad.test.tsx`
   kabi) — mock emas, haqiqiy `uz.json`; kalit yo'qolsa test qizaradi. Rejadagi yalang'och
   `render()` provider-xatosi bilan yiqilardi.

**O'LCHANGAN vs O'LCHANMAGAN:**
- ✅ o'lchangan: RED→GREEN ikkala test guruhi uchun; to'liq gate (yuqoridagi raqamlar);
  commit tarkibi `git show --stat HEAD` bilan tekshirildi — 13 staged fayl + `docs/progress.json`
  (bu begona emas: repo'ning o'z `pre-commit` hook'i har commitda avto-qo'shadi, faqat
  `generatedAt` yangilangan).
- ⚠️ o'lchanmagan (hech qanday qurilmada yugurtirilmagan): `kassa.log` fayli real qurilmada
  yozilishi/rotatsiyasi; `shell:status` IPC javobi jonli Electron'da; badge'ning real kiosk
  ekranidagi ko'rinishi; `getPrintersAsync` sukut printer aniqlashi; offline ekrandagi versiya
  qatori; eski 1.4.0 qobiq bilan moslik (testda simulyatsiya qilingan, qurilmada emas).
  `.exe` yig'ilmagan. Bularning jonli tekshiruvi — F8.

**Nima QILINMADI va nega:**
- `apps/api` / `packages/db` — F3 ishi (TAQIQ); `device-store.js` — TAQIQ; chek shablonlariga
  (`buildSheetHtml`/`buildReceiptHtml`) tegilmadi — faqat interfeys kengaydi.
- Log ko'rish UI'si yo'q — reja qamrovida emas; log fayl operator tomonidan qurilmada ochiladi.

**Keyingi fazaga eslatma / ochiq xavf:**
- F3 `window.electronAPI.version` ni allaqachon mavjud 1.4.0 ko'prigidan oladi — F2 ni kutmaydi,
  worktree'da parallel bajarilishi mumkin (reja o'zi shunday deydi).
- `shell:status` `win?.webContents` orqali printer so'raydi — oyna hali ochilmagan holda chaqirilsa
  `defaultPrinter: ''` qaytadi (catch ichida), bu jim degradatsiya ATAYLAB.
- `logger.write` sinxron (`appendFileSync`) — chastotasi past (offline/print-xato/boot) bo'lgani
  uchun muammo kutilmaydi, lekin o'lchanmagan.

**TO'XTADIM.** Keyingi faza — F3 (qurilma reyestri, server tomoni). Uni boshlash uchun yangi
sessiya kerak.
