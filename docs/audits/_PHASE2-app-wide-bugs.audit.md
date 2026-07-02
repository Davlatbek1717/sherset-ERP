# Phase-2 — App-wide bugs flagged by the 2026-06-06e catalog QA (follow-up)

Session: 2026-06-07 (`davom et`, local Opus, ultracode). The catalog browser-QA
session (2026-06-06e) flagged three out-of-scope app-wide items and deferred them.
This session works that DEFER list. Stack live: web :3100 · api :4000 · db
`moysklad_dev` :5433 (same API process PID 17884, up since 2026-06-06 14:21).

---

## (a) ColumnCustomizer `'Ustunlar'` / `'Reset'` i18n leak — ✅ FIXED

**Bug (confirmed, real).** The design-system `<ColumnCustomizer>` (locale-agnostic
package, no next-intl) defaulted `label = 'Ustunlar'` (Latin-uz) and
`resetLabel = 'Reset'` (English). **All 32 list pages relied on these defaults** —
none passed a label — so every list page's column-settings gear showed Latin-uz
"Ustunlar" even in the RU locale, and "Reset" in both locales. Invisible to the
gates: the no-hardcoded i18n gate scans only document forms, and biome/i18n-key
checks don't validate design-system default prop values.

**Grounding (CLAUDE.md §4 — DOM-role, not grep-count).** moysklad's control:
`<svg>gear</svg><div class="…hideLabel-LBYEzn" style="margin-left:8px">Настроить колонки</div>`.
- `>Настроить колонки<` appears **2549×** as element content → the grounded label.
- `hideLabel-*` appears **exactly once** in the capture (uniquely on this control;
  every other toolbar button shows visible text) → moysklad renders it **icon-only**,
  the text being only the accessible name.
- Rejected misgrounding: `[по умолчанию]` (a candidate reset term) lives inside a
  `<div class="div-viewer" style="display:none">` → hidden viewer, NOT the column
  reset. Did not use it.

**Fix (3 layers, DRY):**
1. **design-system `ColumnCustomizer.tsx`** — `label` default removed (now icon-only
   when omitted, matching its own doc-comment "defaults to gear icon only" which the
   code had contradicted); new `ariaLabel?: string` prop (default `'Customize columns'`
   kept so the standalone from-ui test stays green); `aria-label={ariaLabel}`.
2. **app wrapper `apps/web/src/components/column-settings.tsx`** — `<ColumnSettings>`
   localizes in ONE place: `ariaLabel={t('configure_columns')}` +
   `resetLabel={t('columns_reset')}`, no visible label (icon-only parity). Keeps the
   design-system package locale-agnostic.
3. **i18n keys** (ru+uz, `common`): `configure_columns` = «Настроить колонки» /
   «Ustunlarni sozlash» (grounded); `columns_reset` = «Сбросить» / «Tiklash» (generic
   reset verb — moysklad's exact popover-reset wording was not cleanly grounded, so a
   clear non-leaking term was chosen over a guess).
4. **codemod** — 32 list pages migrated `<ColumnCustomizer>` → `<ColumnSettings>`
   (deterministic Node script, since deleted; all 32 imported it identically).

**Guard** (`apps/web/src/components/__tests__/column-settings-i18n.test.tsx`, 7 tests):
localized accessible name in **both** ru AND uz (real message files via NextIntl),
icon-only (`trigger.textContent === ''`, no "Ustunlar"), localized reset in both
locales, toggle pass-through, **+ a source-scan regression-lock** that fails if any
`app/(app)` page re-imports the raw `<ColumnCustomizer>`.

**Verification.** i18n correctness verified at the component+DOM level in both
locales with the real message files; full regression suite green. Pixel-level live
browser smoke NOT run (no Playwright MCP this session) — low risk: icon-only was
already a supported Button mode and matches moysklad.

**Gates:** tc0 (web+design-system) · biome 0 errors on changed files (4 pre-existing
`useSortedClasses` nursery *warnings* on untouched className lines) · web Vitest
**1423 (+7, 0 regress)** · design-system Vitest 118.

---

## (b) `/notifications?unreadOnly=…` + `/tasks/badge-count` "500 app-wide" — ⚠️ NOT REPRODUCIBLE (transient)

**Investigated thoroughly (systematic-debugging Iron Law: reproduce before fixing).
Could not reproduce.** Against the SAME running API process that was live during the
2026-06-06e observation:
- `GET /notifications?unreadOnly=true&limit=10` → **200** `{items:[],total:0,unreadCount:0}` (direct :4000 AND through the Next proxy :3100)
- `GET /tasks/badge-count` → **200** `{count:2}`
- SSE `/notifications/stream` → 200
- malformed params (`limit=0/99999`, bad cursor/kind) → proper **400** (Zod), never 500
- 30 concurrent badge-count requests → all **200** (no pool-exhaustion 500)

Code review confirms no 500 source: the permission guard throws **403** (not 500) on
insufficient scope; schemas validate; controllers/services are simple Prisma reads.
The FE pollers degrade gracefully (`data?.unreadCount ?? 0`, `data?.count ?? 0`;
react-query ret/refetch). **Most likely cause of the original observation:** the API
process is `tsx watch`; during the catalog QA I was editing API schema files, so the
30s/60s pollers caught brief windows where the Next proxy returned 5xx from the
down-during-recompile upstream — matching the original note's own "likely seed/env"
hedge. **No code change** — fixing a non-reproducible "bug" would be a symptom fix
(violates the Iron Law + CLAUDE.md §2 anti-confabulation).

---

## (c) Product edit has no optimistic lock (lost-update) — ⏭️ DEFERRED (architectural)

Pre-existing, real, but **not a quick fix**: optimistic concurrency (version/updatedAt
check → 409 + FE conflict handling) is an **app-wide** decision — doing it for the
product entity alone, of ~60 editable entities, would be inconsistent. Belongs in a
focused design pass (shared concurrency-control helper + FE 409 UX), not bolted onto
one form. Left documented, not half-built.

---

## Stray data noticed (not fixed)
`employees` list has a leftover test artifact `dup-test-1779968527@demo.local`
("first") from the 2026-06-06d contract-sweep session — harmless seed pollution in
the dev DB.
