# Purchase-orders (and all-pages) — remaining parity work: creation · icons · behavior

Decided with user 2026-06-17. The list-page **pixel/visual** layer is done (15 deltas,
live-verified — see `purchase-orders-list-PIXEL-DELTA.md`). What remains, in the user's words:

1. **Creation parts identical, every page** ("yaratilgan bo'lsa yaratish qismini bir xil qil") — NOW
2. **Real icons** ("rasm bo'lsa kirib uni yuklab o'zimizniki o'rnat") — NOW
3. **Full behaviour parity** ("har bir qismni 100% to'g'ri ishlasin") — NEXT SESSION

## UPDATE 2026-06-17 (live-grounded on online.moysklad.uz #purchaseorder, farrux@climart)

A live read-only walkthrough corrected several assumptions below. Authoritative findings:

**Печать menu is DYNAMIC** (not the static 4 items). On a real account with data + custom
templates the live `print-popup-menu-bar` was, top→bottom:
`Climart Приход` · `Заказ поставщику`(enabled) · `Чек_сум` · `Комплект…` · `Настроить…` ·
then a **«Запросить форму»** block (`print-custom-template-request-header` + subtitle
«Вы можете запросить индивидуальную печатную форму у нашей службы поддержки» + «Как запросить»
button). The first two custom rows (`Climart Приход`, `Чек_сум`) are the account's own
`PrintTemplate`s. NOTE: `Список заказов` was ABSENT here (present only in the old free/empty
capture) — kept ours, since removing it is a tier/state guess.

- **Печать menu — DONE (3 flagships, all live :3100 cert):**
  - `aba1258` «Запросить форму» block — reusable `ListToolbarMenu.requestForm` on the shared
    `ListView`; LOCAL bilingual labels (ru/uz.json parallel-locked; list page outside the i18n
    no-hardcoded gate). Resolves the "add or omit" question → CONFIRMED present, ADDED.
  - `6943dc72` «Заказ поставщику» prints the selected orders via the existing bulk-print pipeline
    (was a dead disabled placeholder); selection-gated.
  - `40fa1c76` dynamic account print-forms: `GET /purchase-orders/print-forms` (doc-scoped
    purchaseorder:view) lists the account's own templates as menu items; each prints via
    `templateId` (BE: `resolveById`/`listPrintable` + `renderBulk(..., templateId?)`). Cert created
    a real template → listed → menu item → printed (201 pdf, templateId sent) → deleted.
  - Still on the menu but DEFERRED: «Комплект…» kit print (disabled placeholder — complex).
