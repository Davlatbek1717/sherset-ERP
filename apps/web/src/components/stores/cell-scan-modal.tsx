'use client';

/**
 * CellScanModal — «Skanerlab biriktirish» (2026-07-17 talab): ikki bosqichli
 * skan orqali mahsulotni yacheykaga bog'lash.
 *
 *   1-bosqich — yacheyka shtrix-kodini skanerlash (polkaga yopishtirilgan
 *      label; CODE128C 8-raqam yoki tireli kod). Server shu kod bo'yicha
 *      aniq yacheykani topadi (POST /admin/stores/:id/cells/resolve).
 *   2-bosqich — mahsulotning asl (ishlab chiqaruvchi) shtrix-kodini skanerlash.
 *      Server mahsulotni topib avtomatik shu yacheykaga biriktiradi
 *      (POST /admin/stores/:id/cells/:cellId/scan-link) — tugma bosish shart
 *      emas. Yacheyka o'zgarmay qoladi, shuning uchun bitta yacheykaga ketma-ket
 *      bir nechta mahsulotni tez skanerlab bo'ladi.
 *
 * Skanerlash USB/Bluetooth klaviatura-skaner (maydonga «yozadi» + Enter) yoki
 * kamera (BarcodeCamera) orqali. Modal ochiqligida global keyboard-wedge
 * (use-barcode-scanner) o'chadi — bu yerda fokusdagi maydon + Enter ishlatiladi,
 * to'qnashuv yo'q. Har bosqichda qaysi kod kutilayotgani aniq ko'rsatiladi.
 *
 * Yacheyka aniqlangach, uning JORIY tarkibi (shu manzilga biriktirilgan barcha
 * mahsulotlar) ko'rsatiladi va har biriktirishdan keyin yangilanadi — bu «faqat
 * yacheykani skanerlab tarkibini ko'rish» stsenariysini ham qamrab oladi.
 */

