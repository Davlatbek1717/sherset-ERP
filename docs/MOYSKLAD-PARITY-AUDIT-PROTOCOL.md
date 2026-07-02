# Moysklad Parity Audit Protocol (v2.2)

**Maqsad:** Har bir sahifa (56+) uchun moysklad bilan **1:1 parity** — kichik xatolar ham qolmasligi.

> **Asosiy printsip**: "Element bor" ≠ "moysklad'dagidek ishlaydi". Har bir element 4 fazadan o'tadi.
> **"Tugadi" deyish huquqi**: 4 fazaning HAR BIRI yashil bo'lganda, side-by-side reference screenshot bilan tasdiqlangach.

---

## v1.0 → v2.0 — Nima o'zgardi?

**v1.0 (kamchilik):** REGION-LEVEL checklist (toolbar, filter, table mavjudligini tekshirar edi)

**v2.0 (to'g'rilangan):** 4-FAZALI INTERACTION-LEVEL checklist:
- Phase 1 — Structural (mavjudlik)
- Phase 2 — **Interactive** (BOSILGANDA / sudralganda / ochilganda — moysklad bilan match)
- Phase 3 — **Stateful** (har holatda — empty/loading/error/filtered/selected)
- Phase 4 — **Reference-check** (har holat uchun moysklad screenshot bilan side-by-side)

---

## 1-qism — Xatolar log'i (4 audit tour, 2026-05-19)

### Tour 1 — purchase-orders cross-cutting + TaskType
**Da'vo:** "tugadi". **Topgan gap'lar:** TaskCreateModal'da «Тип задачи» yo'q + filter panel layout deltalari.

### Tour 2 — InlineFilterPanel sidebar + 2-input date
**Da'vo:** "moysklad bilan 1:1". **Topgan gap'lar:** pills label'dan pastda, 🔍 magnifier, 7 ustun (5 emas), `:` colon yo'q, density bo'sh.

### Tour 3 — 6 delta comprehensive sweep
**Da'vo:** "5×5 grid exact match". **Topgan gap'lar:** `+Buyurtma` o'ngda (chap kerak), `Yakunlarni yashirish`/📥/⚙ keraksiz, button order noto'g'ri, `Печать` russian qoldi.

### Tour 4 — Toolbar parity + dependent picker tooltip
**Da'vo:** "24 ta filter ishlaydi, toolbar 1:1". **Topgan gap'lar:**
- **Toolbar dropdown'lar MAZMUNI** moysklad'dan farqli (O'zgartirish 8 ta item kerak — 2 ta), (Chop etish 5 ta item kerak — 2 ta)
- **Saqlangan filter pill joyi** — moysklad'da filter panel'dan PASTDA alohida qator; bizda action ustun ichida
- **Column sort** — header bosilganda ▲▼ ishlamayapti
- **Column resize** — divider sudrash imkoni yo'q
- **Column gear ⚙** — table header'ning oxirida (yashirin/ko'rinmas + qator soni 25/50/100)
- **Footer totals row** — moysklad'da har column sumi (37 379 061..., 14 154 840...) ko'rsatadi
- **Pagination footer** — `1-100 из 2 187 < >` — bizda yo'q
- **Row hover** — moysklad sariq highlight
- **Status pill** — "Напечатан" ko'k badge stili
- **Button grouping** — `+Buyurtma` chap'da, qolgan to'liq o'ngda, KATTA BO'SH JOY orasida; moysklad'da hammasi yaqin