- **Icons — confirmed already at parity (no change needed).** Live DOM: create «Заказ» button =
  white→#e6e6e6 gradient + `#ccc` border + `#222` text + a small GREEN plus sprite (matches our
  code; the earlier "blue filled disc" note was a low-zoom misread). Printer/refresh/gear/help are
  sprites whose lucide equivalents already match shape. Per the icon rule ("accept the lucide match
  when you can't hand-draw better"), the toolbar icons are DONE.

### List-page (`/purchase-orders`) pixel/behaviour parity — 2026-06-18 round (all live :3100 cert)
- `2134fdac` **«Контрагент» column was INVISIBLE** (width 0) — the DataTable is table-layout:fixed and
  agent/description had no explicit width, so they collapsed once the fixed columns filled the grid. The
  whole supplier column was missing. Gave agent + description widths; also row links → normal-weight +
  always-underline (moysklad measured w400 + static underline, ours was w500 + hover-only).
- `85283869` then `e8bbdb7a` (**ADDED then REMOVED — §4 misground caught by live re-grounding**):
  added a «Статус ▾» toolbar dropdown (7 FSM states as Badges) believing moysklad's toolbar was
  Изменить · **Статус** · Создать · Печать. Live check on the **user's own account (farrux@climart)**
  showed its PO toolbar is **Изменить · Создать · Печать — NO «Статус ▾»**. The button only appears for
  accounts with **custom purchase-order statuses** configured (the free reference capture had it,
  climart does not), and would list those custom statuses, not FSM states. So my version was wrong twice
  (always-shown + FSM states) and made ours DIFFER from what the user sees → removed. The `stateFilter`
  query plumbing stays dormant (`_setStateFilter`) for if/when PO gets custom statuses. Guard
  `purchase-orders-list-parity.test.ts` now LOCKS «Статус» OUT.
- `d5063071` columns narrowed toward moysklad's measured grid (1321px) — ours 1830→1605px (ours stays a
  touch wider: our «3K-2026-NNNNN» №/long supplier names need more than moysklad's short «999»).
- ~~OLD-vs-NEW design split~~ **RESOLVED — no conflict.** After the user fixed the MCP browser
  (`--isolated` on the playwright plugin, no more lock/expiry), a clean measurement of climart showed its
  grid IS the **NEW `.header-wrap` blue-header design** (header markup `header-wrap > header-sort +
  header-content`, header colour `rgb(24,105,153)`=#186999). The earlier "`sorted-desc`/old CellTable /
  likely-dark" read was a transient/misread. So our clone's design is correct; the strategic question is
  moot.
- **Full live measurement vs climart — these already MATCH ours:** header #186999 · w400 · 11px ·
  no-transform · 31px tall · transparent bg · row links #186999 · underline · w400 · 11px · cells 11px ·
  #222 · default `.header-sort` box 14×4. Confirmed, no change needed.
- `1f0fc4e8` **row-hover colour** — measured climart hover = `rgb(255,251,140)`=#fffb8c (we had a paler
  #FFF8E1 guess). Fixed in the SHARED `DataTable` (app-wide). Live :3100 cert: hovered row computes
  rgb(255,251,140) exactly.
- `c277b2e0` **«Принято» fulfilment-bar green** — measured climart `bottom-indicator … green` = 4px
  border-bottom `rgb(134,170,96)`=#86aa60 (muted olive; ours was vivid #3eb53e/3px). Fixed for the
  full-receipt case. NOT visually certed — our demo is all 0-received so the bar never renders here.
### 2026-06-18b round — the «3 things» + «why is № lettered» (user asked to finish all)
- `5dfcb681` **«Номер» → plain integer like moysklad** (root of the user's «nega harf bilan» question).
  `nextOrderName` hand-built `ЗК-{year}-NNNNN` (5-digit zero-pad); moysklad shows a plain integer («999»).
  Switched the generator to `String(n)` with a year-less counter key + renumbered all **2143** demo PO to
  a continuous 1..N by (moment, id) — one-off dev-DB migration (backup `apps/api/scratch-po-names-backup.json`,
  untracked), DocumentSequence counter pointed at 2143 (next = 2144). Live :3100 cert: list shows plain
  integers descending. **RESTART DONE + confirmed live:** tsx-watch did NOT hot-reload the backend change
  (the running API served new DATA but old CODE), so the user OK'd a `pnpm dev` restart — killed the turbo
  tree (PID 19924) + relaunched; API «Nest started on :4000». After restart the list returns 2143, 2090,
  2089, 2088… — the 2143→2090 «jump» is NOT a bug: 60 of 2143 PO are soft-deleted (2091-2142 verified
  `deletedAt != null`), so their numbers leave gaps exactly as moysklad does on delete. Live orders are in
  clean descending «Номер». New orders now get 2144+ (generator + counter live). LESSON: a backend-only
  edit may need a dev restart — tsx-watch missed it here.
- `5dfcb681` (same commit) **default sort** — added deterministic `{ id: dir }` tie-breaker to the list
  orderBy. Because the renumber walked (moment, id), `moment desc` now reads as clean descending «Номер»
  (DB-verified 2143, 2142, 2141…). We did NOT switch the sorted column to «Номер» itself: numeric sort on
  the plain-integer *string* would lexicographically misorder («999» > «2143»), and a raw-SQL numeric sort
  is a disproportionate rewrite of the cursor-paginated list. Visible order matches moysklad regardless.
- `85afdfe0` **sort indicator** — replaced the raw `▼`/`▲` char with a clean CSS caret (8×4, dark grey
  #555), app-wide in the shared `DataTable`. Live cert: sorted header renders the triangle, no char.
  STILL not 1:1 on POSITION — moysklad's caret sits in a reserved box LEFT of the label; ours stays
  adjacent (the faithful left-restructure across ~20 pages was judged disproportionate). Documented gap.
- `95e4475f` **fulfilment partial colour** — made the bar olive #86aa60 at ALL fill levels (was amber for
  partial); moysklad conveys proportion by WIDTH, not colour (sole class modifier was «…green»).
  Partial-green INFERRED (no partial row in climart's demo); NOT runtime-checked (our bar is invisible at
  0-received).

**Remaining toward full purchase-orders 1:1 (next sessions):**
1. **/[id] detail page** — deep live-audit vs moysklad (NOT parallel-locked; safe to work). Biggest
   remaining surface. Needs a stable browser session (today's shared MCP browser locked every 2-3
   calls).
2. **«Комплект…» kit print** — the last Печать item (prints a product-kit composition); complex,
   deferred.
3. **Dual print-path divergence** — DocPdfService bulk-print (now templateId-aware) vs the
   standalone React `/print/purchase-order/[id]` page; converge them so the detail-page print uses
   account templates too.
4. **PARALLEL-LOCKED (do when the products/customer-orders session frees them):**
   - `/new` creation form deep parity — `purchase-orders/new/page.tsx` has their uncommitted edits.
   - i18n-migrate the «Запросить форму» local labels to `print_menu.request_*` keys (ru/uz.json).
   - Saved-filter active-pill blue highlight (`activeId` never passed) — fix in
     `components/customer-orders/saved-filters-pills.tsx`.
5. **Column reorder in ⚙** — moysklad's assortment grid supports drag-reorder; verify live for PO,
   then add a `useColumnOrder` hook if confirmed (separate feature).

## 1 — Creation mechanisms (mostly EXIST; verify + complete + wire per page)
Already built (don't rebuild):
- Print-template editor: `apps/web/src/app/(app)/settings/print-templates/{page,new,[id]}.tsx` + `_components/print-template-form.tsx`.
- Saved filters: `components/customer-orders/saved-filters-pills.tsx` (used by purchase-orders + others).
- Per-page print dropdowns: `components/<entity>/print-dropdown.tsx`.

purchase-orders status: print menu has Список заказов · Заказ поставщику(disabled) · Комплект…(disabled) ·
**Настроить…→/settings/print-templates** ✓ ; SavedFiltersPills wired ✓.

Gaps found (live re-check vs old capture `metadata.json` 2026-05-29):
- moysklad Печать menu now ALSO has **«Запросить форму»** (request custom form) — ours omits it (old
  capture said "no request-form card"). Decide: add as the moysklad-style item or keep omitted.
- Disabled placeholders (Заказ поставщику / Комплект) are "per-account PrintTemplate pending" — they
  enable once print templates exist for the account. Verify the wiring activates them.

TODO (per page, ~all list + detail pages): confirm print-menu structure (templates + Настроить + Запросить
форму) matches moysklad; confirm saved-filter create/apply/delete works; confirm column-customizer ⚙.

## 2 — Icons: recreate moysklad shapes as OUR OWN SVGs (NOT download their assets)
moysklad icons are proprietary raster **sprites** (e.g. create ⊕ = 14×14 at sprite pos -915/-156 on
`cdn-static.moysklad.ru/.../C5E39DB8...`; printer = sprite). **Do NOT copy moysklad's image files**
(their IP / copyright). Instead recreate each shape as an original SVG that looks identical.
- Done so far (lucide vector matches): create button → `Icons.createCircle` (CirclePlus ⊕); Печать → `Icons.print` (Printer).
- To make EXACT: view each moysklad toolbar/nav icon closely (needs the MCP browser — currently contended)
  and either accept the lucide match or hand-draw an equivalent SVG.

## 3 — Behaviour parity (NEXT SESSION)
Every button/menu/modal BEHAVES like moysklad (same modal opens, same steps, same validation). This is
functional Phase-2 QA, page by page — large, separate from pixels.

## Blocker for live work
The single shared Playwright MCP browser is contended by the parallel session (products/customer-orders).
Sustained moysklad comparison needs it free, OR `--isolated` mode (config edit + Claude restart so each
session gets its own browser). The dedicated-headless route can't login to moysklad (bot/concurrent block).

## Recommended execution
Per the project's own efficiency rule (no marathons — context cost ~quadratic), run #1 then #2 then #3 as
SEPARATE focused sessions, each starting from this doc. Faster + higher-quality than one mega-session.
