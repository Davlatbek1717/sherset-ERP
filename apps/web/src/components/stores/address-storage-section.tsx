'use client';

/**
 * «Адресное хранение товаров» — ombor kartochkasining o'ng bo'limi
 * (moysklad store card 1:1, 2026-07-16 talab + 2 kelishilgan o'zgarish):
 *
 *   1) moysklad'dagi «+ Зона» → «Polka qo'shish» deb NOMLANADI va bosilganda
 *      3 ta MAJBURIY input chiqadi: polka kodi · yacheyka kodi prefiksi
 *      («NN-NN-NN», masalan 04-03-01) · o'rinlar soni (masalan 20). Enter →
 *      tizim 04-03-01-01 … 04-03-01-20 ketma-ket yacheykalarni avtomatik
 *      yaratadi (server: POST /admin/stores/:id/cells/generate).
 *   2) Yacheykalar jadvalida moysklad'dagi «Статус»/«Штрихкод» ustunlari YO'Q
 *      (2026-07-16 talab) — «Ячейка | Полка» + har qatorda 3 amal:
 *      ➕ tovar biriktirish (Выбор товара modali) · 🖨 chop etish (label
 *      sahifasi, segmentlar oldindan to'ldirilgan) · 🗑 o'chirish.
 *
 *   Polka-svodka jadvali (moysklad zona jadvali ko'rinishida): Polka |
 *   Всего ячеек | Свободно | Занято, birinchi qator — «Без зоны хранения»
 *   (polkasiz yacheykalar). Band/bo'shlik serverda Product.loc* ∪
 *   ProductLocation dan hisoblanadi.
 */

