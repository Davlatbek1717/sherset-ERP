# `pnpm audit:module <name>` — composite parity-audit CLI

**Date:** 2026-05-31
**Status:** approved (verbal), implementing
**Roadmap slot:** Q1.2 (sustainable-velocity quality foundation)

## Problem

Per-page parity audit is currently a manual ~7-8h sequence: capture moysklad
reference → eyeball the dropdown items against ours → write the deltas down →
typecheck → smoke. That manual loop is slow and error-prone (it is exactly what
caused the "26/56" inflation the `pnpm progress` hook now prevents).

Q1.2 collapses that loop into **one command, ~3-5 min**:

```
pnpm audit:module customer-orders
```

It captures (or reuses) the moysklad reference, dumps OUR dropdown items the same
way, diffs them, writes a machine-readable `todo.json`, then runs typecheck +
smoke. Exit code is non-zero on any delta or gate failure.

## What already exists (reuse, do NOT rebuild)

| Capability | Source | Output |
|---|---|---|
| moysklad capture | `scripts/capture-moysklad-references.ts` | `docs/moysklad-reference/<m>/states/metadata.json` with `states['03-edit-dropdown'].domDump.items[] = {label, disabled}` (S3 Изменить) and `states['05-print-dropdown']` (S5 Печать) |
| live mass-edit smoke | `scripts/smoke-mass-edit.sh` (`pnpm smoke <m>`) | pass/fail vs running API |
| typecheck | `pnpm typecheck` (turbo) | 0/err |
| progress scan | `scripts/progress-report.ts` (`pnpm progress`) | `docs/progress.json`; counts `docs/audits/*-list.audit.md` |

App facts confirmed during exploration:
- Login: `/login`, `admin@demo.local` / `admin123`, test-ids
  `login-email`/`login-password`/`login-submit`, redirect to `/`.
- Rows: real `tbody tr[data-test-id^="<entity>-row-"]`.
- Dropdowns: Radix menu items `[role=menuitem]` (+ `[data-disabled]`), trigger via
  `testId` (e.g. `counterparty-bulk-actions-dropdown`).
- Locale: `NEXT_LOCALE` cookie → `ru`/`uz`; RU labels in
  `apps/web/src/messages/ru.json` (namespaces `bulk`, `bulk_actions`, …).

**There is NO our-side dropdown-item dump today** — the e2e `audit-capture-*.spec.ts`
only take screenshots. So this is net-new logic, no duplication.

## Architecture

Three files, mirroring the `capture-moysklad-{lib,references}.ts` split so the
pure logic is unit-testable without launching a browser.

### `scripts/audit-module-lib.ts` (pure, unit-tested)

```ts
export interface Item { label: string; disabled: boolean }
export interface DropdownDiff {
  matched: number;
  missing: Item[];           // in moysklad, absent in ours
  extra: Item[];             // in ours, absent in moysklad
  disabledMismatch: Array<{ label: string; moysklad: boolean; ours: boolean }>;
  orderMismatch: boolean;    // same set, different order
}
export type Verdict = 'exact' | 'delta';

export function normalizeLabel(s: string): string;     // trim, collapse NBSP/whitespace, lower? (case-sensitive, only ws)
export function diffDropdown(moysklad: Item[], ours: Item[]): DropdownDiff;
export function buildTodo(perDropdown: Record<string, DropdownDiff>): TodoReport;
export function verdict(todo: TodoReport): Verdict;
export function parseStaticOurs(tsxSource: string, ruMessages: Record<string, unknown>): Item[];
```

`OUR_MODULES` registry (built from the workflow fan-out) maps each captured
module → `{ route, dropdownTestIds[], printTestId?, rowTestIdPrefix, i18nNamespaces[], componentPaths[] }`.
Starts with the 12 dedicated-dropdown modules; extensible.

### `scripts/audit-module.ts` (orchestrator — raw Playwright, like capture script)

Pipeline per module:

1. **Capture** — if moysklad `metadata.json` missing/stale, run capture; `--skip-capture` reuses. Read S3/S5 `domDump.items`.
2. **Our-side (live, default)** — Playwright: login, set `NEXT_LOCALE=ru`, goto `/<route>`, select first row, open each dropdown, dump `[role=menuitem]` → `{label, disabled}`. Write `docs/audits/<m>/ours-dropdowns.json` (`source:"live"`).
3. **Static fallback** (`--static`, or auto when web server unreachable) — `parseStaticOurs(componentSource, ru.json)`. Write with `source:"static"` (never silently trusted; report flags it).
4. **Diff** → `docs/audits/<m>/todo.json` via `buildTodo`.
5. **typecheck** (spawn `pnpm typecheck`; `--skip-typecheck`).
6. **smoke** (spawn `pnpm smoke <m>`; skip-tolerant — empty seed is OK; `--skip-smoke`).
7. **Report + exit** — print per-stage status; exit non-zero on any delta or hard gate failure. On `verdict==='exact'` write `docs/audits/<m>-list.audit.md` so `pnpm progress` counts it.

### `scripts/audit-module-lib.test.ts`

Unit tests: exact match; missing; extra; disabled-mismatch; order-mismatch;
NBSP/whitespace normalization; empty menus; static parse of a real dropdown
component.

### `package.json`

```json
"audit:module": "node --env-file=.env.local --import ./apps/api/node_modules/tsx/dist/loader.mjs scripts/audit-module.ts"
```

## Error handling (CLAUDE.md: no silent failure)

- Web server unreachable → loud message ("run `pnpm dev` or pass `--static`"), not a silent empty diff.
- Unknown module → print the registry and exit 1.
- moysklad menu empty because no row selected → already handled by `rowSelected` flag in capture; surfaced as a warning, not counted as "exact".
- Each stage's result is reported independently; final exit code = worst stage.
- Static source is always labelled; an exact verdict reached via static-only is flagged "(static — verify live before claiming parity)".

## Verification plan

- TDD the pure lib first (red → green).
- Live-verify the orchestrator against **counterparties** (catalog pattern) and
  **customer-orders** (FSM document pattern) with web :3000/:3100 + API :4000 +
  DB up. Confirm: exact module reports `exact`; a deliberately-mutated label
  reports the delta.
- Adversarial review workflow before commit.
- One commit through husky.

## Out of scope (YAGNI)

- Side-by-side PNG visual diff (Q1.3 ARIA baseline covers visual regression).
- Detail-page / modal audit (Q2/Q3).
- Auto-fixing deltas — the tool reports `todo.json`; fixes stay human-reviewed.
