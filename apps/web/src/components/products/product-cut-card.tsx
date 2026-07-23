'use client';

/**
 * «Отрезы» card + «Раскрой» modal — USER-DIRECTED meter-goods feature
 * (2026-07-04, NOT moysklad parity; sibling of the «Место хранения» card).
 *
 * A meter-good (труба 4м) is stocked in pieces; cutting one produces shorter
 * remnant pieces that must stay visible. The card is a READ-ONLY table of the
 * product's remnant family (GET /products/:id/cuts — remnant products keyed by
 * attributes.cutSourceId, stock from the Stock engine, documents-only so it
 * can't drift). The modal posts /products/:id/cut, which books a POSTED
 * Списание (consumed pieces) + Оприходование (remnant pieces) atomically.
 *
 * Length math mirrors the BE: exact integer millimeters, no floats.
 */

import { CellPickerField } from '@/components/documents/cell-picker-field';
import { ProductFormCard } from '@/components/product-form-layout';
import { api } from '@/lib/api-client';
import { Button, FormField, Input, Modal, NativeSelect } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface CutItem {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  lengthM: string | null;
  qty: string;
}
interface CutsResponse {
  root: { id: string; name: string } | null;
  sourceLengthM: string | null;
  items: CutItem[];
}
interface RefRow {
  id: string;
  name: string;
}

/** "2.5" → integer millimeters (null on malformed input) — mirrors the BE parser. */
function lengthToMm(s: string): number | null {
  const m = /^(\d{1,5})(?:\.(\d{1,3}))?$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0') || '0');
}
function mmToLength(mm: number): string {
  const whole = Math.floor(mm / 1000);
  const frac = String(mm % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}

interface PieceRow {
  lengthM: string;
  quantity: string;
  cellId: string | null;
  cellLabel: string | null;
}

export function ProductCutCard({ productId }: { productId: string }) {
  const t = useTranslations('pages.product_new');
  const queryClient = useQueryClient();

  const cutsQuery = useQuery<CutsResponse>({
    queryKey: ['product-cuts', productId],
    queryFn: () => api.get<CutsResponse>(`/products/${productId}/cuts`),
  });
  const items = cutsQuery.data?.items ?? [];
  const root = cutsQuery.data?.root ?? null;
  const isRemnant = !!root && root.id !== productId;

  const [open, setOpen] = useState(false);

  // Total remnant meters (qty × length), exact mm math.
  const totalMm = items.reduce((acc, i) => {
    const mm = i.lengthM ? lengthToMm(i.lengthM) : null;
    return mm ? acc + mm * (Number(i.qty) || 0) : acc;
  }, 0);

  return (
    <ProductFormCard title={t('section_cuts')} testId="card-cuts">
      <div className="flex flex-col gap-3">
        {isRemnant && root && (
          <p className="text-sm" data-test-id="cuts-root-link">
            <span className="text-[var(--ms-text-muted)]">{t('cuts_root')}: </span>
            <Link href={`/products/${root.id}`} className="text-[var(--ms-text-brand)]">
              {root.name}
            </Link>
          </p>
        )}

        {items.length === 0 ? (
          <p className="text-[var(--ms-text-muted)] text-sm" data-test-id="cuts-empty">
            {t('cuts_empty')}
          </p>
        ) : (
          <table className="w-full border-collapse text-sm" data-test-id="cuts-table">
            <thead>
              <tr className="border-[var(--ms-text-brand)] border-b-2">
                <th className="px-2 pb-1.5 text-left align-bottom font-normal text-[var(--ms-text-brand)] text-xs">
                  {t('cuts_col_name')}
                </th>
                <th className="px-2 pb-1.5 text-right align-bottom font-normal text-[var(--ms-text-brand)] text-xs">
                  {t('cuts_col_length')}
                </th>
                <th className="px-2 pb-1.5 text-right align-bottom font-normal text-[var(--ms-text-brand)] text-xs">
                  {t('cuts_col_qty')}
                </th>
                <th className="px-2 pb-1.5 text-right align-bottom font-normal text-[var(--ms-text-brand)] text-xs">
                  {t('cuts_col_meters')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const mm = i.lengthM ? lengthToMm(i.lengthM) : null;
                const meters = mm ? mmToLength(mm * (Number(i.qty) || 0)) : '—';
                return (
                  <tr
                    key={i.id}
                    className="border-[var(--ms-border-default)] border-b last:border-0"
                    data-test-id="cuts-row"
                  >
                    <td className="px-2 py-1.5">
                      {i.id === productId ? (
                        <span className="font-medium">{i.name}</span>
                      ) : (
                        <Link href={`/products/${i.id}`} className="text-[var(--ms-text-brand)]">
                          {i.name}
                        </Link>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{i.lengthM ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{i.qty}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{meters}</td>
                  </tr>
                );
              })}
              <tr>
                <td className="px-2 py-1.5 font-semibold">{t('cuts_total')}</td>
                <td className="px-2 py-1.5" />
                <td className="px-2 py-1.5" />
                <td
                  className="px-2 py-1.5 text-right font-semibold tabular-nums"
                  data-test-id="cuts-total-meters"
                >
                  {mmToLength(totalMm)}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(true)}
            data-test-id="cuts-open-modal"
          >
            {t('cuts_button')}
          </Button>
        </div>
      </div>

      {open && (
        <CutModal
          productId={productId}
          prefillLength={
            items.find((i) => i.id === productId)?.lengthM ?? cutsQuery.data?.sourceLengthM ?? ''
          }
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['product-cuts', productId] });
            void queryClient.invalidateQueries({ queryKey: ['product-cell-stock', productId] });
            void queryClient.invalidateQueries({ queryKey: ['product', productId] });
          }}
        />
      )}
    </ProductFormCard>
  );
}

