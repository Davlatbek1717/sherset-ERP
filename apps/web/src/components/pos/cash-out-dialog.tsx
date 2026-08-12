'use client';

import { api } from '@/lib/api-client';
import { parseAmountToMinor } from '@/lib/pos/parse-amount';
import type { CurrencyCode } from '@moysklad/money/currencies';
import { Input, formatMoney, noAccidentalClose } from '@moysklad/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Receipt, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

interface NamedRow {
  id: string;
  name: string;
}

interface CashOutResult {
  id: string;
  name: string;
  kind: string;
  sumMinor: string;
  expenseItem: NamedRow | null;
  recipient: NamedRow | null;
  /** Yozilgan audit hodisalari — `CASH_OVERDRAWN` shu yerda ko'rinadi. */
  auditTypes: string[];
}

type Kind = 'expense' | 'collection';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  /** Kassa valyutasi — major→minor scale (FE-08). */
  currency?: CurrencyCode;
  onDone?: (result: CashOutResult) => void;
}

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];

/**
 * POS «Kassadan chiqim» oynasi — xarajat (RKO) va inkassatsiya
 * (kassa TZ §8.2 / §8.3).
 *
 * Ikkala hujjat bitta oynada: kassir uchun bu bitta harakat — «yashiqdan
 * pul chiqadi», farqi faqat NEGA chiqishida. Ikki alohida tugma qo'yish
 * uni har safar «qaysinisi edi» deb o'ylashga majbur qilardi.
 *
 * Tasdiq SO'RALMAYDI (Q10 — kassir erkin). Lekin modda/qabul qiluvchi
 * MAJBURIY: ularsiz hujjat keyinchalik o'qilmas bo'ladi (server ham rad
 * etadi — bu yerda tugma oldindan bloklanadi, kassir xatoni bosgandan
 * KEYIN emas, OLDIN ko'rsin).
 */
