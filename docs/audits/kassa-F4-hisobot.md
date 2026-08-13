# Faza F4 — Kiosk qattiqligi + watchdog · 2026-08-13 · `74500427`

**Holat:** ✅ to'liq (Phase-1: strukturaviy, runtime-tasdiqlanmagan)

**Yopilgan ID'lar:** K08, K09, K10, K11, K12

**Nima o'zgardi:**
- **K08** — `applyAutoStart()`: Windows'ga kirganda kassa o'zi ochiladi
  (`app.setLoginItemSettings`). Faqat `app.isPackaged` holatda — dasturchi
  mashinasining avtoyuklanishiga yozilib qolmasin (qo'riqchi test shu shartni
  ham qulflaydi).
- **K09** — `keepScreenAwake()`: `powerSaveBlocker.start('prevent-display-sleep')` —
  monoblok ekrani 10 daqiqada uxlab, kassir «kompyuter o'chib qoldi» deb
  o'ylamasin.
- **K10** — `preload.js` → `lockZoom()`: `webFrame.setVisualZoomLevelLimits(1, 1)` —
  sensorli pinch-zoom layoutni buzolmaydi. `preventDefault` ISHLATILMAGAN
  (desktop-touch-keyboard K3 qo'riqchisi bilan zid emas).
- **K11** — `render-process-gone` da darhol `loadApp()` CHEKSIZ SIKL edi. Endi
  1 daqiqalik oynada 3 urinish (`RELOAD_LIMIT`/`RELOAD_WINDOW_MS`), keyin
  `showOffline('Sahifa qayta-qayta yiqilmoqda')` — kassir tushunarli ekran
  ko'radi, har yiqilish `logger.write('shell', …)` bilan faylga yoziladi.
- **K12** — `desktop/tools/watchdog/`: `kassa-watchdog.ps1` (jarayon o'lik bo'lsa
  exe'ni qayta ochadi, logga yozadi) + `install-watchdog.ps1` (Task Scheduler'ga
  har-2-daqiqa yozuvi). README'da o'rnatish/o'chirish/log bo'limi.

**Fayllar:**

| Yo'l | Nima qilindi |
|---|---|
| `desktop/main.js` | `powerSaveBlocker` import, `applyAutoStart`/`keepScreenAwake` (whenReady'da chaqiriladi), `RELOAD_LIMIT` crash-backoff |
| `desktop/preload.js` | `webFrame` import + `lockZoom()` (`installShellHelpers` boshida) |
| `desktop/tools/watchdog/kassa-watchdog.ps1` | YANGI — jarayon-tekshirish + qayta ochish + log |
| `desktop/tools/watchdog/install-watchdog.ps1` | YANGI — Task Scheduler ro'yxatga olish (F8 da qurilmada yugurtiriladi) |
| `desktop/README.md` | «Watchdog» bo'limi + fayllar jadvaliga qator |
| `apps/web/src/__tests__/electron-bridge-contract.test.ts` | «kiosk qattiqligi (F4)» describe — 5 qo'riqchi test |
| `docs/progress.json` | MEN STAGE QILMAGANMAN — repo hook'i har commit'da qayta generatsiya qiladi (faqat `generatedAt`); F1–F3 commit'larida ham shunday |

**Testlar:** 5 yangi qo'riqchi test (K08–K12). RED ko'rildi: implementatsiyadan
OLDIN yugurtirilib **aynan 5 FAIL / 75 PASS**; implementatsiyadan keyin
**80/80 PASS**. Hech bir mavjud test o'chirilmagan/skip qilinmagan.

**Gate:** typecheck ✅ (10/10 task) · lint:product ✅ (0 xato, 1042 warn — policy ruxsat) ·
i18n:gate ✅ (19/19) · web vitest ✅ (268 fayl, 3810 pass / 26 skip)

**O'LCHANGAN vs O'LCHANMAGAN:**
- ✅ o'lchangan: qo'riqchi test RED→GREEN sikli (5 FAIL → 80/80); to'liq gate
  (yuqoridagi natijalar); commit tarkibi `git show --stat HEAD` bilan
  solishtirildi (7-fayl `docs/progress.json` — hook artefakti, yuqorida).
- ⚠️ o'lchanmagan (Phase-1, hech biri qurilmada sinalmagan):
  - **Hech bir `.ps1` yugurtirilmagan** — bu mashinada ham, qurilmada ham.
    Task Scheduler yozuvi YARATILMAGAN (faza-TAQIQ bo'yicha; F8 da qurilmada).
  - **Watchdog'dagi exe yo'li TAXMIN**
    (`%LOCALAPPDATA%\Programs\sherset-kassa\Sherset Kassa.exe`) — per-user NSIS
    o'rnatma papkasi **F8 da qurilmada o'lchanadi**; jarayon nomi
    `'Sherset Kassa'` ham shunga o'xshash taxmin (productName'dan).
  - `setLoginItemSettings`, `powerSaveBlocker`, `setVisualZoomLevelLimits`,
    crash-backoff — birortasi jonli Electron'da/qurilmada yugurtirilmagan;
    tekshiruv faqat manba-matn darajasida (qo'riqchi testlar).
  - `app.isPackaged` sharti runtime'da tekshirilmagan (dev mashinada
    yoqilmasligi — kod o'qishidan kelgan xulosa).

**Nima QILINMADI va nega:**
- `.ps1` skriptlar ijrosi va Task Scheduler yozuvi — faza-maxsus TAQIQ (F8 qurilma ishi).
- Global `user-select: none` — ataylab qamrovdan tashqari (K3 qo'riqchisi bilan
  to'qnashardi), rejadagi qaror.
- `apps/*` kodiga (qo'riqchi testdan boshqa) tegilmagan; `.exe` yig'ilmagan;
  deploy yo'q; versiya ko'tarilmagan (F1 da 1.5.0 bo'lgan).

**Keyingi fazaga eslatma / ochiq xavf:**
- F8 da: (1) per-user o'rnatmadan keyin haqiqiy exe yo'lini o'lchab
  `kassa-watchdog.ps1` dagi yo'lni tasdiqlash/tuzatish; (2) jarayon nomini
  `Get-Process` bilan tekshirish; (3) `install-watchdog.ps1` ni qurilmada
  yugurtirib, Task Manager'dan jarayonni o'ldirib 2 daqiqada qayta ko'tarilishini
  sinash; (4) autostart — qurilmani qayta yoqib tekshirish.
- Watchdog + autostart birga ishlaganda ikki nusxa ochilish xavfi yo'q:
  `requestSingleInstanceLock` ikkinchisini yopadi (bu ham o'lchanmagan).
- Preflight'dagi 2 anomaliya (untracked artefaktlar, NEXT.md drift) — kassa
  faza-konveyeri bilan izohlanadi, tegilmadi.

**TO'XTADIM.** Keyingi faza — F5 (ekran klaviaturasi: Enter, o'qlar). Uni
boshlash uchun yangi sessiya kerak; F5 dan OLDIN kbd-probe o'lchovi majburiy.
