'use client';

/**
 * G3 — VOZVRAT QABUL ekrani (katta omborchi).
 *
 * Oqim (egasining qoidasi, reja 1-bo'lim): manba kassa cheki → har pozitsiya
 * uchun holat (sifatli / brak) va yacheyka → ВП hujjat(lar)i yaratilib
 * o'tkaziladi → YORLIQ chop etiladi (tovar shtrixi + yacheyka kodi).
 * Pulni mijozga KASSIR qaytaradi: post bo'lgan vozvrat kassirning «to'lanmagan
 * vozvratlar» ro'yxatiga o'zi chiqadi (G1).
 *
 * Nega chekdan boshlanadi: qaytarish narxi mijoz TO'LAGAN narx bo'lishi
 * shart va ombor xodimi narx bilan ishlamaydi (egasi qoidasi) — shuning uchun
 * narx serverda chekdan olinadi, bu ekran umuman narx yubormaydi.
 *
 * Brak tovar ALOHIDA BRAK omboriga tushadi (kassa kaskadida qatnashmaydi) —
 * shu sabab sifatli+brak aralash qabul IKKI hujjat bo'lib yoziladi
 * (`sales-return-acceptance.ts` izohiga qarang).
 *
 * Ruxsat serverda (`returnacceptance`) — sahifa 403 bo'lsa xabar ko'rsatadi.
 */

