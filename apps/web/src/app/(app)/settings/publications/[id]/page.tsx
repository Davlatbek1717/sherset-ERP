'use client';

/**
 * /settings/publications/[id] — Single publication management.
 *
 * Shows:
 *  - Public URL (copyable)
 *  - Target doc link
 *  - View analytics (count + last viewed)
 *  - Password / expiry / description (editable)
 *  - Revoke + Rotate-token + Delete actions
 */

import { useConflictReload } from '@/hooks/use-conflict-reload';
import { api } from '@/lib/api-client';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import {
  Alert,
  Badge,
  Button,
  Icons,
  Input,
  PasswordInput,
  formatDate,
  useConfirm,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

interface PublicationDetail {
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
  updatedAt: string;
  version: number;
  owner: { id: string; name: string; email: string } | null;
}

const TARGET_PATH: Record<string, string> = {
  customerorder: '/customer-orders/',
  invoiceout: '/invoices-out/',
  demand: '/demands/',
  supply: '/supplies/',
  paymentin: '/payments-in/',
  paymentout: '/payments-out/',
  cashin: '/cash-in/',
  cashout: '/cash-out/',
  salesreturn: '/sales-returns/',
  purchasereturn: '/purchase-returns/',
  move: '/moves/',
  enter: '/enters/',
  loss: '/losses/',
  inventory: '/inventories/',
  purchaseorder: '/purchase-orders/',
  invoicein: '/invoices-in/',
  payroll: '/payrolls/',
  factureout: '/factures-out/',
  facturein: '/factures-in/',
  commissionreport: '/commission-reports/',
  consignment: '/consignments/',
  pricelist: '/price-lists/',
  prepayment: '/prepayments/',
  prepaymentreturn: '/prepayment-returns/',
  internalorder: '/internal-orders/',
  counterpartyadjustment: '/counterparty-adjustments/',
  processingorder: '/processing-orders/',
  processing: '/processings/',
};

// Maps a publication targetType to its canonical `detail_titles` i18n key, so
// the linked document shows a localized name instead of the raw enum slug.
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

export default function PublicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const t = useTranslations('pages.publications');
  const tCommon = useTranslations('common');
  const tDetailTitles = useTranslations('detail_titles');

  const onConflict = useConflictReload(['publication', id]);

  const { data, isLoading } = useQuery<PublicationDetail>({
    queryKey: ['publication', id],
    queryFn: () => api.get(`/publications/${id}`),
  });

  const [description, setDescription] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [password, setPassword] = useState('');
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate form on first load
  if (data && !edited) {
    if (description === '' && data.description) setDescription(data.description);
    if (expiresAt === '' && data.expiresAt) setExpiresAt(data.expiresAt.slice(0, 10));
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error('not loaded');
      const payload: Record<string, unknown> = {};
      payload.version = data.version;
      payload.description = description || null;
      payload.expiresAt = expiresAt ? expiresAt : null;
      if (password) payload.password = password;
      return api.patch(`/publications/${id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['publication', id] });
      qc.invalidateQueries({ queryKey: ['publications'] });
      setEdited(false);
      setPassword('');
      setError(null);
    },
    onError: (e: Error) => {
      if (isOptimisticConflict(e)) {
        onConflict();
        return;
      }
      setError(e.message);
    },
  });

  const revokeMut = useMutation({
    mutationFn: () => api.post(`/publications/${id}/revoke`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['publication', id] });
      qc.invalidateQueries({ queryKey: ['publications'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const rotateMut = useMutation({
    mutationFn: () => api.post(`/publications/${id}/rotate-token`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['publication', id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/publications/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['publications'] });
      router.push('/settings/publications');
    },
    onError: (e: Error) => setError(e.message),
  });

  const copyUrl = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(publicUrl(data.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (isLoading)
    return <div className="p-8 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>;
  if (!data) return <div className="p-8 text-sm">{tCommon('not_found')}</div>;

  const isRevoked = !!data.revokedAt;
  const isExpired = data.expiresAt && new Date(data.expiresAt) < new Date();
  const targetPath = TARGET_PATH[data.targetType] ?? '/';
  const targetTitleKey = TARGET_TITLE_KEY[data.targetType];
  const revokedDate = data.revokedAt ? formatDate(data.revokedAt) : '';
  const expiresDate = data.expiresAt ? formatDate(data.expiresAt) : '';

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{t('manage_title')}</h1>
        <Button variant="ghost" onClick={() => router.push('/settings/publications')}>
          {t('back_to_list')}
        </Button>
      </div>

      {error && <Alert tone="destructive">{error}</Alert>}
      {isRevoked && <Alert tone="destructive">{t('revoked_alert', { date: revokedDate })}</Alert>}
      {isExpired && !isRevoked && (
        <Alert tone="warning">{t('expired_alert', { date: expiresDate })}</Alert>
      )}

      {/* URL block */}
      <div className="space-y-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
        <div className="text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
          {t('public_link')}
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] px-3 py-2 font-mono text-sm">
            {publicUrl(data.token)}
          </code>
          <Button variant="secondary" onClick={copyUrl}>
            {copied ? `✓ ${tCommon('copied')}` : t('copy')}
          </Button>
          <Button variant="ghost" onClick={() => rotateMut.mutate()} disabled={rotateMut.isPending}>
            {t('rotate_token')}
          </Button>
        </div>
        <p className="text-[var(--ms-text-muted)] text-xs">{t('rotate_warning')}</p>
      </div>

      {/* Target doc */}
      <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
        <div className="mb-1 text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
          {t('target_doc')}
        </div>
        <a
          href={`${targetPath}${data.targetId}`}
          className="text-[var(--ms-text-brand)] hover:underline"
        >
          {targetTitleKey ? tDetailTitles(targetTitleKey) : data.targetType} → {data.targetId}
        </a>
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
          <div className="text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
            {t('view_count')}
          </div>
          <div className="mt-1 font-semibold text-2xl text-[var(--ms-text-primary)] tabular-nums">
            {data.viewCount}
          </div>
        </div>
        <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
          <div className="text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
            {t('last_viewed')}
          </div>
          <div className="mt-1 font-medium text-sm tabular-nums">
            {data.lastViewedAt ? formatDate(data.lastViewedAt) : '—'}
          </div>
        </div>
        <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
          <div className="text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
            {tCommon('status')}
          </div>
          <div className="mt-1">
            {isRevoked ? (
              <Badge tone="destructive">{t('status_revoked')}</Badge>
            ) : isExpired ? (
              <Badge tone="warning">{t('status_expired')}</Badge>
            ) : (
              <Badge tone="success">{tCommon('active')}</Badge>
            )}
            {data.passwordProtected && <Badge tone="neutral">🔒 {t('password_badge')}</Badge>}
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div className="space-y-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
        <div className="font-medium text-sm">{t('settings_section')}</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block">
              <span className="mb-1 block text-[var(--ms-text-muted)] text-xs">
                {t('comment_internal')}
              </span>
              <Input
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setEdited(true);
                }}
                placeholder={t('comment_ph')}
              />
            </label>
          </div>
          <div>
            <label className="block">
              <span className="mb-1 block text-[var(--ms-text-muted)] text-xs">
                {t('expires_label')}
              </span>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => {
                  setExpiresAt(e.target.value);
                  setEdited(true);
                }}
              />
            </label>
          </div>
          <div className="col-span-2">
            <label className="block" htmlFor="publication-password">
              <span className="mb-1 block text-[var(--ms-text-muted)] text-xs">
                {data.passwordProtected ? t('password_label_set') : t('password_label_new')}
              </span>
              <PasswordInput
                id="publication-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setEdited(true);
                }}
                placeholder="••••••••"
                showLabel={tCommon('show_password')}
                hideLabel={tCommon('hide_password')}
              />
            </label>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="primary"
            onClick={() => saveMut.mutate()}
            disabled={!edited || saveMut.isPending}
          >
            <Icons.save className="h-4 w-4" />
            {tCommon('save')}
          </Button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-destructive-200)] bg-[var(--ms-destructive-50)] p-4">
        <div className="mb-2 font-medium text-[var(--ms-text-destructive)] text-sm">
          {t('danger_zone')}
        </div>
        <div className="flex items-center gap-2">
          {!isRevoked && (
            <Button
              variant="destructive"
              onClick={() => revokeMut.mutate()}
              disabled={revokeMut.isPending}
            >
              {t('revoke_action')}
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={async () => {
              const ok = await confirm({
                title: t('delete_confirm_title'),
                description: tCommon('action_irreversible'),
                confirmLabel: tCommon('delete'),
                tone: 'destructive',
              });
              if (ok) deleteMut.mutate();
            }}
            disabled={deleteMut.isPending}
          >
            <Icons.delete className="h-4 w-4" />
            {t('delete_record')}
          </Button>
        </div>
      </div>
    </div>
  );
}
