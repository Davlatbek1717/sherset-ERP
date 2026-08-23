'use client';

/**
 * «Yangi ombor raqamlashtirish» (F3, reja 2026-08-23) — katta omborchi yangi
 * omborni O'ZI qo'shadi: ombor raqami + har stelaj uchun qavat/o'rin sonlari →
 * `NN-SS-QQ-OO` yacheykalar ommaviy yaratiladi, zona = stelaj (`NN-SS`).
 *
 * CellRangeModal bilan bir xil shartnoma: nomlarni FE hosil QILMAYDI —
 * oldindan ko'rish ham, yaratish ham bitta `POST :id/warehouse-numbering`
 * endpointiga boradi (`dryRun` farqi bilan), xato matnlari serverdan
 * (o'zbekcha, stelaj raqami bilan) shundoq ko'rsatiladi.
 */

import type { SegmentRange } from '@/components/stores/cell-name-range';
import { api } from '@/lib/api-client';
import { Button, Input, Modal, useToast } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

/** Server javobi — `bulkCreateCells` bilan bir shakl (createMissingCells). */
interface NumberingResult {
  total: number;
  toCreate: number;
  existing: number;
  zonesToCreate: string[];
  sample: string[];
  created: number;
  zonesCreated: number;
}

interface StelajRow {
  qavatlar: string;
  orinlar: string;
}

const DEFAULT_ROW: StelajRow = { qavatlar: '4', orinlar: '10' };
const MAX_STELAJ = 99;

const digits = (raw: string, max: number) => raw.replace(/\D/g, '').slice(0, max);

