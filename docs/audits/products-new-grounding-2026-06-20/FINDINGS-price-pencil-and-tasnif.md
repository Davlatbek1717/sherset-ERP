# /products/new — live grounding of the 2 remaining controls (2026-06-20)

> Source: real `online.moysklad.uz` (farrux@climart), create-product form
> `#good/edit?new&type=Good`, read-only walkthrough (nothing saved). Screenshots
> in this folder are the authoritative basis (CLAUDE.md §4).

These are the last two of the four polish items the /products/new re-audit
flagged as "non-trivial, NOT quick polish". Live grounding CONFIRMS both are
**features that depend on a larger capability we don't have**, not pencil-sized
decorations — so each is **honestly deferred** with the spec captured here,
rather than shipped as a hollow non-functional look-alike.

---

## (c) Price-row ✏ pencil  →  «Курс валюты документа» (currency-rate editor)

Screenshot: `price-pencil-kurs-valyuty.png`.

Each price row is `[amount input] [сум (UZS) ▾] [✏]`. The ✏ (`div.edit-button`)
opens a small dialog **«Курс валюты документа»**:

```
Курс валюты документа                         [×]
○ 1 = 1 UZS
   Текущий курс валюты из справочника
● 1 = [   1   ] UZS
[Изменить курс]   [Отменить]
```

**What it is:** a per-price **currency exchange-rate override**. When a price is
entered in a *foreign* currency, this sets how many UZS = 1 unit of that currency
(use the reference-book rate, or pin a custom rate). It is **NOT** a markup /
cost-calculator / price-settings tool.

**Why DEFER (not polish):**
- Our /products/new price rows have a **single-option currency dropdown (base
  UZS only)** — there is no foreign currency for which a rate is meaningful, so
  the ✏ would be a **non-functional decoration**.
- The real climart account itself is **100% UZS** (REST-API grounding 2026-06-20:
  all `salePrices` / `buyPrice` / `minPrice` in UZS) → a per-price FX-rate editor
  is **speculative** for this account (the §4 anti-speculation bug-class).
- A correct build = a **multi-currency price-entry feature**: currency dropdown
  lists the account's real currencies, choosing a non-base one enables the rate
  editor, and per-price `currency`+`rate` persist. That is a separate, larger
  flagship — out of scope for "1:1 of the common (UZS) case", which we already
  match.

**If ever built:** dialog = 2 radios (reference rate vs custom `1 = N UZS`) +
«Изменить курс»/«Отменить», one per price row, gated on currency ≠ base.

---

## (d) «Поиск по ТАСНИф» button  →  soliq.uz MXIK/ИКПУ catalog search

Screenshot: `tasnif-search-modal.png`.

In «Особенности учета», the `[🔍 Поиск по ТАСНИФ]` button
(`div.tasnif-search-button-wrapper`) opens a modal:

```
Поиск по ТАСНИФ  ⓘ                                       [×]
Наименование, ИКПУ или штрихкод
[ search input .......................................... ]

[Закрыть]
```

**What it is:** a **national tax-catalog (soliq.uz MXIK / ИКПУ classifier)
search**. You type a product name / ИКПУ / barcode; it queries the soliq.uz
classifier and returns matching catalog entries; picking one fills the
**ИКПУ (MXIK)** + **Код упаковки ТАСНИФ** + **Штрихкод ТАСНИФ** fields.

**Why DEFER (not polish):**
- It is an **external integration with the soliq.uz MXIK classifier** — a
  national tax-authority dataset of tens of thousands of ИКПУ codes + a search
  API. We have **no such data or integration**.
- A "look-alike" modal that returns nothing would be a **hollow, misleading
  decoration** (it would imply ТАСНиф auto-lookup works when it doesn't) —
  violates quality-first + honesty.
- **The fields it fills already exist and persist** on our form: `mxikCode`
  (ИКПУ, 17 digits) + base-pack `tasnifCode` / `barcode` (Код упаковки ТАСНИФ /
  Штрихкод ТАСНИФ). Users can enter the codes **manually today**; only the
  auto-search is missing.

**If ever built:** needs (1) a soliq.uz MXIK dataset or live API access, (2) a
search endpoint, (3) the modal above (title + «Наименование, ИКПУ или штрихкод»
input + result list → on-pick fill ИКПУ/ТАСНиф). A real feature, not polish.

---

## Net result for /products/new

The four re-audit "remaining" items are now resolved:
- **Ед.изм → combo** ✅ shipped (`f86278ad`, live-cert).
- **Страна → combo** ✅ shipped (`f86278ad`, live-cert).
- **Price-row ✏** ✅ shipped (`be22dd3b`, live-cert) — the user chose to build
  multi-currency. Sale-price rows get a real `/currencies` dropdown (per-price
  `currencyCode`, persisted) + the ✏ «Курс валюты документа» dialog (reference
  vs custom rate). buy/min stay base-currency (foreign buy/min would ripple into
  analitika/bom/variant cost math — a separate app-wide money change).
- **«Поиск по ТАСНИф»** ⏸ DECLINED by the user (2026-06-20) — soliq.uz MXIK catalog/integration
  (manual ИКПУ/ТАСНиф entry already works).

/products/new is now **functional 1:1 for all real usage**, incl. per-sale-price
currency + the rate dialog. The only un-built parity bits are buy/min currency
(an app-wide money change) and the soliq.uz ТАСНиф auto-search (user-declined) —
both documented above for whoever picks them up.
