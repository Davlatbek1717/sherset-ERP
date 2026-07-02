# PLAN — «Упаковка» pack-row FOCUSED-state 1:1 (next session)

> Live-grounded 2026-06-25 (8 capture attempts). Evidence:
> `docs/audits/product-pack-active-live-2026-06-25/60-focused.png` (the money shot —
> focused row with all controls + open units dropdown). Working grounding script:
> `tools/capture/product-pack-focus-v7-2026-06-25.mjs`.

## What was already shipped — DONE, certed
Product card tabs converged 1:1: **Упаковка** (`6a39fe7e`·`c205e388`·`705e1ef3`) +
**История** (`5c8d4b8d`·`6d61974a`). The pack tab AT-REST state (borderless cells,
peach empty-name, chevron-on-hover, «Тип кода» col, no TASNIF col) is **already 1:1**.

### FOCUSED-state controls #1–4 — DONE + browser-certed (`824c140f`, 2026-06-25)
Items 1–4 below are SHIPPED. Live cert `scripts/cert-product-pack-focus-2026-06-25.mjs`
on a fresh :3223 dev server = 10/10, 0 console errors:
- ✅ **#1 yellow focused row** — `<tr>` `focus-within:bg-[#fffde7]`; cert read
  `rgb(255,253,231)` exactly. (Kept the at-rest peach empty-name as-is — already 1:1.)
- ✅ **#4 ⣿ drag-to-reorder** — grip column (drag starts on grip only so cell text
  stays selectable), HTML5 DnD + 2px brand drop-line, mirrors DS PositionTable. New
  `grip: GripVertical` DS icon. (Did NOT defer — landed cleanly.)
- ✅ **#2 «↻» generate-barcode** — Штрихкод trailing button → `genEan13()` (now
  EXPORTED from use-product-form). Cert produced 13-digit `2071412318883` (prefix 20).
- ✅ **#3 «⊗» delete** — swapped bare «×» → `Icons.rowDelete` (filled disc + cross).
- i18n `pack_reorder` + `pack_generate_barcode` (ru+uz); +1 vitest focused-state lock.

### FOCUSED-state #5 — DONE + browser-certed (`d94893e7`, 2026-06-25)
Re-grounded the two unknowns (`tools/capture/product-pack-focus-v8` → `focus-v8.json`):
- ✅ **name-suggest SOURCE = the unit-of-measure registry** — v8 enumerated the
  `gwt-PopupPanel selector-popup`: «10^3 м^2 · блок · кг · л · м · шт · ярд …» (all
  units, identical to «Ед. измерения» / our `uomItems` / `/uoms`).
- ✅ **green «+» = create-unit** — it's `div.add-button` (701,367); clicking it raised
  moysklad's «Сохранение изменений» (save-before-leave → units editor), confirming it
  creates a NEW unit of measure.
- Built **PackNameCell** (`apps/web/.../products/pack-name-cell.tsx`): free-text Input
  (keeps custom names — `ProductPack.name` stays a string, NO schema change) + a Radix
  Popover suggestion list over `uomItems` + a trailing green «+». Pick → name = unit.
  «+» → one-field create-unit Modal (prefilled) → POST /uoms → invalidate ['uoms','all']
  → name = the new unit. Read-only callers (no uomItems) fall back to a plain Input.
- Cert `scripts/cert-product-pack-name-suggest-2026-06-25.mjs` on a fresh :3224 = 9/9,
  0 errors: «к» → 3 unit suggestions, pick set «кг», «+» modal, Создать created a REAL
  unit (verified via GET /uoms, cleaned with DELETE /uoms/:id).

**The pack focused row is now moysklad 1:1 end-to-end: ⣿ · yellow · name-suggest+«+» ·
«↻» · «⊗». Nothing remains on the «Упаковка» tab.**

## GROUNDING — what moysklad's pack row does (FOCUSED state)
The extra controls the user saw appear ONLY when a row cell is **focused** (clicked
into). At rest the row is just peach-name + plain values (matches us). On focus:

| Element | moysklad behaviour |
|---|---|
| **Whole row** | turns **YELLOW** (`#fffde7`-ish) while focused/unsaved |
| **⣿ drag handle** (far left) | reorder pack rows by drag |
| **Наименование** | a **Combobox over the UNITS registry** (`▾` listed «10^3 м^2» live) + a green **«+»** that **creates a new unit of measure**. Empty + focused → **RED border** (required) |
| **Количество** | plain number input («1») |
| **Ед. измерения** | unit dropdown («шт») — already done |
| **Тип кода** | barcode-symbology dropdown («EAN13») — already done |
| **Штрихкод упаковки** | input + **«↻»** that **generates an internal EAN13** (user-confirmed; prefix-20, valid check digit) |
| **«⊗»** (far right) | delete row (we have «×» on hover — swap glyph/keep hover) |

