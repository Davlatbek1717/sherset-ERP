'use client';

/**
 * Customer-order detail page — "Связанные документы" tab content.
 *
 * Source: docs/moysklad-reference/visual-captures/03-module/
 *   customerorder/screenshots/d-tab-svyazannye-dokumenty.{png,dom.html}
 *
 * Layout (per the captured screenshot):
 *   ┌──────────────────┐         ┌──────────────────┐
 *   │ Заказ покупателя │ ──────→ │ Отгрузка         │
 *   │ № 04796          │         │ № 05671          │
 *   │ 04.06.2025 09:39 │         │ 04.06.2025 09:43 │
 *   │ 64 000,00 сум    │         │ 64 000,00 сум    │
 *   └──────────────────┘         │ [Status]         │
 *                                └──────────────────┘
 *
 *   [Привязать документ]
 *
 * The captured DOM uses `b-related-documents-diagram` with absolute-
 * positioned cards. We render the same logical structure with a
 * flex row for the current implementation; a proper SVG diagram
 * (with arrows) is Round 5 polish work.
 *
 * Linked-doc data is fetched in the parent page and passed through
 * `linkedDemands` / `linkedInvoicesOut` arrays — once the backend
 * `customer-order.service.findById` includes the reverse-lookup the
 * arrays will be non-empty automatically.
 */

import { INVOICE_STATE_TONE, documentStateTone } from '@/lib/document-state-tone';
import { Badge, Button, Icons, formatDate, formatMoney } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface LinkedDoc {
  id: string;
  name: string;
  moment: string;
  state?: string;
  sumMinor: string;
  /** Used for the card heading + URL. */
  kind:
    | 'customer-order'
    | 'purchase-order'
    | 'demand'
    | 'invoice-out'
    | 'payment-in'
    | 'prepayment'
    | 'move'
    | 'enter'
    | 'loss'
    // Purchase-order downstream chain (Приёмки / Счета поставщиков / Платежи / Возвраты).
    | 'supply'
    | 'invoice-in'
    | 'payment-out'
    | 'purchase-return';
}

export interface RelatedDocsTabProps {
  /** The current document — rendered as the leftmost card. */
  current: LinkedDoc;
  linkedDemands?: LinkedDoc[];
  linkedInvoicesOut?: LinkedDoc[];
  linkedPaymentsIn?: LinkedDoc[];
  linkedPrepayments?: LinkedDoc[];
  linkedMoves?: LinkedDoc[];
  /** Generic linked-doc list — already carries each doc's `kind`. Lets a caller
   *  (e.g. the purchase-order detail) pass an arbitrary downstream chain without a
   *  named prop per type. Appended after the CO-specific named arrays. */
  linked?: LinkedDoc[];
  /** "Привязать документ" — placeholder for the linking flow. */
  onLinkDocument?(): void;
}

export function RelatedDocsTab({
  current,
  linkedDemands = [],
  linkedInvoicesOut = [],
  linkedPaymentsIn = [],
  linkedPrepayments = [],
  linkedMoves = [],
  linked = [],
  onLinkDocument,
}: RelatedDocsTabProps) {
  const t = useTranslations('detail_tabs');
  const others = [
    ...linkedInvoicesOut,
    ...linkedDemands,
    ...linkedPaymentsIn,
    ...linkedPrepayments,
    ...linkedMoves,
    ...linked,
  ];

  return (
    <div data-test-id="related-docs-tab">
      <div className="flex flex-wrap items-stretch gap-6">
        <DocCard doc={current} isCurrent />
        {others.map((doc, idx) => (
          <div
            key={doc.id}
            className="flex items-center gap-2"
            data-test-id={`related-docs-link-${idx}`}
          >
            <Icons.right className="h-4 w-4 text-[var(--ms-text-muted)]" aria-hidden />
            <DocCard doc={doc} />
          </div>
        ))}
      </div>

      {others.length === 0 && (
        <p className="mt-4 text-[var(--ms-text-muted)] text-sm" data-test-id="related-docs-empty">
          {t('no_related_docs')}
        </p>
      )}

      <div className="mt-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={onLinkDocument}
          disabled={!onLinkDocument}
          data-test-id="related-docs-link-button"
        >
          + {t('link_doc')}
        </Button>
      </div>
    </div>
  );
}

