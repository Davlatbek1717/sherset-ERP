'use client';

/**
 * /settings/publications — Public hujjat havolalari ro'yxati.
 *
 * Bu yerdan klerk barcha aktiv "Share via link" havolalarni boshqaradi:
 * status (active / revoked / expired), ko'rishlar soni, oxirgi marta
 * ko'rilgan vaqt. Havolani revoke qilish yoki token'ni rotate qilish
 * — link'ni xavfsiz qilish vositalari.
 *
 * Publikatsiya YARATISH odatda har hujjat /[id] sahifasidan "Share via
 * link" tugmasi orqali bo'ladi. Bu sahifa boshqaruv panel.
 */

import { api } from '@/lib/api-client';
import { Badge, type DataTableColumn, ListView, formatDate, useDebounce } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface PublicationRow {
  id: string;
  targetType: string;
  targetId: string;
  token: string;
  description: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  expiresAt: string | null;
  passwordProtected: boolean;
  revokedAt: string | null;
  createdAt: string;
  owner: { id: string; name: string } | null;
}

interface ListResponse {
  items: PublicationRow[];
  nextCursor?: string;
  total: number;
}

const LIMIT = 100;

// Maps a publication targetType to its canonical `detail_titles` i18n key so
// the «Тип документа» column shows a localized RU/uz name instead of the raw
// enum slug — mirrors settings/publications/[id]/page.tsx so list + detail agree.
const TARGET_TITLE_KEY: Record<string, string> = {
  customerorder: 'customer_order',
  invoiceout: 'invoice_out',
  demand: 'demand',
  supply: 'supply',
  paymentin: 'payment_in',
  paymentout: 'payment_out',
  cashin: 'cash_in',
  cashout: 'cash_out',
  salesreturn: 'sales_return',
  purchasereturn: 'purchase_return',
  move: 'move',
  enter: 'enter',
  loss: 'loss',
  inventory: 'inventory',
  purchaseorder: 'purchase_order',
  invoicein: 'invoice_in',
  payroll: 'payroll',
  factureout: 'facture_out',
  facturein: 'facture_in',
  commissionreport: 'commission_report',
  consignment: 'consignment',
  pricelist: 'price_list',
  prepayment: 'prepayment',
  prepaymentreturn: 'prepayment_return',
  internalorder: 'internal_order',
  counterpartyadjustment: 'counterparty_adjustment',
  processingorder: 'processing_order',
  processing: 'processing',
};

function publicUrl(token: string): string {
  if (typeof window === 'undefined') return `/p/${token}`;
  return `${window.location.origin}/p/${token}`;
}

type StatusTone = 'success' | 'warning' | 'destructive' | 'neutral';

function statusOf(
  p: PublicationRow,
  t: (key: string) => string,
): { tone: StatusTone; label: string } {
  if (p.revokedAt) return { tone: 'destructive', label: t('status_revoked') };
  if (p.expiresAt && new Date(p.expiresAt) < new Date()) {
    return { tone: 'warning', label: t('status_expired') };
  }
  return { tone: 'success', label: t('status_active') };
}

