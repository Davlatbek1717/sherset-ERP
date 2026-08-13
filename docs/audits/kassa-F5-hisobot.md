# Faza F5 — Ekran klaviaturasi: Enter, o'qlar, joylashuv · 2026-08-13 · e2bede04

**Holat:** ✅ to'liq (Phase-1: strukturaviy, qurilmada runtime-tasdiqlanmagan; browser-smoke YO'Q —
lekin `sendInputEvent` xulqi haqiqiy Electron 33.4.11 da kbd-probe bilan O'LCHANGAN)

**Yopilgan ID'lar:** K13 (Enter yo'q edi), K14 (←/→ yo'q edi), K15 (maydon klaviatura ostida qolardi)

**Nima o'zgardi:**
- Reja talabi bo'yicha faza O'LCHOV bilan boshlandi: `desktop/tools/kbd-probe/` kengaytirildi
  (CONTROL_KEYS: Enter/Left/Right; `page.html` ga form+input+textarea va keydown/submit
  tinglovchilar) va haqiqiy Electron 33.4.11 (Chromium 130) da yugurtirildi. Natija ijobiy —
  shundan keyingina implementatsiya boshlandi.
- `desktop/main.js`: `kbd:key` ishlovchisida `CONTROL_KEYS = ['Backspace','Enter','Left','Right']`
  — bular `char` emas, `keyDown`+`keyUp` juftligi bilan yuboriladi. Bitta belgi cheklovi saqlangan.
- `desktop/preload.js`: harf layouti footer'iga va numpad footer'iga `◀ ▶ ⏎` tugmalari qo'shildi;
  K15 uchun klaviatura ochilganda `<body>` ga `paddingBottom = root.offsetHeight` beriladi
  (`applyInset`), yashirilganda/fokus ketganda qaytariladi (`clearInset`). `applyInset`
  `scrollIntoView` dan OLDIN — skroll yangi balandlik bilan hisoblansin.
- `probe.js` dagi `kbd:key` nusxasi main.js bilan sinxron qilindi (izohdagi shartnoma).

**Fayllar:**

| Yo'l | Nima qilindi |
|---|---|
| `desktop/tools/kbd-probe/probe.js` | CONTROL_KEYS o'lchovi (1b), to'liq zanjir o'lchovi (2b), kbd:key nusxasi sinxron |
| `desktop/tools/kbd-probe/page.html` | form + `#ctl` input + `#ta` textarea, keydown/submit jurnal |
| `desktop/main.js` | `kbd:key`: CONTROL_KEYS → keyDown/keyUp |
| `desktop/preload.js` | `⏎ ◀ ▶` tugmalari (ikkala layout), applyInset/clearInset (K15) |
| `apps/web/src/__tests__/desktop-touch-keyboard.test.ts` | Yangi K7 describe (8 test); K1–K6 TEGILMAGAN |
| `docs/progress.json` | pre-commit hook avto-regeneratsiyasi (faqat `generatedAt`) |

**Testlar:** 8 yangi (K7 describe). RED ko'rildi: implementatsiyadan oldin 7 FAIL
(`numpad'da ham o'q tugmalari bor` — plandan tashqari qo'shimcha test — RED yugurtirishdan keyin
qo'shilgan, u ham implementatsiyagacha qizil bo'lardi, alohida RED ko'rilmagan). Keyin 38/38 PASS.
Mavjud K1–K6 testlaridan hech biri o'chirilmagan/`skip` qilinmagan.

**Gate:** typecheck ✓ (10/10) · lint:product ✓ (0 xato) · i18n:gate ✓ (19/19) ·
web vitest ✓ (268 fayl, 3818 pass / 26 skip). api testlari yugurtirilmadi — `apps/api`/`packages/db`
ga tegilmagan.

**O'LCHANGAN vs O'LCHANMAGAN:**

- ✅ o'lchangan (haqiqiy Electron 33.4.11 / Chromium 130, `result.json` → `controlKeys` AYNAN):

```json
"controlKeys": {
  "input": [
    { "key": "Enter", "selectionStart": 3, "value": "abc",
      "keydownSeen": true, "keydowns": ["Enter"], "submitSeen": false },
    { "key": "Left", "selectionStart": 2, "value": "abc",
      "keydownSeen": true, "keydowns": ["ArrowLeft"], "submitSeen": false },
    { "key": "Right", "selectionStart": 3, "value": "abc",
      "keydownSeen": true, "keydowns": ["ArrowRight"], "submitSeen": false }
  ],
  "textarea": [
    { "key": "Enter", "selectionStart": 3, "value": "abc",
      "keydownSeen": true, "keydowns": ["ta:Enter"], "submitSeen": false },
    { "key": "Left", "selectionStart": 2, "value": "abc",
      "keydownSeen": true, "keydowns": ["ta:ArrowLeft"], "submitSeen": false },
    { "key": "Right", "selectionStart": 3, "value": "abc",
      "keydownSeen": true, "keydowns": ["ta:ArrowRight"], "submitSeen": false }
  ],
  "rightFromMiddle": { "selectionStart": 2, "value": "abc" }
}
```

  Reja mezoni: `Enter` `keydownSeen: true` → `keyDown`+`keyUp` yetarli. `Left` kursorni 3→2,
  `Right` o'rtadan 1→2 siljitadi.

  Qo'shimcha: implementatsiyadan KEYIN probe qayta yugurtirilib **to'liq zanjir** o'lchandi
  (haqiqiy preload tugmasi bosilishi → `kbd:key` → `sendInputEvent` → maydon):

```json
"controlChain": {
  "afterLeft": { "selectionStart": 2, "keydowns": ["ArrowLeft"] },
  "afterEnter": { "keydowns": ["ArrowLeft", "Enter"], "submits": 0 }
}
```

  P6 ning eski o'lchovlari ham qayta tasdiqlandi (kirill yetadi, `controlledState: "ў"`,
  `readOnlyTyped: ""`, til tanlovi tiklanadi). Yangi layoutlarda `◀ ▶ ⏎` chiqishi ham
  probe snapshot'ida ko'rindi (`moneyLayout.keys`, `pinLayout.keys`).

- ⚠️ o'lchanmagan:
  - Monoblok qurilmaning o'zida (barmoq bilan) hech narsa sinalmagan — bu F8/Phase-2 ishi.
  - `submitSeen: false` — sintetik `Enter` forma implicit-submit'ini CHAQIRMAYDI. POS'da
    tasdiqlash React `onKeyDown` orqali ishlaydi (keydown yetadi), lekin faqat native form
    submit'ga tayangan joy bo'lsa, u qobiq Enter'idan ishlamaydi. POS sahifalarida bunday
    joy bor-yo'qligi tekshirilmagan (apps/web ga tegish TAQIQ edi).
  - Textarea'da sintetik Enter YANGI QATOR qo'shmaydi (`value: "abc"` o'zgarmadi) — ko'p
    qatorli izoh maydonida ⏎ matnga `\n` yozmaydi, faqat keydown beradi. Bu ochiq cheklov.
  - `applyInset` real sahifada (POS layoutlari, `100vh` konteynerlar) qanday ko'rinishi
    o'lchanmagan; happy-dom'da `offsetHeight` 0 → test faqat atribut o'rnatilishini qulflaydi.

**Nima QILINMADI va nega:**
- `char` bilan Enter yuborish sinalmadi — reja bo'yicha bu faqat `keydownSeen: false` holatidagi
  zaxira yo'l edi; asosiy yo'l ishladi.
- `apps/web` (POS sahifalari, pin-keypad, pos-pin-lock) ga tegilmadi — faza-maxsus TAQIQ.
- Mavjud K1–K6 testlariga tegilmadi; `.exe` yig'ilmadi; deploy yo'q.

**Keyingi fazaga eslatma / ochiq xavf:**
- F8 qurilma sinovida ⏎ ni ANIQ tekshirish kerak: (a) PIN ekranida tasdiqlash; (b) summa
  maydonida Enter POS'ning kutilgan amalini bajaradimi (React onKeyDown'ga bog'liq);
  (c) izoh (textarea) maydonida ⏎ yangi qator YOZMASLIGI kassirni chalg'itmasligi.
- Electron binari `desktop/node_modules` da YO'Q edi (postinstall bloklangan) — probe
  `%LOCALAPPDATA%\electron\Cache\electron-v33.4.11-win32-x64.zip` dan ochilgan nusxada
  yugurtirildi. F8 build'ida `pnpm approve-builds` kerak bo'ladi.
- `docs/progress.json` har commit'da hook tomonidan avto-yangilanadi (faqat timestamp) —
  begona fayl emas.

**TO'XTADIM.** Keyingi faza — F6 (chop etish ishonchliligi). Uni boshlash uchun yangi sessiya kerak.