import { BarcodeCamera } from '@/components/scan/barcode-camera';
import { api } from '@/lib/api-client';
import { Button, Input, Modal, cn, formatMoney, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, Keyboard, Package, ScanLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

interface ResolvedCell {
  id: string;
  code: string;
  shelf: string | null;
}

interface ScanLinkResult {
  ok: boolean;
  alreadyLinked: boolean;
  cell: { code: string };
  product: {
    id: string;
    name: string;
    code: string | null;
    article: string | null;
    uom: string | null;
    barcode: string;
    /** Sotuv narxi (minor). TAN NARX serverdan kelmaydi. */
    salePrice: string | null;
    totalQty: number;
  };
}

interface CellContentItem {
  id: string;
  name: string;
  code: string | null;
  article: string | null;
  uom: string | null;
  totalQty: number;
  cellQty: string | null;
  /** Sotuv narxi (minor). TAN NARX serverdan umuman kelmaydi. */
  salePrice: string | null;
}
interface CellContentsResponse {
  cell: { code: string };
  items: CellContentItem[];
}

export interface CellScanModalProps {
  open: boolean;
  onClose: () => void;
  storeId: string;
  storeName: string;
  /**
   * ➕ bosilgan yacheyka — agar berilsa, yacheyka ALLAQACHON ma'lum: modal
   * ochilishi bilan shu yacheyka tanlangan holatga o'tadi va foydalanuvchi
   * to'g'ridan-to'g'ri mahsulot skaneriga tushadi (yacheyka shtrixini skanerlash
   * SHART EMAS). null — bo'lim yuqorisidagi mustaqil «Skan» (yacheyka ro'yxatdan
   * tanlanadi yoki skanerlanadi).
   */
  expectedCell?: { id: string; code: string; shelf?: string | null } | null;
  /** Biriktirish yakunlangach ombor yacheykalari band/bo'sh hisobini yangilash. */
  onLinked?: () => void;
}

export function CellScanModal({
  open,
  onClose,
  storeId,
  storeName,
  expectedCell,
  onLinked,
}: CellScanModalProps) {
  const t = useTranslations('pages.stores');
  const { toast } = useToast();
  const qc = useQueryClient();

  const [stage, setStage] = useState<'cell' | 'product'>('cell');
  const [cell, setCell] = useState<ResolvedCell | null>(null);
  const [cellInput, setCellInput] = useState('');
  const [productInput, setProductInput] = useState('');
  const [camera, setCamera] = useState(false);

  const cellRef = useRef<HTMLInputElement>(null);
  const productRef = useRef<HTMLInputElement>(null);
  // Modal bir marta ochilganda expectedCell'ni bir marta «iste'mol» qilish uchun
  // (foydalanuvchi «Boshqa yacheyka» bosgach qayta tanlanib qolmasligi kerak).
  const initRef = useRef(false);

  const reset = () => {
    setStage('cell');
    setCell(null);
    setCellInput('');
    setProductInput('');
    setCamera(false);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      reset();
      onClose();
    }
  };

  // Ochilishda: ➕ orqali kelingan bo'lsa (expectedCell) — yacheykani darhol
  // tanlangan deb belgilaymiz va mahsulot bosqichiga o'tamiz (yacheyka shtrixini
  // skanerlash shart emas). Faqat bir marta, ochilish boshida.
  useEffect(() => {
    if (!open) {
      initRef.current = false;
      return;
    }
    if (initRef.current) return;
    initRef.current = true;
    if (expectedCell) {
      setCell({ id: expectedCell.id, code: expectedCell.code, shelf: expectedCell.shelf ?? null });
      setStage('product');
    }
  }, [open, expectedCell]);

  // Bosqichga qarab tegishli maydonni fokuslash (skaner darhol «yoza» boshlaydi).
  useEffect(() => {
    if (!open || camera) return;
    const el = stage === 'cell' ? cellRef.current : productRef.current;
    const id = setTimeout(() => el?.focus(), 30);
    return () => clearTimeout(id);
  }, [open, stage, camera]);

  // ── Yacheyka JORIY tarkibi (qidiruv rejimi + biriktirish tasdig'i) ──
  const cellCode = cell?.code ?? null;
  const { data: contents } = useQuery<CellContentsResponse>({
    queryKey: ['cell-contents', cellCode],
    queryFn: () =>
      api.get<CellContentsResponse>(`/products/cell/${encodeURIComponent(cellCode ?? '')}`),
    enabled: open && !!cellCode,
  });

  // ── 1-bosqich: yacheyka kodini aniqlash ──
  const resolveMut = useMutation({
    mutationFn: (code: string) =>
      api.post<ResolvedCell>(`/admin/stores/${storeId}/cells/resolve`, { code }),
    onSuccess: (resolved) => {
      setCell(resolved);
      setStage('product');
      setCellInput('');
      setProductInput('');
      toast.success(t('scan_cell_resolved', { code: resolved.code }));
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setCellInput('');
      cellRef.current?.focus();
    },
  });

  // ── 2-bosqich: mahsulotni biriktirish ──
  const linkMut = useMutation({
    mutationFn: ({ cellId, barcode }: { cellId: string; barcode: string }) =>
      api.post<ScanLinkResult>(`/admin/stores/${storeId}/cells/${cellId}/scan-link`, { barcode }),
    onSuccess: (res) => {
      // Skanerlangan mahsulot ma'lumoti darhol ko'rinadi: nomi + sotuv narxi +
      // jami qoldiq (TAN NARX serverdan kelmaydi, ko'rsatilmaydi).
      const p = res.product;
      const info = [
        p.salePrice && p.salePrice !== '0' ? formatMoney(p.salePrice, 'UZS') : null,
        `${p.totalQty.toLocaleString('ru-RU', { maximumFractionDigits: 3 })}${p.uom ? ` ${p.uom}` : ''}`,
      ]
        .filter(Boolean)
        .join(' · ');
      if (res.alreadyLinked) {
        toast.info(t('scan_already_linked', { name: p.name }), { description: info });
      } else {
        toast.success(t('scan_linked', { name: p.name }), { description: info });
      }
      setProductInput('');
      qc.invalidateQueries({ queryKey: ['cell-contents', cellCode] });
      onLinked?.();
      productRef.current?.focus();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setProductInput('');
      productRef.current?.focus();
    },
  });

  const submitCell = (raw: string) => {
    const code = raw.trim();
    if (!code || resolveMut.isPending) return;
    resolveMut.mutate(code);
  };
  const submitProduct = (raw: string) => {
    const barcode = raw.trim();
    if (!barcode || !cell || linkMut.isPending) return;
    linkMut.mutate({ cellId: cell.id, barcode });
  };

  // Kamera o'qigan kodni faol bosqichga uzatish.
  const onCameraResult = (text: string) => {
    if (stage === 'cell') submitCell(text);
    else submitProduct(text);
  };

  const Step = ({
    n,
    label,
    state,
  }: {
    n: number;
    label: string;
    state: 'done' | 'active' | 'idle';
  }) => (
    <div className="flex items-center gap-2" data-test-id={`scan-step-${n}`}>
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-semibold text-xs',
          state === 'done' && 'bg-[var(--ms-success-500)] text-white',
          state === 'active' && 'bg-[var(--ms-border-focus)] text-white',
          state === 'idle' &&
            'border border-[var(--ms-border-default)] text-[var(--ms-text-muted)]',
        )}
      >
        {state === 'done' ? <CheckCircle2 className="h-4 w-4" /> : n}
      </span>
      <span
        className={cn('text-sm', state === 'idle' ? 'text-[var(--ms-text-muted)]' : 'font-medium')}
      >
        {label}
      </span>
    </div>
  );

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title={t('scan_modal_title')}
      description={storeName}
      widthClass="w-[520px]"
      testId="cell-scan-modal"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setCamera((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[var(--ms-radius-default)] border px-3 py-1.5 text-sm',
              camera
                ? 'border-[var(--ms-border-focus)] bg-[var(--ms-bg-selected)] text-[var(--ms-text-brand)]'
                : 'border-[var(--ms-border-strong)] text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-hover)]',
            )}
            data-test-id="scan-camera-toggle"
          >
            {camera ? <Keyboard className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            {camera ? t('scan_camera_off') : t('scan_camera_on')}
          </button>
          <Button variant="secondary" onClick={() => handleOpenChange(false)}>
            {t('scan_done')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        {/* ── Bosqich ko'rsatkichi ──
            flex-wrap (2026-07-20f): tor modalda (max-w-[calc(100vw-2rem)]
            bilan qisilganda) ikkala qadam-belgi ustma-ust tushmasin. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Step n={1} label={t('scan_step_cell')} state={cell ? 'done' : 'active'} />
          <div className="h-px min-w-[16px] flex-1 bg-[var(--ms-border-default)]" />
          <Step n={2} label={t('scan_step_product')} state={cell ? 'active' : 'idle'} />
        </div>

        {/* ── Kamera (yoqilgan bo'lsa) — faol bosqichga uzatadi ── */}
        {camera && (
          <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[var(--ms-text-secondary)] text-xs">
              <ScanLine className="h-3.5 w-3.5" />
              {stage === 'cell' ? t('scan_active_cell') : t('scan_active_product')}
            </div>
            <BarcodeCamera onResult={onCameraResult} />
          </div>
        )}

        {/* ── 1-bosqich maydoni: yacheyka ── */}
        <div
          className={cn(
            'rounded-[var(--ms-radius-default)] border p-3',
            stage === 'cell' && !cell
              ? 'border-[var(--ms-border-focus)] bg-[var(--ms-bg-selected)]'
              : 'border-[var(--ms-border-default)]',
          )}
        >
          <label
            htmlFor="scan-cell-input"
            className="mb-1 block font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {t('scan_step_cell')}
          </label>
          {cell ? (
            <div
              className="flex items-center gap-2 text-[var(--ms-success-700)]"
              data-test-id="scan-cell-resolved"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-mono font-semibold tracking-wider">{cell.code}</span>
              {cell.shelf && (
                <span className="text-[var(--ms-text-muted)] text-sm">
                  · {t('col_polka')}: {cell.shelf}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  reset();
                }}
                className="ml-auto text-[var(--ms-text-brand)] text-sm hover:underline"
                data-test-id="scan-change-cell"
              >
                {t('scan_change_cell')}
              </button>
            </div>
          ) : (
            <>
              {/* Sof skan — yacheyka labelini skanerlash (yoki qo'lda kiritish). */}
              <Input
                ref={cellRef}
                id="scan-cell-input"
                value={cellInput}
                placeholder={t('scan_cell_placeholder')}
                autoComplete="off"
                onChange={(e) => setCellInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitCell(cellInput);
                  }
                }}
                data-test-id="scan-cell-input"
              />
              <p className="mt-1 text-[var(--ms-text-muted)] text-xs">{t('scan_cell_hint')}</p>
            </>
          )}
        </div>

        {/* ── 2-bosqich maydoni: mahsulot ── */}
        <div
          className={cn(
            'rounded-[var(--ms-radius-default)] border p-3',
            stage === 'product'
              ? 'border-[var(--ms-border-focus)] bg-[var(--ms-bg-selected)]'
              : 'border-[var(--ms-border-default)] opacity-60',
          )}
        >
          <label
            htmlFor="scan-product-input"
            className="mb-1 block font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {t('scan_step_product')}
          </label>
          <Input
            ref={productRef}
            id="scan-product-input"
            value={productInput}
            placeholder={t('scan_product_placeholder')}
            autoComplete="off"
            disabled={!cell}
            onChange={(e) => setProductInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitProduct(productInput);
              }
            }}
            data-test-id="scan-product-input"
          />
          <p className="mt-1 text-[var(--ms-text-muted)] text-xs">{t('scan_product_hint')}</p>
        </div>

        {/* ── Yacheyka joriy tarkibi (qidiruv rejimi + biriktirish tasdig'i) ── */}
        {cell && (
          <div data-test-id="scan-cell-contents">
            <div className="mb-1.5 flex items-center gap-1.5 text-[var(--ms-text-secondary)] text-sm">
              <Package className="h-4 w-4" />
              {t('scan_contents_title')}
              {contents?.items.length ? (
                <span className="text-[var(--ms-text-muted)]">({contents.items.length})</span>
              ) : null}
            </div>
            {contents && contents.items.length === 0 ? (
              <p className="text-[var(--ms-text-muted)] text-sm" data-test-id="scan-contents-empty">
                {t('scan_contents_empty')}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
                {(contents?.items ?? []).map((it) => (
                  <li
                    key={it.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                    data-test-id={`scan-content-${it.id}`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-sm">{it.name}</div>
                      <div className="text-[var(--ms-text-muted)] text-xs">
                        {[it.code, it.article].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm tabular-nums">
                        {it.totalQty.toLocaleString('ru-RU', { maximumFractionDigits: 3 })}
                        {it.uom ? ` ${it.uom}` : ''}
                      </div>
                      {it.salePrice && it.salePrice !== '0' && (
                        <div className="text-[var(--ms-text-muted)] text-xs tabular-nums">
                          {formatMoney(it.salePrice, 'UZS')}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