export default function PublicationsPage() {
  const t = useTranslations('pages.publication');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tDetailTitles = useTranslations('detail_titles');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
  });

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: ['publications', search, cursor, sortKey, sortDir],
    queryFn: () => api.get<ListResponse>(`/publications?${params.toString()}`),
  });

  const copyUrl = async (token: string) => {
    try {
      await navigator.clipboard.writeText(publicUrl(token));
    } catch {
      // Older browsers — silently skip; user can manually copy from row link
    }
  };

  // Canonical localized doc-type label (falls back to the raw slug for unknown types).
  const targetLabel = (targetType: string): string => {
    const key = TARGET_TITLE_KEY[targetType];
    return key ? tDetailTitles(key) : targetType;
  };

  const columns: DataTableColumn<PublicationRow>[] = [
    {
      key: 'targetType',
      header: t('col_target_type'),
      width: '180px',
      cell: (r) => <span className="text-sm">{targetLabel(r.targetType)}</span>,
      cellText: (r) => targetLabel(r.targetType),
    },
    {
      key: 'description',
      header: tFields('description'),
      cell: (r) => (
        <span className="max-w-[280px] truncate text-[var(--ms-text-muted)] text-sm">
          {r.description || '—'}
        </span>
      ),
      cellText: (r) => r.description ?? '',
    },
    {
      key: 'url',
      header: t('col_url'),
      cell: (r) => (
        <div className="flex items-center gap-2">
          <a
            href={publicUrl(r.token)}
            target="_blank"
            rel="noopener noreferrer"
            className="max-w-[280px] truncate font-mono text-[11px] text-[var(--ms-text-brand)] underline-offset-2 hover:underline"
          >
            /p/{r.token.slice(0, 12)}…
          </a>
          <button
            type="button"
            onClick={() => copyUrl(r.token)}
            className="rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-1.5 py-0.5 text-[10px] text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
            title={t('copy_link_title')}
          >
            {t('copy_label')}
          </button>
        </div>
      ),
      cellText: (r) => publicUrl(r.token),
    },
    {
      key: 'protected',
      header: t('col_protected'),
      width: '80px',
      cell: (r) => (
        <span className="text-sm">
          {r.passwordProtected ? '🔒' : <span className="text-[var(--ms-text-muted)]">—</span>}
        </span>
      ),
      cellText: (r) => (r.passwordProtected ? 'yes' : 'no'),
    },
    {
      key: 'viewCount',
      sortField: 'viewCount',
      header: t('col_views'),
      width: '120px',
      align: 'right',
      sortable: true,
      cell: (r) => <span className="font-medium tabular-nums">{r.viewCount}</span>,
      cellText: (r) => String(r.viewCount),
    },
    {
      key: 'lastViewedAt',
      sortField: 'lastViewedAt',
      header: t('col_last_viewed'),
      width: '140px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {r.lastViewedAt ? formatDate(r.lastViewedAt) : '—'}
        </span>
      ),
      cellText: (r) => (r.lastViewedAt ? formatDate(r.lastViewedAt) : ''),
    },
    {
      key: 'expiresAt',
      header: t('col_expires'),
      width: '120px',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {r.expiresAt ? formatDate(r.expiresAt) : t('no_expiry')}
        </span>
      ),
      cellText: (r) => (r.expiresAt ? formatDate(r.expiresAt) : t('no_expiry')),
    },
    {
      key: 'status',
      header: tCommon('status'),
      width: '140px',
      cell: (r) => {
        const s = statusOf(r, t);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
      cellText: (r) => statusOf(r, t).label,
    },
    {
      key: 'createdAt',
      sortField: 'createdAt',
      header: t('col_created'),
      width: '120px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {formatDate(r.createdAt)}
        </span>
      ),
      cellText: (r) => formatDate(r.createdAt),
    },
    {
      key: 'manage',
      header: '',
      width: '120px',
      cell: (r) => (
        <a
          href={`/settings/publications/${r.id}`}
          className="text-[var(--ms-text-brand)] text-xs underline-offset-2 hover:underline"
        >
          {t('manage_link')}
        </a>
      ),
      cellText: () => '',
    },
  ];

  return (
    <ListView
      testId="publications-page"
      title={t('title')}
      moyskladToolbar
      onRefresh={() => refetch()}
      createHref="/settings/publications/new"
      createLabel={t('create_button')}
      createPosition="start"
      search={searchInput}
      onSearchChange={(v) => {
        setSearchInput(v);
        setCursor(undefined);
      }}
      searchPlaceholder={t('search_placeholder')}
      columns={columns}
      rows={data?.items ?? []}
      keyField="id"
      rowTestId={(r) => `pub-row-${r.id}`}
      total={data?.total ?? 0}
      limit={LIMIT}
      hasNext={!!data?.nextCursor}
      hasPrevious={!!cursor}
      onNext={() => setCursor(data?.nextCursor)}
      onPrevious={() => setCursor(undefined)}
      loading={isLoading}
      error={error as Error | null}
      onRetry={() => refetch()}
      emptyTitle={search ? tCommon('no_results') : t('empty_title')}
      richEmpty={{
        heading: t('empty_rich_heading'),
        helper: { label: t('empty_rich_helper'), href: '/help/publications' },
        cta: { label: t('create_button'), href: '/settings/publications/new' },
      }}
      sortKey={sortKey}
      sortDir={sortDir}
      onSortChange={(key, dir) => {
        setSortKey(key);
        setSortDir(dir);
        setCursor(undefined);
      }}
    />
  );
}
