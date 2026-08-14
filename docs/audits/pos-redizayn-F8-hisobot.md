# POS redizayn — F8 hisobot: ko'p-kassir UI (kassir-tanlash + PIN)

**Sana:** 2026-08-14/15 · **Faza:** F8 (`docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md`)
· **Qamrov:** faqat web (F7 server endpointlariga quriladi) · **Holat: Phase-1 —
strukturaviy, runtime-tasdiqlanmagan** (lokal jonli ko'z-tekshiruv BOR — 11/11 ✓,
qurilma/sensorli sinov YO'Q, F9).

Commitlar: `d1038742` (F8.1 CashierSelectScreen) · `4d288ba1` (F8.2 trigger-nuqtalari)
· `b6e5b493` (F8.3 pin-qulf moslashuvi).

---

## 1. Qilingan ish

### F8.1 — `components/pos/cashier-select-screen.tsx` (`d1038742`)

- **Oqim:** `GET /auth/pos-pin/candidates` → katta kartalar (96px, bosh-harf doirasi +
  ism 20px) → karta bosilgach MAVJUD `PinKeypad` bilan PIN (4 raqam) →
  `POST /auth/pos-pin/switch` → javob (aynan pos-login shakli, F7 kontrakti)
  `acceptAuthResponse` bilan auth-store'ga → **butun** react-query kesh
  invalidatsiyasi (yangi shaxs — `smena-mine`, `cashier-session-current` va qolgan
  hamma so'rov eskirdi; reja «smena-mine invalidate» degan, butun kesh undan qamrovliroq
  va shaxs-almashinuvida yagona to'g'ri variant) → `onSwitched()`.
- **Auth-store:** yangi eksport `acceptAuthResponse(data)` — login / posLogin / refresh
  endi SHU yagona yordamchini chaqiradi (nusxa yo'q, `copy-paste-loses-a-branch` saboqi).
  Switch so'rovi `api-client` orqali (Authorization header + 401-body `remaining`/`lockout`
  shakli tayyor keladi) — auth-store'dan api-client import qilib bo'lmaydi (sikl),
  shuning uchun so'rov komponentda, javob-qabul auth-store'da.
- **Xavfsizlik UI'da:** 401 + `remaining` → `pages.posLock.wrong_remaining` (pos-pin-lock
  bilan BITTA kalit), PIN tozalanadi; 401 + `lockout` → to'liq logout + PIN-ekranga
  (pos-pin-lock xulqi bilan bir xil `lockoutExit`). Qurilma kaliti bo'lsa (`readPosDevice`)
  switch tanasiga qo'shiladi (eski juftlangan o'rnatmalar), bo'lmasa server `uiMode='kiosk'`
  bilan tekshiradi (F7 qarori).
- **Muhit-mezon:** yangi `isPosWorkstation()` (`lib/pos-device.ts`) =
  `isShersetShell() || readPosDevice() !== null` — pos-pin-lock lockout-yo'nalishi bilan
  bitta mezon, endi nomlangan yordamchida. Ekran boshqa muhitda `null` qaytaradi va
  kandidat-so'rov ham ketmaydi.
- **Bitta-numpad invarianti (P6):** PIN bosqichi FAQAT sahifa tugmalari — komponent
  daraxtida `<input>` yo'q (testlar qulflagan).
- **Qo'riqchi-reyestrlar:** `pos-i18n-guard` POS_FILES · `i18n-no-hardcoded`
  POS_DONE_FILES · `kiosk-shell` PIN-4 zanjiriga 5-halqa (`PIN_LENGTH = 4` +
  `maxLength={PIN_LENGTH}`). Raw-input yo'q — `raw-element-conventions` ro'yxati kerak emas.

### F8.2 — trigger-nuqtalari (`4d288ba1`)

- **Smena rejimi (sessiya OCHIQ):** `smena-mode.tsx`da «Kassirni almashtirish» bo'limi —
  tugma **DOIM nofaol** + izoh «Kassirni almashtirish uchun avval smenani yoping».
  SmenaMode faqat ochiq sessiyada chiziladi, almashinuv esa har doim toza nuqtada
  (server 409) — tugma bu yerda yo'l-ko'rsatkich. Faqat kassa ish o'rnida.
