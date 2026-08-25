'use client';

/**
 * K2 — BO'LAK REYESTRI ekrani (katta omborchi).
 *
 * Reja: `docs/plans/2026-08-25-bolinadigan-tovar-bolak-hisobi.md`, K2 fazasi.
 * Bu ekran butun K-rejaning «QO'L TORMOZI»: keyingi fazalarda (kesim oqimi,
 * kassir ko'rinishi, ommaviy kiritish) nimadir chalkashsa, tuzatish shu
 * yerdan qilinadi.
 *
 * 🔴 **Qoldiqqa TEGILMAYDI.** Ekran faqat `stock_pieces` ni to'ldiradi;
 * `Stock`/`StockByCell` haqiqat manbai bo'lib qolaveradi. Shuning uchun har
 * o'zgarishdan keyin server (ombor × tovar) kesimidagi sverkani qaytaradi va
 * u yuqorida darhol ko'rinadi (K2/4-vazifa). «Tugadi» bosilganda reyestr
 * kamayadi, qoldiq esa joyida qoladi ⇒ FARQ chiqadi — bu nuqson emas, aynan
 * shu ko'rinish «endi qoldiqni ham tuzatish kerak» deb aytadi.
 *
 * Ruxsat serverda (`piecetracking`) — sahifa 403 bo'lsa xabar ko'rsatadi.
 */

