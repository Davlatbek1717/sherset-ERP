# Kassa POS redizayn — implementatsiya rejasi

> **Agent ishchilar uchun:** har faza ALOHIDA agent tomonidan, ALOHIDA sessiyada bajariladi.
> Faza tugagach agent **hisobot yozadi va TO'XTAYDI**. Keyingi fazani boshlash **TAQIQLANADI** —
> uni faqat operator (foydalanuvchi) yangi sessiyada ishga tushiradi.
> Har faza prompti hujjat oxirida («Faza promptlari»).

**Maqsad:** `/sotuv` POS sahifasini sensorli monoblokka mos zamonaviy interfeysga o'tkazish
(chap sidebar, ko'k-oq SHERSET tema, katta shriftlar), smena yopish oqimini kassir mustaqil
yakunlaydigan qilish (yopiq sanoq + ochiq cheklar ro'yxati), oyna tugmalarini headerga
singdirish (exe 1.7.0) va bir qurilmada bir nechta kassir ishlashiga yo'l ochish.

**Arxitektura:** `/sotuv` BITTA route qoladi (savat holati, smena sessiyasi, mijoz-ekran
sinxroni buzilmaydi). 3370-qatorli `page.tsx` avval XULQNI O'ZGARTIRMASDAN rejim-komponentlarga
bo'linadi (F1), keyin ustiga yangi qobiq (sidebar+header+tema, F2) va rejim-ekranlar (F3–F5)
quriladi. Exe o'zgarishi (F6) va ko'p-kassir (F7–F8) mustaqil qatlamlar. F9 — yakun + deploy.

**Tech stack:** Next.js App Router · TanStack Query · next-intl (ru+uz) · Tailwind +
`--ms-*` tokenlar · Vitest (happy-dom) · Electron 33 (desktop/) · NestJS + Prisma (auth).

**Spec:** `docs/superpowers/specs/2026-08-14-kassa-pos-redizayn-design.md` — reja shu
hujjatdan kelib chiqadi; har faza agenti AVVAL spec'ni to'liq o'qiydi.

---

## Global cheklovlar (har fazada amal qiladi)

- **Model:** Opus/flagship. Sonnet ishlatilmaydi (`CLAUDE.md` §0).
- **Bitta sessiya = bitta faza.** Faza tugadi → hisobot → TO'XTA. Keyingisini operator ochadi.
- **Gate (har commitdan oldin, to'liq):**
  ```
  pnpm typecheck
  pnpm lint:product
  pnpm i18n:gate
  pnpm --filter @moysklad/web test
  ```
  `apps/api` ga tegilgan bo'lsa qo'shimcha: `pnpm --filter @moysklad/api test`.
- **77 POS characterization testi (MK32) — qabul mezoni.** Ular yashil turishi shart.
  Xulq ATAYLAB o'zgargan joyda (masalan ± tugmalar olib tashlanishi) test **qayta yoziladi**
  (yangi niyat + eski niyat nega bekor bo'lgani izohda) — **o'chirilmaydi**.
- **Mavjud test-fayl ustidan `Write` TAQIQ** — faqat `Edit` (xotira:
  `never-write-over-existing-test-file` — Write testlarni jimgina o'chirgan, gate yashil qolgan).
- **Yorliq halolligi:** F1–F8 natijalari **«Phase-1: strukturaviy, runtime-tasdiqlanmagan»**.
  «done» / «production-ready» / «verified» so'zlari F9 qurilma-sinovigacha TAQIQ.
- **i18n:** yangi yorliqlar FAQAT `apps/web/src/messages/{ru,uz}.json` orqali, JSX'da hardcoded
  kirill/matn TAQIQ. Diqqat: i18n-gate komponent papkalarini tekshirmaydi (xotira:
  `i18n-gate-blind-to-components`) — gate jim degani hardcode yo'q degani EMAS, o'zing tekshir.
- **Dialog konvensiyasi:** har yangi modal YO `noAccidentalClose` bilan himoyalangan, YO
  `dismissible-by-design` deb belgilangan (`dialog-dismissal.test.ts` skaneri tutadi).
  Test-atribut: `data-test-id` (repo konvensiyasi; DS Modal'ning `data-testid`'i bilan
  adashtirma — xotira: `ds-modal-testid-attribute-mismatch`).
- **Header/sidebar `position: fixed` bo'lMAYDI** — oddiy flex-column layout. Sabab:
  `desktop-touch-keyboard.test.ts` dagi `keyboardRoot()` evristikasi «fixed element ichida
  button» ni klaviatura ildizi deb qidiradi; fixed header uni chalg'itadi (F6 sharti ham shu).
- **Git intizomi (`CLAUDE.md` §6):** `git add <aniq fayllar>` — `-A`/`.`/`commit -a` TAQIQ.
  Daraxtda begona o'zgarish bo'lsa `reset --hard`/`checkout -- .`/`clean -fd`/`stash` TAQIQ.
  Commitdan keyin **majburiy** `git show --stat HEAD` (lint-staged begona fayl qo'shishi
  mumkin). Bosqichma-bosqich commit — bir soatlik ish bitta commitda turmasin.
- **Sessiya boshida:** `git worktree list` + `git branch --no-merged` (parallel ish bormi),
  `node scripts/preflight.mjs`.
- **`desktop/` workspace'da EMAS** — bog'liqliklar `cd desktop && pnpm install` bilan; root
  `pnpm-lock.yaml` ga tegilmaydi. `ELECTRON_RUN_AS_NODE` muhitda turibdi — Electron'ni qo'lda
  yugurtirganda `env -u ELECTRON_RUN_AS_NODE …`.
- **Deploy — faqat F9 da va faqat operator ruxsati bilan.** F1–F8 hech narsa deploy qilmaydi,
  `pm2 restart` qilmaydi, exe kanaliga fayl yuklamaydi, prod DB'ga yozmaydi.
- **Server smena-qoidalariga tegilmaydi:** avto-bekor YO'Q, yakunlanmagan chek bloki qoladi
  (egasi qarori 2026-08-12). `unresolved-sales.ts` xabar-mantiqiga F5 faqat O'QISH uchun tegadi.

---

## Fazalar xaritasi

| Faza | Nomi | Qatlam | Bog'liq | Hajm |
|---|---|---|---|---|
| F1 | Monolitni bo'lish (xulq o'zgarmaydi) | web | — | katta |
| F2 | Qobiq: sidebar + header + tema | web | F1 | katta |
| F3 | Sotuv rejimi: savat + setka + to'lov | web | F2 | o'rta |
| F4 | Navbat (kanban) + ro'yxat ekranlari | web | F2 | o'rta |
| F5 | Smena ekrani: yopiq sanoq + ochiq cheklar | web (+kichik api) | F2 | o'rta |
| F6 | Exe 1.7.0: oyna tugmalari headerga | desktop + web | F2 | o'rta |
| F7 | Ko'p-kassir: server (PIN-switch) | api | — | o'rta |
| F8 | Ko'p-kassir: UI (kassir-tanlash) | web | F5, F7 | o'rta |
| F9 | Yakun: chala ishlar + gate + deploy | hammasi | F1–F8 | o'rta |

**Parallellik:** F6 (desktop) va F7 (api) — F3–F5 bilan parallel yurishi MUMKIN (fayl-yo'llar
kesishmaydi), lekin faqat alohida worktree'da (`CLAUDE.md` §6.5). F2→F3/F4/F5 ketma-ket
(hammasi `page.tsx` orkestriga tegadi — bir vaqtda BITTA). F8 F7'siz boshlanmaydi.
F9 har doim oxirgi.

---

## Har faza uchun MAJBURIY protokol

### Agent nima QILADI

1. Spec'ni (`docs/superpowers/specs/2026-08-14-kassa-pos-redizayn-design.md`) va shu rejaning
   O'Z fazasini + «Global cheklovlar»ni to'liq o'qiydi. Oldingi fazalar HISOBOTLARINI o'qiydi
   (reja ichidagi «Hisobot» bloklari) — chala qolgan ishlar ro'yxatiga e'tibor.
2. Fazaning qadamlarini tartibda bajaradi; har mantiqiy bosqichda commit.
3. Test-avval: xulqni o'zgartiradigan har qadam avval testda ifodalanadi (yangi test yoki
   mavjudini yangi niyat bilan qayta yozish).
4. Gate'ni to'liq yugurtiradi, natijani hisobotga AYNAN yozadi (raqamlar bilan).
5. Ishini tugatib **ikki joyga hisobot yozadi** (shakl quyida) va TO'XTAYDI.

### Agent nima QILMAYDI (TAQIQ)

- Keyingi fazaga O'TMAYDI, boshqa faza fayllariga TEGMAYDI (chala ish ro'yxatiga yozadi).
- Deploy/pm2/exe-kanal/prod-DB — TAQIQ (faqat F9, operator ruxsati bilan).
- Qo'riqchi testni o'chirmaydi; mavjud test-fayl ustidan Write qilmaydi.
- «done/verified/production-ready» demaydi (F9 qurilma-sinovigacha).
- Spec'da yo'q funksiya QO'SHMAYDI (YAGNI) — taklifini hisobotning «Takliflar»iga yozadi.
- Boshqa sessiya o'zgarishlariga tegmaydi; NEXT.md'ga yozishda sana+harf kolliziyasini tekshiradi.

### Hisobot shakli (majburiy, faza oxirida, IKKI joyga)

**1-joy — shu reja fayli**, o'z fazasining «Hisobot» qatoriga (marker-kesish xavfi bor —
`indexOf` bilan kesib yozMA, faqat aniq Edit; xotira: `doc-append-marker-truncation`):

```markdown
**Hisobot (F<N>, <sana>, <commit hashlar>):** <2-4 jumla: nima qilindi, gate natijasi,
nima CHALA qoldi (aniq ro'yxat), keyingi agentga ogohlantirish.>
```

**2-joy — to'liq hisobot:** `docs/audits/pos-redizayn-F<N>-hisobot.md` — qilingan ishlar,
o'lchovlar, gate chiqishi, chala ishlar, «O'LCHANMAGAN» bo'limi (halollik).

---

## F1 — Monolitni bo'lish (xulq o'zgarmaydi)

**Qamrov:** `page.tsx` (3370 qator) dan render-bloklarni komponentlarga ko'chirish. Vizual va
xulqiy o'zgarish NOL — 77 test o'zgarishsiz yashil qolishi shart (spec §6).

**Files:**
- Modify: `apps/web/src/app/(app)/sotuv/page.tsx` (orkestr bo'lib qoladi: holat + so'rovlar)
- Create: `apps/web/src/app/(app)/sotuv/_components/sotuv-mode.tsx` (setka + qidiruv + savat)
- Create: `apps/web/src/app/(app)/sotuv/_components/navbat-mode.tsx` (jarayonda + tayyor bloklari)
- Create: `apps/web/src/app/(app)/sotuv/_components/cheklar-mode.tsx`
- Create: `apps/web/src/app/(app)/sotuv/_components/zakazlar-mode.tsx`
- Create: `apps/web/src/app/(app)/sotuv/_components/smena-mode.tsx` (smena tab + yopish formasi)
- (Mijozlar allaqachon komponent: `components/pos/customers-panel.tsx` — tegilmaydi)

**Interfaces (keyingi fazalar tayanadi):**
- Har mode-komponent props orqali oladi: kerakli holat + callback'lar (masalan
  `SmenaMode({ session, onShiftClosed, ... })`). Holat va so'rovlar `page.tsx`da QOLADI —
  bu fazada hech bir so'rov/mutatsiya ko'chirilmaydi, faqat JSX + unga bevosita bog'liq
  lokal hisob-kitoblar.