import { type AddCellOption, resolveCellByCode } from '@/components/inventories/add-cell-picker';
import {
  type ReturnLabelItem,
  ReturnLabelPrintOverlay,
} from '@/components/omborchi/return-label-print';
import { api } from '@/lib/api-client';
import { Input, NativeSelect, formatMoney, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PackageCheck, Printer, RefreshCw, Search, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface ReceiptRow {
  id: string;
  name: string;
  moment: string;
  sumMinor: string;
  state: string;
  agent: { id: string; name: string } | null;
  positionCount: number;
}

interface SourceLine {
  productId: string;
  productName: string;
  barcode: string | null;
  soldQty: string;
  posRefundedQty: string;
  warehouseReturnedQty: string;
  remainingQty: string;
  priceMinor: string;
  discount: string;
}

interface SourceResponse {
  sale: {
    id: string;
    name: string;
    moment: string;
    sumMinor: string;
    agent: { id: string; name: string } | null;
  };
  lines: SourceLine[];
}

interface TargetsResponse {
  stores: Array<{ id: string; name: string; brak: boolean; posPriority: number | null }>;
  defaultStoreId: string | null;
  brakStoreId: string | null;
}

interface AcceptResponse {
  returns: Array<{
    id: string;
    name: string;
    brak: boolean;
    state: string;
    sumMinor: string;
    positions: Array<{
      productId: string;
      productName: string;
      barcode: string | null;
      quantity: string;
      cellId: string;
      cellName: string;
    }>;
  }>;
}

/** Qator holati: qancha, sifatlimi, qaysi yacheyka (kod terish — skaner-do'st). */
interface LineState {
  qty: string;
  brak: boolean;
  cellId: string | null;
  cellName: string;
  cellInput: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

export default function OmborchiVozvratPage() {
  const t = useTranslations('pages.omborchi_vozvrat');
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [saleId, setSaleId] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [labels, setLabels] = useState<ReturnLabelItem[] | null>(null);

  const targets = useQuery<TargetsResponse>({
    queryKey: ['vozvrat-targets'],
    queryFn: () => api.get('/sales-returns/acceptance/targets'),
  });

  const [goodStoreId, setGoodStoreId] = useState<string | null>(null);
  const effectiveGoodStore = goodStoreId ?? targets.data?.defaultStoreId ?? null;
  const brakStoreId = targets.data?.brakStoreId ?? null;

  const receipts = useQuery<{ items: ReceiptRow[] }>({
    queryKey: ['vozvrat-receipts', query],
    queryFn: () =>
      api.get(`/sales-returns/acceptance/receipts?limit=20&q=${encodeURIComponent(query)}`),
    enabled: !saleId,
  });

  const source = useQuery<SourceResponse>({
    queryKey: ['vozvrat-source', saleId],
    queryFn: () => api.get(`/sales-returns/acceptance/source/${saleId}`),
    enabled: !!saleId,
  });

  const goodCells = useQuery<{ cells: AddCellOption[] }>({
    queryKey: ['vozvrat-cells', effectiveGoodStore],
    queryFn: () =>
      api.get(`/admin/stores/${effectiveGoodStore}/address-storage?assortmentKind=product`),
    enabled: !!saleId && !!effectiveGoodStore,
    staleTime: 30_000,
  });

  const brakCells = useQuery<{ cells: AddCellOption[] }>({
    queryKey: ['vozvrat-cells', brakStoreId],
    queryFn: () => api.get(`/admin/stores/${brakStoreId}/address-storage?assortmentKind=product`),
    enabled: !!saleId && !!brakStoreId,
    staleTime: 30_000,
  });

  const cellsFor = (brak: boolean) =>
    (brak ? brakCells.data?.cells : goodCells.data?.cells) ?? ([] as AddCellOption[]);

  const acceptMut = useMutation<AcceptResponse>({
    mutationFn: () => {
      const positions = Object.entries(lines)
        .filter(([, s]) => s.cellId && Number(s.qty) > 0)
        .map(([productId, s]) => ({
          productId,
          quantity: s.qty.trim(),
          cellId: s.cellId as string,
        }));
      if (positions.length === 0) throw new Error(t('error_no_rows'));
      return api.post(`/sales-returns/acceptance/from-retail-sale/${saleId}`, { positions });
    },
    onSuccess: (res) => {
      const docs = res.returns.map((r) => r.name).join(', ');
      toast.success(t('accept_success', { docs }));
      // Yorliqlar — javobdagi tayyor ma'lumotdan (qo'shimcha so'rov yo'q).
      setLabels(
        res.returns.flatMap((r) =>
          r.positions.map((p) => ({
            key: `${r.id}-${p.productId}-${p.cellId}`,
            productName: p.productName,
            barcode: p.barcode,
            cellName: p.cellName,
            quantity: p.quantity,
            brak: r.brak,
          })),
        ),
      );
      setLines({});
      qc.invalidateQueries({ queryKey: ['vozvrat-source', saleId] });
      qc.invalidateQueries({ queryKey: ['vozvrat-receipts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setLine = (productId: string, patch: Partial<LineState>) =>
    setLines((s) => ({
      ...s,
      [productId]: {
        qty: '',
        brak: false,
        cellId: null,
        cellName: '',
        cellInput: '',
        ...s[productId],
        ...patch,
      },
    }));

  /** Kod terish/skan — AYNAN mos yacheyka (`resolveCellByCode` naqshi). */
  const applyCellCode = (productId: string, brak: boolean, code: string) => {
    const found = resolveCellByCode(cellsFor(brak), code);
    if (!found) {
      setLine(productId, { cellId: null, cellName: '', cellInput: code });
      return;
    }
    setLine(productId, { cellId: found.id, cellName: found.name, cellInput: found.name });
  };

  const readyCount = useMemo(
    () => Object.values(lines).filter((s) => s.cellId && Number(s.qty) > 0).length,
    [lines],
  );

  const reset = () => {
    setSaleId(null);
    setLines({});
  };

  return (
    <div className="flex h-[calc(100dvh-58px)] flex-col">
      <div className="flex items-center justify-between border-[var(--ms-border-default)] border-b px-6 py-3">
        <div className="flex items-center gap-3">
          {saleId && (
            <button
              type="button"
              onClick={reset}
              className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[var(--ms-border-default)] px-3 text-xs font-medium text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {t('back')}
            </button>
          )}
          <div>
            <h1 className="text-lg font-bold text-[var(--ms-text-primary)]">{t('title')}</h1>
            <p className="text-xs text-[var(--ms-text-muted)]">{t('subtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ['vozvrat-receipts'] });
            qc.invalidateQueries({ queryKey: ['vozvrat-source'] });
            qc.invalidateQueries({ queryKey: ['vozvrat-cells'] });
          }}
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[var(--ms-border-default)] px-3 text-xs font-medium text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('refresh')}
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* ── 1-qadam: manba chek ─────────────────────────────────────────── */}
        {!saleId && (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setQuery(search.trim());
              }}
              className="flex items-center gap-2"
            >
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('search_placeholder')}
                className="h-11 max-w-md flex-1"
                aria-label={t('search_placeholder')}
                data-test-id="vozvrat-search"
              />
              <button
                type="submit"
                className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-sky-500 px-4 text-sm font-semibold text-white hover:bg-sky-600"
              >
                <Search className="h-4 w-4" />
                {t('search')}
              </button>
            </form>

            {receipts.error ? (
              <div className="rounded-2xl border-2 border-dashed border-red-200 py-12 text-center">
                <p className="text-sm text-red-500">{t('load_error')}</p>
                <p className="mt-1 text-xs text-[var(--ms-text-muted)]">
                  {(receipts.error as Error).message}
                </p>
              </div>
            ) : receipts.isLoading ? (
              <div className="py-8 text-center text-sm text-[var(--ms-text-muted)]">
                {t('loading')}
              </div>
            ) : (receipts.data?.items.length ?? 0) === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-[var(--ms-border-default)] py-12 text-center">
                <PackageCheck className="mx-auto mb-2 h-8 w-8 text-[var(--ms-text-muted)] opacity-40" />
                <p className="text-sm text-[var(--ms-text-muted)]">{t('receipts_empty')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {receipts.data?.items.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSaleId(r.id)}
                    data-test-id="vozvrat-receipt-row"
                    className="flex w-full min-h-[44px] items-center gap-3 rounded-xl border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-4 py-3 text-left hover:bg-[var(--ms-bg-hover)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--ms-text-primary)]">{r.name}</span>
                        <span className="text-sm font-semibold tabular-nums text-[var(--ms-text-secondary)]">
                          {formatMoney(BigInt(r.sumMinor))}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--ms-text-muted)]">
                        {fmtDate(r.moment)} · {t('items_count', { count: r.positionCount })}
                        {r.agent ? ` · ${r.agent.name}` : ''}
                      </div>
                    </div>
                    <Undo2 className="h-4 w-4 shrink-0 text-[var(--ms-text-muted)]" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── 2-qadam: qatorlar, holat, yacheyka ──────────────────────────── */}
        {saleId && (
          <>
            {source.error ? (
              <div className="rounded-2xl border-2 border-dashed border-red-200 py-12 text-center">
                <p className="text-sm text-red-500">{(source.error as Error).message}</p>
              </div>
            ) : source.isLoading || !source.data ? (
              <div className="py-8 text-center text-sm text-[var(--ms-text-muted)]">
                {t('loading')}
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[var(--ms-text-primary)]">
                      {source.data.sale.name}
                    </span>
                    <span className="text-sm tabular-nums text-[var(--ms-text-secondary)]">
                      {formatMoney(BigInt(source.data.sale.sumMinor))}
                    </span>
                    <span className="text-xs text-[var(--ms-text-muted)]">
                      {fmtDate(source.data.sale.moment)}
                      {source.data.sale.agent ? ` · ${source.data.sale.agent.name}` : ''}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-[var(--ms-text-muted)]">{t('good_store')}:</span>
                    <NativeSelect
                      value={effectiveGoodStore ?? ''}
                      onChange={(e) => setGoodStoreId(e.target.value || null)}
                      aria-label={t('good_store')}
                      data-test-id="vozvrat-good-store"
                      className="w-56"
                      selectClassName="min-h-[44px] text-xs"
                    >
                      <option value="">{t('store_none')}</option>
                      {targets.data?.stores
                        .filter((s) => !s.brak)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </NativeSelect>
                    {brakStoreId ? (
                      <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700">
                        {t('brak_store')}:{' '}
                        {targets.data?.stores.find((s) => s.id === brakStoreId)?.name}
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-50 px-2 py-1 font-semibold text-red-600">
                        {t('brak_store_missing')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-[var(--ms-border-default)] rounded-xl border border-[var(--ms-border-default)]">
                  {source.data.lines.map((line) => {
                    const st = lines[line.productId] ?? {
                      qty: '',
                      brak: false,
                      cellId: null,
                      cellName: '',
                      cellInput: '',
                    };
                    const exhausted = Number(line.remainingQty) <= 0;
                    return (
                      <div
                        key={line.productId}
                        data-test-id="vozvrat-line"
                        className={`space-y-2 px-3 py-3 ${exhausted ? 'opacity-45' : ''}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-[var(--ms-text-primary)]">
                            {line.productName}
                          </span>
                          <span className="text-xs tabular-nums text-[var(--ms-text-muted)]">
                            {t('remaining', {
                              remaining: line.remainingQty,
                              sold: line.soldQty,
                            })}
                          </span>
                        </div>

                        {!exhausted && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={st.qty}
                              onChange={(e) => setLine(line.productId, { qty: e.target.value })}
                              placeholder={t('qty')}
                              aria-label={t('qty')}
                              className="h-11 w-24 text-right tabular-nums"
                              data-test-id="vozvrat-qty"
                            />

                            <div className="flex overflow-hidden rounded-lg border border-[var(--ms-border-default)]">
                              <button
                                type="button"
                                onClick={() =>
                                  setLine(line.productId, {
                                    brak: false,
                                    cellId: null,
                                    cellName: '',
                                    cellInput: '',
                                  })
                                }
                                data-test-id="vozvrat-quality-good"
                                className={`min-h-[44px] px-3 text-xs font-semibold ${
                                  st.brak
                                    ? 'text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]'
                                    : 'bg-emerald-500 text-white'
                                }`}
                              >
                                {t('quality_good')}
                              </button>
                              <button
                                type="button"
                                disabled={!brakStoreId}
                                onClick={() =>
                                  setLine(line.productId, {
                                    brak: true,
                                    cellId: null,
                                    cellName: '',
                                    cellInput: '',
                                  })
                                }
                                data-test-id="vozvrat-quality-brak"
                                className={`min-h-[44px] px-3 text-xs font-semibold disabled:opacity-40 ${
                                  st.brak
                                    ? 'bg-amber-500 text-white'
                                    : 'text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]'
                                }`}
                              >
                                {t('quality_brak')}
                              </button>
                            </div>

                            <Input
                              value={st.cellInput}
                              onChange={(e) =>
                                applyCellCode(line.productId, st.brak, e.target.value)
                              }
                              placeholder={t('cell_placeholder')}
                              aria-label={t('cell_placeholder')}
                              className="h-11 w-44 tabular-nums"
                              data-test-id="vozvrat-cell"
                            />
                            {st.cellId ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                                {st.cellName}
                              </span>
                            ) : st.cellInput ? (
                              <span className="text-xs text-red-500">{t('cell_not_found')}</span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-end gap-3">
                  <span className="text-xs text-[var(--ms-text-muted)]">
                    {t('ready_count', { count: readyCount })}
                  </span>
                  <button
                    type="button"
                    onClick={() => acceptMut.mutate()}
                    disabled={acceptMut.isPending || readyCount === 0}
                    data-test-id="vozvrat-accept"
                    className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    <PackageCheck className="h-4 w-4" />
                    {acceptMut.isPending ? '…' : t('accept')}
                  </button>
                </div>

                <p className="text-right text-xs text-[var(--ms-text-muted)]">{t('accept_hint')}</p>
              </>
            )}
          </>
        )}
      </div>

      {labels && labels.length > 0 && (
        <ReturnLabelPrintOverlay items={labels} onClose={() => setLabels(null)} />
      )}
      {/* Yorliqni qayta ochish — qabuldan keyin oyna yopilib qolsa. */}
      {!labels && acceptMut.data && (
        <button
          type="button"
          onClick={() =>
            setLabels(
              (acceptMut.data as AcceptResponse).returns.flatMap((r) =>
                r.positions.map((p) => ({
                  key: `${r.id}-${p.productId}-${p.cellId}`,
                  productName: p.productName,
                  barcode: p.barcode,
                  cellName: p.cellName,
                  quantity: p.quantity,
                  brak: r.brak,
                })),
              ),
            )
          }
          data-test-id="vozvrat-reprint"
          className="mx-4 mb-4 flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[var(--ms-border-default)] text-xs font-medium text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
        >
          <Printer className="h-3.5 w-3.5" />
          {t('label_reprint')}
        </button>
      )}
    </div>
  );
}