- **Smena YOPIQ ekran** (sessiya yo'q, `OpenShiftForm` yonida): xuddi shu nomli **faol**
  tugma (`pos-switch-cashier-open`) → `CashierSelectScreen` formani ALMASHTIRADI
  (overlay emas — kassir bir paytda bitta oqim ko'radi); «Bekor» qaytaradi; muvaffaqiyatda
  `closedSessionId` ham tozalanadi (eski kassirning Z-hisobot tugmasi yangi shaxsga
  ko'rinmasin). **Rejadan og'ish (ochiq):** reja bu yo'lni «Boshqa kassir» deb atagan —
  ikkala nuqtada BITTA yorliq («Kassirni almashtirish») ishlatildi: kassir smena-ekranda
  ko'rgan nomni yopiq ekranda qidiradi, ikki nom bitta amal uchun chalg'itardi.
- **Hotkey/savat/smena holatlariga tegilmagan** — trigger faqat sessiya-yo'q ekranda.

### F8.3 — `pos-pin-lock.tsx` moslashuvi (`b6e5b493`)

- Qulf tushganda `/cashier-sessions/current` **bir marta** so'raladi (polling emas):
  sessiya YO'Q + kassa ish o'rni → PIN-maydon o'rniga `CashierSelectScreen` (spec §8.4:
  «smena yopiq bo'lsa qulf o'rniga kassir-tanlash»). Bekor-yo'li ATAYLAB yo'q — bu hamon qulf.
- **Lockout xulqi buzilmagan:** sessiya BOR → eski PIN-qulf aynan o'zi (egasi PIN'i,
  5-xato → logout); sessiya-so'rovi yiqilsa → fail-safe eski qulf. Muvaffaqiyatli
  almashinuv qulfni ochadi, harakatsizlik-taymeri effekt orqali qayta quriladi.
- `kiosk-shell.test.ts` manba-qulflari (hasPin-gate, `\D` filtr, maxLength 4, lockout-dest
  literal) saqlangan — tegilmagan.

## 2. Testlar (barchasi test-avval yoki Edit)

- **Yangi:** `cashier-select-screen.test.tsx` — 10 test (kartalar, bo'sh-holat,
  muhit-gate + so'rov ketmasligi, PIN bosqichida input-yo'qligi, ortga, switch-tana
  ±qurilma-kalit, acceptAuthResponse+invalidate+onSwitched tartibi, remaining, lockout-logout).
  Qizil ko'rildi (modul yo'qligida import-xato darajasida).
- **Edit:** `sales-screen-shift.test.tsx` +2 (ochiq sessiyada disabled+izoh; muhit-gate) ·
  `open-shift-form.test.tsx` +2 (faol tugma→ekran→bekor; muhit-gate) — ikkalasi avval
  qizil ko'rildi. `pin-entry-single-numpad.test.tsx` +2 (qulf o'rnida tanlash ekrani,
  PIN-maydon yo'q; karta→PinKeypad'da ham invariant) · `kiosk-shell.test.ts` +1 (PIN-4 zanjiri).
- Mavjud test-fayl ustidan Write ishlatilmagan (faqat Edit).
- Test-jihoz topilmasi: fake-taymer davrida mount bo'lgan react-query so'rovi real
  taymerga o'tishdan oldin flush qilinishi shart (izoh testda).

## 3. Gate (har commit oldidan to'liq, raqamlar aynan)

| Gate | F8.1 | F8.2 | F8.3 |
|---|---|---|---|
| `pnpm typecheck` | 0 xato | 0 xato | 0 xato |
| `pnpm lint:product` | 0 error / 1053 warning | 0 / 1053 | 0 / 1053 |
| `pnpm i18n:gate` | 19/19 | 19/19 | 19/19 |
| `pnpm --filter @moysklad/web test` | **3956 passed** / 26 skipped | **3960** / 26 | **3962** / 26 |