### Tour 5 — Silent no-op + invisible affordance bugs
**Da'vo:** "13/13 deltas yopildi, page complete". **Topgan gap'lar:**
- **Saqlangan filter pill `×` o'chirish** — `opacity-0 group-hover:opacity-100` qilingan, lekin user qayerga bosish kerakligini tushunmadi. Moysklad **`✏ pencil`** ikona bilan inline edit pattern ishlatadi (rename + delete + cancel).
- **Bookmark + Settings ikonlari** filter panel'da — `title=` bor edi LEKIN `onClick` yo'q. Bosish hech narsa qilmasdi.
- **Search input clear** — × tugmasi yo'q edi; user matnni qo'lda o'chirishi kerak.
- **Column header sortable** faqat 6/13 column'da; qolganlari header bosilsa hech narsa qilmasdi (silent).
- **Selection counter `[☑1] 1`** — duplicate "1" raqami (bulkToolbarSlot ichidagi span ListView'ning own counter bilan duplicate edi).
- **Header overflow** — `table-layout: fixed` bilan narrow column'larda header matni qo'shni column'ga oqib chiqar edi (no `truncate`).

---

## 2-qism — Process bug'lar (anti-pattern log'i)

| # | Anti-pattern | Misol | To'g'ri yondashuv |
|---|--------------|-------|-------------------|
| 1 | "Element bor" → "matches" | "Chop etish ▾ ko'rinyapti" → declared done; ichidagi 2 ta item moysklad'dagi 5 ta'dan farqli | Har dropdown'ni **OCH** va item'lar list'ini moysklad bilan taqqosla |
| 2 | "Layout to'g'ri" → "behavior to'g'ri" | Column ko'rinyapti → declared done; header bosish sort qilmaydi | Har element'ni **BOS / SUDRA / HOVER** qilib kerakli reaktsiyani tasdiqla |
| 3 | Statik screenshot bilan kifoyalanish | Default view ✓ → declared done; dropdown ochilgan / row selected / empty state hech qachon tekshirilmagan | Har **STATE** uchun screenshot ol va moysklad bilan taqqosla |
| 4 | Iterativ fix→claim→find→fix pattern | 4 ta audit tour — har birida "tugadi" → user yana gap topadi | Audit ALL → Fix ALL → Verify ALL → Claim ONCE |
| 5 | Confirmation bias | Faqat o'zgargan joyni verify | Adversarial savol: **"yana nima qolib ketishi mumkin?"** har audit'da |
| 6 | Reference library yo'qligi | User bergan screenshot bilan cheklanish | Har sahifaning har holati uchun moysklad screenshot kerak — yo'q bo'lsa user'dan so'rab olish |
| 7 | Mikro-detallarni e'tibordan chiqarish | flex-1 spacer `+Buyurtma`'ni o'ng tomon'ga itarayotgani sezilmagan | Pixel-level visual diff: spacing, gap, padding ham audit elementi |
| 8 | "Looks similar" → "is identical" | UI subjective tarzda yaqin ko'rinadi | Side-by-side, har element x/y koordinata bilan, har shrift size, color CSS-darajada |

---

## 3-qism — 4-fazali audit protokol

### Phase 1 — STRUCTURAL (mavjudlik) — 30 min

Har region uchun element'lar mavjud va to'g'ri joyda:

#### A. Top bar (page-level toolbar)
- [ ] `?` help ikona (chap)
- [ ] Title (e.g. "Ta'minlovchi buyurtmalari")
- [ ] `↻` reload ikona title yonida
- [ ] **`+ <Primary>` button title'dan keyin yaqin** (no big gap!)
- [ ] `Filtr` button — primary'dan keyin
- [ ] Search input
- [ ] `[☑ N]` selection counter
- [ ] `O'zgartirish ▾` dropdown
- [ ] `Yaratish ▾` dropdown
- [ ] `Chop etish ▾` dropdown
- [ ] Hammasi **ketma-ket yaqin** (bitta horizontal flex group, hech qanday flex-1 spacer'siz)

#### B. Filter panel
- [ ] Action ustun = grid row 1 col 1 (5 ustunli grid)
- [ ] Saqlangan filter pill'lar **filter panel'dan PASTDA** alohida qator (`test ✏` pencil bilan)
- [ ] Har filter label `●` bullet + `:` colon (inline content bo'lsa)
- [ ] Pills label bilan **bitta qatorda**
- [ ] Date input — 2 ta native input + «—» separator
- [ ] Picker icon — `▼` chevron (NOT 🔍)
- [ ] Bullet `●` rang to'g'ri (active vs inactive)

#### C. List table
- [ ] Har column header
- [ ] **Column gear `⚙`** header'ning oxirida (eng o'ngda)
- [ ] Checkbox column (selection)
- [ ] Footer totals row
- [ ] Pagination footer

#### D. Detail page
- [ ] Sub-nav, toolbar, title+status, form fields, tabs, side summary, bottom panels

#### E. Modals
- [ ] Field tartibi, footer button'lar, width

---

### Phase 2 — INTERACTIVE (BOSILGANDA moysklad bilan match) — 90 min

#### Phase 2a — Silent-no-op audit (MAJBURIY, har audit'da)

Bu eng ko'p takrorlangan xato turi. Har interactive element'ni
quyidagi 3 ta savol bilan tekshirish kerak:

1. **Bosishganda nima bo'ladi?** — onClick / onChange yo'q bo'lsa
   button "ko'rinishidan to'g'ri lekin ishlamaydi" deb hisoblanadi.
2. **Disabled bo'lsa, NIMA UCHUN disabled?** — user'ga hover tooltip
   bilan tushuntirish kerak.
3. **Hover-only ikonka ko'rinadimi?** — `opacity-0
   group-hover:opacity-100` pattern qachon ishlatilsa ham, user qayerga
   bosish kerakligini tushunish uchun **affordance** kerak (cursor
   pointer, aria-label, title attribute).

##### Anti-pattern: "Stub button"
```jsx
// ❌ Yomon — onClick yo'q, hech narsa qilmaydi, lekin enabled ko'rinadi
<button title="Saqlash" aria-label="bookmark">
  <SaveIcon />
</button>

// ✅ Yaxshi — onClick bo'lsa enabled, bo'lmasa visually disabled
<button
  onClick={onSave}
  disabled={!onSave}
  title={onSave ? 'Saqlash' : 'Tez orada'}
  className="disabled:cursor-not-allowed disabled:opacity-50"
  aria-label="bookmark"
>
  <SaveIcon />
</button>
```

##### Anti-pattern: "Invisible delete/edit"
```jsx
// ❌ Yomon — × tugmasi faqat hover'da ko'rinadi, user uni hech qachon topa olmaydi
<button className="opacity-0 group-hover:opacity-100" onClick={onDelete}>×</button>

// ✅ Yaxshi — moysklad pattern: hover'da ✏ pencil → click → inline editor
<button onClick={() => setEditing(true)} aria-label="Tahrirlash">✏</button>
// Editing mode: input + ✓ save + 🗑 delete + × cancel — barchasi ko'rinadi
```

##### Anti-pattern: "Duplicate counter / state"
```jsx
// ❌ Yomon — page-level span + ListView-level prop ikkalasi ham counter ko'rsatadi
<ListView selectionCount={N}>
  {extraActions={<span>{N}</span><Dropdown ... />}}
</ListView>
// Natija: [☑ N] N Dropdown...

// ✅ Yaxshi — bitta source of truth (ListView prop)
<ListView selectionCount={N}>
  {extraActions={<Dropdown ... />}}
</ListView>
```

##### Anti-pattern: "Sortable subset"
```jsx
// ❌ Yomon — column'larning faqat 6/13 da `sortable: true`,
// boshqalari header click'ni silent ignore qiladi
columns = [
  { key: 'name', sortable: true },
  { key: 'agent', /* sortable: yo'q */ },  // ← click qiladi → hech narsa
]

// ✅ Yaxshi — barcha column sortable yoki cursor:default ko'rsatish
columns = [
  { key: 'name', sortable: true },
  { key: 'agent', sortable: true },  // API enum + relational orderBy
]
```

##### Checklist 2a (har audit'da)
- [ ] Har button/link/icon'ning `onClick` yo'q bo'lsa → disabled
- [ ] Disabled element'ga `title` (tooltip bilan tushuntirish)
- [ ] Hover-only ikona o'rniga: hover affordance + explicit action
- [ ] Faqat bitta source of truth har displayed state uchun (counter, indicator, etc.)
- [ ] Har sortable header `sortable: true` (API enum'da ham mavjud bo'lishi shart)
- [ ] Har destructive action `confirm` dialog bilan (Delete, Cancel, Override)
- [ ] Har success/error to'g'ri feedback (toast, banner)
- [ ] Har list page'da `× clear` button text input'lar uchun (search clears search)



**Har bir element bilan o'zaro ta'sir:**

#### B1. Toolbar dropdown'lar OCH va item'larni taqqosla

##### B1.1 — `O'zgartirish ▾` (Изменить)
Moysklad item'lari:
1. Удалить (delete — disabled if no selection)
2. Копировать (copy)
3. Массовое редактирование (mass edit)
4. Провести (commit / post)
5. Снять проведение (un-commit)
6. Объединить (merge — needs ≥2 selected)
7. Поставить в ожидание (set on hold)
8. Снять ожидание (remove hold)

##### B1.2 — `Yaratish ▾` (Создать)
- Selectiondan boshqa hujjat yaratish (Сделать приёмку, Сделать счёт, etc.)

##### B1.3 — `Chop etish ▾` (Печать)
Moysklad item'lari:
1. **Список заказов** (list export — print visible list)
2. **<Custom template>** (e.g. "Climart Приход" — disabled if not set up)
3. **Комплект…** (set/bundle template)
4. **Настроить…** (configure templates)
5. **Запросить форму** + helper text + "Как запросить" button

#### B2. Column headers — har birini BOS
- [ ] Bosilganda ▲ sort ascending
- [ ] Yana bosilganda ▼ sort descending
- [ ] 3-marta bosilganda — sort cancel
- [ ] Matn column → alphabetical
- [ ] Raqam column → numeric
- [ ] Sana column → chronological

#### B3. Column resize — har divider SUDRA
- [ ] Header chiziqlari'ga mouse hover'da `col-resize` cursor
- [ ] Drag bilan width o'zgartirish
- [ ] Min/max width chegarasi
- [ ] Resize'dan keyin saqlanadi (localStorage yoki user pref)

#### B4. Column gear `⚙` (oxirgi header) — OCH va menu'ni verify
- [ ] Har column nomi + checkbox
- [ ] Belgilanmagan column = yashirin
- [ ] Belgilangan = ko'rinadi
- [ ] **Қатор сони (Количество строк)**: `25 | 50 | 100` toggle

#### B5. Row interactions
- [ ] **Hover** — sariq fon (yellow highlight)
- [ ] **Click** → detail page'ga o'tadi
- [ ] **Checkbox** → selection counter o'sadi
- [ ] **Right-click** → context menu (agar moysklad'da bor bo'lsa)

#### B6. Selection workflow
- [ ] 1 row tanlandi → `[☑ 1]` ko'rsatadi
- [ ] O'zgartirish ▾ ichida disabled item'lar activ bo'ladi (Удалить, Копировать, Провести)
- [ ] Saqlangan filter ham endi yangi qator'ga o'tadi

#### B7. Filter buttons
- [ ] `Topish` (Найти) → apply filter, list update
- [ ] `Tozalash` (Очистить) → reset all filters
- [ ] `Bookmark 🔖` → save current filter (modal: nom kiritish)
- [ ] `Gear ⚙` → filter settings (visible/hidden filters)

#### B8. Saved filter pill
- [ ] Pill bosilganda → filter aktivlashadi (URL + UI update)
- [ ] `✏` pencil → modal: nom o'zgartirish / o'chirish
- [ ] X icon → pillni olib tashlash

#### B9. Pagination
- [ ] `<` previous → page o'zgaradi
- [ ] `>` next → page o'zgaradi
- [ ] `1-100 из 2 187` raqam to'g'ri
- [ ] Sahifa raqamini bosish (agar bor bo'lsa)

#### B10. Disabled tooltip
- [ ] Disabled element hover → title attribute ko'rinadi (`Avval kontragentni tanlang` kabi)

---

### Phase 3 — STATEFUL (har holatda moysklad bilan match) — 30 min

Sahifani **HAR STATE**'da tekshir:

| # | State | Trigger | Moysklad behavior |
|---|-------|---------|-------------------|
| S1 | Default (data bilan) | Sahifani ochish | List ko'rinadi, default filter "active" |
| S2 | Empty (data yo'q) | Yangi account / barcha filter mismatch | "Yangi ... yarating" rich empty state |
| S3 | Loading | Slow network | Skeleton shimmer (full list area) |
| S4 | Error | API 500 | Error banner + "Qayta urinish" tugma |
| S5 | Filter applied | Filter set qilingan | URL'da query string, filter pill, "0/N filtered" |
| S6 | Selection N=0 | Default | O'zgartirish dropdown'da delete/edit DISABLED |
| S7 | Selection N=1 | 1 row checked | O'zgartirish item'lari ENABLED |
| S8 | Selection N=many | Multiple checked | Bulk delete confirm dialog |
| S9 | Saved filter active | Pill bosilgan | Filter values populated, pill highlighted |
| S10 | Pagination not-first | `>` next bosilgan | URL cursor, previous tugma enabled |
| S11 | Column hidden via gear | Gear'da checkbox o'chirildi | Column DOM'dan olib tashlanadi, kenglik qayta taqsimlanadi |
| S12 | Sort active | Header bosilgan | ▲ indicator, API sortBy + sortDir |
| S13 | Mobile / narrow | Width < 768px | Grid 5→3→2 collapse |

---

### Phase 4 — REFERENCE-CHECK (moysklad screenshot side-by-side) — 30 min

#### 4.1. Moysklad State Library — AVTOMATLASHTIRILGAN

**v2.1 yangiligi:** Reference screenshot'lar **avtomatik** olinadi `scripts/capture-moysklad-references.ts` Playwright script orqali. Endi user'dan so'rashga ehtiyoj yo'q — script o'zi moysklad.uz'ga kiradi va kerakli holatlarni capture qiladi.

#### 4.1.A. Capture script — kuyidagicha ishlaydi

```bash
# Bitta sahifa uchun barcha state'larni capture qil
pnpm capture-moysklad purchase-orders

# Barcha sahifalarni qaytadan capture qil
pnpm capture-moysklad --all

# Faqat o'zgargan/yo'q bo'lganlarni capture (incremental)
pnpm capture-moysklad --missing
```

Output: `docs/moysklad-reference/<module>/states/`:
- `01-default.png` — default view (page open, no interaction)
- `02-filter-applied.png` — filter ish bilan (e.g. period=today set)
- `03-edit-dropdown.png` — O'zgartirish ▾ (Изменить) ochilgan + DOM dump (item list)
- `04-create-dropdown.png` — Yaratish ▾ (Создать) ochilgan
- `05-print-dropdown.png` — Chop etish ▾ (Печать) ochilgan
- `06-column-gear.png` — column ⚙ ochilgan + DOM dump (item list)
- `07-row-hover.png` — first row hover ustida
- `08-selection-1.png` — 1 row tanlangan (checkbox)
- `09-selection-many.png` — multi selected (Shift+click range)
- `10-empty-state.png` — data yo'q (filter "yo'q" set)
- `11-pagination.png` — pagination footer ko'rinishi
- `12-mobile.png` — responsive (viewport 768x1024)
- `metadata.json` — DOM dumps, x/y coordinates, computed styles per element

Script hammasini bitta moysklad session'da capture qiladi (login → page → state'lar → page → state'lar → logout).

#### 4.1.B. Credentials — env var

```bash
# .env.local (gitignored)
MOYSKLAD_URL="https://app.moysklad.uz"
MOYSKLAD_EMAIL="<user-provided>"
MOYSKLAD_PASSWORD="<user-provided>"
```

User credentials'larni `.env.local` ga qo'yadi (gitignored). Script ularni o'qiydi.
Agar credentials yo'q bo'lsa, script error bilan to'xtaydi va user'ga aytadi.

#### 4.1.C. Capture protocol per page

Har page uchun script quyidagi ketma-ketlikni bajaradi:

1. Login (faqat 1-marta session boshida)
2. Navigate to `<MOYSKLAD_URL>/app/#<module>` (e.g. `#purchaseorder`)
3. Wait for list to load
4. **S1 default**: full-page screenshot
5. **S2 filter-applied**: Filter toggle ON, click «сегодня» chip, screenshot
6. **S3 edit dropdown**: click Изменить ▾, screenshot + extract menu items DOM
7. **S4 create dropdown**: click Создать ▾, screenshot + DOM
8. **S5 print dropdown**: click Печать ▾, screenshot + DOM
9. **S6 column gear**: click ⚙ on table header, screenshot + DOM
10. **S7 row hover**: hover first row, screenshot
11. **S8 selection 1**: click first row checkbox, screenshot
12. **S9 selection many**: Shift+click 5th row, screenshot
13. **S10 empty state**: search for "zzzzzz", screenshot
14. **S11 pagination**: scroll to footer, screenshot
15. **S12 mobile**: resize viewport to 768x1024, screenshot
16. **metadata.json**: dump computed styles, item lists, x/y coords

#### 4.1.D. Reference library — GIT IGNORED

`docs/moysklad-reference/**/states/*.png` git'ga commit qilinmaydi (size + copyright). Lekin `metadata.json` commit qilinadi (DOM structure, item lists — these are the authoritative source-of-truth for audit).

`.gitignore`:
```
docs/moysklad-reference/**/states/*.png
!docs/moysklad-reference/**/metadata.json
```

Reference o'zgarganda `metadata.json` diff PR'da ko'rinadi va review qilinadi.

#### 4.1.E. Audit boshlanishi (Phase 0 — Reference check)

Har audit boshlanganda **birinchi qadam**:

```bash
# Phase 0: ensure reference library is fresh
pnpm capture-moysklad <module> --check

# Output:
# ✓ docs/moysklad-reference/purchase-orders/states/01-default.png (fresh, <7 days)
# ✓ docs/moysklad-reference/purchase-orders/states/02-filter-applied.png (fresh)
# ✗ docs/moysklad-reference/purchase-orders/states/06-column-gear.png (MISSING)
# → Run: pnpm capture-moysklad purchase-orders --refresh
```

Agar `MISSING` yoki `> 30 days old` reference bor bo'lsa — `--refresh` bilan qayta capture qilinadi.

**Reference yo'qligi audit'ni to'xtatadi.** "tugadi" demaslik mumkin emas.

#### 4.2. Side-by-side comparison
Har state uchun:
- Reference screenshot (moysklad)
- Bizning screenshot (browser + Playwright)
- **Yon-yonma qo'yib, pixel-level diff'ni vizual tahlil qil**

Element-by-element (top-left → bottom-right):
- Layout: padding, margin, gap, flex direction
- Typography: font size, weight, color
- Colors: background, border, hover state
- Behavior: animation, transition
- Text: label, placeholder, helper, error

---

## 4-qism — Pre-claim verification protocol (MAJBURIY)

"Tugadi" deyish'dan oldin **HAR BIR ITEM**ni bajarish:

### 4.A. Code quality gates
1. [ ] `pnpm --filter @moysklad/api typecheck` → 0 errors
2. [ ] `pnpm --filter @moysklad/web typecheck` → 0 errors
3. [ ] `pnpm --filter @moysklad/api test` → green
4. [ ] `pnpm --filter @moysklad/web test` → green
5. [ ] `pnpm exec biome check <touched>` → 0 errors (pre-existing warnings noted)
6. [ ] Husky pre-commit hook passed

### 4.B. Visual verification
7. [ ] Brauzer'da sahifa to'liq yuklang
8. [ ] Console error/warning 0 (Playwright bilan tasdiqlash)
9. [ ] Network requests toza (403/500 yo'q)

### 4.C. Phase walkthrough
10. [ ] **Phase 1** checklist barcha item ☑️
11. [ ] **Phase 2** har interaction tested
12. [ ] **Phase 3** har state tested
13. [ ] **Phase 4** side-by-side reference compared

### 4.D. Final claim
14. [ ] Only when ALL above ☑️ — "tugadi, tekshiring" deyish mumkin
15. [ ] Aytmasdan oldin Playwright screenshot va Pixel diff baholash

---

## 5-qism — Boshqa bo'limlarga tatbiq

### Per-page time budget
Har bo'lim audit'i: **~3 soat** (avval 20 minut deb taxmin qilgan — bu xato edi):

| Phase | Time |
|-------|------|
| Reference yig'ish (moysklad screenshot'lar) | 30 min |
| Phase 1+2 audit (structural + interactive) | 60 min |
| Delta list yozish (markdown) | 30 min |
| One-sweep fix (shared + per-page) | 60 min |
| Phase 3+4 verify (stateful + reference) | 30 min |
| Commit | 10 min |

### Shared component'lar (bitta tegish → 16+ sahifaga ta'sir)
- `InlineFilterPanel` → barcha list page
- `PeriodPicker` (Shortcuts/Inputs) → date filter ishlatadigan page
- `CatalogPickerField` → picker ishlatadigan page
- `ListView` (toolbar) → barcha list page
- `DataTable` (sort, resize, gear) → barcha list page
- `Modal` → barcha modal

### Audit ketma-ketligi (priority)
1. **High traffic** — customer-orders, demands, invoices-out
2. **Money** — payments-in/out, cash-in/out, bank-import
3. **Purchase** — purchase-orders (DONE Phase 1), supplies, invoices-in, purchase-returns
4. **Warehouse** — moves, losses, enters, inventory
5. **CRM** — counterparties, contracts, projects
6. **Reports** — har bir hisobot
7. **Settings** — barcha settings sahifa

---

## 6-qism — O'zgartirilmaydigan qoidalar (12 ta)

1. **Hech qachon "tugadi" demaslik** to'liq 4-faza checklist'siz
2. **Har sahifa screenshot** + reference side-by-side har state uchun
3. **Shared component'larga ehtiyot** — bitta tegish 16+ sahifaga ta'sir
4. **UZ tili to'liq** — RU qoldiqlari `git grep -i "Печать\|Изменить\|Сохранить\|Найти\|Очистить"` bilan tozalash
5. **Pre-commit hook'ni skip qilmaslik** (no --no-verify)
6. **Git identity**: `Ozodbek <ozodbekmirgasimov@gmail.com>` har commit'da
7. **Migration purely additive** — backfill yo'q, data preserved
8. **Adversarial savol**: har feature'dan keyin "**yana nima qolib ketishi mumkin?**"
9. **Silent no-op detection (v2.2)** — har interactive element'da
   `onClick` bor yoki `disabled` visual; "ko'rinishidan to'g'ri lekin
   ishlamaydi" pattern bo'lmasligi shart.
10. **Affordance audit (v2.2)** — hover-only ikonka
    `opacity-0 group-hover:opacity-100` pattern qachon ishlatilsa,
    user qayerga bosish kerakligini tushunadigan vizual hint berish.
11. **Single source of truth (v2.2)** — har displayed state (counter,
    badge, indicator) faqat bitta joydan keladi; duplicate ko'rsatma
    bo'lmasligi shart.
12. **API + Schema parallel (v2.2)** — UI'da `sortable: true` qo'shganda
    API'ning `sortBy` enum'iga ham qo'shilishi shart; faqat UI'da
    o'zgartirish API'da 400 silent fail beradi.

---

## 7-qism — Sahifa-bo'yicha audit qadamlari (NEW v2.2)

Har sahifa audit'i quyidagi 8 qadam:

### Qadam 0 — Reference yig'ish (15-30 min)
- `pnpm capture-moysklad <module> --check` → fresh ekanligini tekshir
- Yo'q bo'lsa user'dan moysklad credentials so'rab, capture qil
- `docs/moysklad-reference/<module>/states/*.png` + `metadata.json` tayyor

### Qadam 1 — Structural delta list (15-30 min)
- Browser'da bizning sahifa + reference side-by-side
- Toolbar, filter, table, detail sub-sections — har element delta'larini yoz
- `docs/audit-<module>.md` ga delta list yoz

### Qadam 2 — Interactive delta list (30-45 min)
- Har dropdown OCH → menu items moysklad bilan match
- Har column header BOS → sort works
- Har divider SUDRA → resize works
- Har gear OCH → menu items
- Har hover state verify

### Qadam 3 — Silent no-op audit (15-20 min)
- Har button/link/icon onClick bormi tekshir
- Har destructive action confirm dialog bormi
- Duplicate counter/indicator bormi
- Empty placeholder (Tez orada) tooltip bormi

### Qadam 4 — Stateful audit (15-20 min)
- S1-S13 (default/empty/loading/error/filter/selection/saved-filter/
  pagination/sort/column-hidden/mobile) — har biri verify

### Qadam 5 — One-sweep fix (60-90 min)
- Hammasi ro'yxatdagi delta'larni BIRDANIGA tuzatish
- Iteratsiya yo'q ("fix → claim → user finds → fix")

### Qadam 6 — Pre-claim verification (15 min)
- 4.A-4.D checklist (typecheck, tests, biome, browser, console)
- Reference vs our screenshot side-by-side

### Qadam 7 — Commit + report (10 min)
- Conventional Commits format
- Ozodbek identity
- Commit msg'da: delta count, gates status, related screenshots

---

## 7-qism — purchase-orders qolgan delta'lar (Tour 5 uchun list)

Yuqorida (Tour 4) topilgan, ushbu sweep'da yopiladigan:

### Critical
- [ ] D1. Toolbar `flex-1 spacer` olib tashlash — barcha button'lar **ketma-ket yaqin**
- [ ] D2. `O'zgartirish ▾` 8 ta item to'liq ro'yxati (Удалить, Копировать, Массовое редактирование, Провести, Снять проведение, Объединить, Поставить в ожидание, Снять ожидание) — selection-aware enable/disable
- [ ] D3. `Chop etish ▾` 5 ta item (Список заказов, custom templates, Комплект…, Настроить…, Запросить форму + helper)
- [ ] D4. `Yaratish ▾` item'lar (Сделать приёмку, Сделать счёт, etc.)
- [ ] D5. Saqlangan filter pill — filter panel'dan **PASTDA** alohida qator
- [ ] D6. Column **sort** har header bosilganda ▲▼
- [ ] D7. Column **resize** divider sudrash
- [ ] D8. Column **gear ⚙** table header oxirida — checkbox + qator soni
- [ ] D9. Footer **totals row** (har column sumi)
- [ ] D10. Footer **pagination** `1-100 из 2 187 < >`
- [ ] D11. Row **hover** sariq highlight
- [ ] D12. Status pill ko'k badge ("Напечатан") stil
- [ ] D13. Selection [☑1] dan keyin keraksiz `1` raqamini olib tashlash

### Reference screenshots kerak
- [ ] `docs/moysklad-reference/purchase-orders/states/03-edit-dropdown.png`
- [ ] `docs/moysklad-reference/purchase-orders/states/05-print-dropdown.png`
- [ ] `docs/moysklad-reference/purchase-orders/states/06-column-gear.png`
- [ ] `docs/moysklad-reference/purchase-orders/states/07-row-hover.png`
- [ ] `docs/moysklad-reference/purchase-orders/states/08-selection-1.png`
- [ ] `docs/moysklad-reference/purchase-orders/states/11-pagination.png`

**User screenshot'lar bilan ta'minlasa (rasmda ko'rsatilgan) — Tour 5 boshlanadi.**

---

*Updated: 2026-05-19 — v2.0 4-faza audit, 8 anti-pattern, 13 outstanding deltas for purchase-orders, mandatory reference library.*
