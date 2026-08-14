# POS redizayn — F6 hisobot (exe: oyna tugmalari headerga)

**Sana:** 2026-08-14 · **Faza:** F6 (reja: `docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md`)
**Holat:** **Phase-1: strukturaviy, runtime-tasdiqlanmagan** (haqiqiy Electron qobiq ishga
tushirilmagan; qurilma-sinov F9 da). **Kanalga HECH NARSA yuklanmadi** (F9 sharti bajarildi).
**Commitlar:** `a6061799` (F6.1–6.2 preload + qo'riqchi-test) · `a68ffed0` (F6.3 web
window-controls) · `5040c31d` (F6.4 versiya 1.8.0) — har biri to'liq gate bilan.

## Nima qilindi

### 1. `desktop/preload.js` (F6.2)

- `electronAPI` ga 3 metod qo'shildi: `minimize()` → `shell:minimize`,
  `toggleWindowed()` → `shell:toggle-windowed`, `requestQuit()` → `shell:request-quit`.
  Kanallar suzuvchi uchlik (`WINDOW_BUTTONS`) bilan BIR XIL; `shell:quit` metodi ATAYLAB
  berilmagan — ✕ har doim TASDIQLI yo'ldan (E1). `main.js` ga TEGILMAGAN (ishlovchilar
  1.6.0/P01 dan mavjud — `electron-bridge-contract` IPC-yo'nalish testlari buni qulflaydi).
