'use client';

/**
 * /settings/publications/new — Manually create a publication.
 *
 * The typical flow is "Share via link" inside each document detail
 * page. This form is a fallback for when the operator already knows
 * the target doc ID and wants to create the publication centrally.
 */

import { api } from '@/lib/api-client';
import { Alert, Button, Icons, Input, NativeSelect } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Each target type maps to its canonical `detail_titles` i18n key so the
// dropdown shows localized, app-consistent document names in both locales.
const TARGET_TYPES: { value: string; titleKey: string }[] = [
  { value: 'customerorder', titleKey: 'customer_order' },
  { value: 'invoiceout', titleKey: 'invoice_out' },
  { value: 'demand', titleKey: 'demand' },
  { value: 'supply', titleKey: 'supply' },
  { value: 'paymentin', titleKey: 'payment_in' },
  { value: 'paymentout', titleKey: 'payment_out' },
  { value: 'cashin', titleKey: 'cash_in' },
  { value: 'cashout', titleKey: 'cash_out' },
  { value: 'salesreturn', titleKey: 'sales_return' },
  { value: 'purchasereturn', titleKey: 'purchase_return' },
  { value: 'move', titleKey: 'move' },
  { value: 'enter', titleKey: 'enter' },
  { value: 'loss', titleKey: 'loss' },
  { value: 'inventory', titleKey: 'inventory' },
  { value: 'purchaseorder', titleKey: 'purchase_order' },
  { value: 'invoicein', titleKey: 'invoice_in' },
  { value: 'payroll', titleKey: 'payroll' },
  { value: 'factureout', titleKey: 'facture_out' },
  { value: 'facturein', titleKey: 'facture_in' },
  { value: 'commissionreport', titleKey: 'commission_report' },
  { value: 'consignment', titleKey: 'consignment' },
  { value: 'pricelist', titleKey: 'price_list' },
  { value: 'prepayment', titleKey: 'prepayment' },
  { value: 'prepaymentreturn', titleKey: 'prepayment_return' },
  { value: 'internalorder', titleKey: 'internal_order' },
  { value: 'counterpartyadjustment', titleKey: 'counterparty_adjustment' },
  { value: 'processingorder', titleKey: 'processing_order' },
  { value: 'processing', titleKey: 'processing' },
];

export default function NewPublicationPage() {
  const router = useRouter();
  const t = useTranslations('pages.publications');
  const tCommon = useTranslations('common');
  const tDetailTitles = useTranslations('detail_titles');
  const [targetType, setTargetType] = useState('customerorder');
  const [targetId, setTargetId] = useState('');
  const [description, setDescription] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
        throw new Error(t('err_uuid'));
      }
      const payload: Record<string, unknown> = { targetType, targetId };
      if (description) payload.description = description;
      if (expiresAt) payload.expiresAt = expiresAt;
      if (password) payload.password = password;
      return api.post<{ id: string }>('/publications', payload);
    },
    onSuccess: (created) => router.push(`/settings/publications/${created.id}`),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{t('new_title')}</h1>
        <Button variant="ghost" onClick={() => router.push('/settings/publications')}>
          {t('back_to_list')}
        </Button>
      </div>

      {error && <Alert tone="destructive">{error}</Alert>}

      <div className="space-y-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="mb-1 block text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              {t('target_type')} <span className="text-[var(--ms-text-destructive)]">*</span>
            </span>
            <NativeSelect value={targetType} onChange={(e) => setTargetType(e.target.value)}>
              {TARGET_TYPES.map((tt) => (
                <option key={tt.value} value={tt.value}>
                  {tDetailTitles(tt.titleKey)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <span className="mb-1 block text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              {t('target_id')} <span className="text-[var(--ms-text-destructive)]">*</span>
            </span>
            <Input
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="font-mono text-xs"
            />
          </div>
        </div>

        <div>
          <span className="mb-1 block text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
            {t('comment_internal_long')}
          </span>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('comment_example_ph')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="mb-1 block text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              {t('expires_optional')}
            </span>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div>
            <span className="mb-1 block text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              {t('password_optional')}
            </span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('password_empty_ph')}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-[var(--ms-border-default)] border-t pt-4">
          <Button variant="ghost" onClick={() => router.push('/settings/publications')}>
            {tCommon('cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setError(null);
              createMut.mutate();
            }}
            disabled={createMut.isPending || !targetId}
          >
            <Icons.create className="h-4 w-4" />
            {tCommon('create')}
          </Button>
        </div>
      </div>

      <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] p-3 text-[var(--ms-text-muted)] text-xs">
        {t('hint')}
      </div>
    </div>
  );
}
