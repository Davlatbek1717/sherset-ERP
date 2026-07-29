'use client';

/**
 * Qabul-tasdiqlash paneli (Faza C, spec §5) — qabul-detal sahifasida.
 * Bosqichga qarab (none→awaiting_supplier→delivering→awaiting_admin→completed)
 * mos amal-tugmasini ko'rsatadi + ikki-bosqich tasdiq (window.confirm) + rad-sabab
 * (window.prompt) + bosqich-tarixi timeline. Rol-ruxsatni BE tekshiradi
 * (@RequirePermission) — noto'g'ri rol 403 qaytaradi (xato-xabar chiqadi).
 */

import { api } from '@/lib/api-client';
import { Button } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

type Stage = 'none' | 'awaiting_supplier' | 'delivering' | 'awaiting_admin' | 'completed';
type SaAction = 'send' | 'supplier-confirm' | 'omborchi-confirm' | 'admin-confirm' | 'reject';

interface ApprovalEvent {
  id: string;
  action: string;
  actorType: string;
  reason: string | null;
  createdAt: string;
}
interface ApprovalState {
  stage: Stage;
  state: string;
  applicable: boolean;
  events: ApprovalEvent[];
}

const STAGE_TONE: Record<Stage, string> = {
  none: 'bg-slate-100 text-slate-600',
  awaiting_supplier: 'bg-amber-100 text-amber-700',
  delivering: 'bg-blue-100 text-blue-700',
  awaiting_admin: 'bg-violet-100 text-violet-700',
  completed: 'bg-emerald-100 text-emerald-700',
};

export function SupplyApprovalPanel({ supplyId }: { supplyId: string }) {
  const t = useTranslations('pages.supplyApproval');
  const qc = useQueryClient();

  const { data } = useQuery<ApprovalState>({
    queryKey: ['supply-approval', supplyId],
    queryFn: () => api.get<ApprovalState>(`/supplies/${supplyId}/approval`),
  });

  // Konkret yo'llar — FE↔BE contract-guard dinamik path-segmentni hal qilolmaydi.
  const act = useMutation({
    mutationFn: ({ action, body }: { action: SaAction; body?: unknown }) => {
      switch (action) {
        case 'send':
          return api.post(`/supplies/${supplyId}/approval/send`, {});
        case 'supplier-confirm':
          return api.post(`/supplies/${supplyId}/approval/supplier-confirm`, {});
        case 'omborchi-confirm':
          return api.post(`/supplies/${supplyId}/approval/omborchi-confirm`, {});
        case 'admin-confirm':
          return api.post(`/supplies/${supplyId}/approval/admin-confirm`, {});
        default:
          return api.post(`/supplies/${supplyId}/approval/reject`, body ?? {});
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supply-approval', supplyId] });
      void qc.invalidateQueries({ queryKey: ['supply', supplyId] });
    },
  });

  if (!data) return null;
  const stage = data.stage;

  const confirmThen = (action: SaAction, msg: string) => {
    if (window.confirm(msg)) act.mutate({ action });
  };
  const rejectThen = () => {
    const reason = window.prompt(t('reject_reason_prompt'));
    if (reason?.trim()) act.mutate({ action: 'reject', body: { reason } });
  };

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4"
      data-test-id="supply-approval-panel"
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm">{t('title')}</div>
        <span className={`rounded px-2 py-0.5 font-medium text-xs ${STAGE_TONE[stage]}`}>
          {t(`stage_${stage}`)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {stage === 'none' && (
          <Button
            onClick={() => confirmThen('send', t('confirm_send'))}
            disabled={act.isPending}
            data-test-id="sa-send"
          >
            {t('action_send')}
          </Button>
        )}
        {stage === 'awaiting_supplier' && (
          <>
            <div className="self-center text-slate-500 text-sm">{t('awaiting_supplier')}</div>
            <Button
              variant="secondary"
              onClick={() => confirmThen('supplier-confirm', t('confirm_supplier'))}
              disabled={act.isPending}
              data-test-id="sa-supplier"
            >
              {t('action_supplier_confirm')}
            </Button>
          </>
        )}
        {stage === 'delivering' && (
          <>
            <Button
              onClick={() => confirmThen('omborchi-confirm', t('confirm_omborchi'))}
              disabled={act.isPending}
              data-test-id="sa-omborchi"
            >
              {t('action_omborchi_confirm')}
            </Button>
            <Button variant="secondary" onClick={rejectThen} disabled={act.isPending}>
              {t('action_reject')}
            </Button>
          </>
        )}
        {stage === 'awaiting_admin' && (
          <>
            <Button
              variant="success"
              onClick={() => confirmThen('admin-confirm', t('confirm_admin'))}
              disabled={act.isPending}
              data-test-id="sa-admin"
            >
              {t('action_admin_confirm')}
            </Button>
            <Button variant="secondary" onClick={rejectThen} disabled={act.isPending}>
              {t('action_reject')}
            </Button>
          </>
        )}
        {stage === 'completed' && (
          <div className="font-medium text-emerald-600 text-sm">{t('completed')}</div>
        )}
      </div>

      {act.isError && <div className="mt-2 text-red-600 text-xs">{t('error')}</div>}

      {data.events.length > 0 && (
        <div className="mt-3 border-slate-100 border-t pt-2">
          <div className="mb-1 font-medium text-slate-500 text-xs">{t('history')}</div>
          <ul className="space-y-1">
            {data.events.map((e) => (
              <li key={e.id} className="text-slate-600 text-xs">
                {new Date(e.createdAt).toLocaleString('ru-RU')} — {t(`action_label_${e.action}`)} (
                {e.actorType}){e.reason ? `: ${e.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
