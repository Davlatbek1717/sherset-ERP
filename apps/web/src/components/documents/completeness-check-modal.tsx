'use client';

/**
 * «Проверить комплектацию» — moysklad's document completeness check.
 *
 * DOC-GROUNDED flow (support.moysklad.ru article 360024335613 +
 * moysklad.ru/news/proverka-raskhozhdeniy-v-zakazakh-otgruzkakh-i-drugikh-dokumentakh):
 * the user enters the ACTUAL quantities — by scanning barcodes / typing into
 * the «Добавить позицию» field (each hit +1) or editing «Количество по факту»
 * directly — and the window computes the per-line discrepancy: «Разница» and
 * the status «Не хватает» / «Лишнее» / «Сошлось».
 *
 *  - «Изменить текущий документ» writes the counted facts back to the source
 *    document — ONLY lines with a counted fact > 0 (an untouched line is never
 *    zeroed/deleted by the check; the destructive interpretation is avoided
 *    deliberately until the live modal is pixel-grounded).
 *  - «Принять и завершить проверку» finishes the check without altering
 *    the document.
 *
 * NOTE: pixel-parity of this window is UNVERIFIED — the live modal could not
 * be captured on this machine (no moysklad creds); labels/flow quoted from
 * the official docs. Localized strings are injected by the caller (RU-leak
 * protection, same approach as ProductSelectModalLabels).
 */

import { Button, Modal, cn } from '@moysklad/ui';
import { useMemo, useRef, useState } from 'react';

export interface CompletenessCheckRow {
  /** Position row id (the caller's local/persisted row key). */
  id: string;
  name: string;
  code?: string | null;
  article?: string | null;
  /** Identifiers a scan can match in addition to code/article/name. */
  barcodes?: string[];
  /** Planned quantity (the document's «Кол-во»). Decimal string. */
  quantity: string;
}

export interface CompletenessCheckLabels {
  title: string;
  scanPlaceholder: string;
  colName: string;
  colQty: string;
  colFact: string;
  colDiff: string;
  colStatus: string;
  statusShort: string;
  statusOver: string;
  statusOk: string;
  applyToDoc: string;
  accept: string;
  cancel: string;
  notFound: string;
}

export interface CompletenessCheckModalProps {
  open: boolean;
  onClose: () => void;
  rows: CompletenessCheckRow[];
  labels: CompletenessCheckLabels;
  /** «Изменить текущий документ» — apply the counted facts (only rows with
   *  fact > 0 that differ from plan). Button hidden when omitted. */
  onApplyToDocument?: (updated: Array<{ id: string; quantity: string }>) => void;
  /** «Принять и завершить проверку» — finish without altering the document. */
  onAccept: () => void;
  testId?: string;
}

type RowStatus = 'short' | 'over' | 'ok';

function statusOf(planRaw: string, factRaw: string | undefined): { diff: number; s: RowStatus } {
  const plan = Number(planRaw) || 0;
  const fact = Number(factRaw ?? '0') || 0;
  const diff = fact - plan;
  return { diff, s: diff === 0 ? 'ok' : diff < 0 ? 'short' : 'over' };
}