interface DocCardProps {
  doc: LinkedDoc;
  isCurrent?: boolean;
}

const KIND_TO_ROUTE: Record<LinkedDoc['kind'], string> = {
  'customer-order': '/customer-orders',
  'purchase-order': '/purchase-orders',
  demand: '/demands',
  'invoice-out': '/invoices-out',
  'payment-in': '/payments-in',
  prepayment: '/prepayments',
  move: '/moves',
  enter: '/enters',
  loss: '/losses',
  supply: '/supplies',
  'invoice-in': '/invoices-in',
  'payment-out': '/payments-out',
  'purchase-return': '/purchase-returns',
};

const KIND_LABEL_KEY: Record<LinkedDoc['kind'], string> = {
  'customer-order': 'detail_header.title_prefix',
  'purchase-order': 'detail_titles.purchase_order',
  demand: 'fields.linked_demand',
  'invoice-out': 'fields.linked_demand', // reused label
  'payment-in': 'fields.payed_sum',
  prepayment: 'detail_titles.prepayment',
  move: 'detail_titles.move',
  enter: 'detail_titles.enter',
  loss: 'detail_titles.loss',
  supply: 'detail_titles.supply',
  'invoice-in': 'detail_titles.invoice_in',
  'payment-out': 'detail_titles.payment_out',
  'purchase-return': 'detail_titles.purchase_return',
};

/** Each kind localizes its `state` slug under its own `states.<entity>` namespace. */
const KIND_STATE_NS: Record<LinkedDoc['kind'], string> = {
  'customer-order': 'customer_order',
  'purchase-order': 'purchase_order',
  demand: 'demand',
  'invoice-out': 'invoice_out',
  'payment-in': 'payment_in',
  prepayment: 'prepayment',
  move: 'move',
  enter: 'enter',
  loss: 'loss',
  supply: 'supply',
  'invoice-in': 'invoice_in',
  'payment-out': 'payment_out',
  'purchase-return': 'purchase_return',
};

/** Per-kind tone override (invoice `posted` = brand/in-flight, not success). */
const KIND_TONE_OVERRIDE: Partial<Record<LinkedDoc['kind'], typeof INVOICE_STATE_TONE>> = {
  'invoice-out': INVOICE_STATE_TONE,
};

function DocCard({ doc, isCurrent }: DocCardProps) {
  const t = useTranslations();
  const route = KIND_TO_ROUTE[doc.kind];
  const labelKey = KIND_LABEL_KEY[doc.kind];

  const card = (
    <div
      className={`flex min-w-[220px] flex-col gap-1 rounded-[var(--ms-radius-default)] border bg-[var(--ms-bg-surface)] p-3 shadow-sm transition-shadow hover:shadow-md ${
        isCurrent
          ? 'border-[var(--ms-text-brand)] ring-2 ring-[var(--ms-text-brand)]/20'
          : 'border-[var(--ms-border-default)]'
      }`}
      data-test-id={`related-doc-card-${doc.kind}-${doc.id}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
          {t(labelKey)}
        </span>
        {doc.state &&
          (() => {
            const stateKey = `states.${KIND_STATE_NS[doc.kind]}.${doc.state}`;
            return (
              <Badge
                tone={documentStateTone(doc.state, KIND_TONE_OVERRIDE[doc.kind])}
                data-test-id={`related-doc-state-${doc.id}`}
              >
                {t.has(stateKey) ? t(stateKey) : doc.state}
              </Badge>
            );
          })()}
      </div>
      {/* A brand-new (unsaved) document has no number yet — omit the «№ » line
          rather than render a dangling prefix. Saved docs always carry a number. */}
      {doc.name && (
        <div className="font-semibold text-[var(--ms-text-primary)] text-sm">№ {doc.name}</div>
      )}
      <div className="text-[var(--ms-text-muted)] text-xs tabular-nums">
        {formatDate(doc.moment)}
      </div>
      <div className="font-medium text-[var(--ms-text-primary)] text-sm tabular-nums">
        {formatMoney(doc.sumMinor)}
      </div>
    </div>
  );

  if (isCurrent) return card;
  return (
    <Link href={`${route}/${doc.id}`} className="block focus:outline-none">
      {card}
    </Link>
  );
}