export function CashOutDialog({ open, onOpenChange, sessionId, currency = 'UZS', onDone }: Props) {
  const qc = useQueryClient();
  const t = useTranslations('pages.pos');
  const tCommon = useTranslations('common');
  const [kind, setKind] = useState<Kind>('expense');
  const [amountInput, setAmountInput] = useState('');
  const [expenseItemId, setExpenseItemId] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: items } = useQuery<{ items: NamedRow[] } | NamedRow[]>({
    queryKey: ['expense-items-pos'],
    queryFn: () => api.get('/expense-items?limit=100'),
    enabled: open,
  });
  // Ro'yxat endpointi ba'zi joyda `{items}`, ba'zida massiv qaytaradi.
  const expenseItems: NamedRow[] = Array.isArray(items) ? items : (items?.items ?? []);

  const { data: recipients } = useQuery<NamedRow[]>({
    queryKey: ['cash-out-recipients'],
    queryFn: () => api.get('/cashier-sessions/cash-out-recipients'),
    enabled: open && kind === 'collection',
  });

  // FE-09: yagona pul-parse (lokal float nusxasi o'rniga).
  const amountMinor = parseAmountToMinor(amountInput, currency);
  const canConfirm = amountMinor > 0n && (kind === 'expense' ? !!expenseItemId : !!recipientId);

  const mut = useMutation<CashOutResult>({
    mutationFn: () =>
      api.post<CashOutResult>(`/cashier-sessions/${sessionId}/cash-out`, {
        kind,
        sumMinor: amountMinor.toString(),
        // Faqat o'z turiga tegishli maydon yuboriladi: chalkash hujjatni
        // server ham rad etadi (Z-hisobotda ikki marta o'qilmasin).
        expenseItemId: kind === 'expense' ? expenseItemId : null,
        recipientId: kind === 'collection' ? recipientId : null,
        description: comment.trim() || null,
      }),
    onSuccess: (result) => {
      // Smena naqdi kamaydi — joriy smena ma'lumoti eskirdi.
      qc.invalidateQueries({ queryKey: ['cashier-session-current'] });
      qc.invalidateQueries({ queryKey: ['cash-out-summary', sessionId] });
      onDone?.(result);
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : t('cash_out_error'));
    },
  });

  const reset = useCallback(() => {
    setKind('expense');
    setAmountInput('');
    setExpenseItemId(null);
    setRecipientId(null);
    setComment('');
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const pickerRows = kind === 'expense' ? expenseItems : (recipients ?? []);
  const pickedId = kind === 'expense' ? expenseItemId : recipientId;
  const pick = kind === 'expense' ? setExpenseItemId : setRecipientId;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        {/* K-1: tavsif matni ataylab yo'q — Radix'ning rasmiy opt-out'i
            (`aria-describedby={undefined}`) console warning'ni o'chiradi. */}
        <Dialog.Content
          {...noAccidentalClose}
          aria-describedby={undefined}
          className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[var(--ms-bg-surface)] shadow-2xl outline-none"
        >
          <div className="flex items-center justify-between border-[var(--ms-border)] border-b px-5 py-3">
            <Dialog.Title className="font-semibold text-[var(--ms-text-primary)] text-lg">
              {t('cash_out_title')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={tCommon('close')}
                className="rounded-lg p-1 text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            {/* ── Tur ─────────────────────────────────────────────────────── */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setKind('expense');
                  setError(null);
                }}
                data-test-id="cash-out-kind-expense"
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 font-medium text-sm transition-colors ${
                  kind === 'expense'
                    ? 'border-orange-400 bg-orange-50 text-orange-700'
                    : 'border-[var(--ms-border)] text-[var(--ms-text-muted)]'
                }`}
              >
                <Receipt size={16} /> {t('cash_out_kind_expense')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setKind('collection');
                  setError(null);
                }}
                data-test-id="cash-out-kind-collection"
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 font-medium text-sm transition-colors ${
                  kind === 'collection'
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-[var(--ms-border)] text-[var(--ms-text-muted)]'
                }`}
              >
                <Banknote size={16} /> {t('cash_out_kind_collection')}
              </button>
            </div>

            {/* ── Modda / qabul qiluvchi ──────────────────────────────────── */}
            <div>
              <p className="mb-1.5 text-[var(--ms-text-muted)] text-xs">
                {kind === 'expense' ? t('cash_out_expense_item') : t('cash_out_recipient')}
              </p>
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {pickerRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => pick(row.id)}
                    data-test-id={`cash-out-pick-${row.id}`}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      pickedId === row.id
                        ? 'border-[var(--ms-brand)] bg-[var(--ms-brand)]/5 font-medium'
                        : 'border-[var(--ms-border)] hover:bg-[var(--ms-bg-hover)]'
                    }`}
                  >
                    {row.name}
                  </button>
                ))}
                {pickerRows.length === 0 && (
                  <p className="py-3 text-center text-[var(--ms-text-muted)] text-sm">
                    {kind === 'expense'
                      ? t('cash_out_no_expense_items')
                      : t('cash_out_no_recipients')}
                  </p>
                )}
              </div>
            </div>

            {/* ── Summa ───────────────────────────────────────────────────── */}
            <div className="rounded-xl border-2 border-[var(--ms-brand)] bg-[var(--ms-brand)]/5 px-4 py-3">
              <div className="text-[var(--ms-text-muted)] text-xs">{t('amount')}</div>
              <div
                className="font-bold text-2xl text-[var(--ms-text-primary)] tabular-nums"
                data-test-id="cash-out-amount"
              >
                {amountInput ? formatMoney(amountMinor) : '0'}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {NUMPAD_KEYS.map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => {
                    setError(null);
                    setAmountInput((p) => (k === '⌫' ? p.slice(0, -1) : p.length > 12 ? p : p + k));
                  }}
                  className="h-11 rounded-lg border border-[var(--ms-border)] bg-[var(--ms-bg-input)] font-semibold text-[var(--ms-text-primary)] text-lg transition-all hover:bg-[var(--ms-bg-hover)] active:scale-95"
                >
                  {k}
                </button>
              ))}
            </div>

            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('comment_placeholder')}
            />

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-xs">{error}</p>
            )}
          </div>

          <div className="border-[var(--ms-border)] border-t px-5 py-3">
            <button
              type="button"
              onClick={() => mut.mutate()}
              disabled={!canConfirm || mut.isPending}
              data-test-id="cash-out-confirm"
              className="h-12 w-full rounded-xl bg-[var(--ms-brand)] font-semibold text-base text-white transition-all hover:bg-[var(--ms-brand-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {mut.isPending
                ? '...'
                : kind === 'expense'
                  ? t('cash_out_submit_expense')
                  : t('cash_out_submit_collection')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
