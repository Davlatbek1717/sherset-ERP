# MOYSKLAD 1:1 PARITY PLAN

**Maqsad**: `climart.biznesjon.uz` saytini `online.moysklad.ru` bilan **piksel darajasida** mos qilish — har sahifa, har modal, har tugma, har tooltip.

**Holat**: 2026-04-30
**Egasi**: Ozodbek (`ozodbekmirgasimov1@gmail.com`)
**Repo**: `Biznesjon-Official/moysklad` (private)
**Live**: https://climart.biznesjon.uz

---

## 1. SCOPE — nima qilinadi, nima qilinmaydi

### Qilinadi (✅)
- Har sahifaning **layout** (toolbar, columns, search, sub-tabs, empty state, pagination)
- Har **modal/drawer/dropdown** ochilganda chiqadigan UI
- Har **tugma**ning matni, joylashuvi, hover state, disabled state, click feedback
- Har **tooltip** (hover qilganda chiqadigan so'z) — DOM `title=` + `aria-label`
- **Form fields**: placeholder, validation message, mask (telefon, raqam, sana)
- **Empty states**: matn + ikon + CTA tugma
- **Loading skeletons**: har list/form uchun
- **Toast/error messages**: matn + duration + position
- **Top chrome**: trial banner, logo, top nav order, header right (chat/bell/help/user)
- **Animations**: modal slide-in, drawer slide, page transition timing
- **Visual regression**: har sahifa uchun Playwright screenshot baseline

### Qilinmaydi (❌ — scope dan tashqari)
- Server-side source code clone (proprietary, olib bo'lmaydi)
- Moysklad'ning marketing landing pagelari (`moysklad.ru/*`)
- Mobile native apps (iOS/Android)
- Browser extension'lar
- 1C, Telegram, marketplace integratsiyalari'ning ichki UX (faqat ulardagi sozlamalar sahifasi)

### Qisman (⚠️)
- Print template'lar — visual layout 1:1, lekin PDF render engine farqli (browser print vs Mozilla pdf.js)
- Email template'lar — HTML markup 1:1, lekin transactional email infrastructure boshqacha (SMTP)
- Real-time updates (SSE/WebSocket) — pattern bir xil, lekin server stack farqli

---

## 2. AUDIT — hozirgi holat

### Bizdagi sahifalar
- **139 ta `page.tsx`** (`apps/web/src/app/(app)/**/page.tsx`)
  - List pages: ~60 ta
  - Form/new pages: ~50 ta
  - Detail/[id] pages: ~15 ta
  - Settings: ~14 ta

### Moysklad reference (`docs/moysklad-reference/visual-captures/`)
- **67 ta module** captured (DOM + screenshot + metadata)
- Har module uchun **25-54 ta holat**:
  - `dom-default.html` — list view
  - `dom/01-default.html` — full page
  - `dom/02-dropdown-*.html` — har toolbar dropdown ochilganda
  - `dom/0N-edit-default.html` — yangi yaratish form
  - `dom/0N-edit-dropdown-*.html` — edit form ichidagi dropdown'lar
  - `dom/0N-edit-tab-*.html` — edit form tablari (positions, linked, files, tasks, events)
  - `dom/0N-responsive-{mobile,tablet}.html` — responsive
  - `dom/0N-banner.html` — trial banner state
  - `dom/0N-catalog-picker.html` — product picker modal
- **Har holat uchun**: `meta/0N-*.json` metadata
- **Screenshot**: faqat default + responsive (3-6 ta png)

### Yetishmovchilik
| Yetishmaydi | Olish yo'li |
|---|---|
| Modal **screenshot**'lari (faqat DOM bor) | Capture re-run, `--captures-modals` flag |
| **Tooltip text** alohida JSON'da | `tools/extract-tooltips.py` yozish |
| **Network request/response** | Capture re-run, network panel saqlash |
| **Animation timing** | DevTools manual measure yoki Playwright `getComputedStyle` |
| **Color tokens** | `scrape-tokens` allaqachon bor, qayta ishga tushirish |
| **i18n strings** (uz + ru to'liq dump) | Bundle parse yoki `scrape-tokens` extend |

---

## 3. PHASES — bosqichma-bosqich reja

### ⚙️ FAZA 0 — Capture infrastructure ishga tushirish
**Maqsad**: yetishmovchilikni to'ldirish — har sahifa uchun to'liq DOM + screenshot + tooltip + i18n dump.

**Qadamlar**:
1. `tools/capture/` allaqachon mavjud — `scrape-deep` qayta ishga tushirish
2. `tools/extract-tooltips.py` yozish (DOM'lardan `title=` + `aria-label` parse)
3. `tools/extract-i18n.py` yozish (bundle yoki API'dan strings)
4. Capture'dagi screenshot'larni har holat uchun olish (modal ochilganda, dropdown ochilganda)

**Output**: `docs/moysklad-reference/visual-captures/<module>/` to'liq

**Vaqt**: 4-6 soat (script yozish + run + verify)

### 🎨 FAZA 1 — Site chrome (top nav, banner, logo, header)
**Maqsad**: butun saytda doimiy ko'rinadigan elementlar 1:1

**Qadamlar**:
1. **Top nav reorder**: 14 ta tab → 12 ta. `Отчёты` va `Настройки` olib tashlash. `Решения` qo'shilgan order: `Показатели · Закупки · Продажи · Товары · CRM · Склад · Деньги · Розница · Онлайн-торговля · Производство · Задачи · Решения`
2. **Trial banner**: `auth.account.plan === 'trial'` bo'lsa sariq fon + `Перейдите на платный тариф, чтобы использовать все возможности МоегоСклада` + `Выбрать тариф` orange button
3. **Logo**: "МойСклад" matn → bulut SVG iconi (`packages/design-system/src/icons/MoyskladLogo.tsx`)
4. **Header right**: 🔍 search → 💬 chat icon (placeholder), 🔔 bell badge (notification counter), ❓ help (mavjud), user block (single line: name + email kichik harfda 2-qator)
5. **Reports** sahifasi mavjud sahifa qoldiraman (`/reports` URL ishlaydi), faqat top nav'da yo'q
6. **Settings** ham xuddi shunday — `/settings/*` URL'lar ishlaydi, top nav'da yo'q (faqat user dropdown'da yoki settings sidebar orqali)

**DOD**: Live'da har sahifada top chrome moysklad'ga 95%+ o'xshash. Screenshot side-by-side test.

**Vaqt**: 4-6 soat
**Commit**: `feat(parity): site chrome 1:1 — trial banner + nav reorder + cloud logo`

### 🧱 FAZA 2 — Reusable primitives audit
**Maqsad**: `packages/design-system/` ichidagi `Button`, `Modal`, `Drawer`, `Tooltip`, `Dropdown`, `EmptyState`, `Skeleton` komponentlarini moysklad pattern'iga moslash.

**Qadamlar**:
1. **Button**: variantlar (primary blue, secondary gray, danger red, ghost), sizes (sm/md/lg), icon position (left/right), loading state, disabled state. Screenshot solishtir.
2. **Modal**: title bar (close X right), body padding, footer (action buttons right-aligned, secondary first then primary), Escape key, backdrop click.
3. **Drawer**: side slide-in (right), header sticky, content scroll, footer sticky.
4. **Tooltip**: delay 500ms, arrow position auto, max-width 240px, dark bg.
5. **Dropdown**: 200ms slide-down, click outside close, keyboard nav (Up/Down/Enter).
6. **EmptyState**: centered, icon (40px), title, description, optional CTA button.
7. **Skeleton**: pulse animation, rounded corners, gray-200 bg.

**DOD**: Har primitiv uchun visual regression test (Storybook + Chromatic yoki Playwright snapshot).

**Vaqt**: 6-8 soat
**Commits**: 2-3 ta (`refactor(ds): button match moysklad`, `refactor(ds): modal/drawer parity`, ...)

### 📋 FAZA 3 — TOP-10 yirik list sahifa
**Maqsad**: eng ko'p ishlatiladigan 10 ta sahifani modal/tugma/tooltip bilan to'liq parity.

**Sahifalar (prioritet bo'yicha)**:
1. `/customer-orders` — Mijoz buyurtmalari (Заказы покупателей)
2. `/demands` — Otgruzkalar (Отгрузки)
3. `/invoices-out` — Schyotlar (Счета покупателям)
4. `/purchase-orders` — Xaridlar (Заказы поставщикам)
5. `/supplies` — Qabul qilish (Приёмки)
6. `/cash-in` + `/cash-out` — Kassa kirim/chiqim (ПКО/РКО)
7. `/payments-in` + `/payments-out` — To'lovlar (Входящие/Исходящие платежи)
8. `/counterparties` — Kontragentlar (Контрагенты)
9. `/products` — Mahsulotlar (Товары)
10. **Universal `/documents`** — barcha hujjatlar (Документы)

**Har sahifa uchun qadamlar**:
1. `docs/moysklad-reference/visual-captures/<module>/dom/01-default.html` o'qish
2. Toolbar elementlarini ajratish: primary action, search, filters, sub-tabs, dropdown'lar (Изменить, Создать, Печать, Отправить), bulk actions, column settings
3. Table columns'ni aniqlash (default visible + barcha possible)
4. Empty state matnini olish
5. Pagination format ("1-1 из 0", "0,00" sum row)
6. **Modal'lar**:
   - "Изменить" dropdown menu (bulk actions list)
   - "Создать" dropdown menu (yangi document tipldari)
   - "Печать" dropdown (print template'lar ro'yxati)
   - "Отправить" dropdown (email/SMS opsiyalari)
   - Filter panel (right drawer)
   - Column settings modal
7. Bizning sahifani **butunlay qayta yozish** (page.tsx)
8. i18n key'larni qo'shish (uz + ru)
9. Visual regression baseline (Playwright screenshot)
10. Commit + push + VPS deploy

**DOD per page**:
- ✅ Layout side-by-side moysklad'ga 95%+ mos
- ✅ Toolbar barcha tugmalar bor
- ✅ Modal/dropdown'lar moysklad bilan bir xil
- ✅ Empty state matnlar bir xil
- ✅ i18n uz + ru to'liq
- ✅ Visual regression test green
- ✅ Typecheck + lint clean
- ✅ Manual smoke test (admin@demo.local bilan login + sahifa ko'rinishi)

**Vaqt**: 60-90 daq per sahifa × 10 = **10-15 soat**
**Commits**: 10 ta (har sahifa alohida)

### 📑 FAZA 4 — Universal `/documents` sahifa
Moysklad'da `Главное → Документы` — barcha hujjatlar tipldari bir joyda union.

**Qadamlar**:
1. Backend: `/documents` endpoint — cross-entity union (CustomerOrder + Demand + InvoiceOut + ... 30+ document tipa). Korzina'ga o'xshash pattern.
2. Frontend: `/documents/page.tsx` yangi sahifa
3. Filter: document tipa bo'yicha
4. Columns: Тип документа / № / Время / Сумма / Со склада / На склад / Организация / Контрагент / Статус / Отправлено / Напечатано / Комментарий

**Vaqt**: 3-4 soat
**Commit**: `feat(parity): universal /documents page (cross-entity union)`

### 📋 FAZA 5 — Qolgan 50+ list sahifa
TOP-10 dan tashqari list sahifalar:
- Sales: sales-returns, ecommerce/orders, retail/sales, retail/sessions
- Inventory: enters, losses, moves, inventories, supplies, internal-orders
- Purchase: invoices-in, purchase-returns, factures-in, factures-out
- CRM: contact-persons, contracts, opportunities, calls, events, tasks
- Money: prepayments, prepayment-returns, counterparty-adjustments
- Catalogs: bundles, services, variants, product-folders, price-types, uoms
- Production: BOMs, work-orders, production-orders, production-tasks
- Reports: 16 ta hisobot

**Har sahifa**: **30-45 daq** (FAZA 3 pattern'ni takrorlash)
**Vaqt**: 50 × 30 daq = **25-30 soat**
**Commits**: 50 ta

### 🆕 FAZA 6 — Form/new sahifalar (~50 ta)
Har "Yangi yaratish" sahifa — moysklad'ning edit form DOM'i bilan 1:1.

**Har sahifa**:
1. `dom/0N-edit-default.html` o'qish
2. Form sections aniqlash (header, positions tab, linked tab, files, tasks, events)
3. Field'lar: type, validation, mask, autocomplete, default value
4. Saqlash logic (Сохранить и закрыть, Сохранить, Отмена)
5. Tabs (Позиции / Связанные документы / Файлы / Задачи / События)
6. Position table (catalog picker modal bilan)

**Vaqt**: 30 daq × 50 = **25 soat**
**Commits**: 50 ta

### ⚙️ FAZA 7 — Settings sahifalar
Har Sozlamalar sahifa moysklad bilan parity:
- Organizations, Stores, Cash desks, Bank accounts, Exchange rates
- Users, Roles, Permissions
- Price types, Tax rates, VAT rates, Currencies
- Custom entities, Attributes, Custom fields
- Webhooks, API tokens, Audit log
- Integrations: Soliq, Eskiz, Payme, Click, ASL Belgisi
- Print templates, Email templates

**Vaqt**: 20 daq × 15 = **5 soat**
**Commits**: 15 ta

### 📸 FAZA 8 — Visual regression baseline
Har sahifa uchun Playwright screenshot baseline. CI'da regress'ni tutadi.

**Qadamlar**:
1. `apps/web/tests/visual/parity.spec.ts` — har sahifani sequential ravishda ochib screenshot olish
2. Baseline'ni `apps/web/tests/visual/__screenshots__/` ga commit qilish
3. CI workflow (`.github/workflows/visual-regression.yml`) — har PR'da diff
4. Threshold: max 0.1% pixel difference

**Vaqt**: 4-6 soat
**Commit**: `test(visual): full-app parity baseline (139 pages)`

### 🔍 FAZA 9 — Microcopy + tooltip + animation pass
Har sahifa uchun:
1. Tooltip text'lari moysklad bilan bir xil ekanligini tekshirish
2. Loading state animation timing (300-400ms fade-in)
3. Modal slide-in (250ms cubic-bezier)
4. Drawer slide (300ms cubic-bezier)
5. Toast appearance (200ms slide-down + 5s auto-dismiss)
6. Error message wording — moysklad bilan bir xil

**Vaqt**: 8-10 soat (har sahifaga 5 daq)
**Commits**: 5-7 ta (group qilingan)

---

## 4. DEFINITION OF DONE — har sahifa uchun

Sahifa "Done" deyilishi uchun **hammasi** yashil bo'lishi shart:

- [ ] Layout moysklad'dagi `01-default.html` bilan side-by-side 95%+ mos
- [ ] Toolbar elementlari (primary, search, filter, dropdowns, bulk actions, column settings) bor
- [ ] Sub-tabs / sub-navigation bor (agar moysklad'da bo'lsa)
- [ ] Table columns: default visible kelishuvi moysklad'ga mos
- [ ] Empty state: matn + ikon + CTA moysklad'dagi kabi
- [ ] Pagination format moysklad'dagi kabi
- [ ] Loading skeleton bor (har list/form uchun)
- [ ] Modal/dropdown'lar:
  - [ ] "Изменить" dropdown
  - [ ] "Создать" dropdown
  - [ ] "Печать" dropdown
  - [ ] "Отправить" dropdown
  - [ ] Filter panel
  - [ ] Column settings modal
- [ ] Tooltip'lar (hover'da chiqadigan matn) moysklad'dagi bilan bir xil
- [ ] Form yaratish/tahrirlash (agar bo'lsa) moysklad'ning edit form'iga mos
- [ ] i18n uz + ru to'liq (hard-coded string yo'q)
- [ ] Typecheck clean (0 xato)
- [ ] Lint/biome clean (0 xato)
- [ ] Visual regression test green (Playwright snapshot)
- [ ] Manual smoke test (admin@demo.local bilan local + production)
- [ ] Adversarial QA: empty state, single row, max rows (500+), unicode counterparty name, long description
- [ ] VPS'da deploy qilingan (`git pull && pnpm build && pm2 reload`)

---

## 5. CAPTURE INFRASTRUCTURE

### Mavjud (`tools/capture/`)
| Buyruq | Status |
|---|---|
| `auth` | ✅ ishlaydi |
| `scrape-api` | ✅ ishlaydi |
| `scrape-app` | ✅ ishlaydi |
| `scrape-tokens` | ✅ ishlaydi |
| `scrape-deep` | ✅ ishlaydi (modal+filter+form+toolbar interactions) |
| `scrape-print-templates` | ✅ ishlaydi |
| `scrape-reports` | ✅ ishlaydi |

### Yangi yoziladigan (FAZA 0'da)
| Tool | Maqsad |
|---|---|
| `tools/extract-tooltips.py` | DOM'lardan `title=` + `aria-label` parse → `<module>/tooltips.json` |
| `tools/extract-i18n.py` | Bundle yoki API'dan to'liq i18n strings → `<module>/i18n.json` |
| `tools/extract-spec.py` | DOM → kompakt JSON spec (toolbar, columns, modals, ...) |
| `tools/parity-diff.py` | Bizning sahifa DOM ↔ moysklad DOM diff hisobotini chiqarish |

---

## 6. QUALITY GATES

Har commit uchun **majburiy**:
1. `pnpm --filter @moysklad/web typecheck` — 0 xato
2. `pnpm --filter @moysklad/api typecheck` — 0 xato
3. `pnpm --filter @moysklad/ui test` — barcha yashil
4. `pnpm biome check` — 0 xato (warnings ruxsat)
5. Manual visual check: `https://climart.biznesjon.uz/<sahifa>` — login bilan ochib tekshirish

Har **5 ta sahifa**dan keyin:
1. Visual regression test full run (`pnpm test:visual`)
2. Adversarial QA pass (empty/single/many/unicode/edge cases)
3. Performance check (Lighthouse score > 80)

---

## 7. RISK + MITIGATION

| Risk | Ehtimoli | Mitigation |
|---|---|---|
| **DOM o'zgarishi** (moysklad UI yangilansa) | Past | DOM hash'larini saqlash, capture qayta-qayta ishga tushirish |
| **Capture stale** (oxirgi capture eskirib qolish) | O'rta | Sprint boshida `scrape-deep` qayta ishga tushirish |
| **Pixel-perfect erishib bo'lmaslik** (font, browser farqi) | O'rta | 95%+ mosga ruxsat (100% emas), threshold 0.1% pixel diff |
| **i18n drift** (uz + ru o'rtasida farq) | O'rta | `scripts/check-i18n-parity.ts` (har commit'da) |
| **Production regress** | Past | VPS'da staging branch (`develop`) before main |
| **Vaqt o'tib qolish** (estimate'dan ko'p) | Yuqori | Iterativ — har faza o'z commit'i, har sahifa o'z commit'i |
| **Kontekst yo'qotish** (sessiya tugashi) | Yuqori | Bu PARITY-PLAN.md hujjatda saqlanadi, har sessiya boshida o'qiladi |

---

## 8. PROGRESS TRACKING

Har sahifa holati `docs/PARITY-STATUS.md` da yangilanadi (har commit'da):

```
| Sahifa | Layout | Modals | Tooltips | i18n | Visual test | Status |
|---|---|---|---|---|---|---|
| /customer-orders | ✅ | ✅ | ✅ | ✅ | ✅ | DONE |
| /demands | ✅ | ⚠️  | ❌ | ✅ | ❌ | IN PROGRESS |
| ... | | | | | | |
```

Va commit message'da:
```
feat(parity): customer-orders 1:1 — toolbar + columns + 6 modals

- Toolbar: + Заказ / Фильтр / 0 Изменить▾ / Статус / Создать / Печать / Решения / Столбцы
- 13 columns matching moysklad order
- 6 modals: izmenit/sozdat/pechat/otpravit dropdowns + filter panel + column settings
- 24 i18n keys (uz + ru)
- Visual baseline: customer-orders.png

Closes parity-plan.md FAZA-3 sahifa 1/10.
```

---

## 8a. CAPTURE-DRIVEN WORKFLOW (har sahifa uchun majburiy)

**Sabab**: avvalgi sub-optimal commit'lar (demands, invoices-out) i18n
string'larni taxmin asosida yozib qo'yganligini foydalanuvchi to'g'ri
ushladi. Aniq parity uchun **hech qanday string taxmin qilinmaydi** —
har matn capture'dan kelishi kerak.

### Per-page workflow

```
SAHIFA: /<slug>

1️⃣  CAPTURE INVENTORY (5 daq)
    docs/moysklad-reference/visual-captures/<module>/
    ├── capture.json           — toolbar + columns + metadata
    ├── dom/
    │   ├── 01-default.html       — list view
    │   ├── 02-dropdown-*.html    — har toolbar dropdown
    │   ├── 0X-edit-default.html  — yangi yaratish form
    │   ├── 0X-edit-tab-*.html    — edit form tabs
    │   ├── 0X-detail-default.html — detail page
    │   ├── 0X-field-modal-*.html  — har picker modal
    │   └── 0X-row-context-*.html  — right-click menu

2️⃣  SPEC EXTRACTION (10-15 daq)
    Yangi hujjat: docs/parity-specs/<module>.md
    Tarkibi (hammasi capture'dan extract qilingan, taxmin yo'q):

    a) List view spec
       - Title (real moysklad H1)
       - Sub-tabs (RU only, exact tartib)
       - Toolbar (har tugma + dropdown items)
       - Search placeholder
       - Columns (default visible + barcha)
       - Empty state heading + helper
       - Pagination format
       - Footer sum row

    b) Toolbar dropdowns spec
       - Har dropdown: ochilish trigger + items list
       - Har item: matn + action (delete/transition/...)

    c) Edit form spec
       - Tabs ro'yxati
       - Har field: label / required / type / validation /
         placeholder / mask
       - Save/Cancel button matnlar

    d) Detail page spec
       - Read-only sections
       - Tabs (Главная / Связанные / Файлы / ...)
       - Har section'ning fields ro'yxati

    e) Field modallar spec
       - Har picker: trigger field + ochiladigan modal struktura

    f) i18n string'lar table (capture'dan extracted)
       | Key | RU | UZ | Source |
       |---|---|---|---|
       | title | <real ru> | <real uz> | dom/01-default.html h1 |
       | empty_heading | <real> | <real> | dom/01-default.html .empty-state |
       | search_placeholder | <real> | <real> | dom/01-default.html input |

3️⃣  IMPLEMENTATION (15-30 daq)
    - Spec'dan kelib chiqib page.tsx, komponent, i18n yangilash
    - Har string spec'dagi exact matnga teng

4️⃣  VERIFICATION (5-10 daq)
    - typecheck + biome
    - Manual smoke (sahifa lokal'da ochib, har element capture
      bilan side-by-side solishtirish)
    - Spec'dagi har item DOD checkbox'ini ✅ qilish

5️⃣  COMMIT + STATUS
    - Commit message: "feat(parity): /<slug> capture-driven (X deltas)"
    - PARITY-STATUS.md'da sahifa "DONE (capture-driven)" deb belgilash
    - docs/parity-specs/<module>.md commit'ga kiradi

Sahifa uchun jami vaqt: 35-60 daq
```

### Spec hujjat shabloni

`docs/parity-specs/<module>.md` har sahifa uchun majburiy. Shablon
`docs/parity-specs/_TEMPLATE.md`'da. Spec hujjati hech qanday taxminni
qabul qilmaydi — har string DOM'dan kelishi shart, manba bilan
("source: dom/01-default.html line 234").

### Yo'q narsani qilmaslik

- ❌ "Создавайте … X" placeholder taxmin yozish
- ❌ Search placeholder'ni "Поиск" deb qo'yish
- ❌ Empty state heading'ni sahifa nomidan kelib chiqib generatsiya qilish
- ✅ Faqat capture'dan kelgan exact matn

### Sub-optimal commit'lar (lessons learned)

Quyidagi commit'lar layout struktur to'g'ri, lekin i18n string'lar
**TAXMIN ASOSIDA**. Keyingi capture-driven pass'da yangilanishi kerak:

- `43e2ce6` /purchase-orders — empty_rich_heading taxmin
- `d9ad59d` /counterparties — empty_rich_heading taxmin
- `d27c3af` 25 sahifa × empty_rich_* keys — barchasi taxmin

**Round 1B**: shu sahifalar uchun spec yozish + i18n string'larni
capture'dan tekshirish + yangilash.

---

## 8c. EXECUTION STRATEGY v3 — VERTIKAL (FOYDALANUVCHI TANLOVI)

**2026-04-30 sessiya 2'da foydalanuvchi vertikal yondashuvni tanladi.**
Gorizontal sweep (Round 1 birinchi 70 sahifa) o'rniga, har sahifa
**darrov to'liq 1:1** parity'ga keltiriladi — Round 1+2+3+4+5 bitta
sahifa uchun ketma-ket bajariladi.

### Per-page workflow (vertikal)

```
SAHIFA: /<slug>  (per sahifa ~3-4 soat avtonom)

1️⃣  CAPTURE INVENTORY (10 daq)
    - dom/01-default.html ... 0X-* har capture o'qish
    - screenshots/00-clean-default.png + 0X-dropdown-*.png
    - meta/0X-*.json metadata
    - foydalanuvchi screenshot (kerak bo'lsa)

2️⃣  SPEC FULL EXTRACT (30-45 daq)
    docs/parity-specs/<module>.md to'liq:
    a) List view (toolbar + columns + empty + pagination)
    b) Har 5-7 ta toolbar dropdown items
    c) Filter panel field'lar (16+ ta field)
    d) Column settings modal
    e) Row context menu
    f) Bulk action modallar (8-10 ta — Удалить/Объединить/...)
    g) Detail page va 5 ta tab
    h) Edit form va 5 ta tab + 30+ field
    i) Field-level pickerlar (Контрагент / Организация / Срок ...)
    j) i18n string'lar table (har string source bilan)

3️⃣  IMPLEMENTATION (90-150 daq)
    - List view (page.tsx) — Round 1
    - Toolbar dropdownlar — Round 2
    - Filter panel + Column settings — Round 2
    - Detail page (/[id]) — Round 3
    - Edit form (/new) — Round 4
    - Field modallar va action modallar — Round 4
    - i18n RU + UZ — har round'da
    - Komponent darajasidagi yangilash (kerak bo'lsa)

4️⃣  ADVERSARIAL QA (15-20 daq)
    - typecheck + biome
    - Manual smoke (lokal'da har element click qilib)
    - Adversarial savollar (concurrent, timeout, edge cases)
    - Empty / single / many / unicode / overflow input
    - Visual regression baseline (Playwright snapshot)

5️⃣  COMMIT + STATUS + DEPLOY (5-10 daq)
    - 5-10 ta atomic commit (har Round o'z commit'i)
    - PARITY-STATUS.md sahifa "✅ DONE — 1:1 parity"
    - VPS deploy (foydalanuvchi tasdiqi bilan)
```

### Sahifalar prioriteti (vertikal — birinchidan oxirgi)

Foydalanuvchi'ning real biznes ehtiyojiga muvofiq:

#### TIER 1 — Asosiy savdo flow (eng ko'p ishlatiladi)
1. `/customer-orders` — 27,295 ta zakaz ✨ (REAL DATA)
2. `/demands` — Otgruzkalar (savdo yakuni)
3. `/invoices-out` — Schyot purchasers
4. `/counterparties` — 2,824 ta kontragent ✨ (REAL DATA)
5. `/products` — 7,043 ta tovar ✨ (REAL DATA)

#### TIER 2 — Pul oqimi
6. `/cash-in`, `/cash-out` — kassa ПКО/РКО
7. `/payments-in`, `/payments-out` — to'lovlar
8. `/sales-returns` — qaytarishlar

#### TIER 3 — Xarid (purchase pipeline)
9. `/purchase-orders` — ta'minlovchi buyurtmalar
10. `/supplies` — qabullar
11. `/purchase-returns` — qaytarishlar
12. `/invoices-in` — kelgan schyotlar

#### TIER 4 — Inventarizatsiya
13. `/moves`, `/losses`, `/enters`, `/inventories`

#### TIER 5 — CRM va tasks
14. `/contact-persons`, `/calls`, `/opportunities`, `/tasks`

#### TIER 6 — Settings (har biri qisqa)
15. /settings/* (~14 sahifa)

### Vaqt estimate (vertikal)

| TIER | Sahifa soni | Per sahifa | TIER vaqt |
|---|---|---|---|
| 1 | 5 | 3-4 soat | 15-20 soat |
| 2 | 6 | 3-4 soat | 18-24 soat |
| 3 | 4 | 3-4 soat | 12-16 soat |
| 4 | 4 | 2-3 soat | 8-12 soat |
| 5 | 4 | 2-3 soat | 8-12 soat |
| 6 | 14 | 1-2 soat | 14-28 soat |
| **JAMI** | **37** | | **75-112 soat** |

Plus settings + smaller pages = **~120-150 soat = 4-5 hafta avtonom**.

### VPS deploy strategiyasi (vertikal)

- Har TIER 1 sahifa tugagandan keyin VPS deploy (foydalanuvchi tasdiqi)
- TIER 2-6 har 5 sahifa'dan keyin deploy
- Round 5 (microcopy) faqat fixes — har TIER ichida bajariladi

### Round'lar vertikal modida

Avvalgi Round 1-5 conceptual qoldirilgan, lekin **per sahifa** bajariladi:
- Round 1 (list view layout) → 30-60 daq
- Round 2 (modallar) → 60-90 daq
- Round 3 (detail page) → 60-90 daq
- Round 4 (edit form) → 90-120 daq
- Round 5 (microcopy) → 30-45 daq
- **Per sahifa jami**: 4-7 soat

### Birinchi sahifa: `/customer-orders`

Joriy sahifa: customer-orders Round 1 qisman tugatilgan (commit 7f18545).
Endi vertikal sweep:
- Round 2 (dropdownlar) — joriy
- Round 3 (detail page) — keyin
- Round 4 (edit form) — keyin
- Round 5 (microcopy) — keyin

---

## 8b. EXECUTION STRATEGY v2 — ROUND-BASED (avval, foydalanuvchi tomonidan rad qilingan)

Execution PHASE'lardan farqli ravishda, **ROUND**'lar barcha sahifalarni bir
o'sish darajasida sweep qilib yuradi. Bu rejim foydalanuvchiga real
progress'ni darhol ko'rsatadi (Round 1 tugagandan keyin barcha sahifalar
**layout darajasida** moysklad bilan parity).

### ROUND 1 — Layout & sub-nav parity (1-1.5 hafta avtonom)
Har sahifa uchun **faqat layout**:
- Sub-tabs (RU only — uz/ru mix tuzatish)
- Title row (refresh icon, ? help icon)
- Toolbar tartibi (har tugma to'g'ri joyda)
- Search position (inline yoki alohida — moysklad bilan)
- Status filter (pill emas, dropdown ichida)
- Columns (default visible)
- Empty state (boy: illustration + heading + CTA + resurs linklar)
- Pagination format ("1-1 из N")

**Modal/dropdownlar — bu Round'da YO'Q**, faqat ko'rinishi: ListView.hideTitle
+ ListView.richEmpty kabi reusable prop'lar yaratiladi.

DOD (Round 1, per page):
- [ ] Sub-tabs RU only, moysklad tartibi
- [ ] Toolbar tartibi
- [ ] Search position
- [ ] Empty state moysklad-style
- [ ] Pagination format
- [ ] typecheck + biome clean
- [ ] Manual smoke (sahifa ochiladi, layout to'g'ri)

**Sahifalar**: 80+ ta. Per sahifa **30-60 daq** (komponent reusable bo'lgani
uchun keyingi sahifalar tezroq).

### ROUND 2 — Modal & dropdown UI (2-3 hafta)
Har sahifa uchun **modal/dropdown DOM**:
- Изменить ▾ menu (ko'rinish + items list — funksiya yo'q hali)
- Создать ▾ menu
- Печать ▾ menu (placeholder)
- Отправить ▾ menu (placeholder)
- Решения ▾ menu
- Столбцы ▾ modal (column toggle)
- Filter panel drawer (ko'rinish)

DOD (Round 2):
- [ ] Har dropdown ochiladi va to'g'ri menu items ko'rsatadi
- [ ] Har modal ochiladi va to'g'ri layout ko'rsatadi
- [ ] Click outside dismisses
- [ ] Keyboard nav (Up/Down/Enter, Escape)

### ROUND 3 — Modal funktions (3-4 hafta)
Har modal'ning real funksiyasi:
- Bulk delete (real API + soft delete)
- Bulk transition (FSM bilan)
- Status changer (per-row)
- Owner changer
- Merge ("Объединить")
- Filter apply (real query)
- Print (PDF download — backend kerak)
- Send (email/SMS — eskiz/SMTP integratsiyasi)

DOD (Round 3):
- [ ] Har modal action real ishlaydi
- [ ] Success toast
- [ ] Error toast
- [ ] Loading state
- [ ] Optimistic UI (mavjud bo'lsa)

### ROUND 4 — Edit form & microcopy & visual (3-4 hafta)
Har "Yangi yaratish / tahrirlash" form:
- 30+ field har biri (label, placeholder, validation, mask)
- Tabs: Главная / Связанные документы / Файлы / Задачи / События
- Positions table (catalog picker, qty/price/discount)
- Save/Save and continue/Cancel/Delete buttons
- Tooltip text har element
- Animation timing (modal slide-in 250ms, drawer 300ms, toast 200ms)
- Visual regression baseline (Playwright snapshot per sahifa)

DOD (Round 4):
- [ ] Har field validation moysklad bilan bir xil
- [ ] Har tooltip text bir xil
- [ ] Har animation moysklad bilan bir xil timing
- [ ] Visual diff < 0.1% per sahifa

### Round-darajadagi gate

Har Round tugagandan keyin:
- [ ] Barcha sahifalarning DOD checkbox'lari ✅
- [ ] Visual regression baseline yangilangan
- [ ] PARITY-STATUS.md'da Round "DONE" deb belgilangan
- [ ] **VPS'ga deploy** (foydalanuvchi tasdiqi bilan)

---

## 9. EXECUTION TIMELINE (avtonom)

| Faza | Vaqt (avtonom soat) | Commits | Cumulative |
|---|---|---|---|
| FAZA 0: Capture infra | 4-6 soat | 2-3 | 4-6 |
| FAZA 1: Site chrome | 4-6 soat | 1 | 8-12 |
| FAZA 2: Primitives | 6-8 soat | 2-3 | 14-20 |
| FAZA 3: TOP-10 list | 10-15 soat | 10 | 24-35 |
| FAZA 4: /documents | 3-4 soat | 1 | 27-39 |
| FAZA 5: 50+ lists | 25-30 soat | 50 | 52-69 |
| FAZA 6: 50 forms | 25 soat | 50 | 77-94 |
| FAZA 7: settings | 5 soat | 15 | 82-99 |
| FAZA 8: visual regression | 4-6 soat | 1 | 86-105 |
| FAZA 9: microcopy/tooltips/animation | 8-10 soat | 5-7 | 94-115 |
| **JAMI** | **94-115 soat** | **~140 commit** | **2-3 hafta avtonom** |

Real estimate: kuniga 4-5 soat avtonom ishlasa **~3-4 hafta**.

---

## 10. SESSION ENTRY POINT

**Har yangi sessiya boshida**:
1. Bu hujjat (`docs/PARITY-PLAN.md`) o'qiladi
2. `docs/PARITY-STATUS.md` o'qiladi (qaysi sahifa qilingan)
3. Keyingi sahifa tanlanadi (next pending)
4. `docs/moysklad-reference/visual-captures/<module>/` o'qib parity qilinadi
5. Commit + push + VPS deploy
6. `PARITY-STATUS.md` yangilanadi

**Sessiya tugaganida**:
1. Joriy commit'lar push qilingan
2. `PARITY-STATUS.md` yangilangan
3. Keyingi sessiya uchun "next: <sahifa>" qo'shilgan

---

## 11. APPROVAL

Bu reja foydalanuvchi tomonidan tasdiqlanadi. Tasdiqlanganidan keyin **AVTONOM** ravishda bajariladi:
- Har commit alohida
- Har 5-10 commit'da progress hisoboti
- Bloker bo'lsa to'xtab foydalanuvchidan so'rash

**User'ning roli**:
- Reja sifatini ko'rib qabul qilish
- Bloker hollarda javob berish
- Real foydalanuvchi data bilan QA
- Production'da hayotiyligi mos kelmasa fikr bildirish

**Mening roling**:
- Kod yozish
- Capture o'qish + parse
- Test + commit + deploy
- Progress kuzatish + PARITY-STATUS.md yangilash
- Halol bo'lish: agar biror narsa qila olmasam — to'g'ridan-to'g'ri aytish

---

**Tasdiqlangan**: ❌ (User tasdiqi kutilmoqda)
**Boshlangan**: —
**Tugagan**: —
**Joriy faza**: —

---

*Bu hujjat ishlash davomida yangilanib boriladi. Har faza yakunlanganda "✅ DONE" deb belgilanadi.*
