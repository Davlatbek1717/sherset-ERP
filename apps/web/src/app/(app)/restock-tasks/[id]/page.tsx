'use client';

/**
 * /restock-tasks/[id] — «Joylashtirish vazifasi» checklist (Sherset custom).
 * The warehouse-keeper (omborchi) sees each returned product + its home bin
 * location «NN-NN-NN-NN» and confirms placement by scanning the senik QR (camera)
 * or pressing «Joylandi». When every line is confirmed the task is «done».
 */
import {
  type PieceLabelItem,
  PieceLabelPrintOverlay,
} from '@/components/omborchi/piece-label-print';
import { QrScanner } from '@/components/restock/qr-scanner';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { restockStatusTone } from '@/lib/domain-status-tone';
import { Badge, Button, Input, Modal, NativeSelect, formatDate } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

/** K4 — bo'lak (kesim manbasi yoki natijasi). */
interface RestockPiece {
  id: string;
  label: string | null;
  length: string;
  whole: boolean;
  cellName: string | null;
}

interface RestockLine {
  id: string;
  productId: string | null;
  productName: string;
  quantity: string;
  binLocation: string | null;
  confirmedAt: string | null;
  confirmedByName: string | null;
  /**
   * G6 — omborchi TSD'da «javonda topolmadim» degan MUTLAQ miqdor
   * (`null` = belgilanmagan). Bu yerda faqat KO'RSATILADI: belgi qo'yish
   * terminal ekranining ishi, chekni kamaytirish esa kontrolniki (G2).
   */
  shortageQty: string | null;
  shortageNote: string | null;
  shortageByName: string | null;
  /**
   * K4 — bo'linadigan tovar (kabel/sim/shlang). Bayrog'i o'chiq qatorlarda
   * `false` va qolgan maydonlar UMUMAN kelmaydi ⇒ ekran bir bayt ham
   * o'zgarmaydi.
   */
  pieceTracked?: boolean;
  /** Kassirning mijoz bilan kelishgani: `['150','30']`. */
  agreedLengths?: string[];
  /** Omborchi tanlashi mumkin bo'lgan manbalar (eng uzuni birinchi). */
  pieceOptions?: RestockPiece[];
  /** Shu qator uchun ALLAQACHON kesilgan bo'laklar. */
  cutPieces?: RestockPiece[];
  cutCoverage?: 'not-required' | 'covered' | 'partial' | 'missing';
}
interface RestockTaskDetail {
  id: string;
  sourceName: string | null;
  storeName: string | null;
  assigneeName: string | null;
  createdByName: string | null;
  status: 'pending' | 'in_progress' | 'done';
  note: string | null;
  createdAt: string;
  lines: RestockLine[];
}

/** Pull the product UUID out of a scanned senik QR («{origin}/products/{id}»). */
function productIdFromScan(text: string): string | null {
  const m = text.match(
    /products\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/,
  );
  if (m?.[1]) return m[1];
  // Bare UUID fallback (if the QR encodes just the id).
  const bare = text
    .trim()
    .match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
  return bare?.[0] ?? null;
}

