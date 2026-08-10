'use client';

import { api } from '@/lib/api-client';
import { workItemSeverityTone, workItemStatusTone } from '@/lib/domain-status-tone';
import {
  Badge,
  Button,
  Checkbox,
  Input,
  NativeSelect,
  formatDate,
  formatMoney,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CommentTemplatePicker } from '../_components/comment-template-picker';

/** BE `work-item-fsm.ts` dagi WORK_ITEM_ACTION bilan mos. */
type QueueAction =
  | 'acknowledge'
  | 'request_explanation'
  | 'record_fine'
  | 'start_investigation'
  | 'assign_task'
  | 'write_warning'
  | 'escalate'
  | 'dismiss'
  | 'reopen';

interface QueueRow {
  id: string;
  ruleType: string;
  status: string;
  severity: string;
  subject: { id: string; name: string } | null;
  /** Tiyin, satr. `null` = O'LCHANMADI (0 EMAS). */
  amountMinor: string | null;
  currency: string | null;
  docType: string | null;
  docId: string | null;
  occurredAt: string;
  staleAt: string | null;
  resolutionCode: string | null;
  monthlyCount: number;
  allowedActions: QueueAction[];
  /**
   * §5.3 — yopuvchi amal → ruxsat etilgan sabab kodlari, SHU qoida uchun
   * (MK07). Ro'yxat BE dan keladi: ekranda nusxa saqlansa, ikkalasi bir kunda
   * ajralib qolar va menejer tanlagan kod 400 bilan qaytardi.
   */
  reasonCodes: Partial<Record<QueueAction, string[]>>;
}

interface QueueResponse {
  count: number;
  staleCount: number;
  rows: QueueRow[];
}

interface RuleRow {
  ruleType: string;
  enabled: boolean;
  threshold: number | null;
  thresholdUnit: string | null;
  thresholdRejected: boolean;
  severity: string;
  blocks: boolean;
}

interface SyncResult {
  candidates: number;
  created: number;
  duplicates: number;
  markedStale: number;
}

/**
 * Hujjatga havola (§5.1) — element qaysi obyektdan kelib chiqqan.
 *
 * Ro'yxatda yo'q `docType` — `null`: mavjud bo'lmagan sahifaga havola
 * qo'yishdan ko'ra havolasiz qoldirish yaxshi (`ABSENT` da hujjat UMUMAN
 * yo'q — dalil yozuvning YO'QLIGI).
 */
const DOC_ROUTES: Record<string, string> = {
  product: '/products',
  variant: '/products',
  cashiersession: '/retail/sessions',
  retailsale: '/retail/sales',
  debt: '/debts',
  inventory: '/inventories',
};

function docHref(row: QueueRow): string | null {
  if (!row.docId || !row.docType) return null;
  const base = DOC_ROUTES[row.docType];
  return base ? `${base}/${row.docId}` : null;
}

/**
 * MENEJER ISH NAVBATI — bitta ro'yxat (MK06 / 4M TZ §5).
 *
 * Savolga javob beradi: «bugun nima muhim». Qoida buzilishi, kassa farqi,
 * narx sakrashi — hammasi shu yerda; menejer besh joyni aylanmaydi.
 *
 * 🔴 Navbat HECH NARSANI BLOKLAMAYDI (§5.1) — bu ekranda hech qanday hujjat
 * to'xtatilmaydi va tuzatilmaydi. U faqat «ko'rildi / nima qilindi» ni
 * yozadi. Shu sabab ekranda doimiy izoh turadi.
 */
