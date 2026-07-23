'use client';

/**
 * «Связанные документы» tab — moysklad 1:1 (re-grounded 2026-07-09 on the user's
 * live moysklad screenshots, PO #purchaseorder/edit…&tab=related):
 *
 *   [Привязать документ]                ← plain secondary button, ABOVE the cards
 *
 *   ┌──────────────────┐      ┌──────────────────┐
 *   │ ✓ Заказ поставщику│──●──│ ✓ Счет поставщика │   current = BLACK card,
 *   │ №00992            │      │ №00003            │   linked = WHITE cards,
 *   │ 09.07.2026 10:02  │      │ 08.07.2026 18:21  │   joined by a thin line
 *   │ 0,00 сум          │      │ 0,00 сум          │   with a mid-point dot.
 *   └──────────────────┘      └──────────────────┘
 *
 * Clicking a white card navigates to that document's page (its kind's route).
 * The ✓ mark mirrors «Проведено»: posted → solid, draft → light grey.
 *
 * `linkable` — when the page passes it (saved docs), this tab OWNS the manual
 * «Привязать документ» flow end-to-end: fetches `/document-links` (bidirectional),
 * renders them as unlinkable cards (✕), opens the «Привязка документа» filter-table
 * modal, and auto-opens it on arrival with `?link=new` (a /new form's save-first
 * hand-off, mirroring the tasks `?task=new` pattern).
 */

import { LinkDocumentModal } from '@/components/documents/link-document-modal';
import { api } from '@/lib/api-client';
import { Button, formatMoney } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface LinkedDoc {
  id: string;
  name: string;
  moment: string;
  state?: string;
  sumMinor: string;
  /** Custom «Статус» (State) — rendered as the coloured strip at the card's
   *  bottom (moysklad's orange «Киритилди» bar). */
  statusName?: string | null;
  statusColor?: string | null;
  /** Present only on MANUAL links (moysklad «Привязать документ») — enables the
   *  «Отвязать» affordance. Auto-chain (FK) docs have no linkId. */
  linkId?: string;
  /** Used for the card heading + URL. */
  kind:
    | 'customer-order'
    | 'purchase-order'
    | 'demand'
    | 'invoice-out'
    | 'payment-in'
    | 'cash-in'
    | 'cash-out'
    | 'prepayment'
    | 'move'
    | 'enter'
    | 'loss'
    // Purchase-order downstream chain (Приёмки / Счета поставщиков / Платежи / Возвраты).
    | 'supply'
    | 'invoice-in'
    | 'payment-out'
    | 'purchase-return'
    // Customer-side return (Возврат покупателя) — links back to its Отгрузка.
    | 'sales-return'
    // Счёт-фактура выданный — downstream of an Отгрузка / Счёт покупателю.
    | 'facture-out';
}

/** DocumentLink PascalCase type → card kind (the modal + BE speak PascalCase). */
export const LINK_TYPE_TO_KIND: Record<string, LinkedDoc['kind']> = {
  PurchaseOrder: 'purchase-order',
  Supply: 'supply',
  PurchaseReturn: 'purchase-return',
  InvoiceIn: 'invoice-in',
  Demand: 'demand',
  CustomerOrder: 'customer-order',
  InvoiceOut: 'invoice-out',
  SalesReturn: 'sales-return',
  Move: 'move',
  PaymentIn: 'payment-in',
  PaymentOut: 'payment-out',
  CashIn: 'cash-in',
  CashOut: 'cash-out',
};

export interface RelatedDocsLinkable {
  /** PascalCase entity of the current doc (DocumentLink source). */
  entityType: string;
  /** Pre-fill the modal's «Контрагент» / «Организация» / «На склад» filters
   *  with the current doc's refs (moysklad opens the modal already scoped). */
  agent?: { id: string; name: string } | null;
  organization?: { id: string; name: string } | null;
  storeTo?: { id: string; name: string } | null;
}

export interface RelatedDocsTabProps {
  /** The current document — rendered as the leftmost (black) card. */
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
  /**
   * Saved docs: pass this and the tab owns the whole manual-link flow (fetch +
   * modal + unlink + `?link=new` auto-open). Unsaved /new forms omit it and drive
   * the button via `onLinkDocument` (save-first) instead.
   */
  linkable?: RelatedDocsLinkable;
  /** "Привязать документ" — /new forms: save-first, then land with `?link=new`. */
  onLinkDocument?(): void;
  /** "Отвязать" a manual link (only used when `linkable` is NOT set). */
  onUnlink?(linkId: string): void;
}

