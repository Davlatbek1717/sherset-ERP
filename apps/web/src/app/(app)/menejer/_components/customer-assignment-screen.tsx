'use client';

/**
 * Mijoz taqsimoti — egasini o'zgartirish + TARIX (MK38 · 4-bo'lim TZ §6).
 *
 * SAVOL: «qaysi mijoz kimga biriktirilgan, kim ortiqcha yuklangan va erkin
 * havzada nima qoldi».
 *
 * 🔴 Egalik o'zgarishi HAR DOIM tarixga tushadi (`audit_log`) — o'zgartirish
 * `CounterpartyService.bulkUpdate` orqali ketadi, ya'ni bu ekran o'zining
 * ikkinchi yozuv yo'lini ochmaydi.
 *
 * «Egasiz qilish» va «tegmaslik» — IKKI BOSHQA amal: havzaga qaytarish
 * ataylab alohida tanlov.
 *
 * MK17 «Yo'qolgan mijozlar» SHU ekranning ikkinchi bo'limi sifatida yashaydi —
 * reja ikkinchi mijoz ekranini qurishni ataylab taqiqladi.
 */

import {
  type CustomerDistribution,
  type ManagerCustomerRow,
  type OwnerHistoryEvent,
  managerCustomersApi,
} from '@/lib/manager-customers-api';
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
import { LostCustomersPanel } from './lost-customers-panel';

/** Havzaga qaytarish — `<select>` da bo'sh qiymat bilan ifodalanadi. */
const POOL = '';

type Tab = 'assignment' | 'lost';

