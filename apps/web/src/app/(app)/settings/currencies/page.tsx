'use client';

/**
 * /settings/currencies — moysklad «Валюты» parity. Single settings
 * page: list + inline create + per-row rate edit + archive/restore +
 * delete. Server enforces the moysklad rules (валюта учёта rate fixed
 * at 1, AUTO rate is CBU-managed, system identity immutable, base /
 * system cannot be deleted); this UI surfaces those errors verbatim.
 */

import { CurrencyBulkActionsDropdown } from '@/components/currencies/bulk-actions-dropdown';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { WORLD_CURRENCIES } from '@/lib/world-currencies';
import { Badge, Button, Checkbox, Container, Input, NativeSelect, PageHeader } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface CurrencyRow {
  id: string;
  code: string;
  isoCode: string | null;
  name: string;
  fullName: string | null;
  default: boolean;
  indirect: boolean;
  system: boolean;
  rateUpdateType: 'AUTO' | 'MANUAL';
  rate: string;
  archived: boolean;
}

interface ListResp {
  items: CurrencyRow[];
  total: number;
}

const EMPTY_FORM = {
  // moysklad parity: pick a currency from the reference (auto-fills code/iso/name)
  // — `iso` is the chosen WORLD_CURRENCIES isoCode; no free-typed code/name.
  iso: '',
  rate: '1',
  rateUpdateType: 'MANUAL' as 'AUTO' | 'MANUAL',
  indirect: false,
};

