# Custom fields on the customer-order editor — design

**Date:** 2026-06-15
**Status:** approved (design) — pending spec review → writing-plans → build
**Scope:** ONE sub-project of the larger "match the user's moysklad screenshot" effort.
The other two sub-projects (custom **statuses** «Текширилмаган»; standard fields
«Канал продаж»/«Адрес доставки»/«Баланс») are separate specs, built later.

## Goal

The user's real moysklad account shows account-defined custom fields («Уста»,
«Санаси») inline in the customer-order form. A clone can't hardcode them — they're
the account's own configuration. moysklad models them as **custom attributes**
(доп. поля). Our app already implements this; the only gap is rendering+saving them
on the **`/customer-orders/new` editor**.

## What already exists (verified in code — do NOT rebuild)

- **DB:** `AttributeMetadata` model (entity, code, name, type, required, enumOptions,
  referenceEntity, position, …); the entity-type list explicitly includes `CustomerOrder`.
  Values stored per entity in the existing `attributes Json` column.
- **API:** `attribute-metadata` module (CRUD) + `GET /attribute-metadata/entity/:entity`.
  Customer-order **create schema already accepts `attributes`**
  (`customer-order.schema.ts:92` → `attributes: z.record(z.string(), z.unknown()).optional()`).
- **Settings UI:** `settings/attributes` page + dialog — user creates/edits/deletes
  custom fields per entity type.
- **Editor component:** `components/attributes-editor.tsx` (`AttributesEditor`) — controlled
  (`entity`, `values`, `onChange`), fetches metadata, renders a typed input per field.
  Already used on ~10 document **detail** (`[id]`) pages. Has a `bare` mode.

So this sub-project is **frontend wiring**, not a new feature.

## Design

1. **Refactor `attributes-editor.tsx`:** extract the per-type input switch into a small
   exported `AttributeInput` component (props: meta row, value, onChange, disabled, testId).
   `AttributesEditor` keeps working unchanged (uses `AttributeInput` internally). This is a
   pure extraction — the ~10 detail pages must render identically (guard with their existing
   tests + tsc/biome).

2. **customer-order `/new`:** fetch `GET /attribute-metadata/entity/CustomerOrder`. Render
   each definition as a **`DocumentMetaField`** (label-left, identical to standard fields)
   placed INSIDE the 3 meta columns, distributed by `position` order round-robin
   (1st→left, 2nd→middle, 3rd→right, 4th→left …) so a 2-field account gets Уста (left) +
   Санаси (middle), matching moysklad. The field input is `AttributeInput`.

3. **Save:** hold a local `attributes: Record<string, unknown>` state; include it in the
   POST `/customer-orders` payload when non-empty. Validate `required` custom fields before
   submit (same pattern as the standard-field validation in `createMut`).

4. **Reuse:** keep the metadata-fetch + render-in-columns logic small and extractable so the
   other document `/new` editors adopt it later (this feature rolls out alongside the
   3-column layout rollout).

## Data flow

`GET attribute-metadata/entity/CustomerOrder` → definitions → render fields in meta columns
→ user edits → local `attributes` map → `POST /customer-orders` includes `attributes`
→ backend persists into `attributes Json` (schema already accepts).

## Definition of done (HONEST)

- Custom fields render **pixel-identical to the standard meta fields** (same `DocumentMetaField`
  + DS inputs) and save/load correctly.
- Gates: ui tsc 0 · web tsc 0 · biome 0 · web Vitest green (attributes-editor refactor breaks
  no detail-page test).
- Browser-cert: create «Уста» (text) in Settings → доп. поля for CustomerOrder → open
  `/customer-orders/new` → field appears inline in the left column → fill + Save → reopen the
  saved order → value persisted.
- **NOT in scope here (separate, honest):** absolute pixel-1:1 of the *whole page* vs the
  moysklad screenshot also depends on the app-wide **input density (19px)** item and a few
  polish items tracked in NEXT.md. Custom fields inherit whatever the standard fields look
  like — this feature makes them *consistent*, it does not by itself make the page 100%
  pixel-identical to moysklad.

## Out of scope

- Custom **statuses** (Текширилмаган) — separate sub-project (State model → documents + a
  Settings→Statuses management UI).
- Standard fields Канал продаж / Адрес доставки / Баланс — separate.
- `reference`/`file` attribute types stay as the current UUID-input fallback (v2 picker later).
