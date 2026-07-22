# Demand `/new` (Отгрузка yaratish) — moysklad 1:1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `apps/web/src/app/(app)/demands/new/page.tsx` sahifasini moysklad `#demand/edit?new` bilan **vizual +
funksional 1:1** qilish (sub-project 1/4; keyin detail, list, keyin cross-cutting marking).

**Architecture:** Discovery-first. Task 1 ishlab turgan `:3100`ni moysklad screenshot yoniga qo'yib vizual delta +
runtime-data mavjudligini (profit/bin uchun) aniqlaydi → keyingi tasklar shunga tayanadi. Har funksional task TDD +
capture-grounded (§4) + gate + browser-cert.

**Tech Stack:** Next.js App Router · React · design-system (`@moysklad/ui`, `DocumentTotalsPanel`/`PositionTable`/
`DocumentMetaPanel`/`AttributesEditor`) · Vitest · Playwright MCP · i18n next-intl (ru+uz).

## Global Constraints (spec + CLAUDE.md — har taskка implicit)
- **Grounding (§4):** har label/maydon moysklad capture'da DOM-rol bilan tasdiqlansin; capture = `docs/audits/demands-live-2026-07-23/`. Taxmin yo'q → DEFER+hujjatla.
- **Gate (commit-nuqtada):** `pnpm --filter @moysklad/web typecheck` = 0 · biome = 0 · i18n key-existence ru+uz + no-hardcoded · web Vitest regress yo'q.
- **Halollik:** browser-cert bo'lgunча «done/100%» YO'Q. Commit'da holat halol.
- **Parallel-sessiya (§6):** faqat o'z fayllaring `git add <aniq yo'l>`; `git add -A`/`git add .` TAQIQ.
- **Model:** hamma subagent Opus (`model:'sonnet'` UZATMA).
- **Til:** UI matn i18n orqali (ru+uz), hardcoded Latin-uz YO'Q.

---

### Task 1: Discovery — dev-stack + `/new` vizual pixel-diff + data-feasibility

**Files:**
- Create: `docs/audits/demands-live-2026-07-23/_new-visual-delta.md` (delivarable)

**Interfaces:**
- Produces: `_new-visual-delta.md` — (a) vizual delta ro'yxati (bizning /new vs `demand-03-new.png`: spacing/rang/shrift/
  joylashuv/tugma/label), (b) profit-feasibility (pozitsiya state `buyPriceMinor` tashiydimi? — Task 4 shunga bog'liq),
  (c) bin-feasibility (PositionTable `cell` column config API — Task 5).

- [ ] **Step 1: Dev-stack ko'tarish.** Postgres (`sherset`@5432) ishga tushir → `pnpm db:migrate` → `pnpm db:seed` →
  `pnpm dev` (api:4000 + web:3100). *(Muhit sovuq bo'lsa — postgres qanday startlashini operatordan so'ra; oxirgi
  sessiya `pg_ctl` user-space ishlatgan.)* Kutilgan: `:3100` javob beradi, `:4000/health` OK.
- [ ] **Step 2: Bizning /new'ni ol.** Playwright: `:3100`ga login → `/demands/new` → full-page screenshot
  `docs/audits/demands-live-2026-07-23/our-new-01.png`.
- [ ] **Step 3: Vizual diff.** `our-new-01.png` vs `demand-03-new.png` yonma-yon: har farqni (spacing/rang/shrift/
  label/tugma/blok-tartibi) yoz. Grounding: label matnlari capture'dagi RU bilan mos.
- [ ] **Step 4: Data-feasibility.** `new/page.tsx` position state shape'ini o'qi — pozitsiya `buyPriceMinor` (yoki
  cost) tashiydimi (profit = Σ(sell−buy)×qty create'da hisoblash mumkinmi)? `PositionTable` `cell` column config
  API'sini (`packages/design-system/src/document-editor/PositionTable.tsx`) o'qi. Ikkalasini `_new-visual-delta.md`ga yoz.
- [ ] **Step 5: Delta doc yoz + commit.**
```bash
git add docs/audits/demands-live-2026-07-23/_new-visual-delta.md
git commit -m "docs(demand): /new visual delta + data-feasibility (discovery)"
```
Expected: doc'da vizual delta ro'yxati + profit/bin feasibility javobi.

---

### Task 2: Shipping maydonlarni «Грузоотправитель» bloki ostida guruhlash

**Files:**
- Modify: `apps/web/src/app/(app)/demands/new/page.tsx:879-986` (hozir `DocumentDisclosurePanel title={tForm('other_fields')}` ichida)
- Modify: `apps/web/src/messages/ru.json` + `uz.json` (`detail_titles` yoki `form` namespace: `consignor_block` = «Грузоотправитель» / «Yuk jo'natuvchi»)
- Test: `apps/web/src/app/(app)/demands/__tests__/new-shipping-block.test.tsx` (yoki mavjud demand test fayliga qo'shish)

**Interfaces:**
- Consumes: Task 1 delta doc (moysklad'da blok sarlavhasi aynan «Грузоотправитель»mi tasdiqla — `demand-03-new` capture'da shu 10 maydon `Грузоотправитель ... ИД гос. контракта` ketma-ketligida).
- Produces: yangi i18n key `form.consignor_block` (yoki mos namespace).

- [ ] **Step 1: Failing test.** Test: /new render'da 10 shipping maydon `«Грузоотправитель»` sarlavhali panelda (alohida `other_fields`da EMAS). Assert: `getByText('Грузоотправитель')` panel-title roli + ichida `consignor/consignee/carrier/...` maydonlari.
- [ ] **Step 2: Test fail bo'lishini tasdiqla** (`vitest run new-shipping-block`).
- [ ] **Step 3: Implement.** Shipping 10 maydonni (883-978 oralig'i) alohida `DocumentDisclosurePanel title={tForm('consignor_block')}` (yoki `DocumentSection`) ichiga chiqar; capture tartibiga moslashtir (Грузоотправитель, Перевозочный документ №, Грузополучатель, Транспортное средство, Перевозчик, Номер автомобиля, Наименование груза, Всего мест, Указания грузоотправителя, ИД гос. контракта). `other_fields` disclosure faqat haqiqiy qo'shimcha maydonlar uchun qoladi (Task 3'ga tayyorgarlik). i18n key qo'sh (ru «Грузоотправитель» / uz).
- [ ] **Step 4: Test pass** + `typecheck` + `biome`.
- [ ] **Step 5: Commit.** `git add new/page.tsx ru.json uz.json __tests__/new-shipping-block.test.tsx` → `feat(demand): /new shipping fields grouped under Грузоотправитель block`.

---

### Task 3: Create'da custom-attributes editor («Другие поля»)

**Files:**
- Modify: `apps/web/src/app/(app)/demands/new/page.tsx` (AttributesEditor'ni import + form state + submit payload'ga ulash; detail'dagi `[id]/page.tsx:1148-1156` naqshini ko'r)
- Test: demand /new test fayli

**Interfaces:**
- Consumes: detail `AttributesEditor` props (entity type `demand`, `value`/`onChange`), submit DTO'ning attribute maydoni (`demand.schema.ts`da mavjud attribute payload).
- Produces: /new submit'i custom-attribute qiymatlarini yuboradi.

- [ ] **Step 1: Failing test.** /new'da `AttributesEditor` render bo'ladi (entity=demand); qiymat kiritilib submit qilinganда payload'da attributes bor. (Detail parity: detail submitда bor.)
- [ ] **Step 2: Fail tasdiqla.**
- [ ] **Step 3: Implement.** Detail'dagi AttributesEditor wiring'ini /new'ga ko'chir: state (`attributes`), render (haqiqiy «Другие поля» disclosure — Task 2 shipping'ni chiqargach bo'shagan), submit payload'ga qo'sh. `demand.schema.ts` create DTO attribute'ni qabul qilishini tasdiqla (detail update qiladi → create ham qilishi kerak; qilmasa schema kengaytir + test).
- [ ] **Step 4: Test pass** + gate.
- [ ] **Step 5: Commit.** `feat(demand): custom attributes editor on /new (create parity)`.

---

### Task 4: Create'da «Прибыль» (profit) — Task 1 feasibility'ga bog'liq

**Files:**
- Modify: `packages/design-system/src/document-editor/DocumentTotalsPanel.tsx` (yangi optional `profitMinor` prop + qator — DEFER agar prop allaqachon bor)
- Modify: `apps/web/src/app/(app)/demands/new/page.tsx:840-850` (profit hisoblab prop uzat)
- Test: `packages/design-system` DocumentTotalsPanel test + demand /new profit-calc test

**Interfaces:**
- Consumes: Task 1 Step 4 javobi — pozitsiya `buyPriceMinor` mavjud bo'lsa profit = Σ(priceMinor−buyPriceMinor)×qty (VAT-mantiq detail bilan bir xil). **Agar buyPrice pozitsiyada YO'Q bo'lsa → bu task DEFER + hujjatla** (create'da COGS ma'lum emas, draft'da '—' ko'rsatiladi, moysklad ham draft'da 0 ko'rsatgan — capture `Прибыль: 0,00`).
- Produces: `DocumentTotalsPanel` `profitMinor?: bigint` prop.

- [ ] **Step 1: Feasibility gate.** Task 1 buyPrice YO'Q desa → DEFER (audit-doc'ga yoz), Task 5'ga o't. Bor desa davom.
- [ ] **Step 2: Failing test.** DocumentTotalsPanel `profitMinor={100n}` uzatilganда «Прибыль: …» qatori render. + demand: 2 pozitsiya (sell/buy ma'lum) → profit to'g'ri.
- [ ] **Step 3: Fail tasdiqla.**
- [ ] **Step 4: Implement.** DocumentTotalsPanel'ga `profitMinor` prop + qator (detail `detail-totals-sidebar.tsx:128-134` bilan bir xil format/rang). /new'da profit hisoblab uzat.
- [ ] **Step 5: Test pass** + gate (design-system + web).
- [ ] **Step 6: Commit.** `feat(demand): profit row on /new totals` (yoki DEFER commit yo'q).

---

### Task 5: Pozitsiyada «Ячейка» (bin) kolonka

**Files:**
- Modify: `apps/web/src/app/(app)/demands/new/page.tsx:93-107` (`POSITION_COLUMNS`ga `{ key: 'cell' }` + kerak bo'lsa customs config)
- Modify (agar kerak): `packages/design-system/src/document-editor/PositionTable.tsx` (cell column wiring — Task 1 Step 4 API'ni aniqlagan)
- Test: demand /new positions-column test

**Interfaces:**
- Consumes: Task 1 Step 4 — `PositionTable`da `cell` column config qanday yoqiladi (POSITION_COLUMNS'ga key qo'shish yetadimi yoki customs prop kerakmi).
- Produces: /new positions jadvalida «Ячейка» ustuni; qiymat submit payload'da (position `cellId`/`cell`).

- [ ] **Step 1: Grounding.** capture `demand-03-new` positions kolonka tartibi: Наименование, Маркировка, Ячейка, Цена, Скидка, Кол-во. «Ячейка» = bin. Backend `demand.schema.ts` position `cell`/`slot` maydonini qabul qiladimi tekshir (yo'q bo'lsa BE task ham).
- [ ] **Step 2: Failing test.** /new POSITION_COLUMNS'da `cell` bor → jadval sarlavhasida «Ячейка» render.
- [ ] **Step 3: Fail tasdiqla.**
- [ ] **Step 4: Implement.** `POSITION_COLUMNS`ga `cell` qo'sh (moysklad tartibida: name'dan keyin, price'dan oldin — marking Task alohida). PositionTable API bo'yicha bin-picker/input wire; submit payload. BE cell maydonini qabul qilmasa → schema + migration (alohida commit, §MULTI-AGENT WIRING protokoli).
- [ ] **Step 5: Test pass** + gate.
- [ ] **Step 6: Commit.** `feat(demand): bin (Ячейка) column on /new positions`.

---

### Task 6: Vizual delta fix (Task 1 ro'yxati) + browser-cert

**Files:**
- Modify: `apps/web/src/app/(app)/demands/new/page.tsx` (+ kerak bo'lsa shared DS — lekin shared o'zgarish boshqa formalarga tarqaydi, ehtiyot)
- Test: mavjud demand render testlari regress yo'q

**Interfaces:**
- Consumes: Task 1 `_new-visual-delta.md` ro'yxati.

- [ ] **Step 1:** Delta doc'dagi har vizual farqni (spacing/rang/shrift/label/tugma/blok-tartibi) ketma-ket tuzat. Shared paketга tegsang — regress-risk (28 forma) → alohida ehtiyot + browser-smoke bir necha formada.
- [ ] **Step 2:** Har tuzatishdan keyin `:3100` /new'ni qayta screenshot → moysklad yoniga qo'yib tekshir.
- [ ] **Step 3:** Gate to'liq (typecheck/biome/i18n/web Vitest).
- [ ] **Step 4: Browser-cert.** /new'ni to'liq moysklad `demand-03-new.png` bilan solishtir — ko'rinadigan farq qolmasin (yoki qolganini hujjatla). Halol yorliq: «vizual-verified /new» yoki «qolgan mayda: …».
- [ ] **Step 5: Commit** + audit-doc `docs/audits/_demand-new.audit.md` (nima qilindi, nima DEFER, browser-cert holati).

---

## Marking (Маркировка) — ALOHIDA sub-project (bu rejaga KIRMAYDI)
C2: DS'da `marking` kolonka umuman yo'q → yangi komponent + BE. Katta, cross-page (list/detail/new hammasi). User
«QURILADI» dedi → alohida spec+plan bilan (demand list/detail tugagach yoki parallel worktree'da).

---

## Self-Review
- **Spec coverage:** /new gaplari (N1 custom-attrs=Task3 · N2/C3 profit=Task4 · N3/D5 shipping-group=Task2 · C1 bin=Task5 · vizual=Task1+6) qoplandi. C2 marking = alohida (hujjatlangan).
- **Placeholder:** funksional tasklar aniq fayl+interfeys+test-strategiya bilan; Task1 discovery ataylab boshda (running-app + runtime-data bog'liqligi haqiqiy, placeholder emas). Task4/5 feasibility-gate bilan halol shartlangan.
- **Type consistency:** `profitMinor: bigint` (Task4), `cell` column key (Task5), `form.consignor_block` i18n key (Task2) — nomlar izchil.
