# UI Conventions — canonical, guarded, drift-locked

> **Purpose.** moysklad.uz is a single, internally-consistent product: the same
> action is always the same button, the same status is always the same colour,
> the same page-shape repeats everywhere. A 1:1 parity clone must match that
> consistency, not just per-page correctness. This doc is the **canonical
> convention registry** for the clone — the user-named axis "har tugma / status /
> filter / joylashuv / rang professional bir xil bo'lsin" (every button / status /
> filter / placement / colour uniformly professional).
>
> Each convention below is: (1) **defined** (the canonical rule), (2) **grounded**
> (DS primitive + moysklad capture or explicit semantic rule), and (3) **locked**
> with a source-scan guard so drift can never reappear. Conventions move from
> 🔭 *roadmap* → 🛠️ *in progress* → ✅ *locked*.
>
> **Discovery, not hand-counting.** Per the 08l lesson ("hand-kept enumeration
> eskiradi" / hand-kept lists go stale), every convention's coverage is found by
> a systematic sweep (grep + agent recon), never a hand-maintained list.

---

## ✅ Convention 1 — Document state → Badge tone (LOCKED 2026-06-10)

**Rule.** A document's workflow state (`state` slug) maps to a Badge `tone` via the
single shared helper **`documentStateTone(state, overrides?)`**
([apps/web/src/lib/document-state-tone.ts](../../apps/web/src/lib/document-state-tone.ts)).
No page declares its own state→tone map.

**Canonical map** (the union of every document state; each page uses a subset):

| tone | meaning | states |
|---|---|---|
| `neutral` | not-yet-acted / archived-non-outcome | `draft` |
| `brand` | issued / acknowledged / in-flight (active, not terminal) | `confirmed`, `sent` |
| `warning` | needs attention: partial, pending, awaiting payment | `awaiting_payment`, `partially_paid`, `partially_shipped`, `partially_received`, `pending`, `refunded` |
| `info` | informational acknowledgement | `accepted`, `in_progress` |
| `success` | terminal happy outcome | `posted`, `paid`, `fully_shipped`, `fully_received`, `completed`, `converted`, `closed`, `open` |
| `destructive` | terminal failure / cancelled | `rejected`, `overdue`, `cancelled` |

**Grounding-flagged overrides** (the only two cross-entity divergences — preserved,
not blindly unified, because they are semantically real):

- **`INVOICE_STATE_TONE = { posted: 'brand' }`** — for an invoice, `posted` means
  "issued, awaiting payment" (intermediate; the terminal-done state is `paid`),
  so it stays `brand`, not the `success` it carries for stock documents.
  *Confirm against a moysklad invoice state-pill capture before promoting.*
- **`RETAIL_SESSION_STATE_TONE = { closed: 'neutral' }`** — a `closed` shift is
  simply ended/archived, not a "success" outcome the way a `closed` (fulfilled)
  order is. *Confirm against a closed-shift capture before promoting.*

**How it was done.** A cross-entity audit found the convention was already ~95%
uniform but spread across **54 duplicate `const STATE_TONE` maps + 1 `PO_STATE_TONE`**
— so a recolour or new state needed 55 hand-edits, and two states had silently
drifted (`posted`: `success` ×40 vs `brand` ×4; `closed`: `success` ×4 vs `neutral`
×1). A behaviour-preserving codemod consolidated all 54 pages onto the shared helper;
the `retail/sessions/[id]` detail sibling (which coloured the same session state via
an inline `state === 'open' ? 'success' : 'neutral'` ternary — identical to
`documentStateTone(state, RETAIL_SESSION_STATE_TONE)`) was folded in too, so list and
detail now share one source. **55 pages total.**

**Verification.**
- Exhaustive before/after proof: **54 files × 197 state→tone pairs, 0 mismatches** —
  the migration is provably byte-for-byte behaviour-preserving (zero visual change;
  the win is structural + the two divergences are now explicit, not accidental). The
  `retail/sessions/[id]` fold-in was manually verified equivalent (`open→success`,
  `closed→neutral`).
- Guard [apps/web/src/__tests__/document-state-tone.test.ts](../../apps/web/src/__tests__/document-state-tone.test.ts)
  (34 tests): locks the canonical values, the null/unknown→`neutral` fallback, the
  two overrides, the 6 override-page wirings, and a **drift-lock source-scan** that
  fails if any page re-declares a local `*STATE_TONE` map.
- Gate: web tc 0 · biome 0 · web Vitest 1674 (+34, 0 regression) · ds/api untouched.

**NOT covered by this convention (deliberate scope — see Coverage map below):**
domain-status helpers (`statusTone()` for calls / HR / tasks / opportunities /
email-log / webhooks) use their own vocabularies (call-status, delivery-status,
…) and are a separate follow-up family, not document-FSM states.

---

## ✅ Convention 7 — Archived/active record → tone (LOCKED 2026-06-10)

**Rule.** A record's archived flag maps to a Badge `tone` via the single shared
helper **`archivedTone(archived)`**
([apps/web/src/lib/archived-tone.ts](../../apps/web/src/lib/archived-tone.ts)):

| flag | tone | meaning |
|---|---|---|
| `archived === true` | `neutral` | muted — filed away, not an outcome |
| `archived === false` | `success` | live record, in use |

No page/component hardcodes the archived→tone mapping. This is the
`archived/active` family the recon coverage map (below, section B) flagged as the
biggest pure-dedup batch.

**How it was done.** A discovery recon (4-agent sweep) found **58 boolean→tone
surfaces**; of those, **40 were the archived/active record convention** in three
shapes — a `stateTone` ternary (`archived ? 'neutral' : 'success'`, 6 surfaces),
a conditional badge PAIR (`{archived ? <Badge tone="neutral"> : <Badge
tone="success">}`, list + detail, 26 surfaces), and an archived-only badge
(`{archived && <Badge tone="neutral">}`, 7 surfaces). The convention was uniform
(archived → `neutral`, live → `success`) **EXCEPT one silent drift**:
`settings/label-templates` coloured an archived row `destructive` (red) — which
has no semantic basis (an archived template is not "dangerous"; it is our own
non-parity page, and the universal baseline across all ~39 other surfaces is
`neutral`). A behaviour-preserving codemod consolidated all 40 surfaces onto
`archivedTone()` and fixed the drift to `neutral`. **40 surfaces total.**

**Verification.**
- Exhaustive before/after proof (scripted): **40/40 surfaces** — every migrated
  surface's pre-fix archived tone was `neutral` and active tone `success`
  (byte-equivalent to `archivedTone()`'s output), EXCEPT the 1 intended drift
  fix (label-templates `destructive → neutral`).
- The drift fix is the ONLY rendered change → **browser-smoked** (Playwright,
  live `/settings/label-templates`): an archived template's badge now renders
  `bg-[var(--ms-bg-muted)]` / `rgb(242,242,242)` (grey neutral), not the previous
  red destructive tone. The other 39 surfaces are byte-identical (no browser
  needed — 0 visual change).
- Guard [apps/web/src/__tests__/archived-tone.test.ts](../../apps/web/src/__tests__/archived-tone.test.ts)
  (12 tests): locks the canonical values (`true→neutral`, `false→success`), a
  **drift-lock source-scan** that bans re-introducing a hardcoded archived→tone
  binary pair (literal `archived ? 'neutral' : 'success'` OR the `<Badge>` pair —
  proven non-vacuous with a synthetic offender), and an adoption check on
  representative migrated surfaces.
- Gate: web tc 0 · biome 0 · web Vitest 1686 (+12, 0 regression) · ds/api untouched.

**EXEMPT — archived-precedence composites (4, deliberately NOT consolidated):**
`opportunities` (list + detail), `tasks/[id]`, `pipelines/[id]` map
`archived ? 'neutral' : <dynamic domain status>` (e.g. `: statusTone(status)` or
`: isDefault ? 'brand' : 'success'`). Their archived branch still resolves to
`neutral` (the convention), but the non-archived branch is a dynamic domain
status, so they cannot reduce to one `archivedTone()` call — and the drift-lock
deliberately does not flag them (their non-archived tone is not a literal
`success`). **Adjacent, not yet folded in:** the `isActive` enable/disable badges
(`hr/tasks`, `hr/settings/telegram` — "Активен/Неактивен", a different
vocabulary) belong to Convention 6 (domain-status), not here.

---

## ✅ Convention 6 — Domain-status → tone (LOCKED 2026-06-10)

**Rule.** Every NON-document status vocabulary maps to a Badge tone via its own
per-domain shared map in **`lib/domain-status-tone.ts`**
([apps/web/src/lib/domain-status-tone.ts](../../apps/web/src/lib/domain-status-tone.ts)).
Domains are NOT merged into one table — the same word legitimately differs by
domain (`sent` = success for a delivered message, neutral for an HR task
awaiting an answer; `cancelled` = neutral for a call, destructive for a service
request). No page declares a local `statusTone()` / `*_TONE` map.

**Domains covered (~20):** call status + direction, CRM task status,
opportunity status, service-request status + priority, HR task-log status,
telegram message delivery, HR task priority, payroll bonus/fine,
`activeTone()` (isActive/attendance), `systemTone()` (isSystem/isDefault),
email+webhook delivery, audit action (substring matcher, order-locked), mxik
source, channel kind + `syncStatusTone()`, money flow, bank-import statement
state, ABC class, balance side, legal status, inventory cycle priority.

**How it was done.** A 5-agent discovery recon found **94 status-colour
surfaces** (C-domain-status 38 · D-raw-status 20 · isActive 7 · E-value-sign 17
excluded · already-covered/other 12). 41 surfaces across 40 files were
migrated (Opus fan-out, operator-verified diffs). Four REAL drifts the
duplication had caused were unified (each grounded, documented in the lib
header): opportunity `open` → `info` everywhere (the detail page's `brand` was
a stale workaround for the pre-Conv-1 StateTone union); money flow `out` →
`destructive` (bank-import had `warning`); ABC class → the ABC report's map
(cycle-view had raw emerald/indigo/slate; `C → destructive` GROUNDING-FLAGGED
— softening it is a product decision, change it once in the lib); channel sync
`lastSyncOk === null` → NO badge (the list treated unknown as an error). The
D-track also landed: isSystem blue ×4 → Badge `brand`, kontragentlar
legal-status pills → Badge, xodimlar archived spans → Badge + `archivedTone`
(Conv-7 retrofit), StatCard/payroll/inventerizatsiya raw amber/emerald/red →
`--ms-*` tokens, dead hex fallbacks dropped. i18n leaks fixed on touched
badges (audit-log raw action slug → `translateAction`, hr dashboard raw status
key, bank-import raw state slug + new ru/uz keys, retail POS hardcoded
«Ochiq», counterparty-balance hardcoded «arxiv»).

**Verification.**
- Equivalence proof (scripted, vs pre-migration `e7b27f18`): **117 surface-key
  pairs — 104 byte-equal, 13 deliberate, 0 unexpected.**
- Guard [apps/web/src/__tests__/domain-status-tone.test.ts](../../apps/web/src/__tests__/domain-status-tone.test.ts)
  (**75 tests**): canonical values per map, resolver fallbacks,
  `auditActionTone` branch order, **drift-lock source-scan** (bans local
  `statusTone`/`*_TONE` re-declarations + the `isActive ? 'success' :
  'neutral'` literal pair; non-vacuous), adoption checks on 36 files, D-track
  no-raw-class locks.
- **Phase-2 browser smoke 3/3 PASSED** (real browser, dev stack): opportunity
  detail open pill renders info (`rgb(228,241,250)` = `--ms-info-50`);
  audit-log action badges translated, no raw slugs; all 25 migrated pages load
  without a client crash. The render-sweep also CAUGHT a real pre-existing
  white-screen (`/reports/abc-analysis` FE↔BE contract drift — fixed
  `006f2fe4` + `abc-report-contract.test.ts`).
- Gate: web tc 0 · per-file biome clean · web Vitest 1767 (+81 vs
  pre-session, 0 regression) · ds/api untouched.

**EXEMPT (deliberate, documented):**
- `permission-matrix` SCOPE_TONE (5-way ordinal scale needs more distinct hues
  than the 6-tone Badge palette; also colours a native `<select>`) — needs a
  DS ordinal-palette decision first.
- telegram account-health condition badges (hasSession/flooded — multi-badge
  composite conditions, single site).
- `counterparties` companyType `endsWith('UZ') → brand` (predicate, single site).
- bank-import row-result tri-state (derived from three fields, not a key map).
- apps marketplace `installed → success` badge (label says *enabled* while the
  API's separate `enabled` field is ignored — product question, not a tone map).
- opportunity stage colours (tenant-data-driven, like moysklad custom states).
- `status-change-dropdown` STATE_COLOR hexes = moysklad-parity b-color-square
  SHADOW of Convention 1, kept in sync by hand (comment updated).
- E-class value-sign colouring (money ±, thresholds) — excluded by definition.

---

## ✅ Convention 2 — Action → Button variant (LOCKED 2026-06-11)

**Rule.** An ACTION control (toolbar/form/dialog action, link-action, icon-action)
is a DS **`<Button>`** with the variant determined by the action's role — never a
hand-rolled raw `<button>` duplicating a variant's look. Non-action interactive
elements (filter chips/pills, tabs, row/tree/card click targets, dropdown items,
pager controls, widget internals like input adornments or calendar cells) stay
raw deliberately.

**Canonical action → variant map** (measured by a 2-agent census over every DS
Button call site, not guessed; counts in parentheses):

| action | variant | grounding |
|---|---|---|
| Save («Сохранить») | `primary` (29/30) | modal/form submits; ONE exception: document-detail toolbar Save = `success` (green, moysklad parity, DetailToolbar — 63 pages) |
| Cancel/Close in a modal footer | `secondary` (31) | DetailToolbar Close = `tertiary` (parity); inline mini-form/in-row cancels = `ghost` (cluster) |
| Create/Add — page-header CTA | `primary` (17-cluster) | the page's one main CTA |
| Create/Add — inline add-to-collection | `secondary` (83) | add-tier/add-value/add-stage/add-tag/add-barcode family |
| «Добавить из справочника» positions CTA | `tertiary` (×9) | moysklad-parity grounded (d-default capture), document [id] pages |
| Clear/Reset (filters/forms) | `secondary` (4/5) | server-side destructive reset = `destructive` + ConfirmDialog (justified) |
| Delete — entity-level «Удалить» | `destructive` (23/24) | detail pages, settings, sections |
| Delete — row-level | `ghost` + `size="icon"`/`icon-sm` (28/34) | red hover affordance via className |
| Archive/Restore | `secondary` (15/27) | 8 settings-detail siblings: archive=`tertiary` paired restore=`secondary` (deliberate de-emphasis sub-convention) |
| Print — «Печать ▾» menu trigger | `secondary` (10) | print-dropdown components + DetailToolbar; page-level print CTA = `primary` (justified ×2) |
| Apply/Confirm («Применить/Подтвердить») | `primary` (20/20) | fully uniform |
| Post/Unpost («Провести») | n/a | zero Buttons — lives in dropdown menus / the «Проведено» toggle |
| Inline link-action | `link` | brand text + hover underline; `text-xs`/muted colour kept via className |
| Icon-only action | `ghost` + `size="icon"`/`icon-sm` | aria-label required |

**What was done (2026-06-11).**
- **Recon:** 12-agent Workflow classified ALL 223 raw `<button>` sites (coverage
  cross-checked against grep per file — 223/223; the grep's 225 included 2
  comment-text mentions). 84+9=93 were action buttons; 139 stay deliberately raw
  (chips/tabs/rows/pagers/widget internals — classification recorded in the
  recon output).
- **Cluster 1 — FilterToggleButton (49 copies).** Every list page hand-rolled an
  identical «Фильтр» toggle. New shared
  [apps/web/src/components/filters/filter-toggle-button.tsx](../../apps/web/src/components/filters/filter-toggle-button.tsx)
  (DS Button `secondary`/`sm`, `aria-expanded`, `data-test-id="filter-toggle"`, NO
  chevron — moysklad parity). Deterministic CANON-validated codemod, 40/40 then
  9/9 (the second batch was mis-classified keepRaw by one recon agent — the
  guard's drift-lock scan caught them; fan-out inconsistency bug-class).
- **Cluster 2 — 44 scattered action sites / 31 files** (6-agent Opus fan-out,
  every diff operator-verified): rate-edit ✎/↺ pairs + external-code reveal
  links → `link`; icon row-actions (hr, price-lists, reason-codes, help-drawer,
  command-palette, theme-toggle, dashboard refresh) → `ghost icon/icon-sm`;
  hand-rolled primary/secondary/destructive one-offs (apps install, factures
  generate ×2, role-multi-select save/cancel, opportunities lost-confirm/cancel,
  tags/barcode add, retail header links incl. Z-hisobot anchor via `asChild`) →
  proper variants. `type="button"` enforced everywhere (double-create bug-class).
- **Census drift fixes (6 WRONG):** webhook-dialog + attribute-metadata-dialog
  modal cancel → `secondary`; reason-codes inline add → `secondary`; apps
  uninstall ghost+hand-rolled-red → `destructive`; ecommerce-channel combined
  archive toggle → `secondary`; label-templates archive `destructive` →
  `tertiary` (same baseless-destructive drift class as its Conv-7 badge).
- **🐞 DS Button `link` cva-ordering bug (REAL, found by the migration):** cva
  emits the size axis AFTER the variant axis and `cn`/twMerge keeps the last
  conflict, so a bare `variant="link"` rendered as a 36px `h-9 px-4` box — the
  documented inline-link look NEVER worked (there were zero pre-existing link
  usages, so no render relied on the bug). Fixed centrally with a
  `compoundVariants: [{ variant: 'link', class: 'h-auto px-0' }]` entry
  (TDD: render test failed RED → fix → GREEN).

**Verification.**
- Guard [apps/web/src/__tests__/button-conventions.test.tsx](../../apps/web/src/__tests__/button-conventions.test.tsx)
  (**93 tests**): link-geometry render lock (catches the cva regression) ·
  FilterToggleButton canonical attributes + 49-file adoption + raw-copy
  drift-lock scan (non-vacuous, synthetic offender) · 6 census drift-locks ·
  shared-slot locks (DetailToolbar save=success/close=tertiary/triggers=secondary,
  ConfirmDialog tone rule) · 31-file migration-marker adoption.
- Gate: web tc 0 · ds tc 0 · biome 0 errors (8 pre-existing warnings untouched
  lines) · web Vitest 1862 (+93, 0 regress) · ds Vitest 127 (Button change, 0
  regress) · api untouched.
- Phase-2 browser smoke: see session entry (representatives: filter toggle
  render+behaviour, link geometry, uninstall destructive).

**EXEMPT / deferred (documented, deliberate):**
- 139 keepRaw sites (chips/pills ×23, tabs ×10, row/tree targets ×9, dropdown
  items ×4, pagers ×6, widget internals ×15, link-likes with semantic colour
  the DS link can't express ×8, etc.) — recon classification is the registry.
- DetailToolbar record-pager chevrons + DS Pagination internals = pager parity
  DOM (PAGINATION class), raw by design.
- DetailHeader state-pill trigger (dynamic tone background, badge geometry) and
  SavedFiltersPills pill/pencil/add micro-buttons = capture-grounded raw.
- Row-delete variant UNSUREs (hr/payroll `secondary` text, files/attachments/
  pipeline-editor `tertiary`) — local-uniformity arguments, documented, NOT
  blind-unified.
- `/labels/print` is whole-page hardcoded Latin-uz (≈15 strings incl. its
  primary CTAs) — a separate whole-page i18n work item (Cyrillic-only
  no-hardcoded gate is blind to it), queued in NEXT.md.

---

## ✅ Convention 3 — Toolbar composition & order (LOCKED 2026-06-11)

**Rule.** Toolbars are CENTRALIZED composites — pages may only fill slots, never
hand-roll the bar: lists use **ListView `moyskladToolbar`** (title `[?][↻]` ·
create CTA · FilterToggleButton · inline search · `☑` selection counter ·
Изменить→[Статус]→Создать→Печать dropdowns), document /new pages use
**DocumentEditor** (DS shell with code-fixed order: Save success → Close →
Изменить/Создать документ/Печать/Отправить ▾), document [id] pages use
**DetailToolbar** (Conv-5's composite partner). Slot canon (measured over all
57 moyskladToolbar adopters):

| slot | canon |
|---|---|
| `createPosition` | `"start"` whenever the page has a create button (was 39/49 — the 12-page default-'end' tail was an un-migrated second wave, fixed 2026-06-11) |
| `onRefresh` | always (↻ parity icon; 13-page tail fixed) |
| `extraActionsLeft` | the shared `FilterToggleButton` (money's wrong-slot copy and task-types' raw prefixed-test-id clone fixed; `RAW_FILTER_TOGGLE` made prefix-tolerant) |
| `extraActions` | bulk dropdowns / page CTAs — canonical rendered order Изменить→[Статус]→Создать→Печать (ListView renders typed `printMenu` last by code) |
| typed `editMenu`/`printMenu`/… | MUST pass `label:` — the DS defaults are hardcoded Latin-uz («O'zgartirish»/«Chop etish») and leak into RU otherwise (10 pages fixed) |
| `selectionCount` | a LIVE selection requires a bulk surface (dropdowns, typed menus, or `bulkActionBar`) — sales-returns + purchase-returns had row-selection wired with NO surface (dead-end, fixed with SalesReturn/PurchaseReturn Bulk+Print dropdown pairs mirroring supplies); literal `selectionCount={0}` = parity counter, exempt |

**DocumentEditor i18n contract (the flagship find).** The DS shell's label
defaults are the historical hardcoded strings — Latin-uz toolbar
(`Saqlash`/`Yopish`/`O'zgartirish`/`Hujjat yaratish`/`Chop etish`/`Yuborish`,
error `Saqlashda xato`) and raw-Russian header (`Проведено`/`Ожидание`/`Авто`)
— so every one of the 26 document /new pages leaked Latin-uz into RU **and**
Russian into UZ. Fixed centrally: web hook **`useDocumentEditorLabels()`**
(`apps/web/src/hooks/use-document-editor-labels.ts`, exact mirror of
`useEditFormLabels`) spread into all 26 pages; DS gained `errorTitle` +
`errorRetryLabel` pass-throughs (defaults unchanged). New `detail_header` keys:
`waiting`/`number_auto`/`save_error` (ru+uz). price-lists/new was additionally
a lone i18n drifter (hardcoded status pills «Qoralama/Provedeno/Bekor qilindi»,
type label, role badge, files panel) — mirrored onto the sibling pattern
(`tStates('states.price_list')` etc.).

**Functional bugs found by the recon (all fixed + runtime-relevant):**
- sales-returns + purchase-returns dead-end bulk selection (above) — BE
  bulk-delete/bulk-transition/clone endpoints already existed.
- settings/print-templates list: the show/hide-archived toggle was passed via
  `extraActionsLeft`, which ListView renders ONLY in the moyskladToolbar branch
  → toggle never rendered → archived templates + their restore unreachable.
  Moved to `extraActions` (+ DS Button).
- retail/z-report search filtered only the fetched page client-side (L10
  dead-search class) → threaded into params+queryKey (BE search existed).

**Guard** [apps/web/src/__tests__/toolbar-conventions.test.ts](../../apps/web/src/__tests__/toolbar-conventions.test.ts)
(derived scans, new pages auto-covered): DocumentEditor label-spread lock ×26 ·
createPosition lock · onRefresh lock · FilterToggleButton slot lock ·
no-dead-end-selection lock (non-vacuous: caught purchase-orders' naming variant
and the parity-counter pages during development) · typed-menu `label:` lock.

**EXEMPT / deferred (documented):**
- `onHelp` partial adoption (18/57, inconsistent within sibling families) —
  needs a rollout decision (all-or-defined-subset), deferred.
- DUAL bulk surfaces (products/services/bundles/counterparties/projects/uoms
  render toolbar dropdowns AND the floating BulkActionBar) — needs a capture
  decision; internally consistent within catalog, deferred.
- factures-in/out: selection feeds the primary «generate» CTA (justified
  consumer, exempt in the guard).
- purchase-orders' in-file BulkActionDropdown pair (mechanism hybrid, rendered
  order canonical) — extraction to shared components is cosmetic, deferred.
- Return print-dropdown `list_export` labels are pattern-derived («Список …»
  family) — the return templates captures are EMPTY; confirm against a live
  capture before grounding-lock (flagged in both component headers). CSV
  export handlers for the two return lists don't exist yet → item renders
  disabled (honest affordance, mirrors SupplyPrintDropdown).
- settings/stores + organizations (+bank-accounts/cash-desks/price-types)
  still on the legacy lighter list toolbar — promotion to moyskladToolbar is
  grounding-gated (captures were contaminated; re-capture first).
- retail/sales + retail/sessions lists stay lighter until the deferred
  mass-edit surface lands (documented Phase-1 deferral, audit-doc-grounded).

---

## ✅ Convention 5 — Detail-header layout (LOCKED 2026-06-11)

**Rule.** The document/catalog detail family renders its header through the
shared composite **`DetailToolbar` + `DetailHeader`** — title «<Тип> № <name>
от <date>», pill row, state pill/dropdown, Проведено, author slot, record
pager `N из M ‹›`. Measured 2026-06-11: **43 pages (33 [id] + 10 catalog/CRM
/new), perfectly paired** — no page has one half of the composite. Core props
(`isDirty/isSaving/onSave/onClose`, header identity props) are TS-required =
typecheck-enforced; optional-prop deltas (onClone/onPrintList/onSendEmail/
createMenuItems) are per-entity CAPABILITY differences, not styling drift.

**Other header families (deliberate, each internally uniform):**
- **settings-detail** = DS `EditForm` shell (PageHeader + breadcrumb
  [list, record-name], top badge/Restore/Archive/Delete row, bottom
  [Cancel·Save]) — 24/29 pages; bespoke pairs (label-templates, publications)
  + read-only users/[id] documented. Drifts fixed 2026-06-11:
  print-templates/[id] missing Delete + breadcrumb showed the page title +
  save navigated away; label-templates/[id] missing Cancel; label-templates/new
  wrong Save icon; users/[id] had NO title at all.
- **document /new** = DocumentEditor header strip (see Conv-3).
- **EditForm config entities** (discounts/channels/boms/processes/stages/
  tracking-codes): production trio is byte-uniform; discounts/[id] +
  tracking-codes/[id] titled with the static page title instead of the record
  name — fixed (`title={data.name}` / `data.cis`).
- **FSM read-only trio** (work-orders/ecommerce-orders/tasks): 3 different
  header compositions; the negative-transition verb had a 3-way variant split
  (tertiary/secondary/ghost) → canonicalized to `secondary`. Full convergence
  onto DS `DetailView` (1 consumer today) = deferred follow-up.
- **analitika sub-app**: raw back-link + h1; xodimlar/[id]'s bold-2xl h1
  normalized to the sibling font-semibold text-xl.
- **POS read-only** (retail/sales/[id] · retail/sessions/[id]): created by the
  register, no toolbar by design; sessions/[id] has no title element — open
  question (deliberate card-header vs missing h1), deferred.

**Guard** [apps/web/src/__tests__/header-conventions.test.ts](../../apps/web/src/__tests__/header-conventions.test.ts):
DT⇔DH pairing scan (derived — catches future half-adoptions) · 43-page
adoption lock · record-pager lock (31 pages; opportunities/pipelines exempt,
grounding-flagged) · analitika h1 shape lock (was RED on the real xodimlar
offender before the fix — non-vacuous).

**Parity gaps flagged (grounding-gated, NOT fixed blindly):**
- production/work-orders/[id] is a true FSM document outside the composite —
  deliberate while no production-module capture exists; the strongest
  candidate to adopt the composite once captured.
- ecommerce/orders/[id] — audit-grounded as correctly read-mostly (imported
  order), stays outside.

---

## ✅ Convention 8 — Raw form elements → DS primitives (LOCKED 2026-06-11b)

**Rule.** Form controls come from `@moysklad/ui`, not hand-rolled HTML elements:
`<select>` → **`NativeSelect`** (chevron, h-9, focus ring, disabled states by
construction) · `<textarea>` → **`Textarea`** · `<input type="checkbox">` →
**`Checkbox`** (Radix; `onCheckedChange`, `checked='indeterminate'` third state) ·
other `<input>` types → **`Input`** (263 surfaces total across both waves).

**What was found (deterministic inventory, `scripts/raw-element-inventory.mjs`).**
210 raw sites with ~16 divergent className shapes for the SAME roles: 138 selects
(h-9 ×74 / h-7 ×28 list-filters / h-8 ×16 DocumentMetaField — sitting NEXT TO h-9
DS Inputs in the same form rows / dynamic-const ×13 / stragglers), 31 description
textareas (canonical ×22 + 9 close variants incl. a no-focus-ring modal and a
font-mono template editor), 42 checkboxes (3 sub-shapes incl. a ref-based native
`.indeterminate` select-all), plus a DEAD shadcn `components/ui/{button,input,
label,table}.tsx` + `lib/utils.ts` (0 consumers, non-DS tokens — deleted).

**Migration (2026-06-11b).** CANON-validated deterministic codemod
(2 passes, 205 sites) + 5 hand-care sites: 137/138 selects, 31/31 textareas,
41/42 checkboxes → **209 surfaces**. Heights unified to DS h-9 (the h-7/h-8
drift was the bug); inline filter selects that sized to content keep intrinsic
width via `className="w-auto"` (twMerge overrides the wrapper's `w-full`).
**DS `Checkbox` gained the `indeterminate` rendering** (Minus icon + filled
brand box — previously the state was invisible: white Check on unchecked bg);
hr/employees select-all now passes `checked='indeterminate'` instead of the
ref hack.

**EXEMPT (2, documented in the guard):**
- `permission-matrix.tsx` `<select>` — per-value ordinal SCOPE_TONE palette
  (Conv-6 EXEMPT sibling, pending DS/product decision).
- `role-multi-select.tsx` display-only checkbox — sits INSIDE an option
  `<button>`; Radix Checkbox is a button → button-in-button invalid HTML.

**Input sub-axis (DONE same day, 2nd wave):** of the 85 raw `<input>` sites,
**54 migrated → DS `Input`** (table-driven codemod 52 + audit-log hand ×2 — which
also removed a pre-existing glitch: `INPUT_CLASS` was passed onto two
`NativeSelect` WRAPPERS, double-boxing them; payroll's redundant `inputCls` on
two `MoneyInput`s dropped too; dead `inputCls/inputClass/INPUT_CLASS` consts
deleted ×4 files). Banned types app-wide with NO exemptions:
date/datetime-local/time/month/search/password/email/tel. `text`/`number`
banned outside `EXEMPT_INPUT_TEXTNUM` (10 files): 8 doc /new pages' h-6 w-24
currency-RATE micro-input in a DocumentMetaField helper line (needs a DS size
decision), saved-filters-pills' borderless inline-rename + pill-shaped input,
retail POS touch-skin (h-11 rounded-xl search, rounded-lg fields). file ×5 = no
DS FileInput. 2 of the original 85 were
JSDoc-comment false-positives (productions/[id], analitika/kontragentlar) — the
guard scanner strips comments. Inventory snapshot (post-migration keepraw only):
`docs/audits/_raw-element-inventory.json` (regen
`node scripts/raw-element-inventory.mjs`).

**Radio sub-axis (DONE 2026-06-11c) — `SegmentedControl`.** The deferred
"radio ×9 → RadioGroup axis" was MIS-SCOPED: the raw radios were NOT a
`RadioGroup` dot-list. **6** were the "sr-only radio + styled box-label"
SEGMENTED-toggle idiom — counterparty-adjustments `direction` (new + [id]) and
settings/label-templates `pageSize` + `barcodeFormat` (new + [id]) — copy-pasted
with drift (counterparty `radius-default` vs label-templates `radius-sm`;
hover-on-both vs hover-on-unselected; one had a `locked` disabled state). The
remaining **3** (hr/employees permissions) are a bespoke radio MATRIX (one
dot-radio per table cell, shared row name). Built a new DS primitive
**`SegmentedControl`** ([packages/design-system/src/primitives/SegmentedControl.tsx](../../packages/design-system/src/primitives/SegmentedControl.tsx))
— hidden radios + styled segments, canonical `--ms-radius-default` (Button/
NativeSelect-consistent; fixes the label-templates `radius-sm` drift),
keyboard `has-[:focus-visible]` ring, whole-control + per-option disable,
forwarded per-option `data-test-id`. Migrated all 6 segmented sites; the
permission matrix stays raw (`EXEMPT_RADIO`). `radio` joined the guard's banned
families. **Phase-2 browser smoke (2026-06-11c, live dev):**
label-templates/new — both segmented controls render `role="radiogroup"` with
localized aria-labels, A4→A5 selection switches (selected = brand text+border+
weight-500, distinct from muted unselected), **computed radius 3px =
`--ms-radius-default`, NOT the old 2px `--ms-radius-sm`** (drift-fix live);
counterparty-adjustments/new — direction toggle switches, `data-test-id`
forwarded onto the inputs, aria "Направление"; console 0 errors (favicon noise
only). The whole-control `disabled` (counterparty [id] `locked`) path is
unit-proven (not browser-seeded). DS render test (app-level, mirror of the
RadioGroup test): `components/__tests__/segmented-control-from-ui.test.tsx` (14).

**Guard.** `raw-element-conventions.test.ts` (11): per-family ban scan
(select / textarea / checkbox / **radio** / input types) with the EXEMPT
registries (incl. `EXEMPT_RADIO` = hr/employees permissions matrix) +
synthetic-offender non-vacuity + adoption floors (NativeSelect ≥90 /
Textarea ≥28 / Checkbox ≥18 / Input ≥90 / **SegmentedControl ≥4** files) +
DS-Checkbox indeterminate contract (Minus + filled box + hr/employees wiring).

**Phase-2 browser smoke (2026-06-11b, live dev):** customer-orders filter
NativeSelect chevron render + **E2E filter request** (`paymentStatus=paid` hit
the API) · cash-in/new DS Textarea · hr/employees row-check → select-all
**indeterminate Minus visible** (filled `rgb(24,105,153)`) → cleanup unchecked ·
hr w-auto selects intrinsic (105px, not stretched) · supplies/new currency
select height === sibling DS Input (the intra-form mismatch this fixes) ·
posted customer-order VAT checkbox correctly disabled (readOnly propagation).
Console: 0 errors (favicon 404 noise only). NOT pixel-swept: all 100+ pages
(heights moved h-7/h-8 → h-9 on ~44 surfaces by design).

---

## 🔭 Coverage map — status/colour surfaces across the app

> Filled from the `status-color-landscape-recon` workflow (discovery-based sweep of
> every status-colour surface NOT going through `documentStateTone`). This is the
> backlog for extending Convention 1's uniformity guarantee to the rest of the app.

Source: `status-color-landscape-recon` workflow (5-agent sweep, 2026-06-10) —
**118 status-colour surfaces** outside `documentStateTone`. Grouped by what to do:

**A. ✅ Already covered (recon independently confirmed).** `ecommerce/orders`
(list+detail), `production/work-orders` (list+detail), `commission-reports`,
`retail/sessions` (list+detail) all render state via `documentStateTone`. This is
the migration verifying itself from an outside perspective.

**B. ✅ `archived/active` boolean → tone — DONE as Convention 7 (LOCKED 2026-06-10).**
The pattern `archived ? 'neutral' : 'success'` (and the conditional-badge-pair /
archived-only variants) repeated across settings (`bank-accounts`, `cash-desks`,
`expense-items`, `organizations`, `price-types`, `projects`, `stores`,
`task-types`, `currencies`), catalog (`bundles`, `services`, `contact-persons`,
`counterparties`, `products`, `variants`), production (`boms`, `processes`,
`stages`), `ecommerce/channels`, and components (`calls-section`,
`contact-persons-section`), plus `DetailHeader stateTone={…}`. A discovery recon
counted **40 such surfaces** (the earlier "~28" was an undercount) — all
consolidated onto the shared **`archivedTone(archived)`** helper + drift-lock
guard. The one outlier (`settings/label-templates` archived → `destructive`) was
a silent drift, fixed to `neutral` (browser-smoked). See **Convention 7** above.

**C. ✅ Domain-status helpers — DONE as Convention 6 (LOCKED 2026-06-10).**
All local `statusTone()`/`*_TONE` maps consolidated onto
`lib/domain-status-tone.ts` (41 surfaces / 40 files — the "~20" was the
domain-count, the recon found 38 C-surfaces + isActive family). See
**Convention 6** above.

**D. ✅ Raw tailwind status colours → DS tokens — DONE with Convention 6
(2026-06-10), ONE exemption.** isSystem blue ×4 → Badge `brand`
(`systemTone`), `kontragentlar` legal-status → Badge (`legalStatusTone`),
`inventerizatsiya` PRIORITY/CLASS → Badge (`inventoryPriorityTone` /
`abcClassTone`) + dot/text ambers → `--ms-warning-*` tokens, xodimlar
archived spans → Badge + `archivedTone`. **Still open: `permission-matrix`
SCOPE** (5-way ordinal palette + colours a `<select>` — documented EXEMPT in
Convention 6, needs a DS decision).

**E. ⏸️ Excluded — value-sign colouring, NOT status.** Money ± colours (`retail`
discrepancy red/yellow/green, cash-drawer +/−, sell-price emerald, `payment-dialog`
change-green, `counterparty-balance` debtor/creditor, `purchase-management` coverage
bar). These colour a NUMBER'S SIGN, not a status — a separate concern; if unified
later it is its own "money-sign" convention, not a status-tone one.

**F. 🔭 Convention-1 near-misses (document/session state, but not via a map).**
- `retail/sessions/[id]` — ✅ fixed this session (folded in).
- `retail/page.tsx:374` — ✅ fixed 2026-06-10 with Convention 6: routed through
  `documentStateTone('open', RETAIL_SESSION_STATE_TONE)` + the hardcoded
  Latin-uz «Ochiq» label → `statuses.open` i18n.
- `customer-orders/related-docs-tab.tsx` — ✅ **fixed 2026-06-11c.** Was
  `<Badge tone="neutral">{doc.state}</Badge>` (every related-doc state grey +
  the RAW slug). Now routes through `documentStateTone(doc.state, <per-kind
  override>)` (invoice-out gets `INVOICE_STATE_TONE` so `posted`=brand, not
  success) and localizes the slug per the doc's `states.<entity>` namespace
  (`t.has` guarded → unknown slug falls back to raw + neutral, no crash).
  Component-test-proven (4 tests: per-kind tone, localized label, fallback);
  browser-verify deferred (data-dependent — needs a customer order with
  populated reverse-lookups).

---

## 🔭 Roadmap — conventions to define next (same method: recon → ground → guard)

These are the remaining user-named uniformity axes. Each will get its own numbered
section once audited. Method for each: (a) read the DS primitive + moysklad capture
to fix the canonical rule, (b) recon fan-out for deviations with file:line evidence,
(c) operator ground-truth, (d) mechanical fix, (e) source-scan guard.

- ~~**Convention 2 — Action → Button variant.**~~ ✅ LOCKED 2026-06-11 — see its
  section above. (The roadmap's draft rule said Save=primary; the census showed
  the de-facto 63-page convention is document-Save=`success` via DetailToolbar —
  the locked map distinguishes document-save from generic primary CTA.)
- ~~**Convention 3 — Toolbar composition & order.**~~ ✅ LOCKED 2026-06-11 — see
  its section above (slot canon + DocumentEditor label contract + 3 functional
  bug fixes).
- ~~**Convention 4 — Filter-bar composition.**~~ ✅ **STRUCTURAL LOCKED
  2026-06-11** — see `_CONV4-FILTER-AUDIT-2026-06-11.md`. All 49 filter-bearing
  list pages render the DS `InlineFilterPanel` (inline expandable grid, not a
  drawer) + the shared `FilterToggleButton` (guard `filter-conventions.test.ts`,
  104 tests). The 49-page recon (`wf_df9670ea-80b`) also fixed **2 functional
  filter bugs** (variants «Ниже минимума» 500 crash → removed; tasks «Командные»
  dead pill → department-scoped, both runtime-verified) and **quantified the
  per-entity field-parity gap** as a coverage map. ⚠️ Field-level parity
  (which/how-many fields per entity) is **incremental backlog**, not locked here
  — most doc pages are 60–95% of moysklad's set (purchase-orders is at full
  parity); plus a documented re-order/`stock_minor` dead-column finding. The
  earlier "6-of-26" framing was a grep misread (the shared 6-field hook is
  referenced in comments to say it is intentionally NOT used).
- ~~**Convention 5 — Header layout.**~~ ✅ LOCKED 2026-06-11 — see its section
  above (composite pairing + family map + pager lock).
- ~~**Convention 6 — Domain-status tones.**~~ ✅ LOCKED 2026-06-10 — see its
  section above.
- ~~**Raw-element uniformity** (NEXT.md track 5)~~ → **Convention 8, LOCKED
  2026-06-11b** — select/textarea/checkbox + input, **263 surfaces**; **radio
  sub-axis DONE 2026-06-11c** (6 segmented sites → DS `SegmentedControl`, see
  Conv-8 section). Residual keepraw (in-guard registries): rate-micro ×8 (DS
  size decision) · POS skin ×5 · pills ×2 · permission-matrix radio MATRIX ×3
  (`EXEMPT_RADIO`) · file ×5 (no DS FileInput).

---

## Guard index (source-scan locks that keep conventions from drifting)

| Convention | Guard test |
|---|---|
| 1 — document state→tone | `apps/web/src/__tests__/document-state-tone.test.ts` |
| 2 — action→Button variant | `apps/web/src/__tests__/button-conventions.test.tsx` |
| 3 — toolbar composition & order | `apps/web/src/__tests__/toolbar-conventions.test.ts` |
| 4 — filter-bar structure + functional locks | `apps/web/src/__tests__/filter-conventions.test.ts` |
| 5 — detail-header layout | `apps/web/src/__tests__/header-conventions.test.ts` |
| 6 — domain-status→tone | `apps/web/src/__tests__/domain-status-tone.test.ts` |
| 7 — archived/active→tone | `apps/web/src/__tests__/archived-tone.test.ts` |
| 8 — raw form elements→DS primitives | `apps/web/src/__tests__/raw-element-conventions.test.ts` |
| (abc report FE↔BE contract) | `apps/web/src/__tests__/abc-report-contract.test.ts` |
| (filter sum→MoneyInput) | `apps/web/src/__tests__/sum-filter-money-input.test.ts` |
| (money entry→MoneyInput) | `apps/web/src/__tests__/money-input-rollout.test.ts` |
| (label grounding) | `apps/web/src/__tests__/label-grounding.test.ts` |

> **Machine-checkable status:** `docs/progress.json` → `ui_conventions` block —
> each convention's `locked` is COMPUTED from its guard test existing on disk
> (falsifiable). Currently **8/8 locked** (Conventions 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8).
> Convention 4's lock is the **structural** convention (InlineFilterPanel +
> FilterToggleButton across all 49 filter pages) + 2 functional-bug regression
> locks; per-entity field-parity enrichment is incremental backlog (see
> `_CONV4-FILTER-AUDIT-2026-06-11.md`), not part of the lock.

---

> **Status.** **Conventions 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 LOCKED** (8/8
> machine-checkable in `progress.json.ui_conventions`). Conv 4 = the filter-bar
> structural convention + functional-bug locks (field-parity = documented
> backlog, `_CONV4-FILTER-AUDIT-2026-06-11.md`). Conv 8 is complete across all
> sub-axes: select/textarea/checkbox + the raw-`<input>` sub-axis (11b) + the
> **radio sub-axis → DS `SegmentedControl`** (11c, 6 segmented sites; the
> permission-matrix radio MATRIX stays `EXEMPT_RADIO`). All are
> unit/source-scan guarded. Rendered changes carried Phase-2 browser smokes per
> session entries: Conv 7's label-templates drift fix, Conv 6's unifications +
> 25-page render-sweep, Conv 2's representative set, Conv 3+5's representative
> set, Conv 8's six-probe set + the 11c SegmentedControl smoke (radius drift-fix
> verified 2px→3px live). See the 2026-06-11/11b/11c session entries in NEXT.md
> for the exact smoke lists and what was NOT pixel-swept.
>
> **Numbering note:** Convention 6 = **domain-status tones** (coverage-map "C"
> + the raw-status "D" family); the archived/active family (coverage-map "B")
> is **Convention 7**. (Earlier NEXT.md shorthand called these "6a/6b" —
> superseded by the registry numbers here.)