KEY semantic note: moysklad's pack **«Наименование» IS a unit of measure** (packs =
alternative units). Our `ProductPack.name` is currently a FREE string. Decision below.

## IMPLEMENTATION PLAN (ordered: low-risk → high-risk)
All in `apps/web/src/components/product-detail-widget.tsx` (the pack `<table>` in the
`packaging` TabsContent) unless noted. Reuse `genEan13()` + `uomItems` from
`apps/web/src/components/products/use-product-form.ts`.

1. **Yellow focused row + red empty-name border** (CSS/state, LOW). The `<tr>` gets
   `focus-within:bg-[#fffde7]`; the name Input border goes RED when empty+focused
   (`focus:invalid`-style or a computed `!p.name.trim()` + focus → red), replacing the
   current peach bg. Keep peach OR switch to moysklad's red-border-on-focus.

2. **«↻» generate-barcode** in the Штрихкод cell (LOW). A small refresh button inside
   the barcode Input's trailing slot → `updatePack(id, { barcode: genEan13() })`.
   `genEan13` is already exported-ish in use-product-form (or lift it). Reveal on row
   hover/focus like the «×».

3. **«⊗» delete glyph** (TRIVIAL). Current «×» hover-reveal → moysklad circle-x. Keep
   the hover behaviour; optionally use a circled-x icon. Low priority.

4. **⣿ drag-to-reorder** handle (MEDIUM). Reorder the `packs` array on drag. Options:
   (a) a tiny pointer-based up/down reorder, or (b) a dnd lib if one's already in the
   repo. The pack `position` is already persisted (0-based). If too heavy → DEFER with
   up/down arrows as interim + log the gap.

5. **Наименование = units Combobox + «+»** (HIGH — the big one). Change the name cell
   from a free-text `Input` to a `Combobox` over `uomItems` (the /uoms units) with a
   trailing green **«+»** that creates a new unit. Decision:
   - **Option A (recommended, minimal-semantic):** name Combobox lists unit names;
     selecting sets `pack.name = <unit name>`. The «+» opens a small create-unit flow
     (POST `/uoms` with a name, then pick it) OR routes to `/settings/uoms/new`. Keeps
     `ProductPack.name` a string (no schema change) — the value just comes from the
     units registry instead of free typing.
   - **Option B:** add a real `uomId` FK on ProductPack → bigger (migration). Avoid
     unless Option A proves wrong on a re-ground.
   - Reuse the main-form uom Combobox pattern (`product-form-left-cards.tsx:326-362`)
     + the `/uoms` create. A units-create modal may be needed (check if one exists).

## GATE + CERT (mandatory)
- ds+web tc0 · biome0 · widget vitest 4 (+asserts: yellow class, «↻» genEan13 call,
  name Combobox, «+» create).
- Live cert `:3100` (NEW script, mirror `scripts/cert-product-pack-2026-06-25.mjs`):
  open product → Упаковка → add row → FOCUS name → assert yellow row + «▾» lists units
  + «+» present; click «↻» → barcode fills with a 13-digit EAN13; reorder; SAVE →
  reload → round-trip. 0 console errors.
- **Server gotchas this session (CRITICAL — saved much pain):** web (`next dev`) AND
  api (`tsx watch`) background tasks keep DYING (~1 min). Fix: restart api + run cert
  in ONE chained bash (`wait-for-401 → node cert`, no inter-tool gap). On a clean
  `.next`, PRE-WARM routes via curl (`/login`, the `/api/v1/auth/login` proxy,
  `/products/[id]`, any nav target) before the cert. Login needs click + **Enter
  fallback** on the password field. Playwright `\bиз\b` / Cyrillic word-boundary
  regexes FAIL → use `getByText('…')`. The Combobox/Modal forward `data-testid`
  (no hyphen), DS Input/NativeSelect forward `data-test-id`.
- DB cleanup: a «шт» base pack re-materializes on cleanup-save (product-level tasnif
  round-trip) — clean with API `PATCH {version, packs: []}`.

## HONEST scope note
This is ~5 sub-tasks; #5 (units-picker) is the real work. #4 (drag) may be deferred.
The AT-REST tab is already 1:1 and certed — this PLAN is purely the FOCUSED-state
interaction parity the user spotted in a live walkthrough.
