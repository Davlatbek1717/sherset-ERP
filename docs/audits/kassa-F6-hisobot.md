# Faza F6 — Chop etish ishonchliligi · 2026-08-13 · `ef60b533`

**Holat:** ✅ to'liq (Phase-1: strukturaviy, runtime-tasdiqlanmagan)

**Yopilgan ID'lar:** K16, K17 (K18 ning ekran tomoni F2 da yopilgan edi — bu fazada qo'shimcha ish talab qilinmadi)

**Nima o'zgardi:**
- **K16** — `resolvePageSize` endi balandlikni o'lchashdan OLDIN `document.fonts.ready` ni kutadi.
  Sabab: `loadFile` HTML/rasm bilan tugaydi, web-shrift kechroq keladi va matn balandligini
  o'zgartiradi — kutilmasa `scrollHeight` kichik chiqib chek oxiri kesilardi (faqat qog'ozda
  ko'rinadigan bug-klass). Kutish `FONTS_TIMEOUT_MS = 3000` bilan CHEKLANGAN: shrift kelmasa chek
  baribir bosiladi va `logger.write('print', …)` ga iz qoladi (F2 logi).
- **K17** — `openInternalPopup` endi YAGONA oynani (`printPopup`) qayta ishlatadi: ochiq bo'lsa
  `loadURL` + `focus`, yopilganda `closed` hodisasi holatni `null` ga qaytaradi. Ilgari har chop
  urinishi yangi oyna ochardi va kiosk ustida oynalar to'planardi. Kassir oynasi yopilganda popup
  ham `destroy()` qilinadi.
- Chek SHABLONIGA (print-agent.ts: buildSheetHtml/buildReceiptHtml/buildSheetText/renderZReceiptHtml)
  TEGILMADI; `MIN_HEIGHT_MICRONS`/`TAIL_MICRONS` o'zgarmadi (faza-maxsus taqiqlar bajarildi).

**Fayllar:**

| Yo'l | Nima qilindi |
|---|---|
| `desktop/main.js` | `FONTS_TIMEOUT_MS` konstantasi; `resolvePageSize` da shrift kutish; `printPopup` modul holati; `openInternalPopup` yagona-oyna; `win.on('closed')` da popup destroy |
| `apps/web/src/__tests__/electron-bridge-contract.test.ts` | 3 yangi qo'riqchi test (K16 shrift-kutish, FONTS_TIMEOUT_MS chegara, K17 yagona popup) |
| `docs/progress.json` | pre-commit hook avtomatik yangilaydi (faqat `generatedAt`) — qo'lda tegilmagan |

**Testlar:** 3 yangi test; uchchalasi ham avval **RED** ko'rildi (3 failed | 80 passed), implementatsiyadan keyin 83/83 PASS. Hech bir mavjud test o'chirilmadi/skip qilinmadi.

**Gate:** typecheck ✅ (10/10 task) · lint:product ✅ (0 error) · i18n:gate ✅ (19/19) · web vitest ✅ (268 fayl, 3821 passed | 26 skipped). `apps/api`/`packages/db` ga tegilmadi — api suite talab qilinmadi.

**O'LCHANGAN vs O'LCHANMAGAN:**
- ✅ o'lchangan: qo'riqchi testlarning RED→GREEN sikli (aynan 3 FAIL, keyin 83 PASS); to'liq gate to'rt buyrug'i lokalda yugurtirildi va yashil; `git show --stat HEAD` bilan commit tarkibi tekshirildi (2 o'z fayl + hook'ning progress.json'i).
- ⚠️ o'lchanmagan: **Hech bir printerda o'lchanmagan.** Shrift kutish chekning kesilishini haqiqatan tuzatishi QOG'OZDA sinalmagan; `document.fonts.ready` yashirin chop oynasida qanchada hal bo'lishi o'lchanmagan (3s timeout'ga tushish chastotasi noma'lum); popup qayta-ishlatish real Electron'da yugurtirilmagan (testlar faqat manba-matnni tekshiradi); `.exe` yig'ilmagan.

**Nima QILINMADI va nega:**
- Popup avtomatik yopilmaydi — ATAYLAB: Electron'da chop dialogi tugaganini beradigan ommaviy hodisa yo'q; oyna ramkali, kassir «X» bilan yopadi (endi to'planmaydi ham).
- K18 uchun qo'shimcha kod yo'q — ekran tomoni (sukut printer nomi kirish ekranidagi belgida) F2 da bajarilgan.
- Chek balandligi formulasiga (MIN/TAIL) tegilmadi — faza-maxsus taqiq.

**Keyingi fazaga eslatma / ochiq xavf:**
- F8 QA'da qog'oz sinovi shart: uzun chek (20+ qator) + web-shrift sovuq keshda — oxirgi qatorlar kesilmasligini tekshirish; `kassa.log` da `shrift kutilmadi` yozuvi chiqish chastotasini kuzatish.
- `resolvePageSize` faqat `printHtml` (yashirin jobWin) yo'lida ishlaydi; popup (`?auto=1` / `window.print()`) yo'lidagi balandlik brauzer o'zi hal qiladi — u yo'l bu fazadan tashqarida.

**TO'XTADIM.** Keyingi faza — F7 (mijoz-ekran barqarorligi). Uni boshlash uchun yangi sessiya kerak.
