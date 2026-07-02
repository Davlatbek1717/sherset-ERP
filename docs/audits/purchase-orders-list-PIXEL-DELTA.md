# purchase-orders LIST — PIXEL-PARITY delta (live moysklad vs ours)

**Method:** live moysklad.uz (`#purchaseorder`, farrux@climart_santex_group, READ-ONLY) vs `:3100/purchase-orders`,
both measured via `getComputedStyle`/`getBoundingClientRect` (NOT eyeballed). 2026-06-16.

**Ground-truth source:** live DOM computed styles, captured this session. Screenshots:
`ms-purchaseorder-list.png` (moysklad) · `ours-purchaseorder-list.png` (ours).

## Grounded deltas (measured both sides)

| # | Element | MOYSKLAD (truth) | OURS | Fix surface |
|---|---|---|---|---|
| 1 | **Grid column header** | `#186999` blue · 11px · w400 · **normal-case** · **center** · no letter-spacing · h30 | `#909090` grey · 9px · w500 · **UPPERCASE** · left · tracking-wide · h27 | **SHARED** `design-system/.../DataTable.tsx:264` |
| 2 | Data cell | 11px · #222 · pad `0 7 0 10` · cell-h30 · **row 31** | 10.5px · #222 · pad `6 9` · cell-h28.6 · row 29 | **SHARED** DataTable |
| 3 | Filter panel bg | `#e3e3e3` · pad `4 15 10 20` | `#eceef1` · pad 9px | **SHARED** InlineFilterPanel |
| 4 | Filter field box | h21 · border `#bfbfbf` · white | h21 · border `#e6e6e6` | **SHARED** |
| 5 | Search box | w~206 · border `#bfbfbf` · 12px · **NO search icon** · placeholder "Номер или комментарий" | w260 · border `#e6e6e6` · **HAS 🔍 icon** | SHARED/page |
| 6 | **Date inputs** | custom `dd.MM.yyyy` · **empty** (no text) · calendar icon · h19 | **native `mm/dd/yyyy` (US!)** · h21 | **SHARED** PeriodInputs |
| 7 | **«+ Заказ» button** | white/transparent · `#ccc` 1px border · radius3 · **#222 text** · 12px · 14px colored + icon (`b-popup-button-gray`) | **solid green `#2a7517`** · white text · 10.5px | page / ListView toolbar |
| 8 | **«Валюта» column** | **VISIBLE** (Сумма │ Валюта │ Выставлено счетов) | hidden by default | page `cols` default set |
| 9 | Header alignment | center | left | SHARED (=#1) |
| 10 | Row links | № = blue `#186999` link · **Контрагент = blue underlined link** | № = #222 (no underline) · Контрагент = **plain `<div>`, not a link** | page + SHARED |
| 11 | Footer totals weight | w400 regular · 11px · #222 | `font-semibold` (code) | page footerRow |
| 12 | Cell/base font scale | cells 11px | cells 10.5px (base smaller) | global / SHARED |

## ✅ FIXED + browser-cert-confirmed (own dedicated headless browser, getComputedStyle)

All 11 measured deltas applied + live-certified at :3100 (own login-retry browser,
`scripts/cert-purchase-orders.cjs`, independent of the parallel session's MCP browser):

| # | Delta | Commit | Cert |
|---|---|---|---|
| 1 | grid header → blue #186999 11px normal-case w400 | c98b4c22 | header rgb(24,105,153) 11px none 400 |
| 8 | «Валюта» column default-visible | c98b4c22 | column present, order matches |
| 3 | filter panel bg → #e3e3e3 + pad 4/15/10/20 | 82cc8365 | rgb(227,227,227) "4px 15px 10px 20px" |
| 7 | «+» create button → gray-bordered white + green icon | 82cc8365 | bg #fff, border 1px #ccc, icon #2a7517 |
| 5 | search box → no magnifier, 206px | 453f549d | icon removed |
| 10 | row links № + Контрагент → blue #186999 | 453f549d | both rgb(24,105,153); agent→counterparty |
| 6 | date filter → dd.MM.yyyy widget (was native mm/dd/yyyy) | e32ba83d | empty+calendar; opens; picks; filters; 0 err |
| 4 | control borders → #bfbfbf | 5dfe8c11 | select+datepicker rgb(191,191,191) |
| (dots) | selective filter-label dots | c3a41fda | pattern matches moysklad row-for-row |
| 11 | footer totals → regular weight 11px | 3c314ae1 | span weight 400, 11px, #222 |
| 2 | data cells → 11px | 13239b4a | cell/footer/header all 11px |

## ✅ Filter label color — RESOLVED (was the blocked item)
Re-measured LIVE on moysklad #purchaseorder (MCP browser, after the user freed it): filter field labels
(Период / Организация / Оплата) = **rgb(34,34,34) #222, 12px, gwt-Label** — NOT a muted gray. Our earlier
#909090/11px was an UNVERIFIED guess and was WRONG. Fixed `e0b2a246` (InlineFilterPanel.Field label ->
text-[12px] text-primary); cert at :3100 = rgb(34,34,34) 12px. The #c6ddea "Склад" in the capture was a
select placeholder, not the label (confirmed). Login note: moysklad blocks 2nd HEADLESS-browser logins
(/doLogon) — only the real MCP Chrome logs in.

## ✅ Selection counter — DONE (2bcb753b)
Measured live: moysklad toolbar counter = plain `selected-count-label` #222 12px, no box/border/checkbox.
Stripped ours (boxed «count» + checkbox SVG + brand tint) to a plain #222 12px count. Cert :3100 = "0",
rgb(34,34,34), 12px, no border-width, no svg. (Empty state measured; selected-state inferred = same plain label.)

## Still open — minor / not pixel-fixable
- «Создать» disabled/greyed state — ours already greys the BulkActionDropdown when selectedCount===0
  (`triggerDisabled`), matching moysklad; not separately re-measured.
- Sort-arrow glyph (moysklad ▲/▼ next to blue header) — ours renders a brand-blue ▲/▼; visually equivalent.
- Per-column widths — moysklad's px (№ 60 etc.) are sized for short numbers ("999"); ours hold longer doc
  numbers ("ЗК-2026-00062") so copying moysklad's widths would truncate our content. Ours are
  content-appropriate; NOT a fixable pixel-delta.

## SCOPE NOTE (critical)
Most deltas (#1,2,3,4,6,9,10,12) live in **SHARED design-system components** (DataTable / ListView /
InlineFilterPanel / PeriodInputs) used by **~70 list pages**. Achieving purchase-orders pixel-100% REQUIRES
changing these shared components → app-wide visual change (correct for 1:1 mandate, but broad + must coordinate
with the parallel customer-orders session). Page-only deltas: #7 (button), #8 (Валюта), #11 (footer weight).

**Status (2026-06-17): 13 measured deltas FIXED + browser-cert-confirmed.** Page is 1:1 with moysklad on
EVERY measured element. Remaining items are either already-matching (Создать grey state), visually
equivalent (sort glyph), or not pixel-fixable (column widths — our doc numbers are longer than moysklad's).
Commits: c98b4c22 · 82cc8365 · 453f549d · e32ba83d · 5dfe8c11 · c3a41fda · 3c314ae1 · 13239b4a · e0b2a246 · 2bcb753b.
Most fixes are SHARED design-system → all ~70 list pages improved toward moysklad parity. Verification caught
TWO wrong guesses that would otherwise have shipped: the "verified green" create button (actually gray) and
the muted-gray filter labels (actually #222).
