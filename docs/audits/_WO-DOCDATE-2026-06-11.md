# WorkOrder «Дата документа» (moment) — BE feature + silent-drop fix (2026-06-11, «11f»)

> Follow-on to the grounding mega-session `_GROUNDING-SESSION-2026-06-11.md` —
> implements deferred backlog item **(C) WO docDate**, whose structural ground
> truth was confirmed there (moysklad `processingorder.moment` = «Дата документа»
> exists; our work-orders lacked it; InternalOrder / Production already carry it).
> Unlike the Phase-1 audit conveyer, this is a **runtime-VERIFIED** BE feature
> (live API 8/8 + browser RU+UZ + DB confirm), not a structural-only audit.

## The gap (and the latent bug it hid)

moysklad's production order (`processingorder`) has an editable **«Дата
документа»** (`moment`, DateTime). Our `WorkOrder` model had only the immutable
system `createdAt` plus planning dates (`plannedStartAt/EndAt`, `startedAt`,
`completedAt`) — **no editable document date**.

That was not merely a missing field — it hid a **silent data-loss bug**:
`work-orders/new` *already* bound an editable header date control
(`docDate` state → `DocumentEditor date`/`onDateChange`), but the create payload
omitted it (only `bomId/storeId/plannedQty/plannedStartAt/plannedEndAt` were
sent). So an operator could set the document date and it was **silently dropped**
— every WO was dated server-`now()` regardless. This is the exact bug-class the
`doc-date-payload.test.ts` gate exists to catch — yet work-orders **passed** it,
because the gate had a rationalised escape hatch (`plannedStartAt` accepted as a
"date sink" since WO "has no `moment` column"). The file contained `plannedStartAt`
(a *different* field), so the regex matched while the real docDate leaked.

## What shipped (full vertical slice)

| Layer | Change |
|---|---|
| **DB** | migration `20260611000000_add_work_order_moment`: `ADD COLUMN moment timestamptz NOT NULL DEFAULT now()` + **backfill `moment = created_at`** (existing 26 rows keep their real creation date, not the migration timestamp). `schema.prisma` WorkOrder gains `moment` (mirrors InternalOrder/Production). Client regenerated. |
| **API schema** | `CreateWorkOrderSchema.moment = z.string().datetime().optional()` (stricter `.datetime()` matching this module's `plannedStartAt`; auto-flows to `UpdateWorkOrderSchema` via `.partial()`). `WorkOrderFilterSchema.sortBy` += `'moment'` (parity with internal-orders; default unchanged = `createdAt`, no behaviour drift). |
| **API service** | `create()` persists `moment: parsed.moment ? new Date(parsed.moment) : new Date()`; `update()` sets `data.moment` only when provided; `serialize` type lists `moment` (it already flowed through `...r`). |
| **FE `/new`** | POST body now forwards `moment: docDate ? new Date(docDate).toISOString() : undefined` — **the one-line fix** to the silent drop (mirrors `internal-orders/new`). |
| **FE `/[id]`** | read-only detail now shows a **«Дата документа»** row (`formatDate(wo.moment)`), at the top of the meta column. |
| **i18n** | `pages.work_orders.doc_date` — ru «Дата документа» / uz «Hujjat sanasi» (mirrors the existing grounded `pages.productions.doc_date`). |
| **Guard** | `doc-date-payload.test.ts` `DATE_SINK` tightened `/\bmoment:|\bplannedStartAt\b/` → **`/\bmoment:/`** (escape hatch removed; all 26 doc-date `/new` pages now forward `moment:` — verified every one had `moment:1` except work-orders, which was the lone `plannedStartAt`-only page). + WO schema tests (moment accept/optional/reject-non-ISO + update edit + sortBy) + WO service tests (create persists chosen / defaults ~now / update sets only when provided). |

## Gate (all green)

web tc0 · api tc0 · db tc0 · biome **0 error** (1 pre-existing `noNonNullAssertion`
warning on an untouched bulkTransition line — not introduced here) ·
**api Vitest 2845 (+8, 0 regress)** · **web Vitest 1956 (0 regress)** · ds untouched.

## Runtime proof (this is NOT Phase-1-only)

**Live API adversarial QA** (dev `:4000`, seeded admin, 8/8 PASS):
1. create with chosen PAST moment `2026-03-15T09:30Z` → persisted **exactly**;
   1b. DB row `moment` == chosen;
2. create WITHOUT moment → defaults `~now` (no null);
3. PATCH moment → persisted;
4. adversarial invalid moments → **400**: (a) date-only `2026-03-15`,
   (b) garbage `not-a-date`, (c) impossible `2026-13-40T00:00:00Z`.
QA rows hard-deleted afterwards.

**Browser smoke** (Playwright, dev `:3100`, real session):
`/new` → set header date **10.02.2026 08:15** → pick BOM + store → Save → redirect
to `/[id]` which shows **«Дата документа 10.02.2026 08:15»** (RU) and, after a
`NEXT_LOCALE=uz` reload, **«Hujjat sanasi 10.02.2026 08:15»** (UZ). Before the fix
this would read today's date. Console: only a favicon 404. QA WO hard-deleted.

## Honest status / residuals

- **Runtime-verified** (live API + browser RU+UZ + DB), not a structural-only audit.
- The `/[id]` page is a **read-only** detail view, so the `moment` *edit* path
  (the `update()` support added here) is reachable only via the API / a future
  edit form — there is no FE date control on `/[id]`. The create path (the real
  parity gap + the silent-drop bug) is fully wired and proven.
- The list sort by `moment` is now schema-supported but the list page UI does not
  yet expose it (additive capability; default sort unchanged).
- **boms `costDistributionType`** (the other deferred BE feature from the grounding
  session) is still DEFERRED — its enum-option UI **labels** are blocked on the
  moysklad «Производство» option being enabled (structure is grounded; labels are
  not). WO docDate needed no new UI label («Дата документа» was already grounded
  via the productions sibling), which is why it could close first.
