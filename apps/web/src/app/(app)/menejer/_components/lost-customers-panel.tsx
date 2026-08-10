'use client';

/**
 * MK17 — «Yo'qolgan mijozlar» signali (4M TZ §8.1/3).
 *
 * SAVOL: «kim ilgari sotib olardi va endi to'xtadi, kim javobgar va nega
 * ketdi».
 *
 * 🔴 Bu ekran MK38 «Mijoz taqsimoti» ning ICHIDA yashaydi — ikkinchi mijoz
 * ekrani qurilmadi (reja shuni aniq talab qildi).
 *
 * Uch shartnoma ekranda KO'RINADI:
 *  · «Hech qachon xarid qilmagan» mijoz yo'qolgan EMAS — u alohida sanaladi;
 *  · davr sozlanadi va sozlama qayerdan kelgani ochiq (registr sukutimi yoki
 *    akkaunt sozlamasimi);
 *  · yo'qolish davri egalik taymeridan uzun bo'lsa — OGOHLANTIRISH, jimgina
 *    bo'sh jadval emas.
 */

import {
  LOST_REASON_CODES,
  type LostCustomerResult,
  type LostCustomerRow,
  type LostReasonCode,
  managerCustomersApi,
} from '@/lib/manager-customers-api';
import { managerThresholdsApi } from '@/lib/manager-thresholds-api';
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Input,
  Modal,
  NativeSelect,
  Skeleton,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function LostCustomersPanel() {
  const t = useTranslations('pages.menejer');
  const qc = useQueryClient();

  const [ownerFilter, setOwnerFilter] = useState('');
  const [unmarkedOnly, setUnmarkedOnly] = useState(false);
  const [markFor, setMarkFor] = useState<LostCustomerRow | null>(null);
  /**
   * `null` = maydonga TEGILMAGAN (registrdagi qiymat ko'rinadi) · `''` =
   * foydalanuvchi tozalagan. Ikkalasini bitta `''` bilan ifodalash — maydonni
   * tozalagach yana sukut qiymat chiqib, terilgan raqam unga YOPISHIB
   * ketishini bildirardi («60» + «45» = «6045»).
   */
  const [periodDraft, setPeriodDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<LostCustomerResult>({
    queryKey: ['manager-lost-customers', ownerFilter, unmarkedOnly],
    queryFn: () =>
      managerCustomersApi.lost({
        scope: 'lost',
        ownerId: ownerFilter || undefined,
        unmarkedOnly: unmarkedOnly || undefined,
        limit: 200,
      }),
  });

  const savePeriod = useMutation({
    mutationFn: (days: number) =>
      managerThresholdsApi.update('LOST_CUSTOMER_DAYS', { value: days }),
    onSuccess: () => {
      setError(null);
      setPeriodDraft(null);
      void qc.invalidateQueries({ queryKey: ['manager-lost-customers'] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : t('lc_save_failed')),
  });

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const { config, summary, rows } = data;

  return (
    <div className="space-y-4">
      {/* ── Davr sozlamasi — registrdan, ikkinchi manba yo'q ──────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-[var(--ms-border)] p-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--ms-text-muted)] text-xs">{t('lc_period_label')}</span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              className="w-24"
              data-test-id="lc-period"
              value={periodDraft ?? String(config.lostDays)}
              onChange={(e) => setPeriodDraft(e.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              data-test-id="lc-period-save"
              disabled={
                periodDraft === null ||
                periodDraft.trim() === '' ||
                !Number.isFinite(Number(periodDraft)) ||
                savePeriod.isPending
              }
              onClick={() => savePeriod.mutate(Number(periodDraft))}
            >
              {t('lc_period_save')}
            </Button>
          </div>
        </label>
        <p className="max-w-md text-[var(--ms-text-muted)] text-xs" data-test-id="lc-period-source">
          {config.lostDaysConfigured ? t('lc_period_configured') : t('lc_period_default')}
        </p>
      </div>

      {/* Sozlama rad etilgan bo'lsa — jimgina sukut qo'llanmaydi, aytiladi. */}
      {config.lostDaysRejectReason && (
        <p className="text-[var(--ms-text-danger,#c00)] text-sm" data-test-id="lc-reject">
          {t('lc_period_rejected', { reason: config.lostDaysRejectReason })}
        </p>
      )}

      {/* Signal o'chirilgan bo'lsa bo'sh jadval SABABI bilan ko'rsatiladi. */}
      {!config.lostSignalEnabled && (
        <p className="text-[var(--ms-text-muted)] text-sm" data-test-id="lc-disabled">
          {t('lc_signal_disabled')}
        </p>
      )}

      {/* 🔴 Davr egalik taymeridan uzun — kesim strukturaviy bo'sh chiqadi. */}
      {summary.ownershipConflict && (
        <p className="text-[var(--ms-text-danger,#c00)] text-sm" data-test-id="lc-conflict">
          {t('lc_ownership_conflict', {
            lost: config.lostDays,
            release: config.ownershipReleaseDays ?? 0,
          })}
        </p>
      )}

      {/* ── Manzara ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2" data-test-id="lc-summary">
        <Badge tone={summary.lostCount > 0 ? 'warning' : 'neutral'}>
          {t('lc_lost_count', { count: summary.lostCount })}
        </Badge>
        <Badge tone="neutral">{t('lc_active_count', { count: summary.activeCount })}</Badge>
        {/* «Hech qachon xarid qilmagan» — yo'qolgan EMAS, alohida holat. */}
        <Badge tone="neutral">{t('lc_never_count', { count: summary.neverPurchasedCount })}</Badge>
        <Badge tone={summary.unmarkedCount > 0 ? 'info' : 'neutral'}>
          {t('lc_unmarked_count', { count: summary.unmarkedCount })}
        </Badge>
        {summary.releaseDueCount > 0 && (
          <Badge tone="warning" data-test-id="lc-release-due">
            {t('lc_release_due', { count: summary.releaseDueCount })}
          </Badge>
        )}
      </div>

      {/* ── Sotuvchi kesimi ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2" data-test-id="lc-by-owner">
        {summary.byOwner.map((o) => (
          <Badge key={o.ownerId ?? 'pool'} tone="info">
            {o.ownerName ?? t('ca_no_owner')}: {o.lostCount}
          </Badge>
        ))}
      </div>

      {/* ── Sabab taqsimoti ──────────────────────────────────────────── */}
      {summary.byReason.length > 0 && (
        <div className="flex flex-wrap gap-2" data-test-id="lc-by-reason">
          {summary.byReason.map((r) => (
            <Badge key={r.code} tone="neutral">
              {t(`lc_reason_${r.code}`)}: {r.count}
            </Badge>
          ))}
        </div>
      )}

      {/* ── Filtrlar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--ms-text-muted)] text-xs">{t('ca_filter_owner')}</span>
          <NativeSelect
            value={ownerFilter}
            data-test-id="lc-filter-owner"
            onChange={(e) => setOwnerFilter(e.target.value)}
          >
            <option value="">{t('ca_filter_all')}</option>
            {summary.byOwner
              .filter((o) => o.ownerId)
              .map((o) => (
                <option key={o.ownerId} value={o.ownerId ?? ''}>
                  {o.ownerName}
                </option>
              ))}
          </NativeSelect>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={unmarkedOnly}
            data-test-id="lc-filter-unmarked"
            onCheckedChange={(v) => setUnmarkedOnly(Boolean(v))}
          />
          <span>{t('lc_filter_unmarked')}</span>
        </label>
      </div>

      {error && (
        <p className="text-[var(--ms-text-danger,#c00)] text-sm" data-test-id="lc-error">
          {error}
        </p>
      )}

      {data.truncated && (
        <p className="text-[var(--ms-text-muted)] text-xs" data-test-id="lc-truncated">
          {t('lc_truncated', { shown: rows.length, total: data.totalCount })}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--ms-text-muted)]">
              <th className="py-1 pr-3 font-normal">{t('ca_col_customer')}</th>
              <th className="py-1 pr-3 font-normal">{t('lc_col_inactive')}</th>
              <th className="py-1 pr-3 font-normal">{t('lc_col_last_purchase')}</th>
              <th className="py-1 pr-3 font-normal">{t('ca_col_owner')}</th>
              <th className="py-1 pr-3 font-normal">{t('lc_col_reason')}</th>
              <th className="py-1 font-normal"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3">
                  <EmptyState title={t('lc_empty')} description={t('lc_empty_hint')} />
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.counterpartyId}
                className="border-[var(--ms-border)] border-t"
                data-test-id={`lc-row-${row.counterpartyId}`}
              >
                <td className="py-1 pr-3">{row.name}</td>
                <td className="py-1 pr-3 tabular-nums">
                  {/* NULL ≠ 0 — xaridsiz mijozda kun ko'rsatilmaydi. */}
                  {row.inactiveDays === null ? '—' : t('lc_days', { count: row.inactiveDays })}
                </td>
                <td className="py-1 pr-3">{formatDay(row.lastPurchaseAt)}</td>
                <td className="py-1 pr-3">
                  {row.ownerName ?? (
                    <span className="text-[var(--ms-text-muted)] italic">{t('ca_no_owner')}</span>
                  )}
                  {row.releaseDue && (
                    <span
                      className="ml-1 text-[var(--ms-text-muted)] text-xs"
                      data-test-id={`lc-release-${row.counterpartyId}`}
                    >
                      {t('lc_release_mark')}
                    </span>
                  )}
                </td>
                <td className="py-1 pr-3">
                  {row.reasonCode ? (
                    t(`lc_reason_${row.reasonCode}`)
                  ) : row.reasonRaw ? (
                    // Tanilmagan kod jimgina «belgilanmagan» ga aylanmaydi.
                    <span className="text-[var(--ms-text-muted)]">{row.reasonRaw}</span>
                  ) : (
                    <span className="text-[var(--ms-text-muted)] italic">{t('lc_no_reason')}</span>
                  )}
                </td>
                <td className="py-1">
                  <button
                    type="button"
                    className="text-[var(--ms-text-muted)] text-xs underline"
                    data-test-id={`lc-mark-${row.counterpartyId}`}
                    onClick={() => setMarkFor(row)}
                  >
                    {t('lc_mark')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MarkReasonModal row={markFor} onClose={() => setMarkFor(null)} />
    </div>
  );
}

function MarkReasonModal({
  row,
  onClose,
}: {
  row: LostCustomerRow | null;
  onClose: () => void;
}) {
  const t = useTranslations('pages.menejer');
  const qc = useQueryClient();
  const [code, setCode] = useState<LostReasonCode>('price');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      managerCustomersApi.markLostReason(row?.counterpartyId ?? '', code, note || null),
    onSuccess: () => {
      setNote('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['manager-lost-customers'] });
      onClose();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : t('lc_save_failed')),
  });

  return (
    <Modal
      open={!!row}
      onOpenChange={(v) => !v && onClose()}
      title={t('lc_mark_title')}
      description={row?.name}
      widthClass="w-[520px]"
    >
      <div className="space-y-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--ms-text-muted)] text-xs">{t('lc_col_reason')}</span>
          <NativeSelect
            value={code}
            data-test-id="lc-reason-select"
            onChange={(e) => setCode(e.target.value as LostReasonCode)}
          >
            {LOST_REASON_CODES.map((c) => (
              <option key={c} value={c}>
                {t(`lc_reason_${c}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--ms-text-muted)] text-xs">{t('lc_note')}</span>
          <Input
            value={note}
            data-test-id="lc-reason-note"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {error && <p className="text-[var(--ms-text-danger,#c00)] text-sm">{error}</p>}
        <Button
          size="sm"
          data-test-id="lc-reason-save"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {t('lc_mark_save')}
        </Button>
      </div>
    </Modal>
  );
}

function formatDay(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
