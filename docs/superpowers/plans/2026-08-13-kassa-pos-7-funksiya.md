# Kassa POS — 7 funksiya rejasi (egasining 2026-08-13 talablari)

> **Agent ishchilar uchun (O'ZGARMAS QOIDA):** har faza **ALOHIDA sessiyada, ALOHIDA agent**
> tomonidan bajariladi. Faza tugagach agent **hisobot yozadi va TO'LIQ TO'XTAYDI** —
> keyingi fazani boshlash **QAT'IY TAQIQ** («vaqt bor ekan keyingisini ham qilay» — TAQIQ).
> Sabab: kontekst o'sgani sari token sarfi ~kvadratik oshadi (`CLAUDE.md` §0.3).
> Sub-skill: `superpowers:subagent-driven-development` — faqat **faza ichida**, fazalar orasida emas.

**Maqsad:** kassa POS'ini egasining 7 talabiga moslash: (1) oynani boshqarish tugmalari —/❐/✕;
(2) mahsulot nomi kattaroq, boshqa shriftda; (3) qidiruvda tan/optom narx ko'rinmasin;
(4) qator-tahrir modalida «Minimal» yashirin; (5) chekda mijoz qarz qoldig'i;
(6) kassir istalgan chekka qaytarish qila oladi; (7) o'ng panelda «Mijozlar» bo'limi.

**Arxitektura:** POS — `apps/web/src/app/(app)/sotuv/page.tsx` (~3250 qator monolit, MK33 bo'lish
qarzi — bu reja uni BO'LMAYDI, faqat kichik nuqtaviy tahrir + yangi ish alohida komponentlarga).
Chek — uch renderer, bitta model (`lib/pos/receipt-model.ts`). Desktop — Electron yupqa o'ram
(`desktop/`), savdo mantiqi web'da. Server — NestJS `apps/api/src/modules/*`.

**Tech stack:** Next.js App Router · NestJS + Prisma · Vitest (happy-dom) · Electron 33.4.11 ·
electron-builder 25 (NSIS) · `@moysklad/money` (minor-bigint).

**Spec:** egasining 2026-08-13 xabari + 3 ta qurilma-foto (savat/qidiruv paneli, qator-tahrir
modali, oyna tugmalari referensi — Chrome). Bu hujjatning «Muammolar reyestri» spec vazifasini bajaradi.

---

## Global cheklovlar (HAR fazada amal qiladi)

- **Model:** flagship (Opus-sinf). Subagent'larga `model:'sonnet'` UZATILMAYDI (`CLAUDE.md` §0.1).
- **TDD:** har xulq o'zgarishi avval RED test bilan. Qo'riqchi testni **O'CHIRISH/skip TAQIQ** —
  niyat o'zgarsa test **qayta yoziladi** (yangi niyat + sana + eski niyat nega bekor).
- **Gate (har commitdan oldin, to'liq):**
  ```bash
  pnpm typecheck && pnpm lint:product && pnpm i18n:gate && pnpm --filter @moysklad/web test
  ```
  `apps/api` yoki `packages/db` ga tegilgan bo'lsa qo'shimcha: `pnpm --filter @moysklad/api test`.
- **Git intizomi (`CLAUDE.md` §6):** faqat `git add <aniq fayllar>`; `git add -A`/`-a` TAQIQ;
  `reset --hard`/`stash`/`checkout -- .` begona o'zgarish borida TAQIQ. Commitdan keyin
  **majburiy** `git show --stat HEAD` (lint-staged begona fayl qo'shishi mumkin; `docs/progress.json`
  hook o'zi yangilaydi — bu normal).
- **Yorliq halolligi:** har faza natijasi **«Phase-1: strukturaviy, qurilmada runtime-tasdiqlanmagan»**.
  «done/production-ready/verified» so'zlari TAQIQ (faqat «Phase-1 complete»).
- **i18n:** har yangi matn ru+uz `apps/web/src/messages/{ru,uz}.json` ga; hardcoded matn TAQIQ
  (gate tutadi). `data-test-id` (defis bilan!) konvensiyasi — `data-testid` EMAS.
- **`desktop/` monorepo workspace'ida EMAS** — bog'liqliklar `cd desktop && pnpm install` bilan.
  Muhitda `ELECTRON_RUN_AS_NODE=1` turibdi — electron-builder'ni `env -u ELECTRON_RUN_AS_NODE …` bilan yugurtir.
- **Deploy:** faza oxirida operator (foydalanuvchi) ruxsati bilan. Web → `deploy-smart.sh DS_TARGET=v2`
  (xotira `sherset-vps-deploy`); exe → faqat F1 (quyida, o'lchangan retsept bilan).
- **Prod DB'ga yozish TAQIQ** (ops-skript ham avval faqat `--dry-run`; `--apply` operator ruxsati bilan).
- **Hisobot:** faza tugagach agent hisobotni **(a)** suhbatga va **(b)** SHU faylning pastidagi
  «📝 Hisobotlar» bo'limidagi **O'Z fazasining tayyor bo'sh seksiyasiga** yozadi — seksiyani
  **Edit bilan almashtiradi** (placeholder `_(hali yozilmagan)_` o'rniga). ❗ Fayl oxiriga
  append yoki `indexOf('## X')`-kesish TAQIQ (xotira `doc-append-marker-truncation`: bir marta
  2270 qator o'chgan). Har fazaning seksiyasi oldindan yaratib qo'yilgan — kolliziya yo'q.

---

## Muammolar reyestri (spec)

| ID | Egasining talabi (o'z so'zlari bilan) | Faza |
|---|---|---|
| **P01** | «o'ng tomondagi 3 ta belgi: chiziqcha — ilovadan chiqmasdan rabochiy stolga o'tadi; ikkita to'rtburchak — ilovani kichraytiradi; iks — ilovadan chiqadi» | F1 |
| **P02** | «tovarni qidirganda qoldiq ko'rinishi kerak, lekin kelgan narxi va optom narxi ko'rinmasligi kerak» | F2 |
| **P03** | «modalda optom narx turishi kerak; minimal narx yozuvi yashirin bo'lishi kerak va shu joyni bosganda narx ko'rinishi kerak» | F3 |
| **P04** | «shriftlarni o'zgartirish kerak — mahsulot nomi boshqa xildagi kattaroq shriftda» | F4 |
| **P05** | «chekda mijoz qarzini chiqarishimiz kerak — kontragent tanlanganda, to'lasa/to'lamasa, chek pastida "Sizning qarzingiz" deb qolgan summa» | F5 |
| **P06** | «kassir istalgan chekga vozvrat (qaytarish) qilish imkoni bo'lishi kerak» | F6 |
| **P07** | «o'ng panelda Cheklar va Smena orasida Mijozlar bo'limi — mijoz qarzidan pul to'lasa yoki nimadir qaytarsa, qulay ishlash» | F7 |

**Faza tartibi tavsiyasi:** F1 (desktop, mustaqil) → F2 → F3 → F4 (uchchalasi kichik, mustaqil) →
F5 → F6 → **F7 oxirida** (F6'ning «istalgan chekka qaytarish»idan foydalanadi). F2/F3/F4/F5
o'zaro mustaqil — parallel worktree'larda ham bajarilishi mumkin (§6.5), lekin **F2 va F4
ikkalasi `page.tsx`ning yaqin qatorlariga tegadi** — ketma-ket qilinsin.

---

## Har faza uchun MAJBURIY protokol

1. **Boshlanish:** `node scripts/preflight.mjs`; `git status --short` — begona o'zgarishlarga TEGMA.
2. Faza qadamlarini **tartib bilan**, TDD (avval RED) bilan bajar.
3. To'liq gate → commit → `git show --stat HEAD`.
4. Hisobot (shakl quyida) → suhbatga + shu fayl pastidagi o'z seksiyasiga (Edit, append EMAS).
5. **TO'XTA.** Keyingi faza — faqat yangi sessiyada, operator buyrug'i bilan.

**Hisobot shakli (majburiy):**

```markdown
### 📝 F<N> hisoboti — <sana> · <commit hash(lar)>
**Holat:** ✅ to'liq | ⚠️ qisman | 🔴 bloklandi
**Nima o'zgardi:** (3–6 qator, nega bilan)
**Fayllar:** | Yo'l | Nima qilindi |
**Testlar:** yangi/qayta yozilgan testlar; har biri RED ko'rilganmi
**Gate:** typecheck __ · lint __ · i18n __ · web test __ (· api test __)
**O'LCHANGAN vs O'LCHANMAGAN:** aynan nima yugurtirildi/tekshirildi; qurilmada sinalmagani OCHIQ
**Nima QILINMADI va nega:**
**Deploy:** qilindimi (operator ruxsati bilanmi), qaysi muhitga
**TO'XTADIM.**
```

---

# F1 — Oyna boshqaruv tugmalari: — / ❐ / ✕ (desktop, 1.6.0 → 1.7.0)

**Qamrov:** P01
**Ruxsat etilgan fayllar:**
- `desktop/preload.js`, `desktop/main.js`, `desktop/package.json`, `desktop/README.md` (o'zgartirish)
- `apps/web/src/__tests__/desktop-exit-button.test.ts` → `desktop-window-controls.test.ts` (git mv + qayta yozish)
- Hisobot (shu fayl pastida)

**TAQIQ (faza-maxsus):** web ilova kodiga (apps/web/src, testlardan tashqari) TEGILMAYDI.
`device-store.js`, `updater.js`, `preload-customer.js` ga tegilmaydi.

**Interfeyslar:**
- Produces: IPC `shell:minimize` (send) · `shell:toggle-windowed` (send); preload'da 3 ta yalang tugma.
- Consumes: mavjud `shell:request-quit` (tasdiq dialogli chiqish, 1.6.0).

### Dizayn (nega aynan shunday)

1.6.0 da faqat ✕ bor (`installExitButton`). Endi Chrome kabi uchlik: **—** (minimize → taskbar),
**❐** (kiosk ↔ oynali rejim), **✕** (tasdiq bilan chiqish). Muhim cheklovlar:

- **Har tugma YALANG `<button>`** (konteyner div YO'Q): `desktop-touch-keyboard.test.ts` dagi
  `keyboardRoot()` evristikasi «fixed element ichida button bor» deb qidiradi — konteynerli
  blok klaviatura ildizi bilan adashtirilardi (1.6.0 sabog'i).
- **❐ ramka bera olmaydi:** Electron'da `frame` ish paytida o'zgartirilmaydi. Oynali rejim ham
  RAMKASIZ bo'ladi: 1280×800, markazda; tugmalar preload'dan ko'rinaveradi, ❐ yana bosilsa kiosk'ga qaytadi.
- **Close-qo'riqchi kiosk'ka emas, KONFIGga bog'lanadi:** hozir `win.on('close')` faqat
  `win.isKiosk()` da to'sadi — oynali rejimda Alt+F4/taskbar-close ilovani JIM yopib yuborardi.
  Yangi shart: `!allowQuit && serverBase()` (sozlash oynasi — serverBase bo'sh — yopilaveradi).
- ✕ avvalgidek `shell:request-quit` (tasdiq dialogi) — tasodifiy bosish savdoni yo'qotmasin.

### Qadamlar

- [ ] **1.1 — Qo'riqchi testni qayta yozish (RED):**
  `git mv apps/web/src/__tests__/desktop-exit-button.test.ts apps/web/src/__tests__/desktop-window-controls.test.ts`
  so'ng faylni qayta yoz (eski 1.6.0 niyati — «bitta ✕» — 2026-08-13 da «uchlik»ka kengaydi, deb izohla).
  Mavjud `loadPreload()` jihozini saqla. Yangi testlar:

```ts
/** Body'ning bevosita farzandi bo'lgan yalang fixed tugmalar (o'ngga yopishgan). */
function controlButtons(): HTMLButtonElement[] {
  return [...document.body.children].filter(
    (el): el is HTMLButtonElement =>
      el instanceof HTMLButtonElement && el.style.position === 'fixed' && el.style.right !== '',
  );
}

describe('oyna boshqaruv tugmalari — uchlik (P01, 2026-08-13)', () => {
  it('uchchala tugma chiziladi: — ❐ ✕', () => {
    const labels = controlButtons().map((b) => b.textContent?.trim());
    expect(labels).toContain('—');
    expect(labels).toContain('❐');
    expect(labels).toContain('✕');
  });

  it('har biri YALANG <button> (klaviatura evristikasi buzilmasin)', () => {
    for (const b of controlButtons()) {
      expect(b.parentElement).toBe(document.body);
      expect(b.querySelector('button')).toBeNull();
    }
  });

  it('— bosilsa `shell:minimize` ketadi', () => {
    controlButtons().find((b) => b.textContent?.trim() === '—')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(shell.sends).toEqual([{ channel: 'shell:minimize', payload: undefined }]);
  });

  it('❐ bosilsa `shell:toggle-windowed` ketadi', () => {
    controlButtons().find((b) => b.textContent?.trim() === '❐')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(shell.sends).toEqual([{ channel: 'shell:toggle-windowed', payload: undefined }]);
  });

  it('✕ hamon TASDIQLI yo`ldan yuradi (`shell:request-quit`)', () => {
    controlButtons().find((b) => b.textContent?.trim() === '✕')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(shell.sends).toEqual([{ channel: 'shell:request-quit', payload: undefined }]);
  });
});
```

  Saqla (1.6.0 dan meros, niyati o'zgarmagan): «tugma tanasida tasdiqsiz `shell:quit` yo'q»,
  «file:// sahifalarda chizilmaydi», «imo (installExitGesture) qoladi», «CSSOM-only» testlari —
  funksiya nomini `installWindowControls` ga yangilab. Qo'shimcha main.js grep-testlari:

```ts
describe('main.js — oyna boshqaruv ishlovchilari', () => {
  const mainSrc = readFileSync(join(REPO, 'desktop', 'main.js'), 'utf8');

  it('minimize va toggle-windowed ishlovchilari bor', () => {
    expect(mainSrc).toContain("ipcMain.on('shell:minimize'");
    expect(mainSrc).toContain("ipcMain.on('shell:toggle-windowed'");
  });

  it('🔴 close-qo`riqchi kiosk`ka emas KONFIGga bog`langan (oynali rejimda Alt+F4 jim yopmasin)', () => {
    expect(mainSrc).not.toMatch(/allowQuit && win\?\.isKiosk\(\)/);
    expect(mainSrc).toMatch(/!allowQuit && serverBase\(\)/);
  });
});
```

- [ ] **1.2 — RED tasdiq:** `pnpm --filter @moysklad/web test desktop-window-controls` → FAIL
  (—/❐ yo'q, main.js'da ishlovchilar yo'q).

- [ ] **1.3 — `desktop/preload.js`:** `installExitButton` ni `installWindowControls` ga aylantir:

```js
/**
 * OYNA BOSHQARUV TUGMALARI — o'ng-yuqorida uchlik (P01, 2026-08-13 egasi):
 * «—» ilovadan chiqmasdan ish stoliga (minimize), «❐» kiosk ↔ oynali rejim,
 * «✕» tasdiq dialogli chiqish (1.6.0 dagi tugma). Imo (installExitGesture)
 * o'rnida qoladi.
 *
 * 🔴 Har tugma YALANG <button> (konteyner YO'Q) — `keyboardRoot()` evristikasi
 * uchun (desktop-touch-keyboard.test.ts). 🔴 file:// sahifalarda chizilmaydi.
 * Uslublar faqat CSSOM (sahifa CSP'si).
 */
const WINDOW_BUTTONS = [
  { label: '—', channel: 'shell:minimize', right: '104px' },
  { label: '❐', channel: 'shell:toggle-windowed', right: '56px' },
  { label: '✕', channel: 'shell:request-quit', right: '8px' },
];

function installWindowControls() {
  if (location.protocol === 'file:') return;
  for (const cfg of WINDOW_BUTTONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.textContent = cfg.label;
    const styles = {
      position: 'fixed',
      top: '8px',
      right: cfg.right,
      zIndex: '2147483646',
      width: '40px',
      height: '40px',
      lineHeight: '1',
      fontSize: '20px',
      color: '#ffffff',
      background: 'rgba(15, 23, 42, 0.45)',
      border: '0',
      borderRadius: '20px',
      cursor: 'pointer',
      opacity: '0.7',
    };
    for (const k of Object.keys(styles)) b.style[k] = styles[k];
    b.addEventListener('click', () => ipcRenderer.send(cfg.channel));
    document.body.appendChild(b);
  }
}
```

  `installShellHelpers()` ichida `installExitButton()` → `installWindowControls()`.

- [ ] **1.4 — `desktop/main.js`:** `registerIpc()` ichiga (masalan `shell:request-quit` yonига):

```js
  // «—» — ilovadan chiqmasdan ish stoliga (P01). Kiosk oynada ham ishlaydi.
  ipcMain.on('shell:minimize', () => {
    win?.minimize();
  });

  /**
   * «❐» — kiosk ↔ oynali rejim (P01). Ramka (frame) ish paytida qo'shib
   * bo'lmaydi, shuning uchun oynali rejim ham RAMKASIZ: 1280×800, markazda.
   * Qayta bosilsa kiosk'ga qaytadi. Chiqish baribir faqat ✕/imo orqali —
   * `close` qo'riqchisi konfig bo'yicha to'sadi (pastdagi izoh).
   */
  ipcMain.on('shell:toggle-windowed', () => {
    if (!win) return;
    if (win.isKiosk()) {
      win.setKiosk(false);
      win.setSize(1280, 800);
      win.center();
    } else {
      win.setKiosk(true);
    }
  });
```

  `createWindow()` dagi close-qo'riqchini almashtir (izoh bilan):

```js
  // Kassir oynani yopa olmasin. 🔴 Shart `isKiosk()` EMAS, KONFIG (2026-08-13):
  // «❐» oynali rejimga o'tkazganda isKiosk() false bo'lib qolardi va Alt+F4 /
  // taskbar-close ilovani JIM yopardi. Sozlash oynasi (serverBase bo'sh) esa
  // oddiy «X» bilan yopilaveradi — hali qulflaydigan narsa yo'q.
  win.on('close', (e) => {
    if (!allowQuit && serverBase()) e.preventDefault();
  });
```

- [ ] **1.5 — GREEN:** `pnpm --filter @moysklad/web test desktop-window-controls desktop-touch-keyboard electron-bridge-contract` → PASS.

- [ ] **1.6 — Versiya:** `desktop/package.json` → `1.7.0`; `desktop/README.md`: sarlavha-holat,
  «Natija» blokidagi fayl nomlari `…-1.7.0.exe`, reliz-tarix jadvaliga 1.7.0 qatori
  (qo'riqchi `kassa-installer-config.test.ts` README'dagi installer nomi versiya bilan mosligini talab qiladi).

- [ ] **1.7 — To'liq gate + commit:**
```bash
pnpm typecheck && pnpm lint:product && pnpm i18n:gate && pnpm --filter @moysklad/web test
git add desktop/preload.js desktop/main.js desktop/package.json desktop/README.md apps/web/src/__tests__/desktop-window-controls.test.ts
git commit -m "feat(kassa): oyna boshqaruv tugmalari — minimize/oynali-rejim/chiqish (1.7.0)"
git show --stat HEAD
```

- [ ] **1.8 — Exe yig'ish + kanal (OPERATOR RUXSATI BILAN; 1.6.0 da o'lchangan retsept):**
```bash
cd desktop && env -u ELECTRON_RUN_AS_NODE pnpm run dist   # dist/Sherset-Kassa-Setup-1.7.0.exe
# Kanal: ssh kalit ~/.ssh/sherset_deploy, root@13.140.157.10
# 🔴 Fayllar /var/www/kassa-downloads/desktop/ ICHKI papkaga (ildizga emas — 404 bo'ladi!)
# Tartib: exe+blockmap scp → remote sha512'ni latest.yml bilan solishtir →
#         cp desktop/latest.yml desktop/latest.yml.bak-1.6.0 → yangi latest.yml scp →
#         curl https://erp.sherset.uz/downloads/desktop/latest.yml (1.7.0) + exe HEAD 200.
```
  Push ham kerak (`git push` gh-token bilan — xotira `sherset-vps-deploy`). Web deploy SHART EMAS (faqat desktop o'zgardi).

- [ ] **1.9 — Hisobot + TO'XTASH.** O'lchanmagan deb yoz: qurilmada —/❐ xulqi, oynali rejimdan qaytish.

---

# F2 — Narx-maxfiylik: qidiruvda «Kelgan» YO'Q, savat qatorida «Optom» YO'Q

**Qamrov:** P02
**Ruxsat etilgan fayllar:**
- `apps/web/src/lib/pos/ui-flags.ts` (o'zgartirish)
- `apps/web/src/app/(app)/sotuv/page.tsx` (nuqtaviy: 2 blok shartga olinadi)
- `apps/web/src/app/(app)/sotuv/__tests__/sales-screen-cart.test.tsx` (qayta yozish/kengaytirish)
- Hisobot

**TAQIQ:** `cart-line-edit-modal.tsx` ga TEGILMAYDI (u F3; modalda Optom QOLADI — egasi shuni so'ragan).
Hisob-mantiqqa (cart-math, price-floor) tegilmaydi — bu FAQAT ko'rsatish siyosati.

### Dizayn

Anchor'lar (2026-08-13 xarita): qidiruv kartasidagi «Kelgan» = `page.tsx:1933–1941`
(`data-test-id="sotuv-grid-cost"`, manba `p.buyPrice`); savat qatoridagi «Optom» =
`page.tsx:2807–2814` (`data-test-id="sotuv-cart-min"`, `line.wholesaleMinor`). «Qoldiq» (:1931)
va «Qolgan» (:2781) QOLADI. Repo'da ko'rsatish siyosati uchun tayyor joy bor —
`lib/pos/ui-flags.ts` (`SHOW_MARGIN_ON_SCREEN` patterni) — o'chirib tashlamaymiz, bayroq bilan
o'chiramiz (qaytarilishi oson, niyat hujjatlashtirilgan).

### Qadamlar

- [ ] **2.1 — Test (RED):** `sales-screen-cart.test.tsx` da «Optom» ko'rinishini tasdiqlagan
  assertlarni (xaritada :518 atrofi) yangi niyat bilan qayta yoz + qo'sh:

```tsx
it('P02 (2026-08-13) — qidiruv kartasida tan narx («Kelgan») KO`RINMAYDI', async () => {
  // Egasi: mijoz ko'zi oldida kelgan/optom narx ochiq turmasin. Qoldiq qoladi.
  // Eski niyat (buyPrice kartada ko'rinadi) 2026-08-13 da bekor qilindi.
  await openSalesScreenWithProducts(); // faylda mavjud jihozdan foydalan
  expect(screen.queryByTestId('sotuv-grid-cost')).toBeNull();
  expect(screen.getByText(/Qoldiq/)).toBeInTheDocument();
});

it('P02 — savat qatorida «Optom» KO`RINMAYDI (modalda qoladi — F3)', async () => {
  await addProductToCart();
  expect(screen.queryByTestId('sotuv-cart-min')).toBeNull();
  expect(screen.getByText(/Qolgan/)).toBeInTheDocument();
});
```
  (Jihoz nomlari fayldagi mavjud helper'larga moslansin — test fayli allaqachon savatga
  qo'shish oqimini biladi.)

- [ ] **2.2 — RED tasdiq:** `pnpm --filter @moysklad/web test sales-screen-cart` → FAIL.

- [ ] **2.3 — `ui-flags.ts`ga ikki bayroq:**

```ts
/**
 * Qidiruv kartasida tan narx («Kelgan», buyPrice) ko'rinadimi.
 * 2026-08-13 egasining qarori: YO'Q — mijoz ko'zi oldidagi ekranda tan narx
 * ochiq turmasin. Hisob-mantiq (foyda, narx-pol) bunga BOG'LIQ EMAS.
 */
export const SHOW_COST_IN_SEARCH = false;

/**
 * Savat qatorida «Optom» ko'rinadimi. 2026-08-13: YO'Q — optom narx faqat
 * qator-tahrir modalida qoladi (egasining aniq talabi, F3).
 */
export const SHOW_WHOLESALE_IN_CART = false;
```

- [ ] **2.4 — `page.tsx`:** ikkala blokni bayroqqa o'ra:
  `{SHOW_COST_IN_SEARCH && (<span data-test-id="sotuv-grid-cost">…mavjud markup…</span>)}` va
  `{SHOW_WHOLESALE_IN_CART && (<span data-test-id="sotuv-cart-min">…</span>)}` (mavjud markupni
  o'chirmasdan shartga ol — import qo'shishni unutma).

- [ ] **2.5 — GREEN + to'liq gate + commit:**
```bash
git add apps/web/src/lib/pos/ui-flags.ts "apps/web/src/app/(app)/sotuv/page.tsx" "apps/web/src/app/(app)/sotuv/__tests__/sales-screen-cart.test.tsx"
git commit -m "feat(kassa): qidiruvda tan narx va savatda optom ko'rsatilmaydi (P02)"
```

- [ ] **2.6 — Hisobot + TO'XTASH.** (Operator xohlasa web deploy.)

---

# F3 — Qator-tahrir modali: «Minimal» YASHIRIN, bosilganda ko'rinadi

**Qamrov:** P03
**Ruxsat etilgan fayllar:**
- `apps/web/src/components/pos/cart-line-edit-modal.tsx`
- `apps/web/src/components/pos/__tests__/cart-line-edit-modal.test.tsx`
- Hisobot

**TAQIQ:** narx-pol MANTIG'IGA tegilmaydi — `belowFloor` qulfi, «Saqlash» bloklanishi va
`pos-line-edit-floor-blocked` banneri AYNAN qoladi (xotira `price-floor-min-cost-or-card`:
ekran + server bir manbadan; server juftligi `price-policy-guard.ts` — unga tegilmaydi).

### Dizayn

Modal (`cart-line-edit-modal.tsx`): «Optom: …» (:332–337) QOLADI — egasi aniq so'radi.
«Minimal: …» (:344–356, `pos-line-edit-floor`) sukutda **yashirin**: o'rnida bosiladigan
`Minimal: •••` turadi; bosilganda qiymat ochiladi; modal boshqa qatorga ochilganda yana yashirinadi.
Pol qulfi ishlashda davom etadi — yashirish faqat KO'RSATISH, tekshiruv emas.

### Qadamlar

- [ ] **3.1 — Test (RED):** `cart-line-edit-modal.test.tsx` da «Minimal ko'rinadi» niyatli
  assertlarni qayta yoz + qo'sh:

```tsx
it('P03 (2026-08-13) — «Minimal» sukutda YASHIRIN, «•••» turadi', () => {
  renderModal({ costMinor: 1885000n }); // fayldagi mavjud jihoz bilan
  expect(screen.queryByTestId('pos-line-edit-floor')).toBeNull();
  expect(screen.getByTestId('pos-line-edit-floor-toggle')).toBeInTheDocument();
});

it('P03 — «•••» bosilganda Minimal qiymati ochiladi', async () => {
  renderModal({ costMinor: 1885000n });
  await userEvent.click(screen.getByTestId('pos-line-edit-floor-toggle'));
  expect(screen.getByTestId('pos-line-edit-floor')).toHaveTextContent(/18\s*850/);
});

it('P03 — pol QULFI yashirin holatda ham ishlaydi (poldan past narx bloklanadi)', async () => {
  renderModal({ costMinor: 1885000n });
  await typePrice('10000'); // poldan past
  expect(screen.getByTestId('pos-line-edit-floor-blocked')).toBeInTheDocument();
});
```

- [ ] **3.2 — RED tasdiq:** `pnpm --filter @moysklad/web test cart-line-edit-modal` → FAIL.

- [ ] **3.3 — Implementatsiya:** komponentga holat qo'sh:

```tsx
// P03 (2026-08-13, egasi): «Minimal» sukutda yashirin — kassir/mijoz ko'zi
// oldida pol narxi ochiq turmasin; bosilganda ko'rinadi. Qulf mantiqqa
// TEGILMAGAN — bu faqat ko'rsatish.
const [floorRevealed, setFloorRevealed] = useState(false);
useEffect(() => {
  setFloorRevealed(false); // boshqa qator ochilsa yana yashirin
}, [line?.id]);
```

  :344–356 dagi «Minimal» span'ini shartli render bilan almashtir (atrofdagi layout saqlanadi):

```tsx
{floorRevealed ? (
  <span data-test-id="pos-line-edit-floor" …mavjud class/format…>
    {t('cart_floor')}: {formatMoney(floorMinor)}
  </span>
) : (
  <button
    type="button"
    data-test-id="pos-line-edit-floor-toggle"
    className="…mavjud span class'iga mos, + cursor-pointer…"
    onClick={() => setFloorRevealed(true)}
  >
    {t('cart_floor')}: •••
  </button>
)}
```
  (`•••` — matn emas, belgi: i18n kaliti kerak emas; `cart_floor` kaliti mavjud.)

- [ ] **3.4 — GREEN + to'liq gate + commit:**
```bash
git add apps/web/src/components/pos/cart-line-edit-modal.tsx apps/web/src/components/pos/__tests__/cart-line-edit-modal.test.tsx
git commit -m "feat(kassa): modalda minimal narx yashirin — bosilganda ochiladi (P03)"
```

- [ ] **3.5 — Hisobot + TO'XTASH.**

---

# F4 — Mahsulot nomi: boshqa xildagi KATTAROQ shrift

**Qamrov:** P04
**Ruxsat etilgan fayllar:**
- `packages/design-system/src/globals.css` (1 o'zgaruvchi)
- `apps/web/tailwind.config.ts` (fontFamily'ga 1 yozuv)
- `apps/web/src/app/(app)/sotuv/page.tsx` (2 joyda class), `apps/web/src/components/pos/cart-line-edit-modal.tsx` (1 joyda class)
- `apps/web/src/app/(app)/sotuv/__tests__/sales-screen-cart.test.tsx` (kichik guard)
- Hisobot

**TAQIQ:** global body-shriftga TEGILMAYDI (`--ms-font-sans` o'zgarmaydi — butun ERP moysklad-parity).
Yangi font FAYLI/download QO'SHILMAYDI (next/font emas: VPS build'ida tashqi yuklab olish —
deterministik emas; kassa monobloki Windows — «Segoe UI» doim bor).

### Dizayn

Joriy zanjir: `globals.css:211` `--ms-font-sans: "Helvetica Neue", Helvetica, Arial…` (Windows'da
amalda Arial). Yangi o'zgaruvchi `--pos-font-product: "Segoe UI", "Segoe UI Variable Text", var(--ms-font-sans)` —
Arial'dan aniq farq qiladi, hech narsa yuklab olinmaydi. Tailwind'da `font-pos` klass.
O'lcham: qidiruv kartasi nomi `text-sm → text-base font-semibold`; savat qatori nomi
`text-sm → text-base font-semibold`; modal sarlavhasi (allaqachon `text-xl font-bold`) faqat `font-pos` oladi.

### Qadamlar

- [ ] **4.1 — Guard-test (RED):** `sales-screen-cart.test.tsx` ga:

```tsx
it('P04 (2026-08-13) — mahsulot nomi POS shriftida va kattaroq', async () => {
  await openSalesScreenWithProducts();
  const name = screen.getByTestId('sotuv-product').querySelector('.font-pos');
  expect(name, 'qidiruv kartasi nomi font-pos emas').not.toBeNull();
  expect(name?.className).toContain('text-base');
});
```

- [ ] **4.2 — RED tasdiq**, so'ng implementatsiya:
  - `globals.css` (`--ms-font-sans` qatoridan keyin):
    ```css
    /* POS mahsulot nomlari (P04, 2026-08-13 egasi: «boshqa xildagi kattaroq
       shrift»). Segoe UI — kassa monobloki Windows'da doim bor; boshqa OS'da
       sans zaxirasiga tushadi. Global --ms-font-sans'ga TEGILMAGAN. */
    --pos-font-product: "Segoe UI", "Segoe UI Variable Text", var(--ms-font-sans);
    ```
  - `tailwind.config.ts` → `fontFamily`ga: `pos: ['var(--pos-font-product)'],`
  - `page.tsx:1917` (qidiruv kartasi nomi): `font-medium … text-sm` → `font-pos font-semibold … text-base`
  - `page.tsx:2729` (savat qatori nomi): `… font-medium text-sm …` → `… font-pos font-semibold text-base …`
  - `cart-line-edit-modal.tsx:235` (modal sarlavha): class boshiga `font-pos ` qo'sh.

- [ ] **4.3 — GREEN + to'liq gate + commit:**
```bash
git add packages/design-system/src/globals.css apps/web/tailwind.config.ts "apps/web/src/app/(app)/sotuv/page.tsx" apps/web/src/components/pos/cart-line-edit-modal.tsx "apps/web/src/app/(app)/sotuv/__tests__/sales-screen-cart.test.tsx"
git commit -m "feat(kassa): mahsulot nomi alohida kattaroq shriftda (P04)"
```
  ⚠️ design-system o'zgardi — gate'dan oldin `pnpm --filter @moysklad/ui build` kerak bo'lsa
  (xotira `money-dist-stale-tsbuildinfo` klassi), turbo buni o'zi hal qiladi; typecheck yashilligini tekshir.

- [ ] **4.4 — Hisobot + TO'XTASH.** O'lchanmagan: real monoblokda Segoe UI renderi.

---

# F5 — Chek oxirida «Sizning qarzingiz: …»

**Qamrov:** P05
**Ruxsat etilgan fayllar:**
- `apps/web/src/lib/pos/receipt-model.ts`, `apps/web/src/lib/print-agent.ts`,
  `apps/web/src/components/print/tovar-chek.tsx`, `apps/web/src/app/print/retail-sale/[id]/page.tsx`
- `apps/web/src/app/(app)/sotuv/page.tsx` (faqat chop-chaqiruv nuqtasi, agar model shu yerda qurilsa)
- Testlar: `apps/web/src/lib/pos/receipt-model.test.ts`, `apps/web/src/lib/__tests__/receipt-renderers.test.ts`
- `apps/web/src/messages/{ru,uz}.json` (agar chek yorlig'i i18n'dan olinsa — receipt-model'dagi
  konstantalar literal bo'lsa, konstanta yetarli)
- Hisobot

**TAQIQ:** `apps/api` ga TEGILMAYDI. Sabab: kerakli raqam allaqachon serverda tayyor —
`GET /debts/pos/summary/:counterpartyId` → `payableMinor` («bitta halol raqam», xotira
`pos-customer-card-one-number`); kiosk-policy'da `/debts/*` ochiq. Yangi endpoint/cross-module
DI (xotira `global-di-injection-unguarded` xavfi) SHART EMAS.

### Dizayn

- **Ma'lumot oqimi:** chek chop etilishidan OLDIN, agar chekda `agent` (kontragent) bo'lsa,
  FE `GET /debts/pos/summary/<agentId>?currency=UZS` ni chaqiradi → `payableMinor`.
  Bu **post()'dan keyingi** qiymat: kam to'lov qarzi balansga allaqachon yozilgan
  (`retail-sale.service.ts:1202–1210`), ya'ni «qolgan qoldiq» aynan shu son.
  So'rov yiqilsa → `null` → qator chiqmaydi, **chek baribir chop etiladi** (fail-open —
  chek to'xtamasin).
- **Model:** `ReceiptModel`ga `debtAfterMinor: bigint | null` maydoni; `RECEIPT_LABELS`ga
  `debtAfter: "Sizning qarzingiz"`. Ko'rsatish sharti: `debtAfterMinor != null && > 0n`.
- **UCH renderer birga yangilanadi** (xotira `ombor-chek-uch-renderer`: biri o'zgarsa qolgani
  eskiradi): `buildReceiptText` (:506–522 jami/to'lov bloki), `buildReceiptHtml` (:545–549),
  `tovar-chek.tsx` (:225–233 total/payments footer'i). Uchchalasida ham to'lov qatorlaridan
  KEYIN, footer'dan OLDIN.

### Qadamlar

- [ ] **5.1 — Model testi (RED):** `receipt-model.test.ts`ga:

```ts
it('P05 — debtAfterMinor modeldan o`tadi (null = o`lchanmagan, qator yo`q)', () => {
  const m = buildReceiptModel({ ...baseInput, debtAfterMinor: 125000000n });
  expect(m.debtAfterMinor).toBe(125000000n);
  const m2 = buildReceiptModel({ ...baseInput });
  expect(m2.debtAfterMinor).toBeNull();
});
```

  `receipt-renderers.test.ts`ga (uch renderer sinxronligi):

```ts
it('P05 — uchchala renderer «Sizning qarzingiz» qatorini chiqaradi (>0 bo`lsa)', () => {
  const m = modelWith({ debtAfterMinor: 125000000n });
  expect(buildReceiptText(m)).toContain('Sizning qarzingiz');
  expect(buildReceiptHtml(m)).toContain('Sizning qarzingiz');
  // tovar-chek: render qilib matnni tekshir (fayldagi mavjud render jihozi bilan)
});

it('P05 — qarz 0 yoki null bo`lsa qator CHIQMAYDI', () => {
  for (const v of [0n, null]) {
    const m = modelWith({ debtAfterMinor: v });
    expect(buildReceiptText(m)).not.toContain('Sizning qarzingiz');
  }
});
```

- [ ] **5.2 — RED tasdiq:** `pnpm --filter @moysklad/web test receipt-model receipt-renderers` → FAIL.

- [ ] **5.3 — Model + uch renderer:** `receipt-model.ts`da maydon/label; `print-agent.ts`
  ikkala qurish funksiyasida to'lovlardan keyin:

```ts
if (m.debtAfterMinor != null && m.debtAfterMinor > 0n) {
  // ESC/POS: lines.push(`${RECEIPT_LABELS.debtAfter}: ${fmtAmount(m.debtAfterMinor)}`);
  // HTML: payHtml ga xuddi to'lov qatori uslubida bitta qator (ajratuvchi chiziq bilan)
}
```
  `tovar-chek.tsx` footer'ida payments.map'dan keyin xuddi shu shart bilan qator.

- [ ] **5.4 — Ma'lumot ulash:** chop-chaqiruv nuqtalarini top va summary'ni ulash:
  - `printReceiptViaAgent(saleId)` yo'li (`print-agent.ts` — sale fetch qilinadigan joy):
    sale'da `agent?.id` bo'lsa `api.get('/debts/pos/summary/'+id+'?currency=UZS')` →
    `BigInt(payableMinor)`; `catch → null`.
  - Brauzer-popup yo'li: `app/print/retail-sale/[id]/page.tsx:73` dagi fetch'dan keyin xuddi shu.
  Ikkala joyda bitta helper ishlat (masalan `lib/pos/receipt-debt.ts` — 20 qatorlik
  `fetchDebtAfter(agentId): Promise<bigint | null>`; alohida fayl — ikki nusxa bo'lmasin).

- [ ] **5.5 — GREEN + to'liq gate + commit:**
```bash
git add apps/web/src/lib/pos/receipt-model.ts apps/web/src/lib/print-agent.ts apps/web/src/lib/pos/receipt-debt.ts apps/web/src/components/print/tovar-chek.tsx "apps/web/src/app/print/retail-sale/[id]/page.tsx" apps/web/src/lib/pos/receipt-model.test.ts apps/web/src/__tests__/receipt-renderers.test.ts
git commit -m "feat(kassa): chek oxirida mijozning qolgan qarzi (P05)"
```

- [ ] **5.6 — Hisobot + TO'XTASH.** O'lchanmagan: real chekda (qog'ozda) qator ko'rinishi.

---

# F6 — Kassir ISTALGAN chekka qaytarish qila oladi

**Qamrov:** P06
**Ruxsat etilgan fayllar:**
- API: `apps/api/src/modules/retail-sale/retail-sale.service.ts`,
  `retail-sale-refund-guards.test.ts`, `retail-sale-refund-debt.test.ts` (kerak bo'lsa),
  `apps/api/src/modules/permissions/role-templates.ts` (+ `role-templates.test.ts`),
  `apps/api/src/scripts/ops-f6-salesreturn-topup.ts` (yaratish)
- Web: `apps/web/src/app/(app)/sotuv/page.tsx` (Cheklar tabi + ChekDetailPanel),
  `apps/web/src/app/(app)/sotuv/__tests__/chek-detail-panel.test.tsx`,
  `apps/web/src/messages/{ru,uz}.json`
- Hisobot

**TAQIQ:** kanal-cap validatsiyasi (`retail-refund-validation.ts`) va COGS/qarz auto-split
MANTIG'I O'ZGARMAYDI — «istalgan chek» faqat SMENA va RUXSAT to'siqlarini ochadi.
Mirror-chekni qayta qaytarish taqiqi (:1435–1444) QOLADI.

### Dizayn — ikkita to'siq ochiladi, ikkalasi ham ONGLI siyosat-bekor

**A. Smena to'sig'i.** Hozir qaytarish **asl chek smenasiga** yoziladi (`sessionId: original.sessionId`,
service :1637) va shu smena ochiq bo'lishi shart (precheck :1445–1447 + atomik claim :1797–1808).
Yangi qoida: qaytarish **qaytaruvchi kassirning JORIY ochiq smenasiga** yoziladi:
- precheck :1445–1447 (`original.session.state !== 'open'`) — OLIB TASHLANADI;
- mirror sale `sessionId` = joriy ochiq smena (`cashierSession.findFirst({accountId,
  cashierId: user.sub, state: 'open'})` tranzaksiyadan oldin topiladi);
- atomik claim :1797–1808 **joriy smenaga** ko'chadi (xuddi shu `updateMany where {id: current.id,
  state:'open'}` + `returnsCount/returnsSumMinor increment` — hisoblagichlar endi joriy smenada,
  Z-hisobot (:1902 agregatlar `sessionId` bo'yicha) avtomatik to'g'ri bo'ladi);
- ochiq smena bo'lmasa: `ConflictException("Ochiq smena yo'q — qaytarish uchun avval smena oching.")`;
- naqd qaytim **joriy smenaning kassasidan** chiqadi (CashDesk delta joriy sessiya kassasiga) —
  agent `CashDesk.balanceMinor` dekrementi qaysi kassaga ketayotganini :1388–1800 oralig'ida
  topib, joriy sessiya kassasiga o'tkazadi.
- **Kanal-cap saqlanadi:** karta cheki naqd qaytarilmaydi (xotira `refund-channel-cap-cash-vs-card`).

**B. Ruxsat to'sig'i.** 2026-08-12 da egasi «kassadan pul chiqishi menejer qarori» degan edi —
qaytarish `salesreturn.create`ga ko'chirilgan va kassirga BERILMAGAN (`role-templates.ts:323–326`).
**2026-08-13 da egasi bu qarorni BEKOR qildi** («kassir istalgan chekga vozvrat qilishi kerak»).
Endi: `cashier` shabloniga `grant(['salesreturn'], { view: 'ALL', create: 'ALL' })`; FE'dagi
`!isKiosk` sharti (page.tsx :519–520) olib tashlanadi. Qo'riqchi testlar (jumladan
`retail-sale-lifecycle-permissions.test.ts` va `role-templates.test.ts`) YANGI niyat + sana +
eski qaror bekor qilinganini izohlab QAYTA YOZILADI, o'chirilmaydi. Prod'dagi MAVJUD rollar
uchun `ops-f6-salesreturn-topup.ts` (namuna: `ops-p3-role-topup.ts` — templateSlug='cashier'
rollariga salesreturn view/create=ALL; `--dry-run` default, `--apply` operator bilan).
KIOSK_ALLOWED'da `/retail-sales/*` allaqachon ochiq — kiosk-policy o'zgarishi kerak emas;
`role-templates.test.ts`dagi kiosk-moslik tekshiruvi salesreturn uchun nima talab qilishini
agent birinchi RED'da ko'radi va izoh bilan moslaydi.

**C. «Istalgan chekni TOPISH» (web).** Cheklar tabi hozir faqat joriy smena
(`GET /retail-sales?sessionId=…&limit=100`, page.tsx :1161–1164). Backend TAYYOR:
`RetailSaleFilterSchema` da `search` (chek nomi + kontragent nomi bo'yicha, service :374–381),
`dateFrom/To` bor. UI: Cheklar tabi tepasiga qidiruv maydoni (`data-test-id="sotuv-chek-search"`):
bo'sh → joriy smena (hozirgi xulq); matn kiritilsa → `GET /retail-sales?search=<q>&limit=50`
(sessionId'siz — barcha smenalar). i18n: `pages.sotuv.chek_search_placeholder`
(uz: "Chek raqami yoki mijoz…", ru: "Номер чека или клиент…").

### Qadamlar

- [ ] **6.1 — API testlar (RED):** `retail-sale-refund-guards.test.ts` qayta yoziladi:
  - «asl smena yopiq → 409» testi → **«asl smena yopiq bo'lsa HAM qaytarish O'TADI (joriy ochiq
    smena bor)»** (niyat-bekor izohi bilan);
  - yangi: «qaytaruvchida ochiq smena YO'Q → 409 "Ochiq smena yo'q…"»;
  - yangi: «mirror chek JORIY smenaga yoziladi, hisoblagichlar joriy smenada»;
  - qoladi: mirror-refund taqiqi (:144), atomik claim poygasi (endi joriy smenada).
  `retail-sale-lifecycle-permissions.test.ts` dagi «refund `retailsale.approve` da EMAS» (:162)
  qoladi (permission slug o'zgarmaydi); kassir-403 kutgan testlar yangi niyatga qayta yoziladi.
  `role-templates.test.ts` — cashier'da salesreturn granti kutiladi.

- [ ] **6.2 — RED tasdiq:** `pnpm --filter @moysklad/api test retail-sale-refund-guards role-templates` → FAIL.

- [ ] **6.3 — Service o'zgarishi** (dizayn A bo'yicha; joriy smenani topish, precheck'ni olib
  tashlash, claim/hisoblagich/CashDesk'ni joriy smenaga ko'chirish, xato matnlari yuqoridagidek).

- [ ] **6.4 — `role-templates.ts`:** cashier grantiga (:327 blokidan keyin, eski qaror-izohini
  YANGILAB — «🔴 2026-08-13: egasi 2026-08-12 qarorini bekor qildi — kassir qaytarishi mumkin»):
  `grant(['salesreturn'], { view: 'ALL', create: 'ALL' }),`

- [ ] **6.5 — `ops-f6-salesreturn-topup.ts`:** `ops-p3-role-topup.ts` nusxasidan:
  templateSlug='cashier' bo'lgan rollarga `salesreturn.view/create = ALL`; default dry-run.

- [ ] **6.6 — API GREEN:** `pnpm --filter @moysklad/api test` (to'liq — refund o'zgarishi keng qatlam).

- [ ] **6.7 — Web (RED→GREEN):** `chek-detail-panel.test.tsx`da «kiosk qaytara olmaydi» niyatli
  test qayta yoziladi («kiosk HAM qaytaradi», sana+sabab), yangi test: qidiruv maydoni bor va
  matn kiritilganda so'rov `search=` bilan ketadi (sessionId'siz). Implementatsiya: page.tsx'da
  :519–520 `!isKiosk` sharti olib tashlanadi (izoh yangilanadi — u yerda P3 izohi bor);
  Cheklar tabi so'rovi (:1161–1164) qidiruv holatiga qarab almashadi; qidiruv input + i18n kalitlar.

- [ ] **6.8 — To'liq gate (web+api) + commit:**
```bash
git add apps/api/src/modules/retail-sale/retail-sale.service.ts apps/api/src/modules/retail-sale/retail-sale-refund-guards.test.ts apps/api/src/modules/retail-sale/retail-sale-lifecycle-permissions.test.ts apps/api/src/modules/permissions/role-templates.ts apps/api/src/modules/permissions/role-templates.test.ts apps/api/src/scripts/ops-f6-salesreturn-topup.ts "apps/web/src/app/(app)/sotuv/page.tsx" "apps/web/src/app/(app)/sotuv/__tests__/chek-detail-panel.test.tsx" apps/web/src/messages/ru.json apps/web/src/messages/uz.json
git commit -m "feat(kassa): kassir istalgan chekka qaytarish qila oladi, mirror joriy smenaga (P06)"
```

- [ ] **6.9 — Hisobot + TO'XTASH.** Deploy bo'lsa: prod'da `ops-f6-salesreturn-topup.ts --apply`
  ham kerak (operator ruxsati bilan) — aks holda prod kassirlarda ruxsat bo'lmaydi
  (xotira `stale-seeded-db-missing-permission-rows` klassi).

---

# F7 — O'ng panelda «Mijozlar» bo'limi (Cheklar va Smena orasida)

**Qamrov:** P07
**Ruxsat etilgan fayllar:**
- `apps/web/src/components/pos/customers-panel.tsx` (YARATISH — page.tsx'ni bo'kirtirmaslik uchun, MK33 qarzi)
- `apps/web/src/components/pos/__tests__/customers-panel.test.tsx` (yaratish)
- `apps/web/src/app/(app)/sotuv/page.tsx` (tab qo'shish + panel mount + mavjud modal'larga ulash)
- `apps/web/src/messages/{ru,uz}.json`
- Hisobot

**TAQIQ:** yangi backend YO'Q — hammasi mavjud endpointlarda (quyida). `CustomerCardPanel`,
`DebtPaymentDialog` QAYTA YOZILMAYDI — qayta ishlatiladi.

### Dizayn

Yangi tab `mijozlar` — `type Tab` ittifoqiga qiymat, tab-bar'da (page.tsx :1969–2063 pattern:
qo'lda `<button>`) **`cheklar` va `smena` orasiga**. Panel — yangi `<CustomersPanel />` komponenti:

1. **Qidiruv:** `GET /counterparties?search=<q>&limit=20` (kiosk-policy: ildiz GET ochiq, exact).
   Natija ro'yxati: nom + telefon (`data-test-id="pos-customers-result"`).
2. **Tanlangan mijoz kartochkasi:** `GET /debts/pos/summary/<id>?currency=UZS` → `payableMinor`
   («bitta halol raqam» — xuddi `customer-card-panel.tsx:390` uslubida; `balanceMinor === null`
   → «o'lchanmagan» qatori, xotira `pos-customer-card-one-number`).
3. **Amallar (3 tugma):**
   - **«Qarz to'lash»** → mavjud `DebtPaymentDialog` ochiladi (page.tsx :3173–3190 mount'i
     tanlangan mijoz bilan ochilishini qo'llaydi — `onPayDebt` oqimi customer-card'dan qanday
     ochsa, shunday);
   - **«Mijoz kartasi»** → mavjud `CustomerCardPanel` (tarix/telefon-tahrir shu yerda);
   - **«Cheklari»** → shu panel ichida `GET /retail-sales?agentId=<id>&limit=50` ro'yxati
     (filter TAYYOR — `RetailSaleFilterSchema.agentId`); chek bosilsa mavjud `ChekDetailPanel`
     ochiladi (u yerdan F6 qaytarish oqimi ishlaydi).
4. Interfeys shartnomasi (page.tsx ↔ komponent):

```tsx
interface CustomersPanelProps {
  onOpenCustomerCard: (agent: { id: string; name: string }) => void;
  onPayDebt: (agent: { id: string; name: string }) => void;
  onOpenChek: (saleId: string) => void; // ChekDetailPanel'ni ochadi
}
```

### Qadamlar

- [ ] **7.1 — Komponent testlari (RED):** `customers-panel.test.tsx` (komponent to'g'ridan-to'g'ri
  import + `api` mok — `debt-payment-balance.test.tsx` patterni):
  qidiruv → natija chiqadi; tanlash → summary chaqiriladi va qarz ko'rinadi
  (`data-test-id="pos-customers-debt"`); `balanceMinor:null` → «o'lchanmagan»; uch amal-tugma
  callback'larni to'g'ri argument bilan chaqiradi; «Cheklari» → `agentId=` so'rovi ketadi.
- [ ] **7.2 — RED tasdiq** → `CustomersPanel` implementatsiyasi (yuqoridagi dizayn; UI uslubi —
  qo'shni panellar bilan bir xil, `@moysklad/ui` primitivlari).
- [ ] **7.3 — Sahifa testlari (RED):** `sotuv/__tests__` da (harness orqali): «Mijozlar» tabi
  cheklar↔smena orasida turadi; tab ochilib qidiruv ko'rinadi.
- [ ] **7.4 — page.tsx ulash:** `type Tab` + tugma + `{tab === 'mijozlar' && <CustomersPanel …/>}`;
  callback'lar mavjud modal-mount'larga ulanadi. i18n: `pages.sotuv.tab_customers`
  (uz: "Mijozlar", ru: "Клиенты") va panel matnlari ru+uz.
- [ ] **7.5 — GREEN + to'liq gate + commit:**
```bash
git add apps/web/src/components/pos/customers-panel.tsx apps/web/src/components/pos/__tests__/customers-panel.test.tsx "apps/web/src/app/(app)/sotuv/page.tsx" apps/web/src/messages/ru.json apps/web/src/messages/uz.json
# + qo'shilgan sahifa-test fayli
git commit -m "feat(kassa): o'ng panelda Mijozlar bo'limi — qarz, to'lov, cheklar (P07)"
```
- [ ] **7.6 — Hisobot + TO'XTASH.**

---

## 🚀 Sessiya promptlari (operator har fazani shu matn bilan boshlaydi)

Har prompt yangi sessiyaga AYNAN shu ko'rinishda tashlanadi (faqat faza raqami farq qiladi).

**F1:**
```
docs/superpowers/plans/2026-08-13-kassa-pos-7-funksiya.md rejasini to'liq o'qi va FAQAT F1
fazasini (oyna boshqaruv tugmalari — / ❐ / ✕, desktop 1.7.0) bajar. Reja protokoli majburiy:
TDD (avval RED), to'liq gate, aniq-yo'lli git add, commitdan keyin git show --stat HEAD.
Faza tugagach hisobotni suhbatga va reja pastidagi «📝 F1 hisoboti» seksiyasiga (Edit bilan,
append EMAS) yoz va TO'XTA — keyingi fazani BOSHLAMA. Exe yig'ish/kanalga chiqarish qadamida
mendan ruxsat so'ra.
```

**F2:**
```
docs/superpowers/plans/2026-08-13-kassa-pos-7-funksiya.md rejasini to'liq o'qi va FAQAT F2
fazasini (qidiruvda «Kelgan» va savatda «Optom» ko'rinmasin) bajar. Protokol: TDD (avval RED),
to'liq gate, aniq-yo'lli git add, git show --stat HEAD. Hisobotni suhbatga va reja pastidagi
«📝 F2 hisoboti» seksiyasiga yoz va TO'XTA — keyingi fazani BOSHLAMA.
```

**F3:**
```
docs/superpowers/plans/2026-08-13-kassa-pos-7-funksiya.md rejasini to'liq o'qi va FAQAT F3
fazasini (qator-tahrir modalida «Minimal» yashirin, bosilganda ochiladi) bajar. Protokol: TDD,
to'liq gate, aniq-yo'lli git add, git show --stat HEAD. Hisobotni suhbatga va reja pastidagi
«📝 F3 hisoboti» seksiyasiga yoz va TO'XTA — keyingi fazani BOSHLAMA.
```

**F4:**
```
docs/superpowers/plans/2026-08-13-kassa-pos-7-funksiya.md rejasini to'liq o'qi va FAQAT F4
fazasini (mahsulot nomi boshqa xildagi kattaroq shriftda) bajar. Protokol: TDD, to'liq gate,
aniq-yo'lli git add, git show --stat HEAD. Hisobotni suhbatga va reja pastidagi «📝 F4
hisoboti» seksiyasiga yoz va TO'XTA — keyingi fazani BOSHLAMA.
```

**F5:**
```
docs/superpowers/plans/2026-08-13-kassa-pos-7-funksiya.md rejasini to'liq o'qi va FAQAT F5
fazasini (chek oxirida «Sizning qarzingiz» qatori, uch renderer birga) bajar. Protokol: TDD,
to'liq gate, aniq-yo'lli git add, git show --stat HEAD. apps/api ga TEGMA — ma'lumot
/debts/pos/summary dan olinadi. Hisobotni suhbatga va reja pastidagi «📝 F5 hisoboti»
seksiyasiga yoz va TO'XTA — keyingi fazani BOSHLAMA.
```

**F6:**
```
docs/superpowers/plans/2026-08-13-kassa-pos-7-funksiya.md rejasini to'liq o'qi va FAQAT F6
fazasini (kassir istalgan chekka qaytarish; mirror joriy smenaga; kassirga salesreturn ruxsati;
Cheklar tabida qidiruv) bajar. Bu faza IKKI ONGLI siyosat-bekorni o'z ichiga oladi — qo'riqchi
testlarni o'chirmasdan yangi niyat bilan qayta yoz. Protokol: TDD, to'liq gate (web+api),
aniq-yo'lli git add, git show --stat HEAD. Prod DB'ga yozma (ops-skript faqat --dry-run;
--apply uchun mendan so'ra). Hisobotni suhbatga va reja pastidagi «📝 F6 hisoboti» seksiyasiga
yoz va TO'XTA — keyingi fazani BOSHLAMA.
```

**F7:**
```
docs/superpowers/plans/2026-08-13-kassa-pos-7-funksiya.md rejasini to'liq o'qi va FAQAT F7
fazasini (o'ng panelda «Mijozlar» bo'limi — Cheklar va Smena orasida) bajar. Yangi backend
YOZMA — hammasi mavjud endpointlarda. Protokol: TDD, to'liq gate, aniq-yo'lli git add,
git show --stat HEAD. Hisobotni suhbatga va reja pastidagi «📝 F7 hisoboti» seksiyasiga yoz
va TO'XTA — keyingi fazani BOSHLAMA.
```

---

## 📝 Hisobotlar (har faza agenti O'Z seksiyasini Edit bilan to'ldiradi — append TAQIQ)

### 📝 F1 hisoboti — 2026-08-13 · `5f758d71` (kod) · `57b0ed3` (hisobot)
**Holat:** ✅ Phase-1 complete (kod + exe kanalda; qurilmada runtime-tasdiqlanmagan)
**Nima o'zgardi:** Qobiqda o'ng-yuqori uchlik: «—» (`shell:minimize`), «❐» (`shell:toggle-windowed`
— kiosk ↔ ramkasiz 1280×800 markazda), «✕» (avvalgidek tasdiqli `shell:request-quit`). Close-qo'riqchi
`win?.isKiosk()` dan `!allowQuit && serverBase()` ga ko'chdi — oynali rejimda Alt+F4/taskbar-close
endi jim yopmaydi, sozlash oynasi (serverBase bo'sh) esa avvalgidek yopiladi. Versiya 1.6.0 → 1.7.0.
**Fayllar:** | Yo'l | Nima qilindi |
| `desktop/preload.js` | `installExitButton` → `installWindowControls` (WINDOW_BUTTONS uchligi, har biri yalang `<button>`) |
| `desktop/main.js` | `shell:minimize` + `shell:toggle-windowed` ishlovchilari; close-qo'riqchi konfigga bog'landi |
| `desktop/package.json` | versiya 1.7.0 |
| `desktop/README.md` | sarlavha-holat, «Natija» fayl nomlari 1.7.0, reliz-tarix qatori |
| `apps/web/src/__tests__/desktop-window-controls.test.ts` | `desktop-exit-button.test.ts` dan git mv + yangi niyat («bitta ✕» → «uchlik», E1–E4 meros, W1–W2 yangi) |
| `apps/web/src/__tests__/electron-bridge-contract.test.ts` | 🔴 rejada sanalmagan, lekin MAJBURIY: :314–318 qo'riqchisi ESKI close-shaklni (`!allowQuit && win?.isKiosk()`) qulflab turardi — yangi W2 grep-testi bilan bir vaqtda o'ta olmasdi. O'chirilmadi, yangi niyat + sana + sabab bilan qayta yozildi (F1 taqiqlari testlarni istisno qiladi) |
**Testlar:** desktop-window-controls (11 test: uchlik chiziladi, yalang button, 3 kanal, tasdiqsiz quit yo'q, file:// sharti, imo qoladi, CSSOM, main.js W1/W2). RED ko'rildi: 8 failed / 3 passed (tugmalar/ishlovchilar/qo'riqchi yo'qligida). GREEN: 134/134 (window-controls + touch-keyboard + bridge-contract birga).
**Gate:** typecheck 0 ✓ · lint:product 0 ✓ · i18n:gate 19/19 ✓ · web test 269 fayl / 3838 pass ✓ (api'ga tegilmagan)
**O'LCHANGAN vs O'LCHANMAGAN:** O'lchandi — preload happy-dom'da haqiqiy ijro (tugmalar DOM'da, IPC kanallari mok orqali), main.js manba-grep, to'liq web gate, commit tarkibi (`git show --stat`: 7 o'z fayl + progress.json hook'i). O'LCHANMADI — qurilmada —/❐ xulqi (minimize/restore, kiosk↔oynali o'tish, oynali rejimdan qaytish), 1.7.0 exe umuman yig'ilmagan. **Phase-1: strukturaviy, qurilmada runtime-tasdiqlanmagan.**
**Nima QILINMADI va nega:** qurilmada —/❐ jonli sinovi va 1.6.0→1.7.0 avto-o'tish kuzatuvi — bu Phase-2/qurilma-QA ishi.
**Deploy:** ✅ operator ruxsati bilan (1.8): `pnpm run dist` → `Sherset-Kassa-Setup-1.7.0.exe` (81 962 235 bayt) → scp `/var/www/kassa-downloads/desktop/` → remote sha512 latest.yml bilan AYNAN mos → `latest.yml.bak-1.6.0` zaxira → yangi `latest.yml` → curl: manifest `version: 1.7.0`, exe HEAD 200. Git push o'tdi (`69b48eda..57b0ed39`). Web deploy YO'Q (kerak emas — faqat desktop o'zgardi).
**TO'XTADIM.**

### 📝 F2 hisoboti
_(hali yozilmagan)_

### 📝 F3 hisoboti
_(hali yozilmagan)_

### 📝 F4 hisoboti
_(hali yozilmagan)_

### 📝 F5 hisoboti
_(hali yozilmagan)_

### 📝 F6 hisoboti
_(hali yozilmagan)_

### 📝 F7 hisoboti
_(hali yozilmagan)_