export default function CurrenciesPage() {
  const t = useTranslations('pages.currencies');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editRate, setEditRate] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const clearSelection = () => setSelectedIds(new Set());
  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const listQueryKey = ['currencies'] as const;
  const { data, isLoading } = useQuery<ListResp>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResp>('/currencies'),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['currencies'] });
  const onErr = (e: Error) => setError(e.message);

  const createMut = useMutation({
    mutationFn: () => {
      // The user PICKED a currency — send its canonical code (ISO numeric) /
      // isoCode (ISO alpha) / name from the reference, so a malformed/garbage row
      // (swapped code↔iso, wrong name) can't be created.
      const cur = WORLD_CURRENCIES.find((w) => w.isoCode === form.iso);
      if (!cur) throw new Error('no currency selected');
      return api.post('/currencies', {
        code: cur.code,
        isoCode: cur.isoCode,
        name: cur.name,
        fullName: cur.fullName,
        rate: form.rate || '1',
        rateUpdateType: form.rateUpdateType,
        indirect: form.indirect,
      });
    },
    onSuccess: () => {
      invalidate();
      setAdding(false);
      setForm({ ...EMPTY_FORM });
    },
    onError: onErr,
  });

  const patchMut = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/currencies/${v.id}`, v.body),
    onSuccess: () => {
      invalidate();
      setEditRate({});
    },
    onError: onErr,
  });

  const archiveMut = useMutation({
    mutationFn: (v: { id: string; archived: boolean }) =>
      api.post(`/currencies/${v.id}/${v.archived ? 'restore' : 'archive'}`, {}),
    onSuccess: invalidate,
    onError: onErr,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/currencies/${id}`),
    onSuccess: invalidate,
    onError: onErr,
  });

  const rows = data?.items ?? [];
  // moysklad parity: offer only currencies not already added (by alpha or numeric
  // code) — and only ones the money layer can format (WORLD_CURRENCIES).
  const addedKeys = new Set(rows.flatMap((r) => [r.isoCode, r.code].filter(Boolean)));
  const available = WORLD_CURRENCIES.filter(
    (w) => !addedKeys.has(w.isoCode) && !addedKeys.has(w.code),
  );

  return (
    <Container size="lg" className="py-4">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="mb-3 flex items-center gap-3">
        <Button
          onClick={() => {
            setError(null);
            setAdding((v) => !v);
          }}
          data-test-id="currency-add-toggle"
        >
          {t('add_button')}
        </Button>
        {/* moysklad parity: «N | Изменить ▾» bulk-actions surface. */}
        <span
          className="text-[var(--ms-text-muted)] text-sm tabular-nums"
          data-test-id="currency-selection-count"
        >
          {selectedIds.size}
        </span>
        <CurrencyBulkActionsDropdown
          selectedIds={selectedIds}
          listQueryKey={listQueryKey}
          onClearSelection={clearSelection}
        />
        {error && (
          <span className="text-[var(--ms-text-destructive)] text-sm" data-test-id="currency-error">
            {error}
          </span>
        )}
      </div>

      {adding && (
        <div
          className="mb-4 grid grid-cols-2 gap-3 rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 md:grid-cols-3"
          data-test-id="currency-create-form"
        >
          {/* moysklad «Добавить валюту» — pick from the world-currency reference;
            code / iso-code / name auto-fill (no free-typing → no malformed rows). */}
          <div className="flex flex-col gap-1 text-sm md:col-span-2">
            <label htmlFor="cur-pick" className="text-[var(--ms-text-muted)]">
              {t('field_currency')}
            </label>
            <NativeSelect
              id="cur-pick"
              value={form.iso}
              onChange={(e) => setForm((f) => ({ ...f, iso: e.target.value }))}
              data-test-id="currency-field-pick"
            >
              <option value="">—</option>
              {available.map((w) => (
                <option key={w.isoCode} value={w.isoCode}>
                  {w.name} ({w.isoCode})
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="cur-rate" className="text-[var(--ms-text-muted)]">
              {t('field_rate')}
            </label>
            <Input
              id="cur-rate"
              value={form.rate}
              inputMode="decimal"
              onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
              className="text-right"
              data-test-id="currency-field-rate"
            />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="cur-rateupdate" className="text-[var(--ms-text-muted)]">
              {t('field_rateupdate')}
            </label>
            <NativeSelect
              id="cur-rateupdate"
              value={form.rateUpdateType}
              onChange={(e) =>
                setForm((f) => ({ ...f, rateUpdateType: e.target.value as 'AUTO' | 'MANUAL' }))
              }
              className="w-auto"
              data-test-id="currency-field-rateupdate"
            >
              <option value="MANUAL">{t('type_manual')}</option>
              <option value="AUTO">{t('type_auto')}</option>
            </NativeSelect>
          </div>
          <label
            htmlFor="cur-indirect"
            className="col-span-2 flex items-center gap-2 text-sm md:col-span-3"
          >
            <Checkbox
              id="cur-indirect"
              checked={form.indirect}
              onCheckedChange={(v) => setForm((f) => ({ ...f, indirect: v === true }))}
              data-test-id="currency-field-indirect"
            />
            <span>{t('field_indirect')}</span>
          </label>
          <div className="col-span-2 flex gap-2 md:col-span-3">
            <Button
              onClick={() => {
                setError(null);
                createMut.mutate();
              }}
              disabled={createMut.isPending || !form.iso}
              data-test-id="currency-create-submit"
            >
              {t('save')}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-[var(--ms-text-muted)] text-sm">…</div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-8 text-center text-[var(--ms-text-muted)] text-sm">
          {t('empty_title')}
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              <tr>
                <th className="h-9 w-10 px-3 text-left font-medium">
                  <Checkbox
                    aria-label={tCommon('select_all')}
                    checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.id))}
                    onCheckedChange={(v) => {
                      if (v === true) setSelectedIds(new Set(rows.map((r) => r.id)));
                      else clearSelection();
                    }}
                    data-test-id="currency-select-all"
                  />
                </th>
                <th className="h-9 px-3 text-left font-medium">{t('col_code')}</th>
                <th className="h-9 px-3 text-left font-medium">{t('col_name')}</th>
                <th className="h-9 px-3 text-right font-medium">{t('col_rate')}</th>
                <th className="h-9 px-3 text-left font-medium">{t('col_type')}</th>
                <th className="h-9 px-3 text-left font-medium">{t('col_flags')}</th>
                <th className="h-9 px-3 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const rateLocked = c.default || c.rateUpdateType === 'AUTO';
                const editing = editRate[c.id] !== undefined;
                return (
                  <tr
                    key={c.id}
                    className="border-[var(--ms-border-default)] border-t"
                    data-test-id={`currency-row-${c.code}`}
                  >
                    <td className="px-3 py-2">
                      <Checkbox
                        aria-label={c.name}
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={() => toggleRow(c.id)}
                        data-test-id={`currency-select-${c.code}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-semibold tabular-nums">{c.code}</td>
                    <td className="px-3 py-2">
                      {c.name}
                      {c.archived && (
                        <Badge tone={archivedTone(c.archived)} className="ml-2">
                          {tCommon('archived')}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {editing ? (
                        <span className="flex items-center justify-end gap-1">
                          <Input
                            value={editRate[c.id]}
                            inputMode="decimal"
                            onChange={(e) => setEditRate((m) => ({ ...m, [c.id]: e.target.value }))}
                            className="h-7 w-28 text-right"
                            data-test-id={`currency-rate-input-${c.code}`}
                          />
                          <Button
                            size="icon-sm"
                            onClick={() => {
                              setError(null);
                              patchMut.mutate({ id: c.id, body: { rate: editRate[c.id] } });
                            }}
                            aria-label={t('save')}
                          >
                            ✓
                          </Button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={rateLocked}
                          title={
                            c.default
                              ? t('rate_locked_default')
                              : c.rateUpdateType === 'AUTO'
                                ? t('rate_locked_auto')
                                : t('edit')
                          }
                          onClick={() => setEditRate((m) => ({ ...m, [c.id]: c.rate }))}
                          className={
                            rateLocked
                              ? 'cursor-default text-[var(--ms-text-muted)]'
                              : 'underline-offset-2 hover:underline'
                          }
                          data-test-id={`currency-rate-${c.code}`}
                        >
                          {c.rate}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                      {c.rateUpdateType === 'AUTO' ? t('type_auto') : t('type_manual')}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap gap-1">
                        {c.default && <Badge tone="success">{t('badge_default')}</Badge>}
                        {c.system && <Badge tone="neutral">{t('badge_system')}</Badge>}
                        {c.indirect && <Badge tone="warning">1/x</Badge>}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!c.default && (
                        <span className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setError(null);
                              archiveMut.mutate({ id: c.id, archived: c.archived });
                            }}
                            data-test-id={`currency-archive-${c.code}`}
                          >
                            {c.archived ? t('restore') : t('archive')}
                          </Button>
                          {!c.system && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setError(null);
                                deleteMut.mutate(c.id);
                              }}
                              data-test-id={`currency-delete-${c.code}`}
                            >
                              {t('delete')}
                            </Button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