function CutModal({
  productId,
  prefillLength,
  onClose,
  onDone,
}: {
  productId: string;
  prefillLength: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('pages.product_new');
  const tCommon = useTranslations('common');

  const orgsQuery = useQuery<{ items: RefRow[] }>({
    queryKey: ['organizations-for-cut'],
    queryFn: () => api.get<{ items: RefRow[] }>('/organizations?limit=100'),
  });
  const storesQuery = useQuery<{ items: RefRow[] }>({
    queryKey: ['stores-for-cut'],
    queryFn: () => api.get<{ items: RefRow[] }>('/stores?limit=100'),
  });

  const [organizationId, setOrganizationId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [consumedQty, setConsumedQty] = useState('1');
  const [sourceLengthM, setSourceLengthM] = useState(prefillLength);
  const [sourceCellId, setSourceCellId] = useState<string | null>(null);
  const [sourceCellLabel, setSourceCellLabel] = useState<string | null>(null);
  const [pieces, setPieces] = useState<PieceRow[]>([
    { lengthM: '', quantity: '1', cellId: null, cellLabel: null },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const first = orgsQuery.data?.items[0];
    if (first && !organizationId) setOrganizationId(first.id);
  }, [orgsQuery.data, organizationId]);
  useEffect(() => {
    const first = storesQuery.data?.items[0];
    if (first && !storeId) setStoreId(first.id);
  }, [storesQuery.data, storeId]);

  // Live budget line — the same arithmetic the BE enforces.
  const srcMm = lengthToMm(sourceLengthM);
  const qtyN = Number.parseInt(consumedQty, 10) || 0;
  const budgetMm = srcMm && qtyN > 0 ? srcMm * qtyN : null;
  let usedMm = 0;
  let piecesValid = pieces.length > 0;
  for (const p of pieces) {
    const mm = lengthToMm(p.lengthM);
    const q = Number.parseInt(p.quantity, 10) || 0;
    if (!mm || q <= 0 || (srcMm != null && mm >= srcMm)) {
      piecesValid = false;
      continue;
    }
    usedMm += mm * q;
  }
  const overBudget = budgetMm != null && usedMm > budgetMm;
  const canSubmit =
    !saving && !!organizationId && !!storeId && !!srcMm && qtyN > 0 && piecesValid && !overBudget;

  const setPiece = (idx: number, patch: Partial<PieceRow>) => {
    setPieces((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/products/${productId}/cut`, {
        organizationId,
        storeId,
        consumedQty: qtyN,
        sourceLengthM,
        sourceCellId,
        pieces: pieces.map((p) => ({
          lengthM: p.lengthM,
          quantity: Number.parseInt(p.quantity, 10) || 0,
          cellId: p.cellId,
        })),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message || t('cut_error_generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={t('cut_modal_title')}
      widthClass="w-[560px]"
      closeLabel={tCommon('close')}
      testId="cut-modal"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-[var(--ms-text-muted)] text-xs" data-test-id="cut-summary">
            {budgetMm != null && (
              <span className={overBudget ? 'text-[var(--ms-text-danger)]' : undefined}>
                {overBudget
                  ? t('cut_over_budget')
                  : `${t('cut_summary_used')} ${mmToLength(usedMm)} / ${mmToLength(budgetMm)} м · ${t('cut_summary_waste')} ${mmToLength(budgetMm - usedMm)} м`}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} data-test-id="cut-cancel">
              {tCommon('cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              data-test-id="cut-submit"
            >
              {t('cut_submit')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-4 py-4">
        <FormField inline id="cut-org" label={t('cut_org')}>
          <NativeSelect
            id="cut-org"
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            data-test-id="cut-org-select"
          >
            {(orgsQuery.data?.items ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField inline id="cut-store" label={t('cut_store')}>
          <NativeSelect
            id="cut-store"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            data-test-id="cut-store-select"
          >
            {(storesQuery.data?.items ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField inline id="cut-consumed" label={t('cut_consumed_qty')}>
          <Input
            id="cut-consumed"
            type="number"
            min={1}
            value={consumedQty}
            onChange={(e) => setConsumedQty(e.target.value)}
            data-test-id="cut-consumed-qty"
          />
        </FormField>
        <FormField inline id="cut-length" label={t('cut_source_length')}>
          <Input
            id="cut-length"
            value={sourceLengthM}
            onChange={(e) => setSourceLengthM(e.target.value)}
            placeholder="4"
            data-test-id="cut-source-length"
          />
        </FormField>
        <FormField inline id="cut-source-cell" label={t('cut_source_cell')}>
          <CellPickerField
            storeId={storeId || null}
            assortmentId={productId}
            label={sourceCellLabel}
            onSelect={(cellId, label) => {
              setSourceCellId(cellId);
              setSourceCellLabel(label);
            }}
            onClear={() => {
              setSourceCellId(null);
              setSourceCellLabel(null);
            }}
          />
        </FormField>

        <div className="flex flex-col gap-2">
          <span className="font-medium text-sm">{t('cut_pieces')}</span>
          {pieces.map((p, idx) => (
            <div
              key={`piece-${idx}-${pieces.length}`}
              className="flex items-center gap-2"
              data-test-id="cut-piece-row"
            >
              <Input
                value={p.lengthM}
                onChange={(e) => setPiece(idx, { lengthM: e.target.value })}
                placeholder={t('cut_piece_length')}
                aria-label={t('cut_piece_length')}
                className="w-24"
                data-test-id="cut-piece-length"
              />
              <Input
                type="number"
                min={1}
                value={p.quantity}
                onChange={(e) => setPiece(idx, { quantity: e.target.value })}
                placeholder={t('cut_piece_qty')}
                aria-label={t('cut_piece_qty')}
                className="w-20"
                data-test-id="cut-piece-qty"
              />
              <div className="min-w-0 flex-1">
                <CellPickerField
                  storeId={storeId || null}
                  label={p.cellLabel}
                  onSelect={(cellId, label) => setPiece(idx, { cellId, cellLabel: label })}
                  onClear={() => setPiece(idx, { cellId: null, cellLabel: null })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPieces((rows) => rows.filter((_, i) => i !== idx))}
                disabled={pieces.length === 1}
                aria-label={tCommon('delete')}
                data-test-id="cut-piece-remove"
              >
                ×
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setPieces((rows) => [
                  ...rows,
                  { lengthM: '', quantity: '1', cellId: null, cellLabel: null },
                ])
              }
              data-test-id="cut-piece-add"
            >
              {t('cut_add_piece')}
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-[var(--ms-text-danger)] text-sm" data-test-id="cut-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