import {
  ProductSelectModal,
  type ProductSelectRow,
} from '@/components/products/product-select-modal';
import { CellScanModal } from '@/components/stores/cell-scan-modal';
import { useDestructiveMutation } from '@/hooks/use-destructive-mutation';
import { api } from '@/lib/api-client';
import { Button, Input, cn, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Plus,
  Printer,
  ScanLine,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';

interface CellRow {
  id: string;
  code: string;
  shelf: string | null;
  productCount: number;
}

interface CellsResponse {
  items: CellRow[];
}

const PREFIX_RE = /^\d{1,2}-\d{1,2}-\d{1,2}$/;
const CODE_RE = /^\d{1,2}(-\d{1,2}){3}$/;

/** moysklad jadval-katak uslubi (screenshot: yupqa pastki chiziq, tekis matn). */
const TH = 'px-3 py-2 text-left font-normal text-[var(--ms-text-secondary)] text-sm';
const TD = 'px-3 py-2 text-sm';

export function AddressStorageSection({
  storeId,
  storeName,
}: {
  storeId: string;
  storeName: string;
}) {
  const t = useTranslations('pages.stores');
  const tProductSelect = useTranslations('product_select');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const qc = useQueryClient();
  const { runDestructive } = useDestructiveMutation();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<CellsResponse>({
    queryKey: ['store-cells', storeId],
    queryFn: () => api.get<CellsResponse>(`/admin/stores/${storeId}/cells`),
    enabled: !!storeId,
  });
  const cells = data?.items ?? [];

  // ── Polka-svodka (zona jadvali): «Без зоны хранения» + har polka bo'yicha ──
  const noShelf = cells.filter((c) => !c.shelf);
  const shelfNames = [
    ...new Set(cells.filter((c) => c.shelf).map((c) => c.shelf as string)),
  ].sort();
  const summaryRow = (rows: CellRow[]) => {
    const busy = rows.filter((r) => r.productCount > 0).length;
    return { total: rows.length, busy, free: rows.length - busy };
  };
  // Ochilgan polkalar — bosilganда ichidagi yacheyka KODLARI ko'rinadi (2026-07-19
  // talab: «har polkani dropdown qilib ichidagi yacheykalarni ko'rish»).
  const [openPolkas, setOpenPolkas] = useState<Set<string>>(new Set());
  const togglePolka = (key: string) =>
    setOpenPolkas((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // ── «Polka qo'shish» — 3 input (barchasi majburiy) ──
  const [polkaFormOpen, setPolkaFormOpen] = useState(false);
  const [shelf, setShelf] = useState('');
  const [prefix, setPrefix] = useState('');
  const [count, setCount] = useState('');
  const [polkaError, setPolkaError] = useState<string | null>(null);
  const [generatedInfo, setGeneratedInfo] = useState<string | null>(null);

  const generateMut = useMutation({
    mutationFn: (input: { shelf: string; prefix: string; count: number }) =>
      api.post<{ created: number; skipped: number }>(
        `/admin/stores/${storeId}/cells/generate`,
        input,
      ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['store-cells', storeId] });
      setShelf('');
      setPrefix('');
      setCount('');
      setPolkaFormOpen(false);
      setGeneratedInfo(
        res.skipped > 0
          ? t('cells_generated_skipped', { created: res.created, skipped: res.skipped })
          : t('cells_generated', { created: res.created }),
      );
    },
    onError: (e: Error) => setPolkaError(e.message),
  });

  const submitPolka = () => {
    setPolkaError(null);
    setGeneratedInfo(null);
    // 3 input ham MAJBURIY (2026-07-16 talab — bo'sh qoldirib bo'lmaydi).
    if (!shelf.trim() || !prefix.trim() || !count.trim()) {
      setPolkaError(t('polka_inputs_required'));
      return;
    }
    if (!PREFIX_RE.test(prefix.trim())) {
      setPolkaError(t('polka_prefix_invalid'));
      return;
    }
    const n = Number(count.trim());
    if (!Number.isInteger(n) || n < 1 || n > 99) {
      setPolkaError(t('polka_count_invalid'));
      return;
    }
    generateMut.mutate({ shelf: shelf.trim(), prefix: prefix.trim(), count: n });
  };

  // ── «+ Yacheyka» — bitta yacheykani qo'lda qo'shish (moysklad'dagi link) ──
  const [cellFormOpen, setCellFormOpen] = useState(false);
  const [cellCode, setCellCode] = useState('');
  const [cellShelf, setCellShelf] = useState('');
  const [cellError, setCellError] = useState<string | null>(null);

  const createCellMut = useMutation({
    mutationFn: (input: { code: string; shelf: string | null }) =>
      api.post<CellRow>(`/admin/stores/${storeId}/cells`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-cells', storeId] });
      setCellCode('');
      setCellShelf('');
      setCellFormOpen(false);
    },
    onError: (e: Error) => setCellError(e.message),
  });

  const submitCell = () => {
    setCellError(null);
    if (!CODE_RE.test(cellCode.trim())) {
      setCellError(t('cell_code_invalid'));
      return;
    }
    createCellMut.mutate({ code: cellCode.trim(), shelf: cellShelf.trim() || null });
  };

  // ── Skan orqali biriktirish («Mahsulot qo'shish» oynasidagi «Skan» tugmasi
  //    + bo'lim yuqorisidagi mustaqil «Skan» tugmasi) ──
  const [scanCell, setScanCell] = useState<CellRow | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  // ── Amallar: ➕ tovar biriktirish · 🖨 chop etish · 🗑 o'chirish ──
  const [assignCell, setAssignCell] = useState<CellRow | null>(null);
  const assignMut = useMutation({
    mutationFn: ({ cellId, productIds }: { cellId: string; productIds: string[] }) =>
      api.post<{ updated: number }>(`/admin/stores/${storeId}/cells/${cellId}/assign`, {
        productIds,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store-cells', storeId] }),
    // 2026-07-20 tuzatish: ProductSelectModal tanlovni tasdiqlagach o'zi
    // (mutatsiya natijasini kutmasdan) yopiladi — xato bo'lsa foydalanuvchi
    // "biriktirildi" deb o'ylab qoladi, hech qanday xabar ko'rmasdan. Toast
    // shu bo'shliqni yopadi (boshqa mutatsiyalar kabi inline xato emas,
    // chunki oyna allaqachon yopilgan — inline joy qolmaydi).
    onError: (e: Error) => toast.error(t('assign_failed'), { description: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (cellId: string) => api.delete<unknown>(`/admin/stores/${storeId}/cells/${cellId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store-cells', storeId] }),
  });

  /** 🖨 — label sahifasi, barcha 4 segment shu yacheyka bilan to'ldirilgan.
   *  storeId ham uzatiladi — sahifada «shu ombordan yana yacheyka tanlash»
   *  paneli ochilib, qo'shimcha labellar tanlab chop etilishi mumkin. */
  const printCell = (cell: CellRow) => {
    const [sklad = '', polka = '', qavat = '', yacheyka = ''] = cell.code.split('-');
    const params = new URLSearchParams({
      store: storeName,
      storeId,
      sklad,
      polka,
      qavat,
      yacheyka,
    });
    router.push(`/stores/cell-labels?${params.toString()}`);
  };

  /** «Labellar» — label sahifasini TANLASH rejimida ochadi (segment prefill'siz):
   *  foydalanuvchi shu ombordagi yacheykalarni qidirib-belgilab chop etadi. */
  const openLabelPicker = () => {
    const params = new URLSearchParams({ store: storeName, storeId });
    router.push(`/stores/cell-labels?${params.toString()}`);
  };

  const linkCls =
    'inline-flex items-center gap-1 text-[var(--ms-text-brand)] text-sm hover:underline';
  const iconBtnCls =
    'flex h-7 w-7 items-center justify-center rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-primary)]';

  return (
    <div data-test-id="address-storage-section">
      {/* Sarlavha — moysklad: (?) + to'q sariq «Адресное хранение товаров» */}
      <div className="flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-[var(--ms-text-brand)]" aria-hidden />
        <h2 className="font-medium text-[#e8630a] text-base">{t('address_storage_title')}</h2>
        <div className="ml-auto flex items-center gap-2">
          {/* «Labellar» — yacheykalarni qidirib-belgilab ko'plab chop etish. */}
          <button
            type="button"
            onClick={openLabelPicker}
            className="inline-flex items-center gap-1.5 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-strong)] px-3 py-1 font-medium text-[var(--ms-text-primary)] text-sm hover:bg-[var(--ms-bg-hover)]"
            data-test-id="address-storage-labels"
          >
            <Printer className="h-4 w-4" />
            {t('cell_labels')}
          </button>
          {/* Mustaqil skan — yacheykani skan aniqlaydi, shuning uchun qatorsiz ham
              ishlaydi (tez «skan-skan» ombor oqimi uchun). */}
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-focus)] bg-[var(--ms-bg-selected)] px-3 py-1 font-medium text-[var(--ms-text-brand)] text-sm hover:brightness-95"
            data-test-id="address-storage-scan"
          >
            <ScanLine className="h-4 w-4" />
            {t('scan_button')}
          </button>
        </div>
      </div>

      {/* ── Polka-svodka jadvali (moysklad zona jadvali o'rnida) ── */}
      <table className="mt-4 w-full max-w-[780px] border-collapse" data-test-id="polka-summary">
        <thead>
          <tr className="border-[#2b6c99] border-b">
            <th className={TH}>{t('col_polka')}</th>
            <th className={cn(TH, 'w-28 text-center')}>{t('col_cells_total')}</th>
            <th className={cn(TH, 'w-28 text-center')}>{t('col_cells_free')}</th>
            <th className={cn(TH, 'w-28 text-center')}>{t('col_cells_busy')}</th>
          </tr>
        </thead>
        <tbody>
          {[
            { key: '__none__', label: t('no_zone_row'), rows: noShelf, none: true },
            ...shelfNames.map((name) => ({
              key: name,
              label: name,
              rows: cells.filter((c) => c.shelf === name),
              none: false,
            })),
          ].map(({ key, label, rows, none }) => {
            const s = summaryRow(rows);
            const open = openPolkas.has(key);
            const expandable = rows.length > 0;
            return (
              <Fragment key={key}>
                {/* biome-ignore lint/a11y/useKeyWithClickEvents: qator butun-satr toggle; klaviatura uchun ichki chevron tugmasi bor emas — sodda ombor jadvali, o'qi/enter shart emas */}
                <tr
                  className={cn(
                    none ? 'border-[#2b6c99]' : 'border-[var(--ms-border-default)]',
                    'border-b',
                    expandable && 'cursor-pointer hover:bg-[var(--ms-bg-hover)]',
                  )}
                  onClick={() => expandable && togglePolka(key)}
                  data-test-id={none ? 'polka-row-none' : `polka-row-${label}`}
                >
                  <td className={cn(TD, none && 'text-[var(--ms-text-muted)] italic')}>
                    <span className="inline-flex items-center gap-1.5">
                      {expandable ? (
                        open ? (
                          <ChevronDown className="h-4 w-4 text-[var(--ms-text-muted)]" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-[var(--ms-text-muted)]" />
                        )
                      ) : (
                        <span className="inline-block w-4" />
                      )}
                      <span>{label}</span>
                      {expandable && (
                        <span className="text-[var(--ms-text-muted)] text-xs">({rows.length})</span>
                      )}
                    </span>
                  </td>
                  <td className={cn(TD, 'text-center tabular-nums')}>{s.total}</td>
                  <td className={cn(TD, 'text-center tabular-nums')}>{s.free}</td>
                  <td className={cn(TD, 'text-center tabular-nums')}>{s.busy}</td>
                </tr>
                {/* Ochilganда — shu polkadagi yacheyka KODLARI (band = to'q sariq, bo'sh = ko'k). */}
                {open && expandable && (
                  <tr
                    className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)]"
                    data-test-id={`polka-cells-${none ? 'none' : label}`}
                  >
                    <td colSpan={4} className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {[...rows]
                          .sort((a, b) => a.code.localeCompare(b.code))
                          .map((c) => {
                            const busy = c.productCount > 0;
                            return (
                              <span
                                key={c.id}
                                title={busy ? t('col_cells_busy') : t('col_cells_free')}
                                className={cn(
                                  'rounded-[var(--ms-radius-sm)] border px-2 py-0.5 font-mono text-xs tabular-nums',
                                  busy
                                    ? 'border-[#f0c9a0] bg-[#fdf2e6] text-[#b5651d]'
                                    : 'border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] text-[var(--ms-text-secondary)]',
                                )}
                                data-test-id={`polka-cell-${c.code}`}
                              >
                                {c.code}
                              </span>
                            );
                          })}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* ── «Polka qo'shish» (moysklad «+ Зона» o'rnida — 2026-07-16 rename) ── */}
      <div className="mt-3">
        {!polkaFormOpen ? (
          <button
            type="button"
            className={linkCls}
            onClick={() => {
              setPolkaFormOpen(true);
              setGeneratedInfo(null);
            }}
            data-test-id="add-polka-toggle"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t('add_polka')}
          </button>
        ) : (
          <div
            className="max-w-[780px] rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] p-3"
            data-test-id="add-polka-form"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {(
                [
                  ['polka-shelf', t('polka_input_shelf'), shelf, setShelf, '032'],
                  ['polka-prefix', t('polka_input_prefix'), prefix, setPrefix, '04-03-01'],
                  ['polka-count', t('polka_input_count'), count, setCount, '20'],
                ] as const
              ).map(([id, label, value, set, ph]) => (
                <div key={id} className="flex flex-col gap-1">
                  <label htmlFor={id} className="text-[var(--ms-text-secondary)] text-xs">
                    {label} <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id={id}
                    value={value}
                    placeholder={ph}
                    onChange={(e) => set(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter → generatsiya (2026-07-16 talab: Enter bosilganda
                      // ketma-ket yacheykalar avtomatik yaratiladi).
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submitPolka();
                      }
                    }}
                    data-test-id={id}
                  />
                </div>
              ))}
            </div>
            {polkaError && (
              <div className="mt-2 text-red-600 text-sm" data-test-id="add-polka-error">
                {polkaError}
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={submitPolka}
                loading={generateMut.isPending}
                data-test-id="add-polka-submit"
              >
                {t('polka_generate')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setPolkaFormOpen(false);
                  setPolkaError(null);
                }}
              >
                {tCommon('cancel')}
              </Button>
            </div>
          </div>
        )}
        {generatedInfo && (
          <div className="mt-2 text-emerald-700 text-sm" data-test-id="cells-generated-info">
            {generatedInfo}
          </div>
        )}
      </div>

      {/* ── Yacheykalar jadvali: Ячейка | Полка | amallar (Status/Shtrix YO'Q) ── */}
      <table className="mt-6 w-full max-w-[900px] border-collapse" data-test-id="cells-table">
        <thead>
          <tr className="border-[#2b6c99] border-b">
            <th className={TH}>{t('col_cell')}</th>
            <th className={TH}>{t('col_polka')}</th>
            <th className={cn(TH, 'w-32')} aria-label={t('col_actions')} />
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td className={cn(TD, 'text-[var(--ms-text-muted)]')} colSpan={3}>
                {tCommon('loading')}
              </td>
            </tr>
          ) : cells.length === 0 ? (
            <tr>
              <td
                className={cn(TD, 'text-[var(--ms-text-muted)]')}
                colSpan={3}
                data-test-id="cells-empty"
              >
                {t('cells_empty')}
              </td>
            </tr>
          ) : (
            cells.map((cell) => (
              <tr
                key={cell.id}
                className="border-[var(--ms-border-default)] border-b hover:bg-[var(--ms-bg-hover)]"
                data-test-id={`cell-row-${cell.code}`}
              >
                <td className={cn(TD, 'font-mono tabular-nums tracking-wider')}>{cell.code}</td>
                <td className={TD}>{cell.shelf ?? ''}</td>
                <td className={cn(TD, 'text-right')}>
                  <div className="flex items-center justify-end gap-1">
                    {/* ➕ tovar biriktirish */}
                    <button
                      type="button"
                      className={iconBtnCls}
                      title={t('cell_add_product')}
                      aria-label={t('cell_add_product')}
                      onClick={() => setAssignCell(cell)}
                      data-test-id={`cell-assign-${cell.code}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    {/* 🖨 chop etish */}
                    <button
                      type="button"
                      className={iconBtnCls}
                      title={t('cell_print')}
                      aria-label={t('cell_print')}
                      onClick={() => printCell(cell)}
                      data-test-id={`cell-print-${cell.code}`}
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                    {/* 🗑 o'chirish */}
                    <button
                      type="button"
                      className={cn(iconBtnCls, 'hover:text-red-600')}
                      title={t('cell_delete')}
                      aria-label={t('cell_delete')}
                      onClick={() =>
                        runDestructive({
                          title: tCommon('delete_confirm', { name: cell.code }),
                          // 2026-07-20 tuzatish: registr yozuvi o'chsa ham
                          // tovarning loc* manzili o'zgarmaydi (band/bo'shlik
                          // Product.loc*dan hisoblanadi, StoreCell'dan emas)
                          // — band yacheykani ko'rmasdan o'chirib qo'yish
                          // "ko'rinmas" band manzil qoldiradi. Band bo'lsa
                          // ogohlantiramiz.
                          description:
                            cell.productCount > 0
                              ? t('cell_delete_occupied_warning', { count: cell.productCount })
                              : undefined,
                          run: () => deleteMut.mutateAsync(cell.id),
                        })
                      }
                      data-test-id={`cell-delete-${cell.code}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* ── «+ Yacheyka» (moysklad link — bitta yacheyka qo'lda) ── */}
      <div className="mt-3">
        {!cellFormOpen ? (
          <button
            type="button"
            className={linkCls}
            onClick={() => setCellFormOpen(true)}
            data-test-id="add-cell-toggle"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t('add_cell')}
          </button>
        ) : (
          <div
            className="flex max-w-[780px] flex-wrap items-end gap-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] p-3"
            data-test-id="add-cell-form"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="cell-code" className="text-[var(--ms-text-secondary)] text-xs">
                {t('cell_input_code')} <span className="text-red-500">*</span>
              </label>
              <Input
                id="cell-code"
                value={cellCode}
                placeholder="04-03-01-01"
                onChange={(e) => setCellCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitCell();
                  }
                }}
                data-test-id="cell-code-input"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="cell-shelf" className="text-[var(--ms-text-secondary)] text-xs">
                {t('col_polka')}
              </label>
              <Input
                id="cell-shelf"
                value={cellShelf}
                placeholder="032"
                onChange={(e) => setCellShelf(e.target.value)}
                data-test-id="cell-shelf-input"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={submitCell}
                loading={createCellMut.isPending}
                data-test-id="add-cell-submit"
              >
                {tCommon('add')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setCellFormOpen(false);
                  setCellError(null);
                }}
              >
                {tCommon('cancel')}
              </Button>
            </div>
            {cellError && (
              <div className="w-full text-red-600 text-sm" data-test-id="add-cell-error">
                {cellError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ➕ — «Выбор товара» modali: tanlanganlar shu yacheykaga biriktiriladi
          (asosiy loc* manzili yacheyka kodiga o'rnatiladi). */}
      <ProductSelectModal
        open={!!assignCell}
        onClose={() => setAssignCell(null)}
        currency="UZS"
        selectionMode
        headerExtra={
          <button
            type="button"
            onClick={() => {
              // «Mahsulot qo'shish» oynasidan skan oqimiga o'tish — biriktirilgan
              // yacheyka boshlang'ich yo'nalish sifatida uzatiladi (skan uni
              // qat'iy aniqlaydi).
              setScanCell(assignCell);
              setAssignCell(null);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-focus)] bg-[var(--ms-bg-selected)] px-3 py-1 font-medium text-[12px] text-[var(--ms-text-brand)] hover:brightness-95"
            data-test-id="product-select-scan"
          >
            <ScanLine className="h-4 w-4" />
            {t('scan_button')}
          </button>
        }
        onConfirm={() => undefined}
        onConfirmSelection={(products: ProductSelectRow[]) => {
          if (!assignCell) return;
          assignMut.mutate({
            cellId: assignCell.id,
            productIds: products.map((p) => p.id),
          });
        }}
        labels={{
          title: assignCell
            ? `${t('assign_picker_title')} — ${assignCell.code}`
            : t('assign_picker_title'),
          searchPlaceholder: tProductSelect('searchPlaceholder'),
          refresh: tProductSelect('refresh'),
          priceColumns: tProductSelect('priceColumns'),
          colName: tProductSelect('colName'),
          colQty: tProductSelect('colQty'),
          colOnHand: tProductSelect('colOnHand'),
          colReserved: tProductSelect('colReserved'),
          colInTransit: tProductSelect('colInTransit'),
          colAvailable: tProductSelect('colAvailable'),
          colCode: tProductSelect('colCode'),
          colArticle: tProductSelect('colArticle'),
          colUom: tProductSelect('colUom'),
          colCountry: tProductSelect('colCountry'),
          colWeight: tProductSelect('colWeight'),
          colImage: tProductSelect('colImage'),
          colKind: tProductSelect('colKind'),
          colDescription: tProductSelect('colDescription'),
          colMinPrice: tProductSelect('colMinPrice'),
          colRetailPrice: tProductSelect('colRetailPrice'),
          colPrice: tProductSelect('colPrice'),
          select: tProductSelect('select'),
          cancel: tProductSelect('cancel'),
          close: tProductSelect('close'),
          empty: tProductSelect('empty'),
          loading: tProductSelect('loading'),
        }}
      />

      {/* Skan orqali biriktirish oynasi — «Mahsulot qo'shish»dagi «Skan»dan yoki
          bo'lim yuqorisidagi «Skan» tugmasidan ochiladi. */}
      <CellScanModal
        open={!!scanCell || scanOpen}
        onClose={() => {
          setScanCell(null);
          setScanOpen(false);
        }}
        storeId={storeId}
        storeName={storeName}
        expectedCell={
          scanCell ? { id: scanCell.id, code: scanCell.code, shelf: scanCell.shelf } : null
        }
        onLinked={() => qc.invalidateQueries({ queryKey: ['store-cells', storeId] })}
      />
    </div>
  );
}