export function CustomerAssignmentScreen() {
  const t = useTranslations('pages.menejer');
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>('assignment');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string>(POOL);
  const [historyFor, setHistoryFor] = useState<ManagerCustomerRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{
    rows: ManagerCustomerRow[];
    distribution: CustomerDistribution;
  }>({
    queryKey: ['manager-customers', ownerFilter, unassignedOnly, search],
    queryFn: () =>
      managerCustomersApi.list({
        ownerId: ownerFilter || undefined,
        unassigned: unassignedOnly || undefined,
        search: search || undefined,
        limit: 200,
      }),
    // Ikkinchi bo'lim ochilganda taqsimot ro'yxati bekorga so'ralmaydi.
    enabled: tab === 'assignment',
  });

  const reassign = useMutation({
    mutationFn: () => managerCustomersApi.reassign([...selected], target === POOL ? null : target),
    onSuccess: (res) => {
      setSelected(new Set());
      setError(res.failed.length ? t('ca_partial_failure', { count: res.failed.length }) : null);
      void qc.invalidateQueries({ queryKey: ['manager-customers'] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : t('ca_save_failed')),
  });

  const owners = data?.distribution.owners ?? [];
  const rows = data?.rows ?? [];

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-semibold text-[var(--ms-text-strong)] text-xl">{t('ca_title')}</h1>
        <p className="text-[var(--ms-text-muted)] text-sm">{t('ca_subtitle')}</p>
      </header>

      {/* ── Ikki bo'lim: taqsimot (MK38) va yo'qolganlar (MK17) ───────── */}
      <div className="flex gap-1 border-[var(--ms-border)] border-b" data-test-id="ca-tabs">
        {(['assignment', 'lost'] as const).map((key) => (
          <button
            key={key}
            type="button"
            data-test-id={`ca-tab-${key}`}
            aria-selected={tab === key}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${
              tab === key
                ? 'border-[var(--ms-accent,#1a73e8)] text-[var(--ms-text-strong)]'
                : 'border-transparent text-[var(--ms-text-muted)]'
            }`}
            onClick={() => setTab(key)}
          >
            {key === 'assignment' ? t('ca_tab_assignment') : t('ca_tab_lost')}
          </button>
        ))}
      </div>

      {tab === 'lost' ? (
        <LostCustomersPanel />
      ) : isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {/* ── Havza manzarasi: butun baza bo'yicha, filtrdan MUSTAQIL ─── */}
          <div className="flex flex-wrap gap-2" data-test-id="ca-distribution">
            <Badge tone="neutral">{t('ca_total', { count: data.distribution.total })}</Badge>
            <Badge tone={data.distribution.unassigned > 0 ? 'warning' : 'neutral'}>
              {t('ca_unassigned', { count: data.distribution.unassigned })}
            </Badge>
            {owners.slice(0, 8).map((o) => (
              <Badge key={o.ownerId} tone="info" data-test-id={`ca-owner-${o.ownerId}`}>
                {o.name}: {o.count}
              </Badge>
            ))}
          </div>

          {/* ── Filtrlar ────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--ms-text-muted)] text-xs">{t('ca_filter_owner')}</span>
              <NativeSelect
                value={ownerFilter}
                data-test-id="ca-filter-owner"
                onChange={(e) => {
                  setOwnerFilter(e.target.value);
                  setUnassignedOnly(false);
                }}
              >
                <option value="">{t('ca_filter_all')}</option>
                {owners.map((o) => (
                  <option key={o.ownerId} value={o.ownerId}>
                    {o.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={unassignedOnly}
                data-test-id="ca-filter-unassigned"
                onCheckedChange={(v) => {
                  const on = Boolean(v);
                  setUnassignedOnly(on);
                  if (on) setOwnerFilter('');
                }}
              />
              <span>{t('ca_filter_unassigned')}</span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--ms-text-muted)] text-xs">{t('ca_search')}</span>
              <Input
                value={search}
                data-test-id="ca-search"
                onChange={(e) => setSearch(e.target.value)}
                className="w-56"
              />
            </label>
          </div>

          {/* ── Ommaviy amal ────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-[var(--ms-border)] p-3">
            <span className="text-sm" data-test-id="ca-selected">
              {t('ca_selected', { count: selected.size })}
            </span>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--ms-text-muted)] text-xs">{t('ca_new_owner')}</span>
              <NativeSelect
                value={target}
                data-test-id="ca-target-owner"
                onChange={(e) => setTarget(e.target.value)}
              >
                {/* Havzaga qaytarish — ATAYLAB alohida tanlov, «tegmaslik»
                    bilan aralashmasin. */}
                <option value={POOL}>{t('ca_to_pool')}</option>
                {owners.map((o) => (
                  <option key={o.ownerId} value={o.ownerId}>
                    {o.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Button
              size="sm"
              disabled={selected.size === 0 || reassign.isPending}
              data-test-id="ca-reassign"
              onClick={() => reassign.mutate()}
            >
              {t('ca_reassign')}
            </Button>
          </div>

          {error && (
            <p className="text-[var(--ms-text-danger,#c00)] text-sm" data-test-id="ca-error">
              {error}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ms-text-muted)]">
                  <th className="w-8 py-1 pr-3 font-normal"> </th>
                  <th className="py-1 pr-3 font-normal">{t('ca_col_customer')}</th>
                  <th className="py-1 pr-3 font-normal">{t('ca_col_owner')}</th>
                  <th className="py-1 pr-3 font-normal">{t('ca_col_phone')}</th>
                  <th className="py-1 font-normal"> </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3">
                      <EmptyState title={t('ca_empty')} />
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-[var(--ms-border)] border-t"
                    data-test-id={`ca-row-${row.id}`}
                  >
                    <td className="py-1 pr-3">
                      <Checkbox
                        checked={selected.has(row.id)}
                        data-test-id={`ca-check-${row.id}`}
                        onCheckedChange={() => toggle(row.id)}
                      />
                    </td>
                    <td className="py-1 pr-3">{row.name}</td>
                    <td className="py-1 pr-3">
                      {row.ownerName ?? (
                        <span className="text-[var(--ms-text-muted)] italic">
                          {t('ca_no_owner')}
                        </span>
                      )}
                    </td>
                    <td className="py-1 pr-3">{row.phone ?? '—'}</td>
                    <td className="py-1">
                      <button
                        type="button"
                        className="text-[var(--ms-text-muted)] text-xs underline"
                        data-test-id={`ca-history-${row.id}`}
                        onClick={() => setHistoryFor(row)}
                      >
                        {t('ca_history')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <HistoryModal row={historyFor} onClose={() => setHistoryFor(null)} />
    </div>
  );
}

function HistoryModal({
  row,
  onClose,
}: {
  row: ManagerCustomerRow | null;
  onClose: () => void;
}) {
  const t = useTranslations('pages.menejer');
  const q = useQuery<{ counterpartyId: string; events: OwnerHistoryEvent[] }>({
    queryKey: ['manager-customers', 'history', row?.id],
    queryFn: () => managerCustomersApi.ownerHistory(row?.id ?? ''),
    enabled: !!row,
  });

  return (
    <Modal
      open={!!row}
      onOpenChange={(v) => !v && onClose()}
      title={t('ca_history_title')}
      description={row?.name}
      widthClass="w-[640px]"
      scrollableBody
    >
      {q.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !q.data || q.data.events.length === 0 ? (
        // Tarix yo'qligi — «hech qachon o'zgarmagan» degani; yashirin xato
        // emasligini ochiq aytamiz.
        <EmptyState title={t('ca_history_empty')} description={t('ca_history_empty_hint')} />
      ) : (
        <ul className="divide-y divide-[var(--ms-border)] text-sm">
          {q.data.events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 py-1">
              <span className="tabular-nums text-[var(--ms-text-muted)] text-xs">
                {formatStamp(e.at)}
              </span>
              <span>
                {e.fromOwnerName ?? t('ca_no_owner')} → {e.toOwnerName ?? t('ca_no_owner')}
              </span>
              <span className="text-[var(--ms-text-muted)] text-xs">
                {e.actorName ?? t('ca_actor_system')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