export default function RestockTaskDetailPage() {
  const t = useTranslations('restock');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [scanOpen, setScanOpen] = useState(false);
  // K4 — kesim oynasi va undan keyin AVTOMATIK ochiladigan yorliq oynasi.
  const [cutLine, setCutLine] = useState<RestockLine | null>(null);
  const [labelItems, setLabelItems] = useState<PieceLabelItem[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['restock-task', id],
    queryFn: () => api.get<RestockTaskDetail>(`/restock-tasks/${id}`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['restock-task', id] });

  const confirmLineMut = useApiMutation({
    mutationFn: (lineId: string) => api.post(`/restock-tasks/${id}/lines/${lineId}/confirm`, {}),
    successMessage: t('placed_success'),
    onSuccess: invalidate,
  });

  const confirmScanMut = useApiMutation({
    mutationFn: (productId: string) => api.post(`/restock-tasks/${id}/confirm-scan`, { productId }),
    successMessage: t('scan_success'),
    onSuccess: invalidate,
  });

  const handleScan = (text: string) => {
    const productId = productIdFromScan(text);
    if (!productId) return; // ignore non-product QR codes
    confirmScanMut.mutate(productId);
  };

  /**
   * K4 — KESIM. Javobdagi yorliqlar bo'yicha chop etish oynasi AVTOMATIK
   * ochiladi (K-reja 5-bo'lim: «har kesim yorliq bosilishi bilan tugaydi»).
   * Yorliq matni yangi holatdan quriladi: mijoz bo'lagi `cutPieces` da,
   * omborda qolgan yangi bo'lak esa `pieceOptions` da bo'ladi.
   */
  const cutMut = useApiMutation({
    mutationFn: (vars: {
      lineId: string;
      pieceId?: string;
      label?: string;
      cutLength: string;
      remainingLength?: string;
    }) =>
      api.post<{ task: RestockTaskDetail; labels: string[] }>(
        `/restock-tasks/${id}/lines/${vars.lineId}/cut`,
        {
          ...(vars.pieceId ? { pieceId: vars.pieceId } : {}),
          ...(vars.label ? { label: vars.label } : {}),
          cutLength: vars.cutLength,
          ...(vars.remainingLength ? { remainingLength: vars.remainingLength } : {}),
        },
      ),
    successMessage: t('cut_success'),
    onSuccess: (res, vars) => {
      invalidate();
      setCutLine(null);
      const line = res.task.lines.find((l) => l.id === vars.lineId);
      const fresh = [...(line?.cutPieces ?? []), ...(line?.pieceOptions ?? [])];
      setLabelItems(
        res.labels
          .map((label) => fresh.find((p) => p.label === label))
          .filter((p): p is RestockPiece => p != null)
          .map((p) => ({
            key: p.id,
            label: p.label ?? '',
            lengthText: `${Number(p.length)} m`,
            productName: line?.productName ?? '',
            cellName: p.cellName,
          })),
      );
    },
  });

  if (isLoading || !data) {
    return <div className="p-6 text-[var(--ms-text-muted)]">…</div>;
  }

  const total = data.lines.length;
  // G6 — yetishmovchilik belgilangan qator ham YOPIQ (`restock-task-progress.ts`),
  // ya'ni «bajarildi» hisobi uni ham sanaydi; aks holda 100 % ga hech qachon
  // yetmaydigan ro'yxat chiqardi.
  const confirmed = data.lines.filter((l) => l.confirmedAt || l.shortageQty).length;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => router.push('/restock-tasks')}
            className="mb-1 text-[var(--ms-text-muted)] text-xs hover:underline"
          >
            ← {t('list_title')}
          </button>
          <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">
            {data.sourceName ?? t('source_fallback')}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--ms-text-muted)] text-sm">
            {data.storeName && <span>{data.storeName}</span>}
            <span>
              {t('col_omborchi')}:{' '}
              <span className="text-[var(--ms-text-secondary)]">{data.assigneeName ?? '—'}</span>
            </span>
            <span>{formatDate(data.createdAt)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={restockStatusTone(data.status)}>{t(`status_${data.status}`)}</Badge>
          <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
            {confirmed}/{total}
          </span>
        </div>
      </div>

      <div>
        <Button
          variant="primary"
          onClick={() => setScanOpen(true)}
          disabled={confirmed === total}
          data-test-id="restock-scan-open"
        >
          {t('scan_button')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
        <table className="w-full text-sm" data-test-id="restock-lines-table">
          <thead>
            <tr className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] text-left text-[var(--ms-text-secondary)] text-xs">
              <th className="px-3 py-2 font-medium">{t('line_product')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('line_qty')}</th>
              <th className="px-3 py-2 font-medium">{t('line_location')}</th>
              <th className="px-3 py-2 font-medium">{t('line_status')}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line) => (
              <tr
                key={line.id}
                className="border-[var(--ms-border-default)] border-b last:border-0"
                data-test-id={`restock-line-${line.id}`}
              >
                <td className="px-3 py-2 font-medium text-[var(--ms-text-primary)]">
                  {line.productName}
                  {/* K4 — bo'linadigan tovar: kassirning kelishuvi va kesilgan
                      bo'laklar. Bayrog'i o'chiq qatorda blok UMUMAN chizilmaydi. */}
                  {line.pieceTracked && (
                    <div
                      className="mt-1 space-y-0.5 font-normal text-xs"
                      data-test-id="line-pieces"
                    >
                      {(line.agreedLengths?.length ?? 0) > 1 && (
                        <div className="text-[var(--ms-text-secondary)]">
                          {t('cut_agreed')}: {line.agreedLengths?.join(' + ')}
                        </div>
                      )}
                      {(line.cutPieces?.length ?? 0) > 0 ? (
                        <div className="text-[var(--ms-text-success)]" data-test-id="line-cut-done">
                          ✂{' '}
                          {line.cutPieces
                            ?.map((p) => `${p.label ?? '—'} · ${Number(p.length)}`)
                            .join(' + ')}
                        </div>
                      ) : (
                        <div className="text-[var(--ms-text-muted)]">
                          {t('cut_pieces_available', { count: line.pieceOptions?.length ?? 0 })}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(line.quantity)}</td>
                <td className="px-3 py-2">
                  <span className="font-mono font-semibold text-[var(--ms-text-primary)] tabular-nums tracking-wider">
                    {line.binLocation ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {line.confirmedAt ? (
                    <span
                      className="inline-flex items-center gap-1 text-[var(--ms-text-success)]"
                      data-test-id="line-confirmed"
                    >
                      ✓ {t('confirmed')}
                      {line.confirmedByName && (
                        <span className="text-[var(--ms-text-muted)] text-xs">
                          · {line.confirmedByName}
                        </span>
                      )}
                    </span>
                  ) : line.shortageQty ? (
                    <span
                      className="inline-flex items-center gap-1 text-[var(--ms-text-warning)]"
                      data-test-id="line-shortage"
                    >
                      ⚠ {t('shortage', { qty: Number(line.shortageQty) })}
                      {line.shortageByName && (
                        <span className="text-[var(--ms-text-muted)] text-xs">
                          · {line.shortageByName}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[var(--ms-text-muted)]">{t('pending')}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {!line.confirmedAt && !line.shortageQty && (
                    <div className="flex justify-end gap-2">
                      {/* K4 — kesim tugmasi FAQAT reyestrda manba bo'lganda:
                          reyestr bo'sh bo'lsa qator odatdagidek yopiladi
                          (`not-required`, K3 ning `no-registry` qoidasi). */}
                      {line.pieceTracked && (line.pieceOptions?.length ?? 0) > 0 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setCutLine(line)}
                          data-test-id={`restock-cut-${line.id}`}
                        >
                          {t('cut_button')}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => confirmLineMut.mutate(line.id)}
                        loading={confirmLineMut.isPending}
                        data-test-id={`restock-place-${line.id}`}
                      >
                        {t('placed_button')}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.note && (
        <div className="text-[var(--ms-text-muted)] text-sm">
          {t('note_label')}: {data.note}
        </div>
      )}

      <Modal
        open={scanOpen}
        onOpenChange={setScanOpen}
        title={t('scan_button')}
        widthClass="w-[380px]"
        testId="restock-scan-modal"
      >
        <div className="space-y-2">
          <p className="text-[var(--ms-text-muted)] text-sm">{t('scan_hint')}</p>
          {scanOpen && <QrScanner onResult={handleScan} />}
        </div>
      </Modal>

      {cutLine && (
        <CutModal
          line={cutLine}
          onClose={() => setCutLine(null)}
          pending={cutMut.isPending}
          onSubmit={(vars) => cutMut.mutate({ lineId: cutLine.id, ...vars })}
        />
      )}

      {/* K4/5-vazifa — kesimdan keyin yorliq AVTOMATIK chiqadi. */}
      {labelItems.length > 0 && (
        <PieceLabelPrintOverlay items={labelItems} onClose={() => setLabelItems([])} />
      )}
    </div>
  );
}

/**
 * K4 — KESIM OYNASI (K-reja 5-bo'lim, 3-qadam).
 *
 * Uch kiritish: manba (skaner yoki ro'yxat) → kesilgan uzunlik → qolgan
 * uzunlik. Qoldiqni TIZIM TAKLIF qiladi (`manba − kesim`), lekin omborchi
 * uni TUZATA oladi: haqiqatda 68 chiqishi mumkin. Farq `cut-loss` bo'lib
 * reyestrdan chiqadi va QOLDIQQA TEGMAYDI (egasining 2026-08-25 qarori).
 *
 * Kesilgan uzunlikning sukut qiymati — hali qoplanmagan miqdor: eng ko'p
 * uchraydigan holat «mijoz so'ragan hammasini bitta bo'lakdan kesish».
 */
function CutModal({
  line,
  pending,
  onClose,
  onSubmit,
}: {
  line: RestockLine;
  pending: boolean;
  onClose: () => void;
  onSubmit: (vars: {
    pieceId?: string;
    label?: string;
    cutLength: string;
    remainingLength?: string;
  }) => void;
}) {
  const t = useTranslations('restock');
  const options = line.pieceOptions ?? [];
  const alreadyCut = (line.cutPieces ?? []).reduce((sum, p) => sum + Number(p.length), 0);
  const need = Math.max(0, Number(line.quantity) - alreadyCut);

  const [sourceId, setSourceId] = useState<string>(options[0]?.id ?? '');
  const [scan, setScan] = useState('');
  const [cutLength, setCutLength] = useState(String(need || ''));
  const [remaining, setRemaining] = useState('');

  const source = options.find((p) => p.id === sourceId) ?? null;
  const suggested =
    source && cutLength ? Math.max(0, Number(source.length) - Number(cutLength)) : null;

  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={t('cut_title')}
      widthClass="w-[460px]"
      testId="restock-cut-modal-dialog"
    >
      {/* `data-test-id` — bu repoda testlar shu atributdan qidiradi
          (`test-utils` sozlamasi); Modal'ning o'z `testId` i `data-testid`
          yozadi va u boshqa makon. */}
      <div className="space-y-3" data-test-id="restock-cut-modal">
        <div className="text-[var(--ms-text-secondary)] text-sm">
          {line.productName} · {t('cut_need', { qty: need })}
        </div>

        {/* Skaner-do'st: `BLK-` yorlig'i kiritilsa manba SHU bo'lak bo'ladi
            (ro'yxatdan tanlash — muqobil yo'l, butun rulonda yorliq YO'Q). */}
        <label className="block space-y-1">
          <span className="text-[var(--ms-text-muted)] text-xs">{t('cut_scan_label')}</span>
          <Input
            className="h-11"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            placeholder="BLK-000041"
            data-test-id="cut-scan-input"
          />
        </label>

        {!scan.trim() && (
          <label className="block space-y-1">
            <span className="text-[var(--ms-text-muted)] text-xs">{t('cut_source_label')}</span>
            <NativeSelect
              selectClassName="h-11"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              data-test-id="cut-source-select"
            >
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.label ?? t('cut_whole_roll')) +
                    ` · ${Number(p.length)}` +
                    (p.cellName ? ` · ${p.cellName}` : '')}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-[var(--ms-text-muted)] text-xs">{t('cut_length_label')}</span>
            <Input
              className="h-11"
              value={cutLength}
              onChange={(e) => setCutLength(e.target.value)}
              inputMode="decimal"
              data-test-id="cut-length-input"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[var(--ms-text-muted)] text-xs">
              {t('cut_remaining_label')}
              {suggested !== null && ` (${suggested})`}
            </span>
            <Input
              className="h-11"
              value={remaining}
              onChange={(e) => setRemaining(e.target.value)}
              inputMode="decimal"
              placeholder={suggested !== null ? String(suggested) : ''}
              data-test-id="cut-remaining-input"
            />
          </label>
        </div>

        <p className="text-[var(--ms-text-muted)] text-xs">{t('cut_hint')}</p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" className="min-h-[44px]" onClick={onClose}>
            {t('cut_cancel')}
          </Button>
          <Button
            className="min-h-[44px]"
            loading={pending}
            disabled={!cutLength.trim() || (!scan.trim() && !sourceId)}
            onClick={() =>
              onSubmit({
                ...(scan.trim() ? { label: scan.trim() } : { pieceId: sourceId }),
                cutLength: cutLength.trim(),
                ...(remaining.trim() ? { remainingLength: remaining.trim() } : {}),
              })
            }
            data-test-id="cut-submit"
          >
            {t('cut_submit')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
