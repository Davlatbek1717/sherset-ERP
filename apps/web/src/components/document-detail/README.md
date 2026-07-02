# `components/document-detail` — moysklad-parity detail-page shell

Shared layout primitives for every document detail page (FSM documents
+ catalog items). 17 pages currently use this shell:

| Module | Pages |
|---|---|
| Sales | customer-orders, demands, invoices-out, sales-returns |
| Purchase | purchase-orders, supplies, invoices-in, purchase-returns |
| Warehouse | moves, inventories, enters, losses |
| Money | payments-in, payments-out, cash-in, cash-out |
| Catalog | counterparties, products |

## Why a shared shell?

Before this folder, every detail page hand-built its own toolbar,
header, and tab strip. The result drifted: 5 pages had a green Save,
12 had blue; 1 page had the moysklad 4-tab strip, 16 didn't. After
the migration (commits `69efe63` → `7e2d915`) every page renders the
**same** moysklad-parity:

- Top toolbar: **Saqlash** (green `#369A1E`) · **Orqaga** · `Изменить ▾` · `Создать документ ▾` · `Печать ▾` · `Отправить ▾`
- Header: title + state pill + pillsSlot + Provedeno checkbox + author block
- Content: 4-tab strip (Pozitsiyalar / Bog'liq hujjatlar / Fayllar / Tarix) — money docs swap "Pozitsiyalar" → "Taqsimlanish"
- Position area: position-editor + DetailTotalsSidebar (or allocations table for money docs)

## Components

### `<DetailToolbar />`

Top action toolbar. Save / Close on the left, four dropdowns on the
right.

**Required props:**
- `isDirty` — gates the Save button
- `isSaving` — shows the spinner
- `onSave()`, `onClose()` — the two left-side handlers

**Optional props:**
- `position?: { current, total }` + `onPrev/onNext` — prev/next nav between docs
- `onClone`, `onDelete` — Edit-menu items (omit to disable)
- `onPrintList`, `onPrintConfigure`, `onSendEmail` — Print/Send menu items
- `createMenuItems?: CreateMenuItem[]` — drives the **Создать документ** dropdown.
  Each item is `{ id, label, onSelect, disabled? }`. Empty array hides the dropdown
  (useful for money documents that have no downstream).

### `<DetailHeader />`

Title row + state pill + Provedeno checkbox + author block.

**Required props:**
- `titlePrefix` — e.g. "Заказ покупателя", "Отгрузка". Render as `{titlePrefix} № {name} от {moment}`.
- `name`, `moment` — document number + ISO datetime
- `stateLabel`, `stateTone`, `stateSlug` — the parent translates from
  `states.<entity>` since the namespace differs per entity. The
  `stateSlug` drives the testId `detail-header-state-<slug>`.
- `applicable` — checkbox state

**Optional props:**
- `onToggleApplicable(next)` — hooks the FSM `post`/`unpost` transition.
  Omit when state is terminal (`cancelled`).
- `applicableBusy` — disables the checkbox during a transition flight
- `pillsSlot` — extra status pills (e.g. customer-order's "Не оплачено" / "Не отгружено")
- `authorSlot` — right-edge author block (avatar + name + role + "Изменения: ...")
- `customTitle` — overrides the default title format (used by catalog items that don't have a `№`)
- `hideApplicable` — skips the Provedeno checkbox entirely (catalog items use archived flag, not FSM-applicable)

### `<DetailContentTabs />`

Tab strip — Pozitsiyalar (default) / Bog'liq hujjatlar / Fayllar / Tarix.

**Required props:**
- `auditEntity` — AuditLog entity slug, e.g. `"CustomerOrder"`. Drives the history tab fetch.
- `entityId` — document UUID. Empty disables the audit fetch.
- `relatedGroups` — passed to the default `RelatedDocsPanel`. `[]` is fine when `relatedSlot` is provided.
- `children` — the position-editor + totals-sidebar block (the default tab body)

**Optional props:**
- `filesSlot` — Fayllar tab body. Most pages pass `<AttachmentsSection entity={...} entityId={...} />`. Omitted → tab trigger is hidden entirely.
- `positionsLabel` — overrides the default "Pozitsiyalar" tab label. Money documents pass `"Taqsimlanish"` since the body is an allocations table.
- `relatedSlot` — overrides the default `RelatedDocsPanel`. customer-order passes its custom `RelatedDocsTab` (with the visual diagram) here.

### `<DetailTotalsSidebar />`

Right-edge totals panel — **Promjutochnyi itog** + NDS checkbox + **Tsena vklyuchaet NDS** + **Itogo** + **Kol-vo**.

**Required props:**
- `subtotalMinor`, `vatMinor`, `totalMinor` — BigInt strings
- `vatEnabled`, `vatIncluded` — checkbox states
- `totalQty` — sum of position quantities

**Optional props:**
- `onToggleVatEnabled`, `onToggleVatIncluded` — control the checkboxes (omit for read-only)
- `readOnly` — disables both checkboxes (use when document is in `applicable` state)

## Adding a new detail page

Skeleton for a new FSM document:

```tsx
'use client';

import { AttachmentsSection } from '@/components/attachments-section';
import { AttributesEditor } from '@/components/attributes-editor';
import {
  type CreateMenuItem,
  DetailContentTabs,
  DetailHeader,
  DetailToolbar,
  DetailTotalsSidebar,
} from '@/components/document-detail';
// State → Badge tone is the shared cross-entity convention (UI Convention 1).
// Do NOT declare a local `const STATE_TONE` map — a source-scan guard
// (document-state-tone.test.ts) bans it. Use the shared helper:
import { documentStateTone } from '@/lib/document-state-tone';
import { /* ... */ } from '@moysklad/ui';
// ...

export default function MyDocDetailPage() {
  const tCommon = useTranslations('common');
  const tDetailTitles = useTranslations('detail_titles');
  const tStates = useTranslations('states.my_doc');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // ... existing useQuery, useMutation, form-state setup ...

  const createMenuItems: CreateMenuItem[] = [
    {
      id: 'downstream',
      label: tCreate('downstream'),
      onSelect: () => router.push(`/downstream/new?fromMyDoc=${data.id}`),
    },
  ];

  const onToggleApplicable =
    data.state === 'cancelled'
      ? undefined
      : (next: boolean) => transitionMut.mutate(next ? 'post' : 'unpost');

  return (
    <div className="flex min-h-screen flex-col bg-[var(--ms-bg-page)]">
      <DetailToolbar
        isDirty={isDirty}
        isSaving={saveMut.isPending}
        onSave={() => saveMut.mutate()}
        onClose={() => router.push('/my-doc')}
        onClone={() => cloneMut.mutate()}
        onDelete={!data.applicable ? () => runDestructive({ /* ... */ }) : undefined}
        createMenuItems={createMenuItems}
        onPrintList={() => window.open(`/print/my-doc/${data.id}?auto=1`)}
        onSendEmail={() => setEmailOpen(true)}
      />
      <DetailHeader
        titlePrefix={tDetailTitles('my_doc')}
        name={data.name}
        moment={data.moment}
        stateLabel={tStates(data.state as 'draft' | 'posted' | 'cancelled')}
        stateTone={documentStateTone(data.state)}
        stateSlug={data.state}
        applicable={data.applicable}
        onToggleApplicable={onToggleApplicable}
        applicableBusy={transitionMut.isPending}
        authorSlot={/* avatar + author + Изменения */}
      />
      <main className="flex-1 px-4 py-4">
        {/* form fields in 3-col grid */}
        <div className="mt-4">
          <DetailContentTabs
            auditEntity="MyDoc"
            entityId={data.id}
            relatedGroups={[]}
            filesSlot={<AttachmentsSection entity="MyDoc" entityId={data.id} />}
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <PositionEditor /* ... */ />
              <DetailTotalsSidebar /* ... */ />
            </div>
          </DetailContentTabs>
        </div>
        <AttributesEditor entity="MyDoc" /* ... */ />
      </main>
      {/* CatalogPicker mounts, dialogs */}
    </div>
  );
}
```

## i18n contract

Each detail page reads from these namespaces:

- `detail_titles.<entity>` — title prefix (e.g. `customer_order: "Заказ покупателя"`)
- `detail_header.*` — Provedeno label, "Изменения", role
- `detail_tabs.*` — tab labels
- `detail_send.*` — Send dropdown
- `print_menu.*` — Print dropdown
- `bulk_actions.*` — Edit dropdown
- `create_related.*` — Create-document dropdown items
- `states.<entity>.*` — FSM state translations
- `common.*` — Save, back, delete_confirm, locked_when_posted

Add a new entity to `detail_titles` in both `messages/uz.json` and
`messages/ru.json` when introducing a new detail page.

## Testing

The folder ships with 45 unit tests:

- `detail-toolbar.test.tsx` — 13 tests
- `detail-header.test.tsx` — 13 tests (covers `hideApplicable` + state slug variants)
- `detail-totals-sidebar.test.tsx` — 8 tests
- `detail-content-tabs.test.tsx` — 11 tests (covers `positionsLabel` + `relatedSlot` overrides)

End-to-end coverage in `apps/web/tests/e2e/detail-content-tabs.spec.ts`:

- demands detail: 4 tab triggers + click-to-swap state machine
- customer-orders detail: same 4 tabs (flagship + custom RelatedDocsTab via relatedSlot)
- payments-in detail: tab label is "Taqsimlanish" (override for money documents)

Run e2e:

```bash
# Requires moysklad dev server on port 3000 (NOT another app).
pnpm --filter @moysklad/web test:e2e -- detail-content-tabs
```

Visual parity is captured in `audit/parity-audit-after.html` (3-way
before/now/moysklad comparison for every detail page).

## Catalog detail pages

For non-FSM catalog items (counterparty, product) pass `hideApplicable`
to skip the Provedeno checkbox — the archive button replaces it via
`pillsSlot`. See `counterparties/[id]/page.tsx` for the pattern.

## Known gaps (next pass)

- `customer-orders/[id]` Header № and date are plain text. Moysklad makes them editable inputs (uncertain UX choice; postponed).
- Counterparties/Products detail forms are read-only InfoGrids. Moysklad uses inline edit fields. ~300-line refactor each, postponed.
- DocumentMoreMenu (three-dot context) was removed during the migration. May come back if users miss it.