F7-baseline 3945 → 3962 (+17: 10 komponent + 1 zanjir + 2 shift + 2 open-form + 2 pin-entry).
`apps/api`ga TEGILMAGAN (F7 talabi bajarilgan) — api-suite yugurtirilmadi (F7'da 8288 edi).

## 4. Ko'z-tekshiruv (8.4 — lokal jonli, izolyatsiyalangan headless chromium)

MCP-brauzer parallel sessiyada band (F3–F5 pretsedenti) — alohida skript, 1366×768.
Web :3100 (shu worktree'ning ishlab turgan dev-serveri), api :4000 ni o'zim ko'tarib,
ish oxirida TO'XTATDIM. Qobiq-imitatsiya: `window.electronAPI={isSherset:true}` initScript
(yangi-o'rnatma yo'li: qurilma kaliti yo'q, server `uiMode='kiosk'` bilan tekshiradi).
Test-kassirlar: `scripts/ops-create-test-cashiers.ts --apply` (lokal `climart_adopt`) —
kassir1/2/3, PIN 1111/2222/3333, «Kassa smenasi»ga biriktirilgan.

**11/11 ✓ (haqiqiy server-zanjir orqali):** kassir1 PIN-login → yopiq ekranda tugma →
kandidat kartalari (4 ta) → forma almashtirilgani → «Bekor» qaytishi → Kassir 2 + noto'g'ri
PIN 9999 → «PIN noto'g'ri. Qolgan urinish: 3» → to'g'ri 2222 → switch → yangi kassir
smena-ochish formasi → kassir2 smena ochdi (sessiya egasi Kassir 2 — serverdan) → ochiq
sessiyada tugma DISABLED + izoh → blind-yopish → yopiq ekranda tugma yana faol.
Skrinshotlar ko'z bilan ko'rildi (scratchpad, sessiya-lokal).

**Kuzatuvlar (F8 bugi EMAS, qayd):**
- Kandidatlar ichida «Admin User» ham bor — admin'da PIN va faol smena-a'zolik bor
  (avvalgi sessiyalar dev-DB holati); mezon F7 bo'yicha to'g'ri ishlayapti.
- Konsolda 403×N — `/tasks/badge-count` (layout polling'i kiosk-kassirda taqiqlangan) —
  F8'dan oldingi mavjud xulq; F8 endpointlari toza. 401×2 — ataylab noto'g'ri PIN (kutilgan).
- Birinchi noto'g'ri urinishdan keyin `remaining: 3` (4 emas) — server hisoblagich
  semantikasi (F7 domeni), UI serverning raqamini ko'rsatadi, o'zi hisoblamaydi.
- React key-warning `AppLayout`da — F8'dan oldin ham bor edi (dev overlay).

**Dev-muhit o'zgarishlari (ochiq):** lokal `climart_adopt`ga 3 test-kassir + «Kassa 24/7»
jadvali + «Kassa smenasi» yozildi (idempotent skript); QA davomida kassir2 nomidan 1 smena
ochilib-yopildi. Prod'ga TEGILMAGAN. `docs/progress.json` har commitga avto-hook bilan
qo'shiladi (timestamp regeneratsiya — F7'da ham shunday).

## 5. CHALA / keyingi fazalarga (F9)

- «Kassirni almashtirish» yorlig'i rejadagi «Boshqa kassir» o'rniga (yuqorida sabab) —
  egasi boshqacha xohlasa 1 i18n-kalit.
- Qulf-ekran → kassir-tanlash tarmog'ida qulf-taymeri jonli sinalmagan (5 daq
  harakatsizlik) — unit-testlar qulflagan, qurilma-QA F9'da.
- Switch'dan keyin `closedSessionId` tozalanadi — eski kassirning chop etilmagan
  Z-hisoboti faqat `/retail/sessions` ro'yxatidan topiladi (ongli qaror, F9 muhokamasi).
- `apps/api/src/scripts/`ga ops-skript nusxasi vaqtincha qo'yilib O'CHIRILDI;
  asl `scripts/ops-create-test-cashiers.ts` (untracked) joyida.
- `/tasks/badge-count` 403-shovqini kiosk rejimda (oldingi qarz) — F9 ro'yxatiga nomzod.

## 6. O'LCHANMAGAN (halollik bo'limi)

- **Qurilmada** (sensorli monoblok, kassa .exe, haqiqiy qobiq-klaviatura) sinov YO'Q — F9.
- Pin-qulf → kassir-tanlash yo'li jonli brauzerda kuzatilmagan (faqat vitest; 5-daqiqalik
  idle-taymerni jonli kutish o'tkazilmadi).
- Lockout (5 xato → to'liq logout) jonli ketma-ketlikda terilmagan — unit-test + F7 server-testlari.
- Haqiqiy juftlangan qurilma-kalit yo'li (switch tanasida deviceId/deviceSecret) jonli
  sinalmagan — lokalda juftlangan qurilma yo'q; unit-test qulflagan.
- Bir qurilmada TEZ ketma-ket ko'p almashinuv (kesh-poygalari) o'lchanmagan.
