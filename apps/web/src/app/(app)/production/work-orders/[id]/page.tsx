'use client';

import { DocumentTabs } from '@/components/document-tabs';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import {
  Badge,
  Breadcrumb,
  Button,
  Container,
  FormField,
  Input,
  PageHeader,
  formatDate,
  formatDateOnly,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState } from 'react';

type WorkOrderState = 'draft' | 'in_progress' | 'completed' | 'cancelled';

interface BomComponent {
  id: string;
  productId: string;
  qty: string;
  position: number;
  product: { id: string; name: string; code: string | null; uom: string | null };
}

interface WorkOrderDetail {
  id: string;
  name: string;
  state: WorkOrderState;
  bomId: string;
  storeId: string;
  ownerId: string | null;
  plannedQty: string;
  producedQty: string;
  moment: string;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  description: string | null;
  createdAt: string;
  bom: {
    id: string;
    name: string;
    productId: string;
    product: { id: string; name: string; code: string | null; uom: string | null };
    components: BomComponent[];
  };
  store: { id: string; name: string };
  owner: { id: string; name: string; email: string } | null;
}

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();
  const t = useTranslations('pages.work_orders');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');

  const { data: wo, isLoading } = useQuery<WorkOrderDetail>({
    queryKey: ['work-order', params.id],
    queryFn: () => api.get<WorkOrderDetail>(`/work-orders/${params.id}`),
  });

  const [producedQtyInput, setProducedQtyInput] = useState('');
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['work-order', params.id] });
    void qc.invalidateQueries({ queryKey: ['work-orders'] });
  };

  const transitionMut = useMutation({
    mutationFn: (payload: { state: WorkOrderState; producedQty?: string }) =>
      api.post(`/work-orders/${params.id}/transition`, payload),
    onSuccess: () => {
      setShowCompleteForm(false);
      setProducedQtyInput('');
      setTransitionError(null);
      invalidate();
    },
    onError: (e: Error) => setTransitionError(e.message),
  });

  const handleComplete = () => {
    const qty = producedQtyInput || wo?.plannedQty;
    if (!qty || Number(qty) <= 0) {
      setTransitionError(t('err_quantity'));
      return;
    }
    transitionMut.mutate({ state: 'completed', producedQty: qty });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--ms-text-muted)] text-sm">
        {tCommon('loading')}
      </div>
    );
  }
  if (!wo) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--ms-text-muted)] text-sm">
        {tCommon('not_found')}
      </div>
    );
  }

  const state = wo.state as WorkOrderState;
  const canStart = state === 'draft';
  const canComplete = state === 'in_progress';
  const canCancel = state === 'draft' || state === 'in_progress' || state === 'completed';

  return (
    <Container size="lg" className="space-y-6 py-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <PageHeader
            title={wo.name}
            breadcrumbs={
              <Breadcrumb
                items={[{ label: t('title'), href: '/production/work-orders' }, { label: wo.name }]}
              />
            }
          />
        </div>
        <Badge tone={documentStateTone(state)}>{t(`statuses.${state}`)}</Badge>
      </div>

      {/* Transition error */}
      {transitionError && (
        <div className="rounded bg-[var(--ms-status-error-bg)] p-3 text-[var(--ms-status-error)] text-sm">
          {transitionError}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2" data-test-id="wo-actions">
        {canStart && (
          <Button
            variant="primary"
            onClick={() => transitionMut.mutate({ state: 'in_progress' })}
            disabled={transitionMut.isPending}
            data-test-id="btn-start"
          >
            {t('actions.start')}
          </Button>
        )}
        {canComplete && !showCompleteForm && (
          <Button
            variant="primary"
            onClick={() => setShowCompleteForm(true)}
            data-test-id="btn-complete"
          >
            {t('actions.complete')}
          </Button>
        )}
        {canCancel && (
          <Button
            variant="secondary"
            onClick={() => transitionMut.mutate({ state: 'cancelled' })}
            disabled={transitionMut.isPending}
            data-test-id="btn-cancel"
          >
            {t('actions.cancel')}
          </Button>
        )}
      </div>

      {/* Complete form */}
      {showCompleteForm && (
        <div
          className="space-y-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4"
          data-test-id="complete-form"
        >
          <h3 className="font-semibold text-sm">{t('complete_dialog_title')}</h3>
          <FormField id="produced-qty" label={t('complete_qty_label')}>
            <Input
              value={producedQtyInput || wo.plannedQty}
              onChange={(e) => setProducedQtyInput(e.target.value)}
              inputMode="decimal"
              className="max-w-[200px] text-right"
              data-test-id="field-produced-qty"
            />
          </FormField>
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={handleComplete}
              disabled={transitionMut.isPending}
              data-test-id="btn-confirm-complete"
            >
              {t('actions.complete')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowCompleteForm(false);
                setProducedQtyInput('');
                setTransitionError(null);
              }}
              data-test-id="btn-cancel-complete"
            >
              {tCommon('cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Main info */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <div className="flex justify-between border-[var(--ms-border-subtle)] border-b pb-2 text-sm">
            <span className="text-[var(--ms-text-muted)]">{t('bom')}</span>
            <a href={`/production/boms/${wo.bomId}`} className="font-medium hover:underline">
              {wo.bom.name}
            </a>
          </div>
          <div className="flex justify-between border-[var(--ms-border-subtle)] border-b pb-2 text-sm">
            <span className="text-[var(--ms-text-muted)]">{t('store')}</span>
            <span className="font-medium">{wo.store.name}</span>
          </div>
          <div className="flex justify-between border-[var(--ms-border-subtle)] border-b pb-2 text-sm">
            <span className="text-[var(--ms-text-muted)]">{t('planned_qty')}</span>
            <span className="font-medium tabular-nums">{wo.plannedQty}</span>
          </div>
          <div className="flex justify-between border-[var(--ms-border-subtle)] border-b pb-2 text-sm">
            <span className="text-[var(--ms-text-muted)]">{t('produced_qty')}</span>
            <span className="font-medium tabular-nums">{wo.producedQty}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between border-[var(--ms-border-subtle)] border-b pb-2 text-sm">
            <span className="text-[var(--ms-text-muted)]">{t('doc_date')}</span>
            <span>{formatDate(wo.moment)}</span>
          </div>
          {wo.plannedStartAt && (
            <div className="flex justify-between border-[var(--ms-border-subtle)] border-b pb-2 text-sm">
              <span className="text-[var(--ms-text-muted)]">{t('planned_start_at')}</span>
              <span>{formatDateOnly(wo.plannedStartAt)}</span>
            </div>
          )}
          {wo.plannedEndAt && (
            <div className="flex justify-between border-[var(--ms-border-subtle)] border-b pb-2 text-sm">
              <span className="text-[var(--ms-text-muted)]">{t('planned_end_at')}</span>
              <span>{formatDateOnly(wo.plannedEndAt)}</span>
            </div>
          )}
          {wo.startedAt && (
            <div className="flex justify-between border-[var(--ms-border-subtle)] border-b pb-2 text-sm">
              <span className="text-[var(--ms-text-muted)]">{t('started_at')}</span>
              <span>{formatDate(wo.startedAt)}</span>
            </div>
          )}
          {wo.completedAt && (
            <div className="flex justify-between border-[var(--ms-border-subtle)] border-b pb-2 text-sm">
              <span className="text-[var(--ms-text-muted)]">{t('completed_at')}</span>
              <span>{formatDate(wo.completedAt)}</span>
            </div>
          )}
          {wo.owner && (
            <div className="flex justify-between border-[var(--ms-border-subtle)] border-b pb-2 text-sm">
              <span className="text-[var(--ms-text-muted)]">{tCommon('owner')}</span>
              <span>{wo.owner.name}</span>
            </div>
          )}
          {wo.description && (
            <div className="flex justify-between border-[var(--ms-border-subtle)] border-b pb-2 text-sm">
              <span className="text-[var(--ms-text-muted)]">{tFields('description')}</span>
              <span className="text-right">{wo.description}</span>
            </div>
          )}
        </div>
      </div>

      {/* BOM components table */}
      <div>
        <h3 className="mb-3 font-semibold text-[var(--ms-text-secondary)] text-sm">
          {tFields('product')} — {wo.bom.product.name}
        </h3>
        {wo.bom.components.length > 0 ? (
          <table className="w-full text-sm" data-test-id="bom-components-table">
            <thead>
              <tr className="border-[var(--ms-border-default)] border-b">
                <th className="px-3 py-2 text-left font-medium text-[var(--ms-text-muted)]">
                  {tFields('product')}
                </th>
                <th className="w-32 px-3 py-2 text-right font-medium text-[var(--ms-text-muted)]">
                  {tFields('quantity')}
                </th>
              </tr>
            </thead>
            <tbody>
              {wo.bom.components.map((c) => (
                <tr
                  key={c.id}
                  className="border-[var(--ms-border-subtle)] border-b hover:bg-[var(--ms-bg-hover)]"
                >
                  <td className="px-3 py-2">{c.product.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.qty} {c.product.uom ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[var(--ms-text-muted)] text-sm">{tCommon('no_records')}</p>
        )}
      </div>

      <DocumentTabs auditEntity="WorkOrder" entityId={wo.id} relatedGroups={[]} />
    </Container>
  );
}