export function CompletenessCheckModal({
  open,
  onClose,
  rows,
  labels,
  onApplyToDocument,
  onAccept,
  testId,
}: CompletenessCheckModalProps) {
  // Counted «Количество по факту» per row id. Starts EMPTY (0 counted) — a
  // fresh check reads «Не хватает» on every line until items are scanned.
  const [fact, setFact] = useState<Record<string, string>>({});
  const [scan, setScan] = useState('');
  const [scanMiss, setScanMiss] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFact({});
    setScan('');
    setScanMiss(false);
  };

  // Scan/type + Enter: match code / article / barcode / name (case-insensitive
  // exact, else unique substring of the name) → that line's fact +1.
  const handleScan = () => {
    const q = scan.trim().toLowerCase();
    if (!q) return;
    const exact = rows.find(
      (r) =>
        r.code?.toLowerCase() === q ||
        r.article?.toLowerCase() === q ||
        r.barcodes?.some((b) => b.toLowerCase() === q) ||
        r.name.toLowerCase() === q,
    );
    const partial = rows.filter((r) => r.name.toLowerCase().includes(q));
    const hit = exact ?? (partial.length === 1 ? partial[0] : undefined);
    if (!hit) {
      setScanMiss(true);
      return;
    }
    setScanMiss(false);
    setFact((m) => ({ ...m, [hit.id]: String((Number(m[hit.id]) || 0) + 1) }));
    setScan('');
    scanRef.current?.focus();
  };

  const hasDiscrepancy = useMemo(
    () => rows.some((r) => statusOf(r.quantity, fact[r.id]).s !== 'ok'),
    [rows, fact],
  );
  const applicableChanges = useMemo(
    () =>
      rows
        .filter((r) => {
          const f = Number(fact[r.id] ?? '0') || 0;
          return f > 0 && f !== Number(r.quantity);
        })
        .map((r) => ({ id: r.id, quantity: String(Number(fact[r.id])) })),
    [rows, fact],
  );

  const STATUS_STYLE: Record<RowStatus, string> = {
    short: 'bg-[var(--ms-action-destructive)] text-white',
    over: 'bg-[#f5a623] text-white',
    ok: 'bg-[var(--ms-success-500)] text-white',
  };
  const STATUS_LABEL: Record<RowStatus, string> = {
    short: labels.statusShort,
    over: labels.statusOver,
    ok: labels.statusOk,
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
      title={labels.title}
      widthClass="w-[760px]"
      testId={testId ?? 'completeness-check-modal'}
      footer={
        <>
          {onApplyToDocument && (
            <Button
              type="button"
              variant="secondary"
              disabled={applicableChanges.length === 0}
              onClick={() => {
                onApplyToDocument(applicableChanges);
                reset();
              }}
              data-test-id="completeness-apply"
            >
              {labels.applyToDoc}
            </Button>
          )}
          <Button
            type="button"
            variant="success"
            onClick={() => {
              onAccept();
              reset();
            }}
            data-test-id="completeness-accept"
          >
            {labels.accept}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
            data-test-id="completeness-cancel"
          >
            {labels.cancel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 px-4 py-3" data-test-id="completeness-body">
        <div className="flex flex-col gap-1">
          <input
            ref={scanRef}
            type="text"
            value={scan}
            onChange={(e) => {
              setScan(e.target.value);
              setScanMiss(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleScan();
              }
            }}
            placeholder={labels.scanPlaceholder}
            className="h-9 w-full rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 text-sm placeholder:text-[var(--ms-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--ms-text-brand)]"
            data-test-id="completeness-scan-input"
          />
          {scanMiss && (
            <span className="text-[12px] text-[var(--ms-text-destructive)]">{labels.notFound}</span>
          )}
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)]">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 bg-[var(--ms-bg-muted)]">
              <tr className="border-[var(--ms-border-default)] border-b text-left text-[var(--ms-text-muted)]">
                <th className="px-3 py-1.5 font-normal">{labels.colName}</th>
                <th className="w-20 px-2 py-1.5 text-right font-normal">{labels.colQty}</th>
                <th className="w-32 px-2 py-1.5 text-right font-normal">{labels.colFact}</th>
                <th className="w-20 px-2 py-1.5 text-right font-normal">{labels.colDiff}</th>
                <th className="w-28 px-2 py-1.5 text-center font-normal">{labels.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const { diff, s } = statusOf(r.quantity, fact[r.id]);
                return (
                  <tr key={r.id} className="border-[var(--ms-border-subtle)] border-b">
                    <td className="px-3 py-1.5">
                      {r.code && (
                        <span className="mr-2 text-[var(--ms-text-muted)] tabular-nums">
                          {r.code}
                        </span>
                      )}
                      {r.name}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.quantity}</td>
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={fact[r.id] ?? ''}
                        onChange={(e) => setFact((m) => ({ ...m, [r.id]: e.target.value }))}
                        className="h-6 w-24 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] px-1 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--ms-text-brand)]"
                        data-test-id={`completeness-fact-${r.id}`}
                      />
                    </td>
                    <td
                      className={cn(
                        'px-2 py-1.5 text-right tabular-nums',
                        diff !== 0 && 'font-medium text-[var(--ms-text-destructive)]',
                      )}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span
                        className={cn(
                          'inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 font-medium text-[11px]',
                          STATUS_STYLE[s],
                        )}
                        data-test-id={`completeness-status-${r.id}`}
                      >
                        {STATUS_LABEL[s]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Keep the accept affordance meaningful: nothing to apply → the apply
            button greys out; the check can always be finished. */}
        <span className="sr-only" data-test-id="completeness-has-discrepancy">
          {hasDiscrepancy ? '1' : '0'}
        </span>
      </div>
    </Modal>
  );
}