export function WarehouseNumberingModal({
  open,
  storeId,
  onClose,
  onCreated,
}: {
  open: boolean;
  storeId: string;
  onClose(): void;
  /**
   * Yaratilgandan keyin: `ranges` — ombor segmenti bilan chegaralangan filtr
   * (`[{NN,NN}, null, null, null]`), ota-komponent shu bilan etiketka chop
   * etish oynasini ochadi — yangi omborning HAMMA yacheykasi belgilangan holda.
   */
  onCreated(ranges: Array<SegmentRange | null>): void;
}) {
  const t = useTranslations('pages.stores.address_storage');
  const tc = useTranslations('common');
  const { toast } = useToast();

  const [warehouseNo, setWarehouseNo] = useState('');
  const [rows, setRows] = useState<StelajRow[]>([{ ...DEFAULT_ROW }]);
  // Soni maydoni ALOHIDA matn: `String(rows.length)` bo'lsa maydonni tozalash
  // darhol «1» ga qaytarib, keyingi terilgan raqamga yopishib ketardi («13»).
  const [countText, setCountText] = useState('1');
  const [preview, setPreview] = useState<NumberingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Stelajlar soni o'zgarganda mavjud qatorlar SAQLANADI; yangi qatorlar
   *  oxirgi qator nusxasi — omborda stelajlar odatda bir xil o'lchamda. */
  const setCount = (raw: string) => {
    const text = digits(raw, 2);
    setCountText(text);
    if (text === '') return; // bo'sh — qatorlar turadi, foydalanuvchi teryapti
    const n = Math.min(Number(text), MAX_STELAJ);
    setRows((prev) => {
      if (n <= 0) return prev;
      if (n <= prev.length) return prev.slice(0, n);
      const last = prev[prev.length - 1] ?? DEFAULT_ROW;
      return [...prev, ...Array.from({ length: n - prev.length }, () => ({ ...last }))];
    });
  };

  const setRow = (i: number, patch: Partial<StelajRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const applyFirstToAll = () =>
    setRows((prev) => {
      const first = prev[0];
      if (!first) return prev;
      return prev.map(() => ({ ...first }));
    });

  const payload = useMemo(
    () => ({
      warehouseNo,
      stelajlar: rows.map((r) => ({ qavatlar: Number(r.qavatlar), orinlar: Number(r.orinlar) })),
    }),
    [warehouseNo, rows],
  );

  /** Yarim to'ldirilgan retsept so'rov YUBORMAYDI — `Number('') === 0` bo'lib,
   *  foydalanuvchi so'ramagan «0 qavat» xatosi ko'rinib qolardi. */
  const ready =
    /^\d{1,2}$/.test(warehouseNo.trim()) &&
    rows.length > 0 &&
    rows.every((r) => r.qavatlar.trim() !== '' && r.orinlar.trim() !== '');

  // Oldindan ko'rish — 400ms debounce (CellRangeModal bilan bir xil ritm).
  useEffect(() => {
    if (!open || !ready) {
      setPreview(null);
      return;
    }
    let alive = true;
    const id = setTimeout(() => {
      api
        .post<NumberingResult>(`/admin/stores/${storeId}/warehouse-numbering`, {
          ...payload,
          dryRun: true,
        })
        .then((r) => {
          if (!alive) return;
          setPreview(r);
          setError(null);
        })
        .catch((e: Error) => {
          if (!alive) return;
          setPreview(null);
          setError(e.message);
        });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [open, storeId, payload, ready]);

  const createMut = useMutation({
    mutationFn: () =>
      api.post<NumberingResult>(`/admin/stores/${storeId}/warehouse-numbering`, {
        ...payload,
        dryRun: false,
      }),
    onSuccess: (r) => {
      // HAQIQIY `created` — parallel sessiya oralab yaratgan bo'lsa server
      // kamroq yozadi va oyna yolg'on son aytmasligi kerak (range_done naqshi).
      toast.success(t('range_done', { created: r.created, skipped: r.existing }));
      const no = Number(warehouseNo);
      onCreated([{ from: no, to: no }, null, null, null]);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={t('numbering_title')}
      widthClass="w-[560px]"
      testId="warehouse-numbering-modal"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} data-test-id="numbering-cancel">
            {tc('cancel')}
          </Button>
          <Button
            onClick={() => createMut.mutate()}
            loading={createMut.isPending}
            disabled={!preview || preview.toCreate === 0}
            data-test-id="numbering-create"
          >
            {preview && preview.toCreate > 0
              ? t('numbering_create', { count: preview.toCreate })
              : t('range_nothing')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-4">
        <p className="text-[var(--ms-text-muted)] text-xs">{t('numbering_hint')}</p>

        <div className="flex flex-wrap items-end gap-4">
          <label className="block font-medium text-[var(--ms-text-secondary)] text-sm">
            {t('numbering_warehouse_no')}
            <Input
              value={warehouseNo}
              onChange={(e) => setWarehouseNo(digits(e.target.value, 2))}
              placeholder="03"
              className="mt-1 w-20"
              data-test-id="numbering-no"
            />
          </label>
          <label className="block font-medium text-[var(--ms-text-secondary)] text-sm">
            {t('numbering_stelaj_count')}
            <Input
              value={countText}
              onChange={(e) => setCount(e.target.value)}
              onBlur={() => setCountText(String(rows.length))}
              className="mt-1 w-20"
              data-test-id="numbering-count"
            />
          </label>
          {rows.length > 1 && (
            <Button
              variant="secondary"
              onClick={applyFirstToAll}
              data-test-id="numbering-apply-first"
            >
              {t('numbering_apply_first')}
            </Button>
          )}
        </div>

        <div className="max-h-64 overflow-y-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ms-text-muted)] text-xs">
                <th className="px-2 py-1 font-normal">{t('numbering_col_stelaj')}</th>
                <th className="px-2 py-1 font-normal">{t('numbering_col_qavat')}</th>
                <th className="px-2 py-1 font-normal">{t('numbering_col_orin')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: qator identikligi = stelaj tartib raqami (kodning 2-segmenti), indeks shu ma'noning o'zi
                <tr key={i} className="border-t border-t-[var(--ms-border-default)]">
                  <td className="px-2 py-1 font-medium">{String(i + 1).padStart(2, '0')}</td>
                  <td className="px-2 py-1">
                    <Input
                      value={r.qavatlar}
                      onChange={(e) => setRow(i, { qavatlar: digits(e.target.value, 2) })}
                      className="h-7 w-16"
                      aria-label={`${t('numbering_col_qavat')} ${i + 1}`}
                      data-test-id={`numbering-qavat-${i}`}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      value={r.orinlar}
                      onChange={(e) => setRow(i, { orinlar: digits(e.target.value, 2) })}
                      className="h-7 w-16"
                      aria-label={`${t('numbering_col_orin')} ${i + 1}`}
                      data-test-id={`numbering-orin-${i}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-app)] p-2 text-sm">
          <div className="mb-1 font-medium">{t('range_preview')}</div>
          {error ? (
            // Server matni SHUNDOQ ko'rsatiladi — o'zbekcha va stelaj raqamli.
            <p className="text-[var(--ms-text-destructive)] text-xs" data-test-id="numbering-error">
              {error}
            </p>
          ) : preview ? (
            <>
              <p data-test-id="numbering-counts">
                {t('range_total')}: {preview.total} · {preview.toCreate} {t('range_new')} ·{' '}
                {preview.existing} {t('range_existing')}
              </p>
              <p
                className="mt-1 text-[var(--ms-text-muted)] text-xs"
                data-test-id="numbering-sample"
              >
                {preview.sample.join(', ')}
              </p>
              {preview.zonesToCreate.length > 0 && (
                <p
                  className="mt-1 text-[var(--ms-text-muted)] text-xs"
                  data-test-id="numbering-zones"
                >
                  {t('range_zones_to_create')}: {preview.zonesToCreate.join(', ')}
                </p>
              )}
            </>
          ) : (
            <p className="text-[var(--ms-text-muted)] text-xs">…</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