export default function MenejerNavbatPage() {
  const t = useTranslations('pages.managerQueue');
  const qc = useQueryClient();

  const [ruleType, setRuleType] = useState('');
  const [staleOnly, setStaleOnly] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<QueueAction | null>(null);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  /**
   * MK20 — tanlangan shablon. Jurnalga TUSHMAYDI: u yerga matn ketadi
   * (`comment`). Bu qiymat faqat «qaysi shablon ishlatildi» statistikasi
   * uchun BE ga uzatiladi.
   */
  const [templateId, setTemplateId] = useState<string | null>(null);

  const query = new URLSearchParams();
  if (ruleType) query.set('ruleType', ruleType);
  if (staleOnly) query.set('staleOnly', 'true');
  const qs = query.toString();

  const { data, isLoading } = useQuery<QueueResponse>({
    queryKey: ['manager-queue', ruleType, staleOnly],
    queryFn: () => api.get<QueueResponse>(`/manager/queue${qs ? `?${qs}` : ''}`),
  });

  const { data: rulesData } = useQuery<{ rules: RuleRow[] }>({
    queryKey: ['manager-queue-rules'],
    queryFn: () => api.get<{ rules: RuleRow[] }>('/manager/queue/rules'),
  });

  const closeForm = () => {
    setActingId(null);
    setPendingAction(null);
    setReason('');
    setComment('');
    setTemplateId(null);
  };

  const sync = useMutation({
    mutationFn: () => api.post<SyncResult>('/manager/queue/sync', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manager-queue'] }),
  });

  const act = useMutation({
    mutationFn: (v: {
      id: string;
      action: QueueAction;
      reasonCode?: string;
      comment?: string;
      templateId?: string | null;
    }) =>
      api.post(`/manager/queue/${v.id}/action`, {
        action: v.action,
        ...(v.reasonCode ? { reasonCode: v.reasonCode } : {}),
        ...(v.comment ? { comment: v.comment } : {}),
        // MK20 — statistika uchun; jurnalga MATN yoziladi, havola emas.
        ...(v.templateId ? { templateId: v.templateId } : {}),
      }),
    onSuccess: () => {
      closeForm();
      qc.invalidateQueries({ queryKey: ['manager-queue'] });
    },
  });

  const rows = data?.rows ?? [];
  const rules = rulesData?.rules ?? [];
  const misconfigured = rules.filter((r) => r.thresholdRejected);

  const runAction = (row: QueueRow, action: QueueAction) => {
    // Sabab kodlari bor amal = YOPUVCHI amal ⇒ forma ochiladi (§5.3).
    if (row.reasonCodes?.[action]?.length) {
      setActingId(row.id);
      setPendingAction(action);
      setReason('');
      setComment('');
      setTemplateId(null);
      return;
    }
    act.mutate({ id: row.id, action });
  };

  return (
    <div className="p-4" data-test-id="manager-queue-page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-[var(--ms-text-primary)] text-lg">
          {t('title')}
          {rows.length > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 text-xs">
              {rows.length}
            </span>
          )}
          {(data?.staleCount ?? 0) > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 text-xs">
              {t('stale_badge', { count: data?.staleCount ?? 0 })}
            </span>
          )}
        </h1>

        <Button
          size="sm"
          variant="secondary"
          disabled={sync.isPending}
          onClick={() => sync.mutate()}
          data-test-id="manager-queue-sync"
        >
          {sync.isPending ? t('syncing') : t('sync')}
        </Button>
      </div>

      {/* 🔴 Doimiy izoh: nazorat to'xtatmaydi (§5.1). */}
      <p className="mb-3 text-[var(--ms-text-muted)] text-xs">{t('hint')}</p>

      {sync.data && (
        <p
          className="mb-3 text-[var(--ms-text-muted)] text-xs"
          data-test-id="manager-queue-sync-result"
        >
          {t('sync_result', {
            created: sync.data.created,
            duplicates: sync.data.duplicates,
            stale: sync.data.markedStale,
          })}
        </p>
      )}

      {misconfigured.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-xs">
          {t('threshold_rejected', { rules: misconfigured.map((r) => r.ruleType).join(', ') })}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[var(--ms-text-muted)] text-xs">{t('filter_rule')}</span>
          <NativeSelect
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value)}
            className="w-56"
            aria-label={t('filter_rule')}
            data-test-id="manager-queue-rule-filter"
          >
            <option value="">{t('filter_rule_all')}</option>
            {rules.map((r) => (
              <option key={r.ruleType} value={r.ruleType}>
                {t(`rule_${r.ruleType}`)}
              </option>
            ))}
          </NativeSelect>
        </label>

        <label className="flex items-center gap-2 pb-2 text-[var(--ms-text-primary)] text-sm">
          <Checkbox
            checked={staleOnly}
            onCheckedChange={(next) => setStaleOnly(next === true)}
            data-test-id="manager-queue-stale-filter"
          />
          {t('filter_stale')}
        </label>
      </div>

      {isLoading && <p className="text-[var(--ms-text-muted)] text-sm">{t('loading')}</p>}

      {!isLoading && rows.length === 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
          <p className="font-medium text-emerald-800 text-sm">{t('empty_title')}</p>
          <p className="mt-1 text-emerald-700 text-xs">{t('empty_hint')}</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const href = docHref(row);
          return (
            <div
              key={row.id}
              data-test-id={`manager-queue-item-${row.id}`}
              className={`rounded-xl border p-4 ${
                row.staleAt ? 'border-red-200 bg-red-50/40' : 'border-[var(--ms-border)]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={workItemSeverityTone(row.severity)}>
                      {t(`severity_${row.severity}`)}
                    </Badge>
                    <Badge tone={workItemStatusTone(row.status)}>{t(`status_${row.status}`)}</Badge>
                    {row.staleAt && <Badge tone="destructive">{t('stale')}</Badge>}
                    <span className="font-medium text-[var(--ms-text-primary)] text-sm">
                      {t(`rule_${row.ruleType}`)}
                    </span>
                  </div>

                  <div className="mt-1 text-[var(--ms-text-muted)] text-xs">
                    {/* «Kim · qancha · qachon» — §5.1 ning uch savoli. */}
                    {row.subject?.name ?? t('no_subject')}
                    {' · '}
                    {row.amountMinor != null
                      ? formatMoney(BigInt(row.amountMinor), row.currency ?? 'UZS')
                      : t('amount_unmeasured')}
                    {' · '}
                    {formatDate(row.occurredAt)}
                  </div>

                  {/* §5.1 «kontekst — tendensiya, bitta hodisa emas». */}
                  {row.monthlyCount > 1 && (
                    <p className="mt-1 text-amber-700 text-xs">
                      {t('monthly_pattern', { count: row.monthlyCount })}
                    </p>
                  )}

                  {row.resolutionCode && (
                    <p className="mt-1 text-[var(--ms-text-muted)] text-xs">
                      {t('resolution')}: {t(`reason_${row.resolutionCode}`)}
                    </p>
                  )}
                </div>

                {href && (
                  <a
                    href={href}
                    className="whitespace-nowrap text-[var(--ms-brand)] text-xs hover:underline"
                  >
                    {t('open_doc')} →
                  </a>
                )}
              </div>

              {row.allowedActions.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {row.allowedActions.map((action) => (
                    <Button
                      key={action}
                      size="sm"
                      variant={action === 'acknowledge' ? 'primary' : 'secondary'}
                      disabled={act.isPending}
                      onClick={() => runAction(row, action)}
                      data-test-id={`manager-queue-action-${action}-${row.id}`}
                    >
                      {t(`action_${action}`)}
                    </Button>
                  ))}
                </div>
              )}

              {actingId === row.id && pendingAction === 'record_fine' && (
                // MK40 brauzer-QA: «Jarima yozish» hozircha FAQAT jurnalga
                // yozadi — `HrBonusFineLog` ga pul TUSHMAYDI (MK07 ochiq qarzi,
                // `manager-queue.service.ts` da ham warn bilan belgilangan).
                // Menejer element «Hal qilindi» bo'lganini ko'rib jarima
                // ushlab qolindi deb o'ylamasin: qarz ekranda ochiq turadi.
                <p
                  className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-xs"
                  data-test-id={`manager-queue-fine-not-charged-${row.id}`}
                >
                  {t('fine_not_charged_notice')}
                </p>
              )}

              {actingId === row.id && pendingAction && (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[var(--ms-text-muted)] text-xs">{t('reason')}</span>
                    <NativeSelect
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-56"
                      aria-label={t('reason')}
                      data-test-id={`manager-queue-reason-${row.id}`}
                    >
                      <option value="">{t('reason_placeholder')}</option>
                      {(row.reasonCodes?.[pendingAction] ?? []).map((code) => (
                        <option key={code} value={code}>
                          {t(`reason_${code}`)}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>

                  {/* MK20 — shablon TAKLIF qiladi; matn quyidagi maydonda
                      tahrirlanadi (majburlanmaydi). */}
                  <CommentTemplatePicker
                    action={pendingAction}
                    ruleType={row.ruleType}
                    data-test-id={`manager-queue-template-${row.id}`}
                    onPick={(pick) => {
                      setTemplateId(pick.templateId);
                      // Matn izoh maydoniga TUSHADI — bu yerdan menejer uni
                      // tahrirlaydi va jurnalga aynan shu matn ketadi.
                      setComment(pick.text ?? '');
                    }}
                  />

                  <div className="min-w-[240px] flex-1">
                    <Input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={t('comment_placeholder')}
                      data-test-id={`manager-queue-comment-${row.id}`}
                    />
                  </div>

                  <Button
                    size="sm"
                    // `other` sababida izoh MAJBURIY — BE ham shuni tekshiradi.
                    disabled={act.isPending || !reason || (reason === 'other' && !comment.trim())}
                    onClick={() =>
                      act.mutate({
                        id: row.id,
                        action: pendingAction,
                        reasonCode: reason,
                        comment: comment.trim() || undefined,
                        templateId,
                      })
                    }
                    data-test-id={`manager-queue-submit-${row.id}`}
                  >
                    {t('submit')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={closeForm}>
                    {t('cancel')}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