export function RelatedDocsTab({
  current,
  linkedDemands = [],
  linkedInvoicesOut = [],
  linkedPaymentsIn = [],
  linkedPrepayments = [],
  linkedMoves = [],
  linked = [],
  linkable,
  onLinkDocument,
  onUnlink,
}: RelatedDocsTabProps) {
  const t = useTranslations('detail_tabs');
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  // «?link=new» arrival (from a /new form's «Привязать документ») → open once.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const autoOpenHandled = useRef(false);

  const canSelfLink = !!linkable && !!current.id && current.id !== 'new';
  const manualLinksKey = ['document-links', linkable?.entityType ?? '', current.id] as const;
  const { data: manualLinks } = useQuery<{
    items: Array<{
      linkId: string;
      type: string;
      id: string;
      name: string;
      moment: string;
      sumMinor: string;
      state: string;
      statusName: string | null;
      statusColor: string | null;
    }>;
  }>({
    queryKey: manualLinksKey,
    queryFn: () =>
      api.get(
        `/document-links?entityType=${encodeURIComponent(linkable?.entityType ?? '')}&entityId=${encodeURIComponent(current.id)}`,
      ),
    enabled: canSelfLink,
  });
  const unlinkMut = useMutation({
    mutationFn: (linkId: string) => api.delete(`/document-links/${linkId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: manualLinksKey }),
  });

  useEffect(() => {
    if (autoOpenHandled.current || !canSelfLink) return;
    if (searchParams.get('link') === 'new') {
      autoOpenHandled.current = true;
      setModalOpen(true);
      router.replace(pathname, { scroll: false });
    }
  }, [canSelfLink, searchParams, router, pathname]);

  const manualCards: LinkedDoc[] = canSelfLink
    ? (manualLinks?.items ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        moment: d.moment,
        state: d.state,
        sumMinor: d.sumMinor,
        statusName: d.statusName,
        statusColor: d.statusColor,
        linkId: d.linkId,
        kind: LINK_TYPE_TO_KIND[d.type] ?? current.kind,
      }))
    : [];

  const others = [
    ...linkedInvoicesOut,
    ...linkedDemands,
    ...linkedPaymentsIn,
    ...linkedPrepayments,
    ...linkedMoves,
    ...linked,
    ...manualCards,
  ];

  const handleUnlink = canSelfLink ? (linkId: string) => unlinkMut.mutate(linkId) : onUnlink;
  const handleLink = canSelfLink ? () => setModalOpen(true) : onLinkDocument;

  return (
    <div data-test-id="related-docs-tab">
      {/* moysklad: the button sits ABOVE the diagram (plain label, no «+»). */}
      <div className="mb-5">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleLink}
          disabled={!handleLink}
          data-test-id="related-docs-link-button"
        >
          {t('link_doc')}
        </Button>
      </div>

      {/* moysklad shows the relations diagram ONLY when something is linked — an
          unlinked doc renders NO cards at all (re-grounded 2026-07-09, user report:
          the lone black card must NOT pre-show before «Привязать документ»). */}
      {others.length > 0 && (
        <div className="flex flex-wrap items-center">
          <DocCard doc={current} isCurrent />
          {others.map((doc, idx) => (
            <div
              key={doc.linkId ?? `${doc.kind}-${doc.id}`}
              className="flex items-center"
              data-test-id={`related-docs-link-${idx}`}
            >
              {/* connector — thin grey line with a mid dot (moysklad diagram edge). */}
              <span className="relative block h-px w-10 bg-[var(--ms-border-strong,#c9c9c9)]">
                <span className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 h-[5px] w-[5px] rounded-full bg-[var(--ms-border-strong,#c9c9c9)]" />
              </span>
              <DocCard doc={doc} onUnlink={handleUnlink} />
            </div>
          ))}
        </div>
      )}

      {canSelfLink && (
        <LinkDocumentModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          current={{
            entityType: linkable?.entityType ?? '',
            id: current.id,
            name: current.name,
            moment: current.moment,
            sumMinor: current.sumMinor,
            state: current.state,
          }}
          defaults={{
            agent: linkable?.agent ?? null,
            organization: linkable?.organization ?? null,
            storeTo: linkable?.storeTo ?? null,
          }}
          onLinked={() => qc.invalidateQueries({ queryKey: manualLinksKey })}
        />
      )}
    </div>
  );
}

interface DocCardProps {
  doc: LinkedDoc;
  isCurrent?: boolean;
  onUnlink?(linkId: string): void;
}

const KIND_TO_ROUTE: Record<LinkedDoc['kind'], string> = {
  'customer-order': '/customer-orders',
  'purchase-order': '/purchase-orders',
  demand: '/demands',
  'invoice-out': '/invoices-out',
  'payment-in': '/payments-in',
  'cash-in': '/cash-in',
  'cash-out': '/cash-out',
  prepayment: '/prepayments',
  move: '/moves',
  enter: '/enters',
  loss: '/losses',
  supply: '/supplies',
  'invoice-in': '/invoices-in',
  'payment-out': '/payments-out',
  'purchase-return': '/purchase-returns',
  'sales-return': '/sales-returns',
  'facture-out': '/factures-out',
};

/** Card heading = the document-type title (moysklad «Заказ поставщику» etc.). */
const KIND_LABEL_KEY: Record<LinkedDoc['kind'], string> = {
  'customer-order': 'detail_titles.customer_order',
  'purchase-order': 'detail_titles.purchase_order',
  demand: 'detail_titles.demand',
  'invoice-out': 'detail_titles.invoice_out',
  'payment-in': 'detail_titles.payment_in',
  'cash-in': 'detail_titles.cash_in',
  'cash-out': 'detail_titles.cash_out',
  prepayment: 'detail_titles.prepayment',
  move: 'detail_titles.move',
  enter: 'detail_titles.enter',
  loss: 'detail_titles.loss',
  supply: 'detail_titles.supply',
  'invoice-in': 'detail_titles.invoice_in',
  'payment-out': 'detail_titles.payment_out',
  'purchase-return': 'detail_titles.purchase_return',
  'sales-return': 'detail_titles.sales_return',
  'facture-out': 'detail_titles.facture_out',
};

/** «09.07.2026 10:02» — moysklad card date is day+time, no comma. */
function formatCardMoment(moment: string): string {
  const d = new Date(moment);
  if (Number.isNaN(d.getTime())) return moment;
  return d
    .toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(',', '');
}

function DocCard({ doc, isCurrent, onUnlink }: DocCardProps) {
  const t = useTranslations();
  const route = KIND_TO_ROUTE[doc.kind];
  const labelKey = KIND_LABEL_KEY[doc.kind];
  // «Отвязать» — only on a manual link (has linkId) with a handler.
  const unlinkable = doc.linkId && onUnlink;
  const posted = doc.state === 'posted' || doc.state === 'shipped';

  const card = (
    <div
      className={`group relative flex w-[190px] flex-col gap-0.5 border p-3 text-left ${
        isCurrent
          ? 'border-[#3b3b3b] bg-[#3b3b3b] text-white'
          : 'border-[var(--ms-border-default)] bg-white text-[var(--ms-text-primary)] transition-colors hover:border-[var(--ms-border-focus,#7cb2dd)]'
      }`}
      data-test-id={`related-doc-card-${doc.kind}-${doc.id}`}
    >
      <div className="flex items-start gap-1.5">
        {/* «Проведено» check — GREEN when posted (moysklad), faint grey when draft. */}
        <svg
          viewBox="0 0 14 14"
          aria-hidden="true"
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
            posted ? 'text-[#8bc34a]' : isCurrent ? 'text-white/45' : 'text-[#c9c9c9]'
          }`}
        >
          <path
            d="M2 7.5l3.2 3.2L12 3.9"
            stroke="currentColor"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
        <span className="font-bold text-[13px] leading-tight">{t(labelKey)}</span>
        {unlinkable && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onUnlink?.(doc.linkId as string);
            }}
            title={t('detail_tabs.unlink')}
            aria-label={t('detail_tabs.unlink')}
            className="ml-auto hidden text-[var(--ms-text-muted)] text-xs hover:text-[var(--ms-action-destructive)] group-hover:block"
            data-test-id={`related-doc-unlink-${doc.id}`}
          >
            ✕
          </button>
        )}
      </div>
      {/* A brand-new (unsaved) document has no number yet — omit the «№» line
          rather than render a dangling prefix. Saved docs always carry a number. */}
      {doc.name && <div className="text-[13px] leading-tight">№{doc.name}</div>}
      <div
        className={`text-[12px] leading-tight ${isCurrent ? 'text-white/60' : 'text-[var(--ms-text-muted)]'}`}
      >
        {formatCardMoment(doc.moment)}
      </div>
      <div className="font-bold text-[13px] leading-tight">{formatMoney(doc.sumMinor, 'UZS')}</div>
      {/* Custom «Статус» strip — full-width coloured bar at the card's bottom edge
          (moysklad's orange «Киритилди» bar; shown on black and white cards alike). */}
      {doc.statusName && (
        <div
          className="-mx-3 -mb-3 mt-1 px-2 py-0.5 text-center font-semibold text-[12px] text-white leading-tight"
          style={{ backgroundColor: doc.statusColor ?? '#9ca3af' }}
          data-test-id={`related-doc-status-${doc.id}`}
        >
          {doc.statusName}
        </div>
      )}
    </div>
  );

  if (isCurrent) return card;
  // Band 4.3 (moysklad): the white card navigates to the linked document's page.
  return (
    <Link href={`${route}/${doc.id}`} className="block focus:outline-none">
      {card}
    </Link>
  );
}