- `tab` holati va `setTab` union tipi O'ZGARMAYDI (F2 almashtiradi).

**Qadamlar:**

- [ ] **1.1** `page.tsx`ni to'liq o'qib blok-xarita tuzish: qaysi qator-oraliq qaysi
  komponentga ketadi, har blok qaysi holat/callback'larni ishlatadi. Xaritani hisobotga kiritish.
- [ ] **1.2** `smena-mode.tsx` ni ajratish (eng izolyatsiylangani). Gate → commit.
- [ ] **1.3** `zakazlar-mode.tsx`, `cheklar-mode.tsx` ni ajratish. Gate → commit.
- [ ] **1.4** `navbat-mode.tsx` (jarayonda + tayyor JSX bloklari, ikkalasi bitta faylda —
  F4 ularni birlashtiradi). Gate → commit.
- [ ] **1.5** `sotuv-mode.tsx` (setka + qidiruv + savat paneli). Gate → commit.
- [ ] **1.6** `page.tsx` yakuniy tekshiruv: faqat holat + so'rovlar + tab-bar + mode-render
  qolganini tasdiqlash (maqsad ~800-1200 qator). Vizual regress yo'qligini `pnpm dev` da
  ko'z bilan tekshirish (savat qo'shish, tab almashish).
- [ ] **1.7** Hisobot va TO'XTASH. Diqqat: `DocumentEditor prop-drop` bug-klassi — yangi prop
  zanjirda yo'qolib typecheck'dan jim o'tishi mumkin; har mode render qilinganini testda emas,
  brauzerda ham ko'r.

