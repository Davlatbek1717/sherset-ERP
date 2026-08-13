# Faza F7 — Mijoz-ekran barqarorligi · 2026-08-13 · `bc493869`

**Holat:** ✅ to'liq (Phase-1: strukturaviy, runtime-tasdiqlanmagan)

**Yopilgan ID'lar:** K19, K20

**Nima o'zgardi:**
- **K19** — mijoz-ekran «ochiq» holati endi `kassa-config.json` da saqlanadi
  (`device-store.js` → `get/setCustomerDisplayOpen`). Qobiq qayta ishga tushganda
  (`app.whenReady`, `createWindow()` dan keyin) holat `true` bo'lsa ekran o'zi ochiladi —
  ilgari yangilanish/elektr uzilishidan keyin kassir tugmani qayta bosishi kerak edi.
- **K20** — `did-fail-load` da oyna endi darhol yopilmaydi: 3 martagacha (har 3 soniyada)
  qayta yuklashga urinadi, muvaffaqiyatli yuklanishda hisoblagich nolga qaytadi. Chegaradan
  oshsa yopiladi (mijoz ekranida Chrome xato sahifasi osilib qolgandan ko'ra o'chiq ekran yaxshi)
  va har urinish `logger.write('cfd', …)` bilan faylga yoziladi (F2 dan foydalanadi).
- `closeCustomerDisplay(remember = true)` — ilova-yopilish yo'llarida `false` uzatiladi
  (xotira qoladi), kassirning ataylab yopishida (`toggleCustomerDisplay`) default `true`
  (xotira o'chadi).

**Fayllar:**

| Yo'l | Nima qilindi |
|---|---|
| `desktop/device-store.js` | `getCustomerDisplayOpen` / `setCustomerDisplayOpen` + eksport |
| `desktop/main.js` | `CFD_RETRY_LIMIT/DELAY`, `cfdRetries`, retry-ishlovchi, holat saqlash/tiklash, `remember` parametri, 4 chaqiruvchi yangilandi |
| `apps/web/src/__tests__/electron-bridge-contract.test.ts` | K19 va K20 qo'riqchi testlari (mijoz-ekran describe'ida) |
| `docs/progress.json` | pre-commit hook avto-yangilagan `generatedAt` (qo'lda tegilmagan) |

**Testlar:** 2 yangi (K19, K20) — ikkalasi ham avval **RED ko'rildi** (aynan shu 2 test yiqildi,
qolgan 83 yashil), implementatsiyadan keyin 85/85 yashil.

**Gate:** typecheck ✅ (10/10 task) · lint:product ✅ (0 xato, 1042 warning — siyosat ruxsat beradi) ·
i18n:gate ✅ (19/19) · web vitest ✅ (268 fayl, 3823 o'tdi, 26 skip). `apps/api`/`packages/db` ga
tegilmadi — api testi shart emas. Qo'shimcha: `node --check` ikkala desktop faylga toza.

**O'LCHANGAN vs O'LCHANMAGAN:**
- ✅ o'lchangan: TDD RED→GREEN sikli (fokus-suite 2 marta yugurtirildi); to'liq gate to'rttala
  buyruq bilan; commit tarkibi `git show --stat HEAD` bilan tekshirildi.
- ⚠️ o'lchanmagan (hammasi F8 qurilma-sinoviga qoladi): reboot'dan keyin ekranning o'zi
  ochilishi (O'lchov varaqasi #15); tarmoq uzilganda retry'ning real ishlashi; yangilanish
  o'rnatilgach tiklanish; ikkinchi monitor bilan har qanday jonli xulq. Electron jarayoni
  umuman ishga tushirilmadi.

**Nima QILINMADI va nega:**
- Runtime/qurilma sinovi — F8 ga tegishli (Global cheklovlar: F1–F7 deploy/exe yig'ish TAQIQ).
- `preload-customer.js` va `customer-display/` sahifasiga tegilmadi (faza-maxsus TAQIQ).
- `partition` qo'shilmadi — qo'riqchi test buni bloklaydi, umumiy cookie sessiyasi saqlanadi.

**Keyingi fazaga eslatma / ochiq xavf:**
- 🔴 Reja «UCHALA chaqiruvchi» degan edi, aslida **TO'RTINCHI** ham bor edi: boot-yangilanish
  yo'li (`app.whenReady` ichidagi `setTimeout` → `installOnBoot`). U ham `false` bilan yangilandi —
  aks holda K19 ning asosiy stsenariysi (yangilanishdan keyin tiklash) aynan yangilanish yo'lining
  o'zida buzilardi. F8 sinovida aynan shu yo'l tekshirilsin (varaqa #15 + #16 birga).
- Retry-chegara oshib oyna yopilsa xotira ham o'chadi (`remember=true` — reja shunday buyurgan):
  keyingi boot'da avto-tiklanish BO'LMAYDI, kassir tugmani bosadi. Bu ataylab, bug emas.
- Preflight 2 anomaliya ko'rsatdi: untracked fayllar (oldingi sessiyalar artefaktlari — tegilmadi)
  va NEXT.md 1 kun orqada (kassa fazalari hisobotni `docs/audits/` ga yozadi — kutilgan drift).

**TO'XTADIM.** Keyingi faza — F8 (reliz 1.5.0 + qurilmada Phase-2 QA, operator bilan birga).
Uni boshlash uchun yangi sessiya kerak.