import {
  type PieceLabelItem,
  PieceLabelPrintOverlay,
} from '@/components/omborchi/piece-label-print';
import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import { Button, Input, NativeSelect, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Printer, RefreshCw, ScanBarcode, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

interface StoreRef {
  id: string;
  name: string;
}

interface ProductRef {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  pieceTracked?: boolean;
}

interface WholeGroup {
  length: string;
  count: number;
  pieceIds: string[];
}

interface PieceRow {
  id: string;
  label: string | null;
  length: string;
  sourcePieceId: string | null;
  updatedAt: string;
  violations: string[];
}

interface CellGroup {
  cellId: string | null;
  cellName: string | null;
  stockQty: string;
  registryQty: string;
  diffQty: string;
  status: 'ok' | 'excess' | 'missing';
  wholeGroups: WholeGroup[];
  pieces: PieceRow[];
  longest: string | null;
}

interface RegistryResponse {
  product: ProductRef & { pieceTracked: boolean };
  store: StoreRef;
  cells: Array<{ id: string; name: string }>;
  view: {
    cells: CellGroup[];
    totals: {
      stockQty: string;
      registryQty: string;
      diffQty: string;
      status: 'ok' | 'excess' | 'missing';
      activePieces: number;
      wholeCount: number;
      longest: string | null;
    };
    invalidPieces: number;
    scrapPieces: number;
  };
}

interface LookupResponse {
  piece: {
    id: string;
    label: string | null;
    length: string;
    whole: boolean;
    status: string;
    storeId: string;
    storeName: string | null;
    cellId: string | null;
    cellName: string | null;
    assortmentId: string;
  };
  product: ProductRef | null;
}

const TONE: Record<'ok' | 'excess' | 'missing', string> = {
  ok: 'text-emerald-700',
  excess: 'text-amber-700',
  missing: 'text-red-700',
};

export default function OmborchiBolaklarPage() {
  const t = useTranslations('pages.omborchi_bolaklar');
  const { toast } = useToast();
  const qc = useQueryClient();
  const { can } = usePermissions();

  const [storeId, setStoreId] = useState('');
  const [search, setSearch] = useState('');
  const [product, setProduct] = useState<ProductRef | null>(null);

  // Kiritish formasi
  const [whole, setWhole] = useState(true);
  const [length, setLength] = useState('');
  const [count, setCount] = useState('1');
  const [cellId, setCellId] = useState('');

  // Tuzatish va skaner
  const [editing, setEditing] = useState<{ id: string; length: string } | null>(null);
  const [scanCode, setScanCode] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const [labels, setLabels] = useState<PieceLabelItem[] | null>(null);

  const canWrite = can('piecetracking', 'create');

  const stores = useQuery<{ items: StoreRef[] }>({
    queryKey: ['stores-active'],
    queryFn: () => api.get('/stores?archived=false&limit=50'),
  });

  const found = useQuery<{ items: ProductRef[] }>({
    queryKey: ['bolaklar-products', search],
    queryFn: () => api.get(`/products?search=${encodeURIComponent(search)}&limit=10`),
    enabled: search.trim().length >= 2 && !product,
  });

  const scopeKey = ['bolaklar-registry', storeId, product?.id ?? ''];
  const registry = useQuery<RegistryResponse>({
    queryKey: scopeKey,
    queryFn: () => api.get(`/stock-pieces?storeId=${storeId}&assortmentId=${product?.id ?? ''}`),
    enabled: !!storeId && !!product,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: scopeKey });

  const uom = registry.data?.product.uom ?? product?.uom ?? '';
  const fmt = (v: string) => (uom ? `${v} ${uom}` : v);

  const applyResponse = (data: RegistryResponse) => {
    qc.setQueryData(scopeKey, data);
  };

  const createMut = useMutation({
    mutationFn: () =>
      api.post<RegistryResponse & { labels: string[] }>('/stock-pieces', {
        storeId,
        assortmentId: product?.id,
        cellId: cellId || null,
        whole,
        length,
        count: Number(count) || 1,
      }),
    onSuccess: (data) => {
      applyResponse(data);
      setLength('');
      setCount('1');
      toast.success(t('added', { count: data.labels.length || Number(count) || 1 }));
      // Yorliq bosish oynasi FAQAT bo'laklarda ochiladi — butun rulon
      // yorliqsiz (K-Q3).
      if (data.labels.length > 0) {
        setLabels(
          data.labels.map((label) => ({
            key: label,
            label,
            lengthText: fmt(length),
            productName: data.product.name,
            cellName: data.cells.find((c) => c.id === cellId)?.name ?? null,
          })),
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (v: { id: string; length?: string; cellId?: string | null }) =>
      api.patch<RegistryResponse>(`/stock-pieces/${v.id}`, {
        ...(v.length !== undefined ? { length: v.length } : {}),
        ...(v.cellId !== undefined ? { cellId: v.cellId } : {}),
      }),
    onSuccess: (data) => {
      applyResponse(data);
      setEditing(null);
      toast.success(t('saved'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeMut = useMutation({
    mutationFn: (id: string) => api.post<RegistryResponse>(`/stock-pieces/${id}/close`, {}),
    onSuccess: (data) => {
      applyResponse(data);
      toast.success(t('closed'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const flagMut = useMutation({
    mutationFn: (value: boolean) =>
      api.post('/stock-pieces/flag', { assortmentId: product?.id, pieceTracked: value }),
    onSuccess: () => {
      refresh();
      toast.success(t('saved'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Yorliqni skanerlash — AYNAN bitta bo'lak ochiladi (K-reja 7.3). */
  const scan = async () => {
    const code = scanCode.trim();
    if (!code) return;
    try {
      const out = await api.get<LookupResponse>(
        `/stock-pieces/lookup?code=${encodeURIComponent(code)}`,
      );
      setScanCode('');
      setStoreId(out.piece.storeId);
      if (out.product) {
        setProduct(out.product);
        setSearch('');
      }
      setHighlight(out.piece.id);
      toast.success(t('scan_found', { label: out.piece.label ?? code }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const printOne = (row: PieceRow, cell: CellGroup) => {
    if (!row.label) return;
    setLabels([
      {
        key: row.id,
        label: row.label,
        lengthText: fmt(row.length),
        productName: registry.data?.product.name ?? '',
        cellName: cell.cellName,
      },
    ]);
  };

  const view = registry.data?.view;
  const totals = view?.totals;

  return (
    <div className="flex h-[calc(100dvh-58px)] flex-col">
      {/* Sarlavha */}
      <div className="flex items-center justify-between gap-3 border-[var(--ms-border)] border-b px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/omborchi"
            className="flex items-center gap-1.5 rounded-lg border border-[var(--ms-border)] px-3 py-2 text-xs"
            data-test-id="bolaklar-back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('back')}
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-bold text-[var(--ms-text-primary)] text-lg">
              {t('title')}
            </h1>
            <p className="truncate text-[var(--ms-text-muted)] text-xs">{t('subtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--ms-border)] px-3 py-2 text-xs"
          data-test-id="bolaklar-refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('refresh')}
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Doira: ombor + tovar + skaner */}
        <div className="grid gap-3 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--ms-text-muted)]">{t('field_store')}</span>
            <NativeSelect
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              data-test-id="bolaklar-store"
            >
              <option value="">{t('choose_store')}</option>
              {(stores.data?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </label>

          <div className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--ms-text-muted)]">{t('field_product')}</span>
            {product ? (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--ms-border)] px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm" data-test-id="bolaklar-product">
                  {product.name}
                </span>
                <button
                  type="button"
                  onClick={() => setProduct(null)}
                  aria-label={t('clear_product')}
                  data-test-id="bolaklar-product-clear"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('search_placeholder')}
                data-test-id="bolaklar-search"
              />
            )}
          </div>

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--ms-text-muted)]">{t('field_scan')}</span>
            <div className="flex gap-2">
              <Input
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void scan();
                }}
                placeholder={t('scan_placeholder')}
                data-test-id="bolaklar-scan"
              />
              <Button
                variant="secondary"
                onClick={() => void scan()}
                data-test-id="bolaklar-scan-btn"
              >
                <ScanBarcode className="h-4 w-4" />
              </Button>
            </div>
          </label>
        </div>

        {/* Qidiruv natijalari */}
        {!product && (found.data?.items?.length ?? 0) > 0 && (
          <div
            className="rounded-xl border border-[var(--ms-border)]"
            data-test-id="bolaklar-results"
          >
            {(found.data?.items ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setProduct(p);
                  setSearch('');
                }}
                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-[var(--ms-bg-hover)]"
              >
                <span className="truncate">{p.name}</span>
                <span className="text-[var(--ms-text-muted)] text-xs">{p.code ?? ''}</span>
              </button>
            ))}
          </div>
        )}

        {registry.isError && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm"
            data-test-id="bolaklar-error"
          >
            {(registry.error as Error).message}
          </div>
        )}

        {!storeId || !product ? (
          <div className="rounded-xl border border-[var(--ms-border)] p-6 text-center text-[var(--ms-text-muted)] text-sm">
            {t('choose_scope')}
          </div>
        ) : null}

        {registry.data && totals && view && (
          <>
            {/* Bayroq holati */}
            {!registry.data.product.pieceTracked && (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 text-sm"
                data-test-id="bolaklar-flag-off"
              >
                <span>{t('flag_off_hint')}</span>
                {can('piecetracking', 'update') && (
                  <Button
                    variant="secondary"
                    onClick={() => flagMut.mutate(true)}
                    data-test-id="bolaklar-flag-on"
                  >
                    {t('flag_turn_on')}
                  </Button>
                )}
              </div>
            )}

            {/* Sverka — har o'zgarishdan keyin darhol yangilanadi (K2/4) */}
            <div
              className="grid gap-3 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4 sm:grid-cols-5"
              data-test-id="bolaklar-totals"
            >
              <Metric label={t('sum_stock')} value={fmt(totals.stockQty)} />
              <Metric label={t('sum_registry')} value={fmt(totals.registryQty)} />
              <Metric
                label={t('sum_diff')}
                value={fmt(totals.diffQty)}
                tone={TONE[totals.status]}
                testId="bolaklar-diff"
              />
              <Metric label={t('sum_pieces')} value={String(totals.activePieces)} />
              <Metric label={t('sum_longest')} value={totals.longest ? fmt(totals.longest) : '—'} />
            </div>

            {totals.status === 'ok' ? (
              <div
                className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800 text-sm"
                data-test-id="bolaklar-no-diff"
              >
                {t('no_diff')}
              </div>
            ) : (
              <div
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 text-sm"
                data-test-id="bolaklar-has-diff"
              >
                {t('has_diff', { diff: fmt(totals.diffQty) })}
              </div>
            )}

            {view.invalidPieces > 0 && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 text-sm"
                data-test-id="bolaklar-invalid"
              >
                {t('warn_invalid', { count: view.invalidPieces })}
              </div>
            )}
            {view.scrapPieces > 0 && (
              <div
                className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 text-sm"
                data-test-id="bolaklar-scrap"
              >
                {t('warn_scrap', { count: view.scrapPieces })}
              </div>
            )}

            {/* Kiritish */}
            {canWrite && (
              <div className="grid gap-3 rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)] p-4 md:grid-cols-5">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--ms-text-muted)]">{t('field_kind')}</span>
                  <NativeSelect
                    value={whole ? 'whole' : 'piece'}
                    onChange={(e) => setWhole(e.target.value === 'whole')}
                    data-test-id="bolaklar-kind"
                  >
                    <option value="whole">{t('kind_whole')}</option>
                    <option value="piece">{t('kind_piece')}</option>
                  </NativeSelect>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--ms-text-muted)]">{t('field_length')}</span>
                  <Input
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    placeholder={t('length_placeholder')}
                    data-test-id="bolaklar-length"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--ms-text-muted)]">{t('field_count')}</span>
                  <Input
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    data-test-id="bolaklar-count"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--ms-text-muted)]">{t('field_cell')}</span>
                  <NativeSelect
                    value={cellId}
                    onChange={(e) => setCellId(e.target.value)}
                    data-test-id="bolaklar-cell"
                  >
                    <option value="">{t('no_cell')}</option>
                    {registry.data.cells.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    onClick={() => createMut.mutate()}
                    disabled={createMut.isPending || !length.trim()}
                    data-test-id="bolaklar-add"
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    {t('add')}
                  </Button>
                </div>
              </div>
            )}

            {/* Yacheykalar */}
            {view.cells.length === 0 ? (
              <div
                className="rounded-xl border border-[var(--ms-border)] p-6 text-center text-[var(--ms-text-muted)] text-sm"
                data-test-id="bolaklar-empty"
              >
                {t('empty')}
              </div>
            ) : (
              view.cells.map((cell) => (
                <div
                  key={cell.cellId ?? 'no-cell'}
                  className="rounded-xl border border-[var(--ms-border)] bg-[var(--ms-bg-surface)]"
                  data-test-id="bolaklar-cell-group"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-[var(--ms-border)] border-b px-4 py-2">
                    <div className="font-semibold text-sm">{cell.cellName ?? t('no_cell')}</div>
                    <div className={`text-xs ${TONE[cell.status]}`}>
                      {t('cell_summary', {
                        stock: fmt(cell.stockQty),
                        registry: fmt(cell.registryQty),
                        diff: fmt(cell.diffQty),
                      })}
                    </div>
                  </div>

                  {/* Butun rulonlar — guruhlangan (K-reja 3-bo'lim) */}
                  {cell.wholeGroups.length > 0 && (
                    <div className="flex flex-wrap gap-2 border-[var(--ms-border)] border-b px-4 py-3">
                      {cell.wholeGroups.map((g) => (
                        <div
                          key={g.length}
                          className="flex items-center gap-2 rounded-lg border border-[var(--ms-border)] px-3 py-1.5 text-sm"
                          data-test-id="bolaklar-whole-group"
                        >
                          <span className="font-semibold tabular-nums">
                            {t('whole_group', { length: fmt(g.length), count: g.count })}
                          </span>
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => closeMut.mutate(g.pieceIds[0] as string)}
                              className="text-[var(--ms-text-muted)] text-xs underline"
                              data-test-id="bolaklar-whole-close"
                            >
                              {t('close_one')}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bo'laklar — har biri alohida */}
                  {cell.pieces.length === 0 ? (
                    <div className="px-4 py-3 text-[var(--ms-text-muted)] text-xs">
                      {t('no_pieces')}
                    </div>
                  ) : (
                    <ul>
                      {cell.pieces.map((row) => (
                        <li
                          key={row.id}
                          className={`flex flex-wrap items-center gap-3 border-[var(--ms-border)] border-b px-4 py-2 text-sm last:border-b-0 ${
                            highlight === row.id ? 'bg-sky-50' : ''
                          }`}
                          data-test-id="bolaklar-piece"
                        >
                          <span className="font-mono text-xs">{row.label ?? '—'}</span>
                          {editing?.id === row.id ? (
                            <>
                              <Input
                                value={editing.length}
                                onChange={(e) => setEditing({ id: row.id, length: e.target.value })}
                                className="w-28"
                                data-test-id="bolaklar-edit-input"
                              />
                              <Button
                                onClick={() =>
                                  updateMut.mutate({ id: row.id, length: editing.length })
                                }
                                data-test-id="bolaklar-edit-save"
                              >
                                {t('save')}
                              </Button>
                              <Button variant="secondary" onClick={() => setEditing(null)}>
                                {t('cancel')}
                              </Button>
                            </>
                          ) : (
                            <span className="font-semibold tabular-nums">{fmt(row.length)}</span>
                          )}

                          {row.violations.length > 0 && (
                            <span
                              className="text-red-700 text-xs"
                              data-test-id="bolaklar-piece-invalid"
                            >
                              {row.violations.join(', ')}
                            </span>
                          )}

                          {canWrite && editing?.id !== row.id && (
                            <div className="ml-auto flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setEditing({ id: row.id, length: row.length })}
                                className="flex items-center gap-1 text-xs underline"
                                data-test-id="bolaklar-edit"
                              >
                                <Pencil className="h-3 w-3" />
                                {t('edit')}
                              </button>
                              <NativeSelect
                                value={cell.cellId ?? ''}
                                onChange={(e) =>
                                  updateMut.mutate({ id: row.id, cellId: e.target.value || null })
                                }
                                data-test-id="bolaklar-move"
                              >
                                <option value="">{t('no_cell')}</option>
                                {registry.data.cells.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </NativeSelect>
                              <button
                                type="button"
                                onClick={() => printOne(row, cell)}
                                className="flex items-center gap-1 text-xs underline"
                                data-test-id="bolaklar-print"
                              >
                                <Printer className="h-3 w-3" />
                                {t('print')}
                              </button>
                              <button
                                type="button"
                                onClick={() => closeMut.mutate(row.id)}
                                className="text-red-700 text-xs underline"
                                data-test-id="bolaklar-close"
                              >
                                {t('close_piece')}
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </>
        )}
      </div>

      {labels && <PieceLabelPrintOverlay items={labels} onClose={() => setLabels(null)} />}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone?: string;
  testId?: string;
}) {
  return (
    <div>
      <div className="text-[var(--ms-text-muted)] text-xs">{label}</div>
      <div className={`font-semibold tabular-nums ${tone ?? ''}`} data-test-id={testId}>
        {value}
      </div>
    </div>
  );
}