**Hisobot (F1, 2026-08-14, `82222e29`·`0801a2ed`·`4d5479c4`·`392c0b40`):** page.tsx 3370→1607
qator; 5 rejim-komponent + 2 ulashma fayl (`pos-types.ts`, `use-print-outcome.ts` — rejada yo'q
edi, zarur bo'ldi) yaratildi; holat/so'rov/mutatsiyalar sahifada qoldi, JSX aynan ko'chirildi.
Gate har commitda to'liq: typecheck 0 · lint 0 error · i18n 19/19 · web test 3876 passed
(166/166 sotuv-test **o'zgarishsiz** yashil). 5 qo'riqchi-skaner yo'l/ro'yxati moslashtirildi
(pos-cart-profit endi page+sotuv-mode; pos-refund-payout → cheklar-mode; page raw-input
ro'yxatdan chiqdi). Lokal dev-brauzerda barcha 6 rejim + savat-qo'shish + drawer ko'z bilan
tekshirildi, konsol 0 xato. **Phase-1: strukturaviy, runtime-tasdiqlanmagan** — qurilma/sensorli
sinov YO'Q (F9). Keyingi agentga: tab-bar/CFD-satr/dialoglar ATAYLAB sahifada (F2 ishi); yangi
POS-fayl ochsangiz pos-i18n-guard/i18n-no-hardcoded/raw-element ro'yxatlariga qo'shish MAJBURIY.
To'liq: `docs/audits/pos-redizayn-F1-hisobot.md`.

---

## F2 — Qobiq: sidebar + header + tema

**Qamrov:** spec §3 (layout), §4 (tema/tipografika). Eski tab-bar o'rniga chap sidebar +
yuqori header; rejimlar to'liq ekran. Mode-komponentlar ichki ko'rinishi hali eski (F3–F5
yangilaydi) — bu fazada ular shunchaki to'liq-en konteynerga tushadi.

**Files:**
- Create: `apps/web/src/components/pos/pos-sidebar.tsx`
- Create: `apps/web/src/components/pos/pos-header.tsx`
- Create: `apps/web/src/components/pos/use-server-link.ts` (aloqa indikatori hook'i)
- Create: `apps/web/src/app/(app)/sotuv/pos-theme.css` (POS-qamrovli tokenlar)
- Modify: `apps/web/src/app/(app)/sotuv/page.tsx` (tab-bar → sidebar/header/mode-konteyner)
- Modify: `apps/web/src/messages/ru.json`, `uz.json` (yangi yorliqlar)
- Test: `apps/web/src/components/pos/__tests__/pos-sidebar.test.tsx`,
  `pos-header.test.tsx` (yangi fayllar)

**Interfaces:**
- `type PosMode = 'sotuv' | 'navbat' | 'zakazlar' | 'cheklar' | 'mijozlar' | 'smena'` —
  `page.tsx`dagi eski `tab` unioni SHU tipga almashadi ('savat'→'sotuv',
  'jarayonda'/'tayyor'→'navbat'). F3–F5 va F8 shu tipga tayanadi.
- `PosSidebar({ mode, onModeChange, badges: { savat: number; navbat: number }, canSeeOrders,
  collapsed, onToggleCollapsed })`
- `PosHeader({ session, connectionOk, children? })` — o'ng chetida F6 oyna-tugmalari uchun
  slot (`children`).
- Sidebar holati: `localStorage['sherset.pos.sidebar']` = `'collapsed' | 'expanded'`.
- Tema: `pos-theme.css` da `.pos-theme` klassi ostida CSS o'zgaruvchilar:
  ```css
  .pos-theme {
    --pos-brand: #1e5aa8;        /* header/aksent — SHERSET ko'ki */
    --pos-brand-dark: #164a8f;   /* hover/aktiv */
    --pos-on-brand: #ffffff;
    --pos-touch-min: 56px;       /* minimal bosish nishoni */
    --pos-row-h: 64px;           /* ro'yxat qatori */
  }
  ```
  Mavjud `--ms-*` tokenlar o'z joyida qoladi — `.pos-theme` faqat `/sotuv` ildiz div'ida.

**Qadamlar:**

- [ ] **2.1** Test-avval: `pos-sidebar.test.tsx` — (a) 6 bo'lim chiziladi, `canSeeOrders=false`
  da zakazlar yo'q; (b) badge'lar ko'rinadi; (c) yig'ish tugmasi `onToggleCollapsed` chaqiradi;
  (d) har element balandligi 64px (className orqali). Yiqilishini ko'r → `pos-sidebar.tsx` yoz
  → yashil. Commit.
- [ ] **2.2** Test-avval: `pos-header.test.tsx` — logotip matni, smena-chip (kassir ismi +
  yosh + savdo jami), `stale` da sariq holat, `connectionOk=false` da qizil indikator.
  `pos-header.tsx` yoz. SHERSET logotipi: avval `apps/web/public/` da tayyor asset bor-yo'qligini
  tekshir; bo'lmasa matn-logotip (oq, qalin, harf-kerning bilan). Soat: `useEffect`da minutlik
  interval (testda soat assertsiz — flaky bo'ladi). Commit.
- [ ] **2.3** `use-server-link.ts`: TanStack Query `QueryCache.subscribe` orqali — oxirgi
  so'rov network-xato bilan tugagan bo'lsa `false`, muvaffaqiyatdan keyin `true`. Yangi server
  so'rovi QO'SHILMAYDI (mavjud pollinglar signal beradi). Test: cache event simulyatsiyasi.
  Commit.
- [ ] **2.4** `page.tsx` integratsiya: `.pos-theme` ildiz, flex-column (header) + flex-row
  (sidebar + mode-konteyner). Eski tab-bar va CFD-satr o'chadi (CFD tugmasi headerga yoki
  Smena rejimiga — spec §5.1). `tab` → `mode` migratsiyasi: eski `setTab('savat')`
  chaqiruvlar `setMode('sotuv')` ga, `'jarayonda'|'tayyor'` → `'navbat'`. Hotkey'lar saqlanadi.
  Gate: 77 test — tab nomlariga bog'langan testlar yangi niyat bilan QAYTA yoziladi (Edit).
  Commit.
- [ ] **2.5** Tipografika-pass (spec §4): mode-konteyner ichidagi ESKI ko'rinishlarga
  tegilmaydi (F3–F5 ishi), faqat sidebar/header/umumiy fon. `pnpm dev` da ko'z bilan: 1366×768
  va 1920×1080 da sidebar yig'ilish/ochilishi, badge'lar. Commit.
- [ ] **2.6** Hisobot va TO'XTASH. CHALA ro'yxatiga: mode ichlari hali eski dizaynda (F3–F5).

**Hisobot (F2):** _[bo'sh]_

---

## F3 — Sotuv rejimi: savat + setka + to'lov

**Qamrov:** spec §5.1 + §4 o'lchamlari. ± tugmalar olib tashlanadi (Q6), skaner-javob,
to'lovda tez-summa tugmalari.

**Files:**
- Modify: `apps/web/src/app/(app)/sotuv/_components/sotuv-mode.tsx`
- Modify: `apps/web/src/components/pos/payment-dialog.tsx` (tez-summa tugmalari)
- Create: `apps/web/src/lib/pos/scan-feedback.ts` (WebAudio bip — asset'siz)
- Modify: `ru.json`, `uz.json`
- Test: `sales-screen-cart.test.tsx` (± xulqi → yangi niyat bilan qayta yoziladi, Edit),
  `apps/web/src/lib/pos/__tests__/scan-feedback.test.ts` (yangi)

**Interfaces:**
- Savat qatori: butun qator `<button data-test-id="sotuv-cart-line">` (64px) →
  `cart-line-edit-modal` ochadi (modal MAVJUD, o'zgarmaydi). ± tugmalar YO'Q.
- `scanFeedback.ok()` / `scanFeedback.notFound()` — WebAudio oscillator (600ms ichida qisqa
  ton; notFound — past ton ×2). `sotuv-mode`da savatga qo'shilganda `ok()` + qatorga bir
  lahzalik yashil flash-class; topilmaganda `notFound()` + mavjud xato-xabar.
- `payment-dialog`: naqd maydoni ustida 4 tugma — «Aniq summa» (jami'ni qo'yadi) ·
  «100 000» · «200 000» · «500 000» (qiymatni maydonga QO'SHADI emas, O'RNATADI — kassir
  adashmasin). Yorliqlar i18n.

**Qadamlar:**

- [ ] **3.1** `sales-screen-cart.test.tsx`dagi ± assertlarini yangi niyatga ko'chirish:
  «qator bosilsa tahrir oynasi ochiladi», «± tugmalar YO'Q» (izohda eski niyat nega bekor).
  Yiqilsin → `sotuv-mode.tsx`da qatorni qayta qurish (nom + miqdor×narx + jami, 64px,
  18-20px shrift) → yashil. Commit.
- [ ] **3.2** «TO'LASH» tugmasi 72px panel-en, jami summa 36-40px qalin. Setka kartalari:
  min 56px bosish maydoni, nom 18px. Gate → commit.
- [ ] **3.3** `scan-feedback.ts` + test (AudioContext mock; happy-dom'da `AudioContext`
  yo'q bo'lsa modul buni graceful o'tkazadi — qurilmasiz muhitda crash TAQIQ). `sotuv-mode`ga
  ulash: `addToCart` muvaffaqiyati → `ok()` + flash; qidiruv-topilmadi → `notFound()`.
  Commit.
- [ ] **3.4** `payment-dialog.tsx` tez-summa tugmalari + testi (mavjud test-fayl bo'lsa Edit).
  Diqqat: `pos-characterization` to'lov testlari (`sales-screen-payment`) yashil qolsin.
  Gate → commit.
- [ ] **3.5** `pnpm dev`da ko'z-tekshiruv (savat oqimi, to'lov, skaner-simulyatsiya sifatida
  qidiruv+Enter). Hisobot va TO'XTASH.

**Hisobot (F3):** _[bo'sh]_

---

## F4 — Navbat (kanban) + ro'yxat ekranlari

**Qamrov:** spec §5.2 (Navbat) + §5.3 (Cheklar/Zakazlar/Mijozlar to'liq-ekran).

**Files:**
- Modify: `apps/web/src/app/(app)/sotuv/_components/navbat-mode.tsx` (kanban)
- Modify: `cheklar-mode.tsx`, `zakazlar-mode.tsx` (to'liq-ekran: ro'yxat + o'ng detal-panel)
- Modify: `apps/web/src/components/pos/customers-panel.tsx` (faqat o'lcham-pass — 64px
  qatorlar; mantiqqa tegilmaydi)
- Modify: `ru.json`, `uz.json`
- Test: `sales-screen-orders.test.tsx` / `chek-detail-panel.test.tsx` — kerak bo'lsa Edit;
  yangi: `navbat-mode.test.tsx`

**Interfaces:**
- Navbat: ikki ustun — chap «Yig'ilmoqda» (`pickingSales`, sariq), o'ng «Tayyor»
  (`readySales`, yashil). Karta: chek raqami 20px · summa · mijoz · o'tgan vaqt · tugmalar:
  «TO'LASH» (faqat tayyor; MAVJUD to'lov yo'lini chaqiradi — F1'da ko'chirilgan callback) ·
  «BEKOR QILISH» (mavjud `cancelSale`; tasdiq matnida chek raqami + summa bo'lishi SHART).
- Sidebar `badges.navbat` = `pickingSales.length + readySales.length` (F2 interfeysi).
- Cheklar/Zakazlar: chapda ro'yxat (64px qatorlar), o'ngda detal-panel — mavjud funksional
  1:1 (qaytarish, qayta chop, F7/F8 zakaz oqimi), faqat joylashuv/o'lcham.

**Qadamlar:**

- [ ] **4.1** Test-avval `navbat-mode.test.tsx`: ikki ustun; tayyor kartada TO'LASH bor,
  yig'ilmoqda kartada YO'Q; bekor tasdig'ida raqam+summa. Yiqilsin → kanban yoz → yashil.
  Gate → commit.
- [ ] **4.2** `cheklar-mode.tsx` to'liq-ekran layout (mavjud ro'yxat/detal JSX'ini ikki
  ustunga yoyish, 64px qatorlar). Mavjud testlar (`chek-*`) yashil. Commit.
- [ ] **4.3** `zakazlar-mode.tsx` xuddi shunday; `sales-screen-orders` yashil. Commit.
- [ ] **4.4** `customers-panel` o'lcham-pass. Commit.
- [ ] **4.5** Ko'z-tekshiruv + hisobot va TO'XTASH.

**Hisobot (F4):** _[bo'sh]_

---

## F5 — Smena ekrani: yopiq sanoq + ochiq cheklar ro'yxati

**Qamrov:** spec §5.4 (Q7 — blind sanoq; strukturali yakunlanmagan-cheklar ro'yxati, draft
ham ko'rinadi). Kichik API qo'shimchasi: yakunlanmagan cheklar ro'yxatini STRUKTURA sifatida
olish.

**Files:**
- Create (api): `apps/api/src/modules/cashier-session/` ichiga endpoint —
  `GET /cashier-sessions/:id/unresolved` → `{ sales: [{ id, name, state, sumMinor }] }`
  (close'dagi bilan AYNAN bir xil tanlov-mezon — `draft|picking|ready`; mavjud so'rovni
  qayta ishlat, nusxalama). Test: co-located `.test.ts`.
- Modify (api): `apps/api/src/modules/auth/kiosk-policy.ts` — yangi GET allowlist'ga
  (`why: 'smena yopishdan oldin yakunlanmagan cheklar'`); `kiosk-policy.test.ts` yangilanadi.
- Modify (web): `apps/web/src/app/(app)/sotuv/_components/smena-mode.tsx`
- Modify: `ru.json`, `uz.json`
- Test (web): `sales-screen-shift.test.tsx` (blind-sanoq xulqi — Edit bilan qayta yozish),
  yangi assertlar: kutilgan summa sanoqdan oldin DOM'da YO'Q.

**Interfaces:**
- Yopish oqimi (holat mashinasi `smena-mode` ichida):
  `idle → counting (faqat numpad, kutilgan summa DOM'da YO'Q) → review (Sanadingiz X ·
  Kutilgan Y · Farq Z; farq≠0 → izoh maydoni MAJBURIY) → closing (mavjud closeMut)`.
  `review`dan sanoqni o'zgartirishga qaytish YO'Q (faqat butun oqimni bekor qilish —
  «Bekor» → `idle`, sanoq tozalanadi). `closePreview` so'rovi qoladi, lekin natijasi faqat
  `review` bosqichida chiziladi. USD maydoni mavjud shart bilan (`usdInPlay`).
- Yakunlanmagan-cheklar bloki: yopishdan OLDIN ham ko'rinadi (unresolved > 0 bo'lsa):
  har chek karta — raqam · bosqich-yorlig'i (savatda/yig'ilmoqda/yig'ilgan) · summa ·
  tugmalar: `ready` → «TO'LASH» (mavjud to'lov yo'li) va «BEKOR QILISH»; `picking` →
  «BEKOR QILISH»; `draft` → «BEKOR QILISH» (to'lov draft'dan mumkin emas — server `post()`
  faqat ready'dan). Bekor — mavjud `cancelSale` (tasdiq + raqam + summa).
- Server XULQI o'zgarmaydi: close hali ham 400 beradi; UI ro'yxat bo'sh bo'lgandagina
  yopishga ruxsat ko'rsatadi (lekin serverga baribir ishonadi).

**Qadamlar:**

- [ ] **5.1** API: test-avval — endpoint testi (draft+picking+ready qaytadi, boshqa sessiya
  cheki QAYTMAYDI, yopiq sessiyada bo'sh). Endpoint yoz (close'dagi tanlov bilan bitta
  yordamchi funksiya). Kiosk-allowlist + testi. `pnpm --filter @moysklad/api test` → commit.
- [ ] **5.2** Web: `sales-screen-shift.test.tsx`ni blind-oqimga qayta yozish (Edit): kutilgan
  summa `counting`da yo'q; `review`da farq chiqadi; farq≠0 da izohsiz yopib bo'lmaydi.
  Yiqilsin → `smena-mode` holat mashinasi → yashil. Gate → commit.
- [ ] **5.3** Yakunlanmagan-cheklar bloki + testi (3 bosqich kartasi, draft'da faqat bekor).
  Gate → commit.
- [ ] **5.4** Ko'z-tekshiruv: smena ochish→savdo→yopishga urinish→ro'yxat→bekor→yopish.
  Hisobot va TO'XTASH. Hisobotda OCHIQ: server xulqi o'zgarmagani, faqat UI.

**Hisobot (F5):** _[bo'sh]_

---

## F6 — Exe 1.7.0: oyna tugmalari headerga

**Qamrov:** spec §7. Preload API + suppression, web-header uchligi, qo'riqchi-test qayta
yoziladi, versiya 1.7.0. Kanalga YUKLANMAYDI (F9).

**Files:**
- Modify: `desktop/preload.js` (electronAPI + suppression), `desktop/package.json` (1.7.0)
- Create: `apps/web/src/components/pos/window-controls.tsx`
- Modify: `apps/web/src/components/pos/pos-header.tsx` (o'ng slotga ulash)
- Modify (qayta yozish, Edit): `apps/web/src/__tests__/desktop-window-controls.test.ts`
- Test: `apps/web/src/components/pos/__tests__/window-controls.test.tsx` (yangi)

**Interfaces:**
- `electronAPI`ga qo'shiladi (preload):
  ```js
  minimize: () => ipcRenderer.send('shell:minimize'),
  toggleWindowed: () => ipcRenderer.send('shell:toggle-windowed'),
  requestQuit: () => ipcRenderer.send('shell:request-quit'),
  ```
  (main.js ishlovchilari MAVJUD — 1.6.0 dan; main.js'ga tegilmaydi.)
- Suppression (preload, o'z suzuvchi tugmalarini chizishdan OLDIN va keyin kuzatadi):
  sahifa `document.documentElement.dataset.shersetWindowControls === 'page'` qo'ysa —
  preload uchligi chizilmaydi/olib tashlanadi (MutationObserver `documentElement`
  atributlariga). Qobiqning o'z file:// sahifalarida (setup/offline) hech narsa o'zgarmaydi (E3).
- `window-controls.tsx` (web): FAQAT `window.electronAPI?.minimize` mavjud bo'lsa chizadi;
  mount'da `dataset.shersetWindowControls = 'page'` qo'yadi, unmount'da o'chiradi. Uch tugma:
  `—` · `❐` · `✕` (56px kenglik, header balandligi, ✕ hover qizil), `data-test-id`:
  `pos-win-minimize|toggle|close`.
- Shartnomalar saqlanadi: E1 (✕ → `shell:request-quit`), E4 (burchak-imo qoladi).
  E2 evolyutsiya: preload-tugmalari (eski web bilan) hali ham yalang-fixed; header-tugmalar
  oddiy oqimda (fixed EMAS) — klaviatura-evristika buzilmaydi; test yangi niyat bilan
  buni tekshiradi.

**Qadamlar:**

- [ ] **6.1** `desktop-window-controls.test.ts`ni qayta yozish (Edit; tarixiy naqsh — fayl
  boshidagi «TARIX» izohiga yangi band): W5 — electronAPI'da 3 metod; W6 — marker qo'yilsa
  preload uchligi yo'q; W7 — marker yo'q bo'lsa (eski web) uchlik chiziladi. Yiqilsin.
- [ ] **6.2** `preload.js`: API + suppression. Test yashil. Commit.
- [ ] **6.3** Web `window-controls.tsx` + testi (API yo'q → hech narsa chizilmaydi; API bor →
  3 tugma + marker; bosishlar to'g'ri metodlarni chaqiradi — mock). Headerga ulash. Gate →
  commit.
- [ ] **6.4** `desktop/package.json` → `1.7.0`. `cd desktop && pnpm install` (agar kerak).
  Lokal smoke: `env -u ELECTRON_RUN_AS_NODE npx electron .` — header uchligi chiqishi,
  eski suzuvchi uchlik yo'qligi. (Qurilmasiz muhitda bu QOLADI — hisobotga «O'LCHANMAGAN».)
  Commit.
- [ ] **6.5** Hisobot va TO'XTASH. Versiya-moslik matritsasi (spec §7) hisobotda takrorlansin.

**Hisobot (F6):** _[bo'sh]_

---

## F7 — Ko'p-kassir: server (PIN-switch)

**Qamrov:** spec §8 server qismi. Faqat `apps/api` (+kiosk-policy). Web'ga TEGILMAYDI (F8).

**Files:**
- Modify: `apps/api/src/modules/auth/` — pos-pin kontroller/servis joylashgan fayllar
  (agent avval `pos-pin` bo'yicha grep qilib aniq fayllarni topadi; `/auth/pos-pin` va
  `/auth/pos-pin/verify` mavjud)
- Modify: `apps/api/src/modules/auth/kiosk-policy.ts` + testi (2 yangi endpoint allowlist)
- Test: co-located `.test.ts` (mavjud pos-pin testlari qatoriga, Edit)

**Interfaces (F8 shunga quriladi):**
- `GET /auth/pos-pin/candidates` → `{ cashiers: [{ employeeId, name }] }` — shu qurilma
  do'koni smenalariga biriktirilgan, POS-PIN o'rnatgan xodimlar. PIN yoki boshqa sir
  QAYTARILMAYDI. Mezon: smena a'zoligi (`openSessionFromSmena` ishlatadigan a'zolik
  jadvalidan — smena.service.ts:227 atrofidagi tekshiruv bilan BITTA manba).
- `POST /auth/pos-pin/switch` body `{ employeeId, pin }` → muvaffaqiyatda auth-javob
  (mavjud login-javob shakli bilan BIR XIL — F8 `auth-store`ga to'g'ridan-to'g'ri beradi).
  Tekshiruvlar tartibda: (1) so'rov kiosk-juftlangan qurilmadan (mavjud kiosk-aniqlash
  mexanizmi); (2) joriy kassirning OCHIQ sessiyasi YO'Q (bor bo'lsa 409 — avval smena
  yopilsin); (3) target xodim `candidates` mezonida; (4) PIN verify — MAVJUD lockout
  hisoblagichi bilan (5 xato qoidasi target xodimga nisbatan); (5) audit-jurnalga yozuv
  (kim → kimga, qurilma, vaqt).
- Zod sxemalar tana-shartnomali (`pos-terminal-debt-payment-broken` xotirasi: jim tashlash
  bo'lmasin).

**Qadamlar:**

- [ ] **7.1** Recon: pos-pin fayllarini, kiosk-aniqlash usulini, login-javob shaklini,
  smena-a'zolik so'rovini topib hisobot-xaritaga yozish (grep-satr emas — model/fayl bloki
  o'qiladi; xotira: `grep-field-to-model-misattribution`).
- [ ] **7.2** Test-avval `candidates`: a'zo+PIN'li qaytadi · PIN'siz QAYTMAYDI · boshqa do'kon
  qaytmaydi · kiosk bo'lmagan so'rovda 403. Endpoint yoz. Commit.
- [ ] **7.3** Test-avval `switch`: to'g'ri PIN → token; noto'g'ri → lockout hisobi; ochiq
  sessiya bor → 409; a'zo emas → 403; kiosk emas → 403. Endpoint yoz. Commit.
- [ ] **7.4** Kiosk-policy allowlist + testi. Audit-yozuv testi. `pnpm --filter @moysklad/api
  test` to'liq → commit.
- [ ] **7.5** Hisobot va TO'XTASH. OCHIQ yozilsin: token-invalidatsiya semantikasi qanday
  hal qilindi (eski kassir tokeni nima bo'ladi) — F8 agenti shunga qaraydi.

**Hisobot (F7):** _[bo'sh]_

---

## F8 — Ko'p-kassir: UI (kassir-tanlash + PIN)

**Qamrov:** spec §8 UI qismi. F7 endpointlariga quriladi; F5 smena-ekraniga «Kassirni
almashtirish» kiradi.

**Files:**
- Create: `apps/web/src/components/pos/cashier-select-screen.tsx`
- Modify: `apps/web/src/app/(app)/sotuv/_components/smena-mode.tsx` («Kassirni almashtirish»)
- Modify: `apps/web/src/components/pos/pos-pin-lock.tsx` (smena yopiq → tanlash ekrani)
- Modify: `apps/web/src/lib/auth-store.ts` (switch-javobni qabul qilish — mavjud login
  yo'li bilan bitta funksiya)
- Modify: `ru.json`, `uz.json`
- Test: `cashier-select-screen.test.tsx` (yangi); `pin-entry-single-numpad.test.tsx` /
  pos-pin-lock testlari (Edit)

**Interfaces:**
- `CashierSelectScreen({ onSwitched })`: `GET /auth/pos-pin/candidates` → katta kartalar
  (bosh harf doirasi + ism, 96px balandlik); karta → PIN bosqichi (MAVJUD `pin-keypad`
  komponenti qayta ishlatiladi) → `POST /auth/pos-pin/switch` → `auth-store`ga yangi token →
  `onSwitched()` (react-query keshini invalidate — `smena-mine` qayta so'raladi, yangi kassir
  smena-ochish formasini ko'radi).
- Oqim triggerlari: (a) Smena rejimida «Kassirni almashtirish» tugmasi — FAQAT sessiya yopiq
  bo'lganda aktiv (ochiq bo'lsa tugma o'rniga izoh: «Avval smenani yoping»); (b) smena
  yopilgandan keyingi ekranda «Boshqa kassir» yo'li; (c) `pos-pin-lock`: qulf ochilganda
  sessiya yo'q bo'lsa tanlash ekraniga yo'l. Ekran faqat kiosk/juftlangan muhitda ko'rinadi
  (`isShersetShell() || readPosDevice()` — pos-pin-lock'dagi mavjud mezon bilan bitta).
- Xavfsizlik UI'da: PIN xato → qolgan urinishlar soni (server javobidan); lockout →
  to'liq logout (pos-pin-lock'dagi mavjud xulq bilan bir xil).

**Qadamlar:**

- [ ] **8.1** F7 hisobotini o'qish (token semantikasi!). Test-avval `cashier-select-screen`:
  kartalar chiziladi · PIN bosqichiga o'tadi · switch muvaffaqiyatida `onSwitched` ·
  xatoda urinish soni ko'rinadi. Komponent yoz. Commit.
- [ ] **8.2** `smena-mode`ga tugma (ochiq sessiyada bloklangan holati bilan) + test. Commit.
- [ ] **8.3** `pos-pin-lock` moslashuvi + testlari (Edit; mavjud lockout-xulq buzilmasin).
  Gate → commit.
- [ ] **8.4** Ko'z-tekshiruv (lokal DB'da 2 test-kassir bilan — `scripts/ops-create-test-cashiers.ts`
  bor). Hisobot va TO'XTASH.

**Hisobot (F8):** _[bo'sh]_

---

## F9 — Yakun: chala ishlar + to'liq gate + deploy

**Qamrov:** F1–F8 hisoblaridagi BARCHA chala ishlarni yig'ib tugatish, to'liq gate, deploy
(web + exe 1.7.0 kanalga), hujjat-yakun. **Deploy operator ruxsati bilan.**

**Qadamlar:**

- [ ] **9.1** Barcha «Hisobot (F1–F8)» bloklarini va `docs/audits/pos-redizayn-F*-hisobot.md`
  fayllarini o'qib chala-ishlar reyestrini tuzish; har birini bajarish yoki (operator roziligida)
  keyinga qoldirilganini OCHIQ hujjatlash.
- [ ] **9.2** To'liq gate: typecheck · lint:product · i18n:gate · web test (to'liq suite,
  changed-only EMAS — xotira: `changed-tests-gate-misses-convention-guards`) · api test.
- [ ] **9.3** Web deploy — `/deploy` skill tartibida (build tartibi + gotcha'lar o'sha yerda;
  xotira: `sherset-vps-deploy`, `deploy-verify-against-local-not-remote` — deploy to'liqligi
  LOKAL HEAD bilan o'lchanadi).
- [ ] **9.4** Exe 1.7.0 build + kanalga yuklash (F6 relizi; barqarorlik-reja F8 tartibi
  namuna). Qurilmalar QO'LDA yangilanadi — operator bilan kelishib.
- [ ] **9.5** Qurilmada sensorli Phase-2 QA (operator ishtirokida): sidebar/har rejim ·
  savat oqimi (± yo'q, qator-modal) · skaner-javob · blind-sanoq · ochiq-cheklar ro'yxati
  bilan smena yopish · oyna tugmalari (yangi exe'da header, eski exe'da suzuvchi) ·
  kassir almashtirish (2 kassir, PIN, lockout). Natija bo'yicha statuslar
  «Phase-1» → «Phase-2 verified»ga ko'chiriladi.
- [ ] **9.6** NEXT.md yozuvi (sana+harf kolliziyasini tekshirib) + MEMORY.md pointer +
  shu rejaga yakuniy hisobot. TO'XTASH.

**Hisobot (F9):** _[bo'sh]_

---

## Self-review (reja yozilgach tekshirildi)

- **Spec qamrovi:** §3 layout→F2 · §4 tema→F2/F3 · §5.1→F3 · §5.2/5.3→F4 · §5.4→F5 ·
  §6 monolit→F1 · §7 exe→F6 · §8 ko'p-kassir→F7/F8 · §10 chiqarish→F9. Bo'shliq yo'q.
- **Placeholder yo'q:** har fazada aniq fayl-yo'llar, interfeys-shartnomalar, test-avval
  qadamlar. F7 fayl-nomlari ataylab recon-qadam bilan (pos-pin fayllari nomini taxmin
  qilmaslik uchun — konfabulyatsiyaga qarshi qoida).
- **Tip-izchillik:** `PosMode` unioni F2'da e'lon qilinadi, F3–F5/F8 shunga tayanadi;
  `electronAPI` metod nomlari F6 preload va web'da bir xil; switch-javob shakli F7→F8.

---

# Faza promptlari

Har faza uchun tayyor prompt. **Yangi sessiyada** shu blokni to'liq nusxalab tashlang.
🔴 **Bitta promptda bitta faza.** Ikkitasini birga bermang.

### F1 — Monolitni bo'lish

```
docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md rejasining F1 fazasini bajar.
Avval spec (docs/superpowers/specs/2026-08-14-kassa-pos-redizayn-design.md), rejaning
«Global cheklovlar» va «Har faza uchun MAJBURIY protokol» bo'limlarini, keyin F1 bo'limini
to'liq o'qi. Vazifa: apps/web/src/app/(app)/sotuv/page.tsx (3370 qator) dan render-bloklarni
_components/ ostidagi rejim-komponentlarga ko'chirish — XULQ VA VIZUAL O'ZGARISH NOL,
77 POS characterization testi o'zgarishsiz yashil. Har ajratishdan keyin gate + commit.
Faqat F1 — boshqa fazaga o'tma. Tugagach hisobotni rejaning «Hisobot (F1)» qatoriga va
docs/audits/pos-redizayn-F1-hisobot.md ga yoz, TO'XTA.
```

### F2 — Qobiq: sidebar + header + tema

```
docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md rejasining F2 fazasini bajar.
Avval spec, «Global cheklovlar», protokol va F1 hisobotini o'qi. Vazifa: /sotuv sahifasiga
chap yig'iladigan sidebar (72↔240px, localStorage) + 64px ko'k header (SHERSET logotip,
smena-chip, soat, aloqa indikatori) + .pos-theme tema qatlami; eski tab-bar o'chadi, tab
unioni PosMode ('sotuv'|'navbat'|'zakazlar'|'cheklar'|'mijozlar'|'smena') ga ko'chadi.
Header/sidebar position:fixed EMAS (klaviatura-evristika!). Test-avval: pos-sidebar,
pos-header, use-server-link. Yangi yorliqlar i18n (ru+uz). Faqat F2. Tugagach hisobot →
rejaning «Hisobot (F2)» + docs/audits/pos-redizayn-F2-hisobot.md, TO'XTA.
```

### F3 — Sotuv rejimi

```
docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md rejasining F3 fazasini bajar.
Avval spec, «Global cheklovlar», protokol va F1–F2 hisobotlarini o'qi. Vazifa: Sotuv rejimi
sensorli qayta quriladi — savat qatoridan ± tugmalar OLIB TASHLANADI (qator 64px, bosilsa
mavjud cart-line-edit-modal ochiladi), TO'LASH 72px, jami 36-40px, setka kartalari ≥56px,
skaner-javob (WebAudio bip + flash, scan-feedback.ts), payment-dialog'ga tez-summa tugmalari
(Aniq summa/100k/200k/500k — qiymatni O'RNATADI). sales-screen-cart testlari yangi niyat
bilan Edit orqali qayta yoziladi (Write TAQIQ). Faqat F3. Tugagach hisobot → «Hisobot (F3)»
+ docs/audits/pos-redizayn-F3-hisobot.md, TO'XTA.
```

### F4 — Navbat + ro'yxat ekranlari

```
docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md rejasining F4 fazasini bajar.
Avval spec, «Global cheklovlar», protokol va F1–F3 hisobotlarini o'qi. Vazifa: navbat-mode
ikki ustunli kanban bo'ladi (Yig'ilmoqda · Tayyor; kartada katta TO'LASH faqat tayyorda,
BEKOR tasdig'ida chek raqami+summa — mavjud cancelSale/to'lov yo'llari qayta ishlatiladi);
cheklar-mode va zakazlar-mode to'liq-ekran ro'yxat+detal-panel (64px qatorlar);
customers-panel faqat o'lcham-pass. Test-avval navbat-mode.test.tsx; mavjud chek/zakaz
testlari yashil qolsin. Faqat F4. Tugagach hisobot → «Hisobot (F4)» +
docs/audits/pos-redizayn-F4-hisobot.md, TO'XTA.
```

### F5 — Smena: yopiq sanoq + ochiq cheklar

```
docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md rejasining F5 fazasini bajar.
Avval spec, «Global cheklovlar», protokol va F1–F4 hisobotlarini o'qi. Vazifa ikki qism:
(1) API: GET /cashier-sessions/:id/unresolved — close'dagi mezon bilan yakunlanmagan
cheklar ro'yxati (draft|picking|ready), kiosk-allowlist bilan, test-avval; (2) Web:
smena-mode'da YOPIQ sanoq oqimi (counting bosqichida kutilgan summa DOM'da YO'Q; review'da
Sanadingiz/Kutilgan/Farq; farq≠0 → izoh majburiy; sanoqqa qaytish yo'q) + yakunlanmagan
cheklar strukturali ro'yxati (draft ham ko'rinadi; draft'da faqat BEKOR, ready'da TO'LASH
ham). Server smena-qoidalari O'ZGARMAYDI. sales-screen-shift testlari Edit bilan qayta
yoziladi. Faqat F5. Tugagach hisobot → «Hisobot (F5)» +
docs/audits/pos-redizayn-F5-hisobot.md, TO'XTA.
```

### F6 — Exe 1.7.0: oyna tugmalari

```
docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md rejasining F6 fazasini bajar.
Avval spec §7, «Global cheklovlar», protokol va F2 hisobotini o'qi. Vazifa: desktop/preload.js
electronAPI'ga minimize/toggleWindowed/requestQuit qo'shiladi; sahifa
data-sherset-window-controls="page" belgisini qo'yganda preload o'z suzuvchi uchligini
chizmaydi (MutationObserver); web'da window-controls.tsx — FAQAT electronAPI.minimize mavjud
bo'lsa header o'ng chetida — ❐ ✕ (✕ hover qizil), marker qo'yadi. E1 (request-quit) va E4
(burchak-imo) saqlanadi; desktop-window-controls.test.ts yangi niyat bilan Edit orqali qayta
yoziladi. desktop/package.json → 1.7.0. Kanalga YUKLAMA (F9). desktop/ workspace'da emas;
ELECTRON_RUN_AS_NODE tuzog'iga ehtiyot bo'l. Faqat F6. Tugagach hisobot → «Hisobot (F6)» +
docs/audits/pos-redizayn-F6-hisobot.md, TO'XTA.
```

### F7 — Ko'p-kassir: server

```
docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md rejasining F7 fazasini bajar.
Avval spec §8, «Global cheklovlar» va protokolni o'qi. Vazifa (faqat apps/api): avval recon —
pos-pin fayllari, kiosk-aniqlash, login-javob shakli, smena-a'zolik so'rovi (grep-satr emas,
fayl blokini o'qi); keyin test-avval ikki endpoint: GET /auth/pos-pin/candidates (shu qurilma
do'koni smenalariga biriktirilgan, PIN'li xodimlar — sir qaytarilmaydi) va POST
/auth/pos-pin/switch {employeeId, pin} (kiosk-juftlik · joriy kassirning ochiq sessiyasi
yo'qligi (409) · a'zolik · PIN + mavjud lockout · audit-yozuv · javob shakli mavjud login
bilan BIR XIL). Kiosk-allowlist + testlari. Web'ga TEGMA (F8). Faqat F7. Tugagach hisobot
(token-invalidatsiya semantikasi OCHIQ yozilsin) → «Hisobot (F7)» +
docs/audits/pos-redizayn-F7-hisobot.md, TO'XTA.
```

### F8 — Ko'p-kassir: UI

```
docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md rejasining F8 fazasini bajar.
Avval spec §8, «Global cheklovlar», protokol va F5+F7 hisobotlarini o'qi (F7'dagi token
semantikasi muhim). Vazifa: cashier-select-screen.tsx (kandidat-kartalar → mavjud pin-keypad
bilan PIN → switch → auth-store'ga token → smena-mine invalidate); smena-mode'da «Kassirni
almashtirish» (ochiq sessiyada bloklangan); pos-pin-lock moslashuvi (qulf ochilganda sessiya
yo'q → tanlash ekrani; lockout xulqi buzilmasin). Ekran faqat kiosk/juftlangan muhitda.
Test-avval; pos-pin-lock testlari Edit bilan. Lokal ko'z-tekshiruv:
scripts/ops-create-test-cashiers.ts bilan 2 kassir. Faqat F8. Tugagach hisobot →
«Hisobot (F8)» + docs/audits/pos-redizayn-F8-hisobot.md, TO'XTA.
```

### F9 — Yakun + deploy

```
docs/superpowers/plans/2026-08-14-kassa-pos-redizayn.md rejasining F9 fazasini bajar.
Avval spec, «Global cheklovlar», protokol va F1–F8 hisobotlarining HAMMASINI o'qi. Vazifa:
(1) chala-ishlar reyestrini tuzib har birini bajar yoki operator roziligi bilan ochiq
qoldir; (2) to'liq gate (typecheck · lint:product · i18n:gate · web test TO'LIQ · api test);
(3) MENDAN RUXSAT SO'RAB web deploy (/deploy skill tartibida) va exe 1.7.0 build + kanalga
yuklash; (4) men bilan birga qurilmada sensorli Phase-2 QA (rejadagi 9.5 ro'yxati bo'yicha)
— natijaga qarab statuslarni «Phase-2 verified»ga ko'chir; (5) NEXT.md yozuvi (harf
kolliziyasini tekshir) + MEMORY pointer + yakuniy hisobot «Hisobot (F9)» +
docs/audits/pos-redizayn-F9-hisobot.md. TO'XTA.
```