- **Suppression:** sahifa `<html data-sherset-window-controls="page">` qo'ysa suzuvchi uchlik
  chizilmaydi / olib tashlanadi; marker ketsa QAYTADI. Kuzatuv — MutationObserver
  (`documentElement`, `attributeFilter`). Chizish **idempotent** (DOM'dagi
  `data-sherset-window-button` belgisi bo'yicha) — observer/navigatsiya nechta marta
  chaqirsa ham dublikat yo'q. `file://` sahifalarda avvalgidek hech narsa chizilmaydi (E3);
  burchak-imosi (E4) va ekran-klaviatura kodiga tegilmagan.

### 2. Web (F6.3)

- **Yangi:** `components/pos/window-controls.tsx` — FAQAT `electronAPI.minimize` funksiya
  bo'lsa chizadi (capability-aniqlash, versiya raqami emas); mount'da marker qo'yadi,
  unmount'da olib tashlaydi. Uch tugma — ❐ ✕: 56px en, `self-stretch` (64px header bo'yi),
  ✕ hover qizil (`hover:bg-red-600`), `-mr-4` bilan ekranning eng o'ng chetiga yopishadi.
  `data-test-id`: `pos-win-minimize|toggle|close`. `position: fixed` YO'Q (klaviatura-evristika
  sharti). Bridge-aniqlash `useEffect`da (shell-version-badge naqshi — hydration-mismatch yo'q).
- `pos-header.tsx`: `<WindowControls />` `children` slotidan KEYIN (eng o'ngda). `page.tsx` ga
  tegilmadi.
- i18n: `pages.pos.win_minimize/win_toggle/win_close` (ru+uz). Qo'riqchi-reyestrlar yangilandi:
  `pos-i18n-guard` POS_FILES + `i18n-no-hardcoded` POS_DONE_FILES (F1/F2 ogohlantirishi bajarildi).

### 3. Qo'riqchi-testlar

- `desktop-window-controls.test.ts` — **faqat Edit** bilan qayta yozildi, TARIX izohiga yangi
  band (suzuvchi uchlik endi MOSLIK ZAXIRASI). Saqlangan: E1–E4, W1, W2. Yangi: **W5**
  (3 metod haqiqiy preload ijrosida to'g'ri kanalga yuboradi; electronAPI blokida `shell:quit`
  yo'q), **W6** (marker oldindan/keyin — uchlik yo'q/olib tashlanadi; faqat `page` qiymati
  bostiradi), **W7** (marker yo'q/ketti — uchlik bor/qaytadi, ANIQ 3 ta — dublikat taqiq).
  Test-avval: 6 yangi assert qizil ko'rildi, keyin preload yozildi.
- **Yangi:** `window-controls.test.tsx` (8 test) — matritsa (API yo'q / eski exe / yangi exe),
  bosishlar, unmount-marker, fixed-emas, va **nom-moslik tetheri**: komponent chaqiradigan metod
  nomlari + marker literal HAQIQIY `desktop/preload.js` da tekshiriladi
  (`fe-fixture-invents-server-field` bug-klassiga qarshi).

### 4. Versiya — 1.8.0 (rejadan SABABLI og'ish; F6.4)

Reja «`desktop/package.json` → 1.7.0» degan. **Lekin 1.7.0 raqami band chiqdi:** P01 commit'i
`5f758d71` (2026-08-13) suzuvchi uchlikli, suppression'SIZ binarni 1.7.0 sifatida yig'ib
KANALGA chiqargan (README'da sha512/HEAD-200 o'lchovi bor edi). Bitta raqam ostida ikki xil
binar bo'lmasligi va electron-updater kanal-1.7.0 olgan qurilmalarga yangisini bera olishi
uchun F6 relizi **1.8.0** bo'ldi. Kod/testlardagi «1.7.0+» izohlar 1.8.0 ga to'g'rilandi
(funksional aniqlash baribir capability bo'yicha — `minimize` bormi). README holat-bloki
yangilandi: repo=1.8.0 (yig'ilmagan, kanalda emas), kanal=1.7.0.

## Versiya-moslik matritsasi (spec §7 — takror, 1.8.0 bilan)

| Web ↓ / Qobiq → | Brauzer (exe yo'q) | Eski exe ≤1.7.0 (kanaldagi) | Yangi exe 1.8.0+ |
|---|---|---|---|
| **Eski web** (marker yo'q) | tugma yo'q (normal) | suzuvchi uchlik | suzuvchi uchlik (marker yo'q → chiziladi) |
| **Yangi web, POS sahifa** | hech narsa (`electronAPI` yo'q) | suzuvchi uchlik (`minimize` yo'q → header chizmaydi, marker qo'ymaydi) | **header uchligi**; marker → suzuvchi bostirilgan |
| **Yangi web, POS bo'lmagan sahifa** (kassa-kirish va h.k.) | tugma yo'q | suzuvchi uchlik | suzuvchi uchlik (marker yo'q) |

Hech bir katakda 0 ta ham, 2 ta ham uchlik yo'q. POS sahifadan chiqilganda marker olib
tashlanadi → suzuvchi uchlik qaytadi (W7 qulfi).

## Gate natijalari (har commit oldidan to'liq)

- `pnpm typecheck` — 0 xato (10/10 task).
- `pnpm lint:product` — 0 error (1053 warning — siyosat bo'yicha ruxsat).
- `pnpm i18n:gate` — 19/19 yashil.
- `pnpm --filter @moysklad/web test` — **3945 passed / 26 skipped** (F5-baseline 3925 →
  +9 qayta yozilgan desktop-qo'riqchi, +3 dinamik bridge-contract kanal-testi (yangi 3 IPC
  chaqiruv avtomatik test oladi), +8 yangi `window-controls.test.tsx`). `apps/api` ga
  tegilmagan — api-suite talab qilinmadi.

## O'LCHANMAGAN (halollik)

- **Haqiqiy Electron qobiq ishga tushirilmagan** (`env -u ELECTRON_RUN_AS_NODE npx electron .`
  qilinmadi): dev-mashinada kiosk/setup GUI ochilishi ishga halaqit qiladi, api/db dev-stack
  o'chiq edi — POS baribir ochilmasdi. Suppression va metodlar **haqiqiy preload manbasini**
  vitest-harness ijro etib o'lchandi (happy-dom, jonli MutationObserver) — lekin bu Electron
  EMAS. Reja 6.4 buni oldindan ruxsat etgan («qurilmasiz muhitda QOLADI»).
- Header-uchlikning VIZUAL ko'rinishi (eng o'ng chetga yopishishi, hover qizil, 64px) brauzerda
  ko'z bilan ko'rilmagan — komponent faqat `electronAPI` bilan chiziladi, dev-brauzerda u yo'q.
  Klass-darajada testlar qulflaydi, piksel-darajada F9 qurilma-sinovi ko'radi.
- 1.6.0/1.7.0 → 1.8.0 jonli o'tish, «—»/«❐» real oyna xulqi — qurilmada (F9).
- Eski exe + yangi web kombinatsiyasi jonli sinalmagan (testda `minimize`siz bridge bilan
  simulyatsiya qilingan).

## Chala qolgan / keyingi agentlarga

1. **F9 diqqat: exe relizi endi `1.8.0`** (reja matnidagi «1.7.0» eskirgan — u kanalda band).
   `cd desktop && pnpm run dist` → `Sherset-Kassa-Setup-1.8.0.exe`. `desktop/` workspace'da
   emas; `desktop/pnpm-lock.yaml` untracked (boshqa sessiya artefakti) — tegilmadi.
2. `ShellVersionBadge` hamon o'zini fixed burchakka chizadi (F2 chala №2 «F6 bilan birga»
   degan edi) — F6 reja-bo'limi fayl-ro'yxatida YO'Q edi, qamrov intizomi bo'yicha ATAYLAB
   qilinmadi. F9 hal qilsin (headerga singdirish yoki qoldirish).
3. CFD tugmasi header slotida oyna-tugmalaridan CHAPDA turadi (page.tsx o'zgartirilmadi) —
   vizual tartib F9 ko'z-tekshiruvida baholanadi.
4. Preflight «working tree TOZA EMAS» anomaliyasi — sessiya-boshi git-status'dagi MA'LUM
   untracked artefaktlar (eski reja/scratchpad/xlsx fayllari), F6 fayllariga daxlsiz;
   session-start-audit workflow shu sababli yuborilmadi. `docs/progress.json` ni pre-commit
   hook o'zi qayta yaratadi (faqat `generatedAt`) — har commitga o'zi qo'shilib boradi, begona
   ish emas.

## Takliflar (YAGNI — bajarilmadi, faqat qayd)

- `latest.yml` kanalida 1.7.0 «yetim» reliz bo'lib qoladi (suppression'siz) — F9 1.8.0 ni
  yuklagach kanal tarixida izoh qoldirish foydali.
- Suzuvchi uchlik uslublarini (40px doira) header-uslubga yaqinlashtirish — eski-web moslik
  rejimida ham bir xil ko'rinish uchun. Hozircha ehtiyoj yo'q.
